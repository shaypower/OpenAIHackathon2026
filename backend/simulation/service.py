"""Public deterministic facade for a bounded dated transit simulation slice."""
from __future__ import annotations

import heapq
import math
import time
from dataclasses import dataclass, field
from datetime import date, datetime, time as wall_time, timedelta, timezone
from pathlib import Path
from typing import Iterable, Mapping
from zoneinfo import ZoneInfo

from backend.accessibility.demand import Demand, community_demand
from backend.domain.models import (
    AccessibilityResult, CivicObjective, Community, DemandConfig, Evidence,
    FailureReason, Intervention, Journey, JourneyLeg, MapFeature,
    InterventionChange, MapFeatureProperties, Provenance, ServiceLocation, SimulationMetrics,
    StressScenario, TimetableChange,
)
from backend.optimization.ranking import RankedCandidate, rank_candidates
from backend.optimization.search import CANDIDATE_CAP, SHIFT_WINDOW_MINUTES, generate_candidates
from backend.routing.gtfs import StopTime, TransitFeed, TransportError, parse_gtfs, read_gtfs_archive, read_gtfs_directory

ENGINE_VERSION = "civic-transport-0.1.0"


@dataclass(frozen=True)
class WalkEdge:
    id: str
    from_node: str
    to_node: str
    duration_minutes: float
    distance_km: float
    method: str
    geometry: object | None = None


@dataclass(frozen=True)
class SimulationSnapshot:
    dataset_id: str
    feed: TransitFeed
    communities: tuple[Community, ...]
    services: tuple[ServiceLocation, ...]
    walk_edges: tuple[WalkEdge, ...]
    minimum_transfer_minutes: Mapping[str, float]
    service_hours: Mapping[str, Mapping[int, tuple[tuple[int, int], ...]] | None]
    provenance: tuple[Provenance, ...]
    evidence: tuple[Evidence, ...]
    data_mode: str
    maximum_walking_minutes: float = 30.0
    trip_changes_supported: bool = False
    operational_assumptions: tuple[str, ...] = ()
    cohort_estimates: Mapping[str, tuple[int, str, str]] = field(default_factory=dict)

    @property
    def edge_ids(self) -> set[str]:
        return {edge.id for edge in self.walk_edges} | {
            _segment_id(tid, index) for tid, rows in self.feed.stop_times.items() for index in range(len(rows) - 1)
        }


@dataclass(frozen=True)
class MissedConnection:
    community_id: str
    trip_id: str
    stop_id: str
    shift_needed_minutes: int
    arrival_at: datetime
    departure_at: datetime


@dataclass(frozen=True)
class SimulationResult:
    """B-owned result bundle; C wraps it in/persists a SimulationRun."""
    dataset_id: str
    service_date: date
    departure_at: datetime
    timezone: str
    demand_config_id: str
    objective_id: str
    data_mode: str
    metrics: SimulationMetrics
    before: SimulationMetrics | None
    after: SimulationMetrics
    accessibility: tuple[AccessibilityResult, ...]
    journeys: tuple[Journey, ...]
    evidence: tuple[Evidence, ...]
    provenance: tuple[Provenance, ...]
    map_features: tuple[MapFeature, ...]
    assumptions: tuple[str, ...]
    limitations: tuple[str, ...]
    execution_time_ms: float
    diagnostics: tuple[MissedConnection, ...] = ()
    removed_ids: tuple[str, ...] = ()
    intervention_id: str | None = None
    scenario_id: str | None = None
    changes: tuple[InterventionChange, ...] = ()

    @property
    def engine_version(self) -> str:
        return ENGINE_VERSION

    @property
    def input_dataset_ids(self) -> tuple[str, ...]:
        return (self.dataset_id,)


@dataclass(frozen=True)
class CandidateEvaluation:
    intervention: Intervention
    result: SimulationResult | None
    error_code: str | None = None
    simulation_run_id: str | None = None


def _segment_id(trip_id: str, index: int) -> str:
    return f"ride:{trip_id}:{index}"


def build_snapshot(
    dataset_id: str, feed: TransitFeed, communities: Iterable[Community],
    services: Iterable[ServiceLocation], walk_edges: Iterable[WalkEdge], *,
    minimum_transfer_minutes: Mapping[str, float],
    service_hours: Mapping[str, Mapping[int, tuple[tuple[int, int], ...]] | None],
    provenance: Iterable[Provenance], evidence: Iterable[Evidence], data_mode: str,
    maximum_walking_minutes: float = 30.0, trip_changes_supported: bool = False,
    operational_assumptions: Iterable[str] = (),
    cohort_estimates: Mapping[str, tuple[int, str, str]] | None = None,
) -> SimulationSnapshot:
    """Validate cross-record references once and pin immutable run inputs."""
    comms, service_list = tuple(communities), tuple(services)
    edges, provs, evs = tuple(walk_edges), tuple(provenance), tuple(evidence)
    if not dataset_id or not comms or not service_list:
        raise TransportError("missing_data", "Snapshot needs an ID, communities, and services.")
    for collection, label in ((comms, "community"), (service_list, "service"), (edges, "edge"), (provs, "provenance"), (evs, "evidence")):
        ids = [getattr(value, "id") for value in collection]
        if len(ids) != len(set(ids)):
            raise TransportError("invalid_snapshot", f"Duplicate {label} ID.")
    prov_ids, evidence_ids = {p.id for p in provs}, {e.id for e in evs}
    for p in provs:
        if p.data_mode not in ("real", "synthetic"):
            raise TransportError("invalid_snapshot", "Invalid provenance data mode.")
    for e in evs:
        if not set(e.provenance_ids) <= prov_ids:
            raise TransportError("invalid_snapshot", f"Evidence {e.id!r} has unresolved provenance.")
    for entity in (*comms, *service_list):
        if not set(entity.provenance_ids) <= prov_ids:
            raise TransportError("invalid_snapshot", f"{entity.id!r} has unresolved provenance.")
    service_ids = {s.id for s in service_list}
    if set(service_hours) - service_ids:
        raise TransportError("invalid_snapshot", "Service-hours map references an unknown service.")
    nodes = {f"community:{c.id}" for c in comms} | {f"service:{s.id}" for s in service_list} | set(feed.stops)
    edge_ids = {e.id for e in edges}
    if len(edge_ids) != len(edges):
        raise TransportError("invalid_snapshot", "Duplicate walk edge ID.")
    for edge in edges:
        if edge.from_node not in nodes or edge.to_node not in nodes:
            raise TransportError("invalid_snapshot", f"Walk edge {edge.id!r} has an unknown endpoint.")
        if edge.duration_minutes < 0 or edge.distance_km < 0:
            raise TransportError("invalid_snapshot", f"Walk edge {edge.id!r} has a negative duration or distance.")
        if not edge.method.strip() or edge.method == "straight_line":
            raise TransportError("invalid_snapshot", f"Walk edge {edge.id!r} needs a non-straight-line method.")
    for stop_id, minutes in minimum_transfer_minutes.items():
        if stop_id not in feed.stops or minutes < 0:
            raise TransportError("invalid_snapshot", f"Invalid transfer time for stop {stop_id!r}.")
    for service in service_list:
        if service.opening_hours_known and service.id not in service_hours:
            raise TransportError("invalid_snapshot", f"Known hours missing for service {service.id!r}.")
        schedule = service_hours.get(service.id)
        if schedule is not None:
            for weekday, periods in schedule.items():
                if not 0 <= weekday <= 6 or any(not (0 <= a < b <= 1440) for a, b in periods):
                    raise TransportError("invalid_snapshot", f"Invalid weekly hours for service {service.id!r}.")
    if maximum_walking_minutes < 0:
        raise TransportError("invalid_snapshot", "Maximum walking time cannot be negative.")
    if data_mode not in ("real", "synthetic", "mixed"):
        raise TransportError("invalid_snapshot", "Invalid data mode.")
    estimates = dict(cohort_estimates or {})
    for cid, (count, method, evidence_id) in estimates.items():
        community = next((c for c in comms if c.id == cid), None)
        if community is None or evidence_id not in evidence_ids or not method.strip() or not 0 <= count <= community.population.total_residents:
            raise TransportError("invalid_snapshot", f"Invalid evidenced cohort estimate for {cid!r}.")
    declared_modes = {data_mode}
    declared_modes.update(p.data_mode for p in provs)
    declared_modes.update(entity.data_mode for entity in (*comms, *service_list) if entity.data_mode != "mixed")
    if any(item.verification == "synthetic" for item in evs):
        declared_modes.add("synthetic")
    concrete_modes = declared_modes - {"mixed"}
    effective_mode = "mixed" if "mixed" in declared_modes or len(concrete_modes) > 1 else next(iter(concrete_modes), data_mode)
    return SimulationSnapshot(dataset_id, feed, comms, service_list, edges, dict(minimum_transfer_minutes), dict(service_hours), provs, evs, effective_mode, maximum_walking_minutes, trip_changes_supported, tuple(operational_assumptions), estimates)


def load_snapshot(dataset_id: str, root: str | Path | None = None) -> SimulationSnapshot:
    """Load an immutable processed snapshot directory after verifying its file hashes.

    The layout is intentionally B-owned and narrow: manifest.json, gtfs/*.txt,
    communities.json, services.json, provenance.json, walk_edges.json,
    service_hours.json. A can supply validated DTO arrays and the GTFS tables.
    """
    import hashlib
    import json
    from backend.domain.models import Community, Evidence, Provenance, ServiceLocation
    base = Path(root) if root else Path(__file__).resolve().parents[1] / "data" / "processed"
    folder = (base / dataset_id).resolve()
    if base.resolve() not in folder.parents:
        raise TransportError("invalid_reference", "Dataset path escapes the processed-snapshot root.")
    manifest_path = folder / "manifest.json"
    if not manifest_path.exists():
        raise TransportError("missing_data", f"Processed snapshot {dataset_id!r} is not available.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1 or manifest.get("dataset_id", dataset_id) != dataset_id:
        raise TransportError("invalid_snapshot", "Snapshot manifest schema or dataset ID does not match the requested version.")
    files = manifest.get("files", {})
    resolved = {}
    for key, item in files.items():
        path = (folder / item["path"]).resolve()
        if folder not in path.parents:
            raise TransportError("invalid_snapshot", f"Manifest path for {key!r} escapes its dataset directory.")
        if key == "gtfs" and path.is_dir():
            for filename, expected_hash in item.get("table_sha256", {}).items():
                table_path = (path / filename).resolve()
                if path not in table_path.parents or not table_path.is_file():
                    raise TransportError("invalid_snapshot", f"Invalid GTFS table path {filename!r}.")
                if hashlib.sha256(table_path.read_bytes()).hexdigest() != expected_hash:
                    raise TransportError("invalid_snapshot", f"Checksum mismatch for GTFS table {filename!r}.")
            required_tables = {"stops.txt", "routes.txt", "trips.txt", "stop_times.txt"}
            if not required_tables <= set(item.get("table_sha256", {})):
                raise TransportError("invalid_snapshot", "Directory GTFS snapshots must hash each required table.")
        else:
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != item.get("sha256"):
                raise TransportError("invalid_snapshot", f"Checksum mismatch for {key!r}.")
        resolved[key] = path
    required = {"communities", "services", "provenance", "walk_edges", "service_hours", "gtfs"}
    if not required <= resolved.keys():
        missing = sorted(required - resolved.keys())
        if manifest.get("region_id") == "tipperary" and "communities" in resolved:
            from backend.domain.models import Community
            rows = json.loads(resolved["communities"].read_text(encoding="utf-8"))
            communities = [Community.model_validate(row) for row in rows]
            unknown_cohort = [c.id for c in communities if c.population.target_cohort_residents is None]
            if unknown_cohort:
                raise TransportError("missing_cohort", f"Snapshot has no evidenced target-cohort count for {len(unknown_cohort)} communities; age and no-car marginals cannot identify their intersection.")
            raise TransportError("missing_data", f"Snapshot is not simulation-ready; missing {', '.join(missing)}. Service locations, validated walk links, weekly opening hours and a bounded GTFS feed are required.")
        raise TransportError("invalid_snapshot", f"Snapshot is missing files: {missing}.")
    prov_values = json.loads(resolved["provenance"].read_text(encoding="utf-8"))
    provs = [Provenance.model_validate(row) for row in prov_values]
    tables_dir = resolved["gtfs"]
    feed = read_gtfs_archive(tables_dir, manifest.get("agency_timezone")) if tables_dir.is_file() else read_gtfs_directory(tables_dir, manifest.get("agency_timezone"))
    evidence_values = json.loads(resolved["evidence"].read_text(encoding="utf-8")) if "evidence" in resolved else []
    service_hours = json.loads(resolved["service_hours"].read_text(encoding="utf-8"))
    service_hours = {sid: (None if hours is None else {int(day): tuple(tuple(period) for period in periods) for day, periods in hours.items()}) for sid, hours in service_hours.items()}
    communities = [Community.model_validate(x) for x in json.loads(resolved["communities"].read_text(encoding="utf-8"))]
    services = [ServiceLocation.model_validate(x) for x in json.loads(resolved["services"].read_text(encoding="utf-8"))]
    counts = manifest.get("record_counts", {})
    for key, actual in (("communities", len(communities)), ("services", len(services)), ("provenance", len(provs))):
        if key in counts and counts[key] != actual:
            raise TransportError("invalid_snapshot", f"Manifest {key} count does not match its file.")
    return build_snapshot(
        dataset_id, feed,
        communities, services,
        [WalkEdge(**x) for x in json.loads(resolved["walk_edges"].read_text(encoding="utf-8"))],
        minimum_transfer_minutes=manifest.get("minimum_transfer_minutes", {}),
        service_hours=json.loads(resolved["service_hours"].read_text(encoding="utf-8")),
        provenance=provs,
        evidence=[Evidence.model_validate(x) for x in evidence_values],
        data_mode=manifest["data_mode"], maximum_walking_minutes=manifest.get("maximum_walking_minutes", 30),
        trip_changes_supported=manifest.get("trip_changes_supported", False),
        operational_assumptions=manifest.get("operational_assumptions", []),
    )


def _aware_in_zone(value: datetime, zone: ZoneInfo) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise TransportError("invalid_departure", "departure_at must be a dated timezone-aware datetime.")
    return value.astimezone(zone)


def _service_instant(service_date: date, seconds: int, zone: ZoneInfo) -> datetime:
    day, second_of_day = divmod(seconds, 86400)
    d = service_date + timedelta(days=day)
    naive = datetime.combine(d, wall_time()) + timedelta(seconds=second_of_day)
    first, second = naive.replace(tzinfo=zone, fold=0), naive.replace(tzinfo=zone, fold=1)
    if first.utcoffset() != second.utcoffset():
        raise TransportError("invalid_feed", f"GTFS event falls in an ambiguous local time: {naive.isoformat()} {zone.key}.")
    if first.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != naive:
        raise TransportError("invalid_feed", f"GTFS event falls in a nonexistent local time: {naive.isoformat()} {zone.key}.")
    return first


def _plus_minutes(value: datetime, minutes: float) -> datetime:
    return (value.astimezone(timezone.utc) + timedelta(minutes=minutes)).astimezone(value.tzinfo)


def _minutes_between(start: datetime, end: datetime) -> float:
    return (end.astimezone(timezone.utc) - start.astimezone(timezone.utc)).total_seconds() / 60.0


def _schedule(feed: TransitFeed, service_date: date, shifts: Mapping[str, int], cancelled: set[str], closed_edges: set[str]):
    active = feed.active_service_ids(service_date)
    for tid, trip in feed.trips.items():
        if trip.service_id not in active or tid in cancelled:
            continue
        rows = feed.stop_times[tid]
        for index, (a, b) in enumerate(zip(rows, rows[1:])):
            edge_id = _segment_id(tid, index)
            if edge_id in closed_edges:
                continue
            delta = shifts.get(tid, 0) * 60
            route = feed.routes[trip.route_id]
            yield {
                "id": edge_id, "trip_id": tid, "index": index,
                "from": a.stop_id, "to": b.stop_id, "mode": route.mode,
                "departure": _service_instant(service_date, a.departure_seconds + delta, ZoneInfo(feed.timezone)),
                "arrival": _service_instant(service_date, b.arrival_seconds + delta, ZoneInfo(feed.timezone)),
            }


def _map_features(snapshot: SimulationSnapshot, disruptions: set[str] | None = None) -> tuple[MapFeature, ...]:
    disruptions = disruptions or set()
    features = []
    for c in snapshot.communities:
        evidence_ids = [e.id for e in snapshot.evidence]
        features.append(MapFeature(id=f"community:{c.id}", geometry=c.geometry, properties=MapFeatureProperties(entity_id=c.id, label=c.name, layer="community", state="existing", data_mode=c.data_mode, evidence_ids=evidence_ids)))
    for s in snapshot.services:
        features.append(MapFeature(id=f"service:{s.id}", geometry=s.geometry, properties=MapFeatureProperties(entity_id=s.id, label=s.name, layer="service", state="disrupted" if s.id in disruptions else "existing", data_mode=s.data_mode, evidence_ids=evidence_ids)))
    for edge in snapshot.walk_edges:
        if edge.geometry is not None:
            features.append(MapFeature(id=f"walk:{edge.id}", geometry=edge.geometry, properties=MapFeatureProperties(entity_id=edge.id, label=f"Walk link ({edge.method})", layer="transport", state="disrupted" if edge.id in disruptions else "existing", data_mode=snapshot.data_mode, evidence_ids=evidence_ids)))
    return tuple(features)


def _service_opening_time(service_id: str, arrival: datetime, snapshot: SimulationSnapshot) -> datetime | None:
    hours = snapshot.service_hours.get(service_id)
    if hours is None:
        return None
    local = arrival.astimezone(ZoneInfo(snapshot.feed.timezone))
    for day_delta in range(0, 8):
        d = local.date() + timedelta(days=day_delta)
        intervals = hours.get(d.weekday(), ())
        for start, end in intervals:
            opening = _service_instant(d, start * 60, ZoneInfo(snapshot.feed.timezone))
            closing = _service_instant(d, end * 60, ZoneInfo(snapshot.feed.timezone)) if end < 1440 else _service_instant(d + timedelta(days=1), 0, ZoneInfo(snapshot.feed.timezone))
            candidate = max(arrival, opening, key=lambda x: x.timestamp())
            if candidate < closing:
                return candidate
    return None


def _route_one(snapshot: SimulationSnapshot, community: Community, targets: list[ServiceLocation], departure: datetime,
               active_edges: list[dict], closed_services: set[str], closed_walk_edges: set[str], cancelled_trips: set[str]):
    zone = ZoneInfo(snapshot.feed.timezone)
    walk_adjacency: dict[str, list[WalkEdge]] = {}
    for edge in snapshot.walk_edges:
        if edge.id not in closed_walk_edges:
            walk_adjacency.setdefault(edge.from_node, []).append(edge)
    transit_adjacency: dict[str, list[dict]] = {}
    for edge in active_edges:
        transit_adjacency.setdefault(edge["from"], []).append(edge)
    for values in transit_adjacency.values():
        values.sort(key=lambda edge: (edge["departure"].timestamp(), edge["trip_id"], edge["id"]))
    target_nodes = {f"service:{s.id}": s for s in targets if s.id not in closed_services}
    origin = f"community:{community.id}"
    # State is (node, last trip, arrival, walk minutes, distance, legs, missed diagnostics).
    first = (origin, None, departure, 0.0, 0.0, tuple(), tuple())
    heap = [(departure.timestamp(), 0.0, 0, first)]
    serial = 1
    labels: dict[tuple[str, str | None], list[tuple[float, float]]] = {}
    missed: dict[tuple[str, str], MissedConnection] = {}
    unknown_hours = False
    rejected_by_walk_limit = False
    best = None
    visited_nodes = set()
    while heap:
        _, _, _, state = heapq.heappop(heap)
        node, last_trip, at, walked, distance, legs, route_missed = state
        visited_nodes.add(node)
        if walked > snapshot.maximum_walking_minutes + 1e-9:
            continue
        label_key = (node, last_trip)
        if any(t <= at.timestamp() + 1e-6 and w <= walked + 1e-9 for t, w in labels.get(label_key, [])):
            continue
        keep = [(t, w) for t, w in labels.get(label_key, []) if not (at.timestamp() <= t + 1e-6 and walked <= w + 1e-9)]
        labels[label_key] = keep + [(at.timestamp(), walked)]
        if node in target_nodes:
            service = target_nodes[node]
            opens = _service_opening_time(service.id, at, snapshot)
            if opens is None:
                unknown_hours = True
            else:
                final_legs = list(legs)
                if opens.timestamp() > at.timestamp() + 1e-6:
                    final_legs.append(JourneyLeg(id=f"{community.id}-opening-wait", mode="wait", label=f"Wait for {service.name} to open", start_at=at, end_at=opens, duration_minutes=_minutes_between(at, opens), status="feasible", evidence_ids=[]))
                final_legs.append(JourneyLeg(id=f"{community.id}-service", mode="service", label=service.name, start_at=opens, end_at=opens, duration_minutes=0.0, status="feasible", evidence_ids=[]))
                if best is None or opens.timestamp() < best[0].timestamp():
                    best = (opens, service, tuple(final_legs), route_missed, distance)
            continue
        for edge in walk_adjacency.get(node, []):
            if walked + edge.duration_minutes > snapshot.maximum_walking_minutes + 1e-9:
                rejected_by_walk_limit = True
                continue
            end = _plus_minutes(at, edge.duration_minutes)
            leg = JourneyLeg(id=edge.id, mode="walk", label=f"Walk ({edge.method})", start_at=at, end_at=end, duration_minutes=edge.duration_minutes, status="feasible", geometry=edge.geometry, evidence_ids=[])
            nxt = (edge.to_node, last_trip, end, walked + edge.duration_minutes, distance + edge.distance_km, legs + (leg,), route_missed)
            heapq.heappush(heap, (end.timestamp(), walked + edge.duration_minutes, serial, nxt)); serial += 1
        for edge in transit_adjacency.get(node, []):
            min_transfer = snapshot.minimum_transfer_minutes.get(node, 0.0) if last_trip and last_trip != edge["trip_id"] else 0.0
            earliest = _plus_minutes(at, min_transfer)
            if edge["departure"].timestamp() < earliest.timestamp() - 1e-6:
                needed = max(0, math.ceil(_minutes_between(edge["departure"], earliest) - 1e-9))
                missed[(edge["trip_id"], node)] = MissedConnection(community.id, edge["trip_id"], node, needed, at, edge["departure"])
                continue
            new_legs = legs
            if edge["departure"].timestamp() > at.timestamp() + 1e-6:
                mode = "transfer" if last_trip and last_trip != edge["trip_id"] else "wait"
                label = f"Transfer and wait at {snapshot.feed.stops[node].name}" if mode == "transfer" else f"Wait at {snapshot.feed.stops[node].name}"
                wait_leg = JourneyLeg(id=f"wait:{community.id}:{edge['id']}", mode=mode, label=label, start_at=at, end_at=edge["departure"], duration_minutes=_minutes_between(at, edge["departure"]), status="feasible", evidence_ids=[])
                new_legs = new_legs + (wait_leg,)
            transit_leg = JourneyLeg(id=edge["id"], mode=edge["mode"], label=f"{edge['mode'].replace('_', ' ').title()} {edge['trip_id']}", start_at=edge["departure"], end_at=edge["arrival"], duration_minutes=_minutes_between(edge["departure"], edge["arrival"]), status="feasible", evidence_ids=[])
            if last_trip == edge["trip_id"] and new_legs and new_legs[-1].mode == edge["mode"]:
                previous = new_legs[-1]
                transit_leg = previous.model_copy(update={"end_at": edge["arrival"], "duration_minutes": _minutes_between(previous.start_at, edge["arrival"]), "id": f"trip:{edge['trip_id']}"})
                new_legs = new_legs[:-1] + (transit_leg,)
            else:
                new_legs = new_legs + (transit_leg,)
            nxt = (edge["to"], edge["trip_id"], edge["arrival"], walked, distance, new_legs, route_missed)
            heapq.heappush(heap, (edge["arrival"].timestamp(), walked, serial, nxt)); serial += 1
    if best:
        end, service, legs, _, distance = best
        total = _minutes_between(departure, end)
        missed_values = tuple(sorted(missed.values(), key=lambda m: (m.trip_id, m.stop_id)))
        return service, legs, total, distance, missed_values, None
    missed_values = tuple(sorted(missed.values(), key=lambda m: (m.trip_id, m.stop_id)))
    if unknown_hours:
        return None, (), None, 0.0, missed_values, "missing_data"
    if missed_values:
        return None, (), None, 0.0, missed_values, "missed_connection"
    if rejected_by_walk_limit:
        return None, (), None, 0.0, (), "walking_limit"
    if closed_services and not target_nodes:
        return None, (), None, 0.0, (), "service_closed"
    active = snapshot.feed.active_service_ids(departure.date())
    if any(tid in cancelled_trips and snapshot.feed.trips[tid].service_id in active
           and visited_nodes.intersection(row.stop_id for row in snapshot.feed.stop_times[tid]) for tid in cancelled_trips):
        return None, (), None, 0.0, (), "service_cancelled"
    if not any(edge["trip_id"] not in closed_services for edge in active_edges):
        return None, (), None, 0.0, (), "no_active_service"
    return None, (), None, 0.0, (), "no_path"


def _failure(code: str, text: str) -> FailureReason:
    # DTO vocabulary intentionally remains finite; no-active-service is a no_path subtype.
    if code == "no_active_service":
        return FailureReason(code="no_path", description=text)
    if code not in {"no_path", "missed_connection", "journey_too_long", "walking_limit", "service_closed", "service_cancelled", "missing_data"}:
        code = "no_path"
    return FailureReason(code=code, description=text)


def _metrics(accessibility: tuple[AccessibilityResult, ...], before: tuple[AccessibilityResult, ...] | None,
             config: DemandConfig, number_changes: int) -> SimulationMetrics:
    cohort = sum(a.cohort_residents for a in accessibility)
    reachable = sum(a.reachable_residents for a in accessibility)
    old = {a.community_id: a for a in (before or ())}
    newly_weighted = 0.0
    for item in accessibility:
        prior = old.get(item.community_id)
        newly = max(0, item.reachable_residents - (prior.reachable_residents if prior else 0))
        if item.cohort_residents:
            newly_weighted += item.weighted_demand * newly / item.cohort_residents
    return SimulationMetrics(
        cohort_residents=cohort, reachable_residents=reachable,
        access_percent=(100.0 * reachable / cohort if cohort else None),
        weighted_population_gaining_access=newly_weighted,
        additional_vehicle_minutes=None, additional_distance_km=None,
        number_of_changes=number_changes, indicative_cost_eur_week=None,
    )


def _run(snapshot: SimulationSnapshot, objective: CivicObjective, departure_at: datetime, demand: DemandConfig,
         shifts: Mapping[str, int] | None = None, *, before: SimulationResult | None = None,
         cancelled_trips: set[str] | None = None, closed_edges: set[str] | None = None,
         closed_services: set[str] | None = None, scenario_id: str | None = None,
         intervention_id: str | None = None, number_changes: int = 0,
         changes: tuple[InterventionChange, ...] = ()) -> SimulationResult:
    started = time.perf_counter()
    zone = ZoneInfo(snapshot.feed.timezone)
    departure = _aware_in_zone(departure_at, zone)
    service_date = departure.date()
    scoped_communities = [c for c in snapshot.communities if c.region_id == objective.region_id]
    if not scoped_communities:
        raise TransportError("missing_data", f"Snapshot contains no communities for region {objective.region_id!r}.")
    assumptions = list(snapshot.operational_assumptions)
    for community in scoped_communities:
        community_demand(community, demand, dict(snapshot.cohort_estimates))
        estimate = snapshot.cohort_estimates.get(community.id)
        if estimate is not None and (community.population.target_cohort_residents is None or community.population.cohort_method == "estimated"):
            assumptions.append(f"Target cohort for {community.id} uses estimate method '{estimate[1]}' with evidence {estimate[2]}.")
    targets = [s for s in snapshot.services if s.kind == objective.target_service]
    if not targets:
        raise TransportError("missing_data", f"No services of kind {objective.target_service!r} in the snapshot.")
    if not snapshot.feed.active_service_ids(service_date):
        active_edges = []
    else:
        active_edges = list(_schedule(snapshot.feed, service_date, shifts or {}, cancelled_trips or set(), closed_edges or set()))
    walk_closed = {edge_id for edge_id in (closed_edges or set()) if any(w.id == edge_id for w in snapshot.walk_edges)}
    journeys, results, diagnostics = [], [], []
    before_access = {x.community_id: x for x in before.accessibility} if before else {}
    for community in sorted(snapshot.communities, key=lambda c: c.id):
        if community.region_id != objective.region_id:
            continue
        demand_value = community_demand(community, demand, dict(snapshot.cohort_estimates))
        service, legs, total, distance, missed, failure_code = _route_one(snapshot, community, targets, departure, active_edges, closed_services or set(), walk_closed, cancelled_trips or set())
        diagnostics.extend(missed)
        failure_list = []
        feasible = service is not None and total is not None
        reachable = demand_value.residents if feasible and total <= objective.constraint.maximum_journey_minutes else 0
        if failure_code:
            desc = {
                "missed_connection": "A connecting departure leaves before arrival plus the minimum transfer time.",
                "missing_data": "Journey paths exist, but service opening hours are unknown or unavailable.",
                "service_closed": "All matching service locations are closed in this scenario.",
                "no_active_service": f"No GTFS service is active on {service_date.isoformat()}.",
                "no_path": "No connected walk/transit path reaches a matching service.",
            }.get(failure_code, "No feasible journey is available.")
            if failure_code == "walking_limit":
                desc = f"Explicit walking links exceed the configured {snapshot.maximum_walking_minutes:g}-minute limit."
            failure = _failure(failure_code, desc)
            if snapshot.evidence:
                failure = failure.model_copy(update={"evidence_ids": [e.id for e in snapshot.evidence]})
            failure_list.append(failure)
        elif total is not None and total > objective.constraint.maximum_journey_minutes:
            failure_list.append(_failure("journey_too_long", f"Journey takes {total:g} minutes; objective limit is {objective.constraint.maximum_journey_minutes:g} minutes."))
        journey_id = f"journey:{community.id}"
        if not feasible:
            journey = Journey(id=journey_id, community_id=community.id, service_id=targets[0].id, departure_at=departure, timezone=snapshot.feed.timezone, legs=list(legs), total_minutes=None, feasible=False, data_mode=snapshot.data_mode)
        else:
            journey = Journey(id=journey_id, community_id=community.id, service_id=service.id, departure_at=departure, timezone=snapshot.feed.timezone, legs=list(legs), total_minutes=total, feasible=True, data_mode=snapshot.data_mode)
        journeys.append(journey)
        results.append(AccessibilityResult(community_id=community.id, cohort_residents=demand_value.residents,
            reachable_residents=reachable, access_percent=(100.0 if demand_value.residents and reachable == demand_value.residents else (0.0 if demand_value.residents else None)),
            weighted_demand=demand_value.weighted_residents, journey_ids=[journey_id], failures=failure_list, data_mode=snapshot.data_mode))
    access_tuple = tuple(results)
    if before and {r.community_id for r in access_tuple} != set(before_access):
        raise TransportError("candidate_scope_mismatch", "Candidate community scope differs from its baseline.")
    metrics = _metrics(access_tuple, before.accessibility if before else None, demand, number_changes)
    limits = ["No real GTFS, civic population, or service-hours dataset is bundled; current fixture/results are synthetic." if snapshot.data_mode == "synthetic" else "Results inherit the input snapshot data mode.",
              "Capacity, vehicle blocks/interlining, operating cost, and road-network generation are not modelled; unknown metrics remain null.",
              "Walking legs use explicit supplied links only; no straight-line link is treated as walkable."]
    return SimulationResult(snapshot.dataset_id, service_date, departure, snapshot.feed.timezone, demand.id, objective.id,
        snapshot.data_mode, metrics, before.metrics if before else None, metrics, access_tuple, tuple(journeys), snapshot.evidence,
        snapshot.provenance, _map_features(snapshot, set(closed_services or ()) | set(closed_edges or ())),
        tuple(dict.fromkeys(assumptions)), tuple(limits), (time.perf_counter() - started) * 1000.0,
        tuple(sorted(diagnostics, key=lambda d: (d.community_id, d.trip_id, d.stop_id))), tuple(sorted((closed_edges or set()) | (cancelled_trips or set()) | (closed_services or set()))), intervention_id, scenario_id, changes)


def run_baseline(snapshot: SimulationSnapshot, objective: CivicObjective, departure_at: datetime, demand: DemandConfig) -> SimulationResult:
    """Calculate dated journeys and accessibility from the pinned snapshot."""
    return _run(snapshot, objective, departure_at, demand)


def find_failures(accessibility: Iterable[AccessibilityResult]) -> list[AccessibilityResult]:
    return [item for item in accessibility if item.failures or item.reachable_residents < item.cohort_residents]


def inspect_failure(snapshot: SimulationSnapshot, objective: CivicObjective, result: AccessibilityResult,
                    journeys: Iterable[Journey]) -> tuple[list[FailureReason], list[Evidence]]:
    if result.community_id not in {c.id for c in snapshot.communities}:
        raise TransportError("invalid_reference", f"Unknown community {result.community_id!r}.")
    journey_ids = {j.id for j in journeys}
    if not set(result.journey_ids) <= journey_ids:
        raise TransportError("invalid_reference", "Accessibility references an unknown journey.")
    return list(result.failures), list(snapshot.evidence)


def _apply_timetable_changes(snapshot: SimulationSnapshot, objective: CivicObjective, intervention: Intervention,
                             departure_at: datetime) -> dict[str, int]:
    if intervention.objective_id != objective.id:
        raise TransportError("invalid_reference", "Intervention belongs to a different objective.")
    community_ids = {c.id for c in snapshot.communities if c.region_id == objective.region_id}
    if not intervention.community_ids or not set(intervention.community_ids) <= community_ids:
        raise TransportError("invalid_reference", "Intervention references communities outside this snapshot/objective.")
    if intervention.data_mode != snapshot.data_mode:
        raise TransportError("invalid_reference", "Intervention data mode does not match its snapshot.")
    if not set(intervention.evidence_ids) <= {e.id for e in snapshot.evidence}:
        raise TransportError("invalid_reference", "Intervention references unknown evidence.")
    if len(intervention.changes) != 1 or not isinstance(intervention.changes[0], TimetableChange):
        raise TransportError("unsupported_change", "Only one TimetableChange is supported per intervention.")
    if not snapshot.trip_changes_supported:
        raise TransportError("unsupported_operational_assumptions", "Trip changes are disabled because vehicle/block and capacity constraints are unknown.")
    change = intervention.changes[0]
    if abs(change.shift_minutes) > SHIFT_WINDOW_MINUTES or change.trip_id not in snapshot.feed.trips:
        raise TransportError("invalid_change", "Trip is unknown or shift exceeds the supported ±30 minute window.")
    trip = snapshot.feed.trips[change.trip_id]
    zone = ZoneInfo(snapshot.feed.timezone)
    local_departure = _aware_in_zone(departure_at, zone)
    if trip.service_id not in snapshot.feed.active_service_ids(local_departure.date()):
        raise TransportError("invalid_change", f"Trip {trip.id!r} is not active on the chosen service date.")
    if any(x.arrival_seconds + change.shift_minutes * 60 < 0 or x.departure_seconds + change.shift_minutes * 60 < 0 for x in snapshot.feed.stop_times[trip.id]):
        raise TransportError("invalid_change", "Timetable change creates a negative service-day time.")
    return {trip.id: change.shift_minutes}


def simulate_candidate(snapshot: SimulationSnapshot, objective: CivicObjective, departure_at: datetime, demand: DemandConfig,
                       baseline: SimulationResult, intervention: Intervention) -> SimulationResult:
    if (baseline.dataset_id, baseline.objective_id, baseline.departure_at, baseline.demand_config_id) != (snapshot.dataset_id, objective.id, _aware_in_zone(departure_at, ZoneInfo(snapshot.feed.timezone)), demand.id):
        raise TransportError("invalid_reference", "Candidate inputs must match the pinned baseline objective, date, dataset, and demand config.")
    shifts = _apply_timetable_changes(snapshot, objective, intervention, departure_at)
    result = _run(snapshot, objective, departure_at, demand, shifts, before=baseline, intervention_id=intervention.id, number_changes=1, changes=tuple(intervention.changes))
    old = {r.community_id: r for r in baseline.accessibility}
    losses = [r.community_id for r in result.accessibility if r.reachable_residents < old.get(r.community_id, r).reachable_residents]
    if losses:
        raise TransportError("would_remove_access", f"Candidate removes access from previously reachable target-cohort communities: {sorted(losses)}.")
    return result


def stress_test_candidate(snapshot: SimulationSnapshot, objective: CivicObjective, departure_at: datetime, demand: DemandConfig,
                          baseline: SimulationResult, intervention: Intervention, scenario: StressScenario) -> SimulationResult:
    candidate = simulate_candidate(snapshot, objective, departure_at, demand, baseline, intervention)
    if scenario.data_mode != snapshot.data_mode:
        raise TransportError("invalid_reference", "Scenario data mode does not match its snapshot.")
    if not set(scenario.provenance_ids) <= {p.id for p in snapshot.provenance}:
        raise TransportError("invalid_reference", "Scenario references unknown provenance.")
    invalid_edges = set(scenario.closed_edge_ids) - snapshot.edge_ids
    invalid_services = set(scenario.closed_service_ids) - {s.id for s in snapshot.services}
    invalid_trips = set(scenario.cancelled_trip_ids) - set(snapshot.feed.trips)
    if invalid_edges or invalid_services or invalid_trips:
        raise TransportError("invalid_reference", f"Scenario references unknown IDs: edges={sorted(invalid_edges)}, services={sorted(invalid_services)}, trips={sorted(invalid_trips)}.")
    change = intervention.changes[0]
    return _run(snapshot, objective, departure_at, demand, {change.trip_id: change.shift_minutes}, before=candidate,
        cancelled_trips=set(scenario.cancelled_trip_ids), closed_edges=set(scenario.closed_edge_ids),
        closed_services=set(scenario.closed_service_ids), scenario_id=scenario.id, intervention_id=intervention.id, number_changes=1,
        changes=tuple(intervention.changes))


def evaluate_candidates(snapshot: SimulationSnapshot, objective: CivicObjective, departure_at: datetime, demand: DemandConfig,
                        baseline: SimulationResult, interventions: Iterable[Intervention], max_candidates: int = CANDIDATE_CAP) -> list[CandidateEvaluation]:
    proposals = list(interventions)
    if len(proposals) > min(max_candidates, CANDIDATE_CAP):
        raise TransportError("candidate_limit", f"At most {min(max_candidates, CANDIDATE_CAP)} candidates can be evaluated.")
    evaluated = []
    for intervention in proposals:
        try:
            evaluated.append(CandidateEvaluation(intervention, simulate_candidate(snapshot, objective, departure_at, demand, baseline, intervention)))
        except TransportError as exc:
            evaluated.append(CandidateEvaluation(intervention, None, exc.code))
    return evaluated

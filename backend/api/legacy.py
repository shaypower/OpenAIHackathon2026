"""Accessibility screening API and an explicitly illustrative Tipperary demo."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "backend" / "data"
SCENARIO_PATH = DATA_DIR / "north_tipperary_demo.json"
PROCESSED_DIR = DATA_DIR / "processed"
FRONTEND_DIR = ROOT / "frontend"

router = APIRouter()


class SimulationRequest(BaseModel):
    mode: Literal["baseline", "intervention", "flood_baseline", "flood_intervention"] = "intervention"
    target_minutes: int = Field(default=45, ge=5, le=240)


def _load_scenario() -> dict:
    try:
        return json.loads(SCENARIO_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Demo scenario could not be loaded: {exc}") from exc


def _edges_for_mode(scenario: dict, mode: str) -> tuple[list[dict], set[str]]:
    flooded = mode.startswith("flood_")
    include_intervention = mode.endswith("intervention")
    closures = set(scenario["stress_test"]["closed_edge_ids"]) if flooded else set()
    edges = [edge for edge in scenario["network"]["edges"] if edge["id"] not in closures]
    if include_intervention:
        edges += scenario["intervention"]["edges"]
    return edges, closures


def _shortest_minutes(start: str, edges: list[dict], clinic_ids: set[str]) -> float | None:
    """Dijkstra over precomputed generalized journey times (not a live timetable)."""
    graph: dict[str, list[tuple[str, float]]] = {}
    for edge in edges:
        a, b, minutes = edge["from"], edge["to"], float(edge["minutes"])
        graph.setdefault(a, []).append((b, minutes))
        if edge.get("bidirectional", True):
            graph.setdefault(b, []).append((a, minutes))

    distances = {start: 0.0}
    pending: set[str] = {start}
    while pending:
        current = min(pending, key=lambda node: distances[node])
        pending.remove(current)
        current_minutes = distances[current]
        if current in clinic_ids:
            return current_minutes
        for neighbor, edge_minutes in graph.get(current, []):
            alternative = current_minutes + edge_minutes
            if alternative < distances.get(neighbor, math.inf):
                distances[neighbor] = alternative
                pending.add(neighbor)
    return None


def _run_mode(scenario: dict, mode: str) -> tuple[dict[str, float | None], set[str]]:
    edges, closures = _edges_for_mode(scenario, mode)
    clinics = {node["id"] for node in scenario["network"]["nodes"] if node["kind"] == "healthcare_hub"}
    times = {
        zone["node_id"]: _shortest_minutes(zone["node_id"], edges, clinics)
        for zone in scenario["demand_zones"]
    }
    return times, closures


def _summary(scenario: dict, times: dict[str, float | None], threshold: int) -> dict:
    total = sum(zone["residents_65_plus_without_car"] for zone in scenario["demand_zones"])
    reached = sum(
        zone["residents_65_plus_without_car"]
        for zone in scenario["demand_zones"]
        if times[zone["node_id"]] is not None and times[zone["node_id"]] <= threshold
    )
    served_people = sum(
        zone["residents_65_plus_without_car"]
        for zone in scenario["demand_zones"]
        if times[zone["node_id"]] is not None and times[zone["node_id"]] <= threshold
    )
    weighted_minutes = sum(
        times[zone["node_id"]] * zone["residents_65_plus_without_car"]
        for zone in scenario["demand_zones"]
        if times[zone["node_id"]] is not None and times[zone["node_id"]] <= threshold
    )
    return {
        "population_65_plus_without_car": total,
        "reached_within_target": reached,
        "outside_target": total - reached,
        "coverage_pct": round(100 * reached / total, 1) if total else 0.0,
        "mean_minutes_among_reached": round(weighted_minutes / served_people, 1) if served_people else None,
        "target_minutes": threshold,
    }


def simulate(mode: str = "intervention", target_minutes: int = 45) -> dict:
    """Return map-ready GeoJSON and comparable outcomes for four scenario states."""
    scenario = _load_scenario()
    valid_modes = {"baseline", "intervention", "flood_baseline", "flood_intervention"}
    if mode not in valid_modes:
        raise ValueError(f"Unsupported mode: {mode}")
    if not 5 <= target_minutes <= 240:
        raise ValueError("target_minutes must be between 5 and 240")

    results: dict[str, dict[str, float | None]] = {}
    all_times: dict[str, dict[str, float | None]] = {}
    closures_for_active: set[str] = set()
    for result_mode in sorted(valid_modes):
        times, closures = _run_mode(scenario, result_mode)
        results[result_mode] = _summary(scenario, times, target_minutes)
        all_times[result_mode] = times
        if result_mode == mode:
            closures_for_active = closures

    active_summary = results[mode]
    comparison_mode = {
        "baseline": "baseline",
        "intervention": "baseline",
        "flood_baseline": "baseline",
        "flood_intervention": "flood_baseline",
    }[mode]
    comparison = results[comparison_mode]
    active_times = all_times[mode]
    node_by_id = {node["id"]: node for node in scenario["network"]["nodes"]}

    features: list[dict] = []
    for edge in scenario["network"]["edges"] + scenario["intervention"]["edges"]:
        a, b = node_by_id[edge["from"]], node_by_id[edge["to"]]
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [a["coordinates"], b["coordinates"]]},
            "properties": {
                "feature_type": "route",
                "id": edge["id"],
                "label": edge["label"],
                "route_kind": edge["kind"],
                "minutes": edge["minutes"],
                "is_intervention": edge["kind"] == "proposed_feeder",
                "closed_in_active_stress_test": edge["id"] in closures_for_active,
                "schematic": True,
            },
        })

    for zone in scenario["demand_zones"]:
        node_id = zone["node_id"]
        per_mode = {key: value[node_id] for key, value in all_times.items()}
        active_minutes = active_times[node_id]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": node_by_id[node_id]["coordinates"]},
            "properties": {
                "feature_type": "demand_zone",
                "id": zone["id"],
                "label": zone["label"],
                "population_65_plus_without_car": zone["residents_65_plus_without_car"],
                "travel_minutes": {k: round(v, 1) if v is not None else None for k, v in per_mode.items()},
                "selected_mode": mode,
                "selected_minutes": round(active_minutes, 1) if active_minutes is not None else None,
                "within_target": active_minutes is not None and active_minutes <= target_minutes,
                "newly_reached_people": (
                    zone["residents_65_plus_without_car"]
                    if active_minutes is not None
                    and active_minutes <= target_minutes
                    and (all_times[comparison_mode][node_id] is None or all_times[comparison_mode][node_id] > target_minutes)
                    else 0
                ),
                "input_quality": "illustrative_demo",
            },
        })

    for node in scenario["network"]["nodes"]:
        if node["kind"] not in {"healthcare_hub", "public_transport_stop"}:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": node["coordinates"]},
            "properties": {
                "feature_type": node["kind"],
                "id": node["id"],
                "label": node["label"],
                "input_quality": "illustrative_demo",
            },
        })

    underserved = [
        {
            "area": zone["label"],
            "people_65_plus_without_car": zone["residents_65_plus_without_car"],
            "travel_minutes": round(active_times[zone["node_id"]], 1) if active_times[zone["node_id"]] is not None else None,
        }
        for zone in scenario["demand_zones"]
        if active_times[zone["node_id"]] is None or active_times[zone["node_id"]] > target_minutes
    ]
    underserved.sort(key=lambda item: (-(item["people_65_plus_without_car"]), -(item["travel_minutes"] or 10**6)))

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "scenario_id": scenario["scenario_id"],
            "scenario_title": scenario["title"],
            "active_mode": mode,
            "model": scenario["model_notes"],
            "data_status": "Illustrative synthetic inputs; no CSO, NTA, NaPTAN, Pobal, OPW, LiDAR or Tipperary Council records were loaded.",
            "summaries": results,
            "selected_summary": active_summary,
            "comparison_mode": comparison_mode,
            "change_vs_comparison": {
                "additional_people_reached": active_summary["reached_within_target"] - comparison["reached_within_target"],
                "coverage_change_percentage_points": round(active_summary["coverage_pct"] - comparison["coverage_pct"], 1),
            },
            "areas_outside_target": underserved,
        },
    }


@router.get("/api/data/tipperary/{filename}", tags=["data"])
async def tipperary_processed_data(filename: str) -> FileResponse:
    allowed = {
        "tipperary_census_access_screen.geojson",
        "tipperary_census_access_screen.csv",
        "tipperary_screening_candidates.geojson",
        "tipperary_screening_candidates.csv",
        "tipperary_naptan_stops.geojson",
        "tipperary_gtfs_stops.geojson",
        "tipperary_ingestion_report.json",
        "source_manifest.json",
    }
    if filename not in allowed:
        raise HTTPException(status_code=404, detail="Processed data file not found")
    path = PROCESSED_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Run backend.ingest_tipperary to create this output")
    return FileResponse(path)


@router.post("/api/simulations/accessibility", tags=["simulation"])
async def accessibility_simulation(request: SimulationRequest) -> dict:
    return simulate(request.mode, request.target_minutes)


@router.get("/api/simulations/accessibility/demo", tags=["simulation"])
async def default_accessibility_simulation() -> dict:
    return simulate()


@router.get("/gis", include_in_schema=False)
async def map_page() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")

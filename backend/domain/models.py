"""Version-one integration vocabulary. No routing or optimisation logic here.

Wire format is snake_case; the existing frontend's camelCase models stay behind
its provider adapters. See docs/team/API_CONTRACTS.md for semantic invariants.
"""

from datetime import date
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl

Id = Annotated[str, Field(min_length=1, max_length=160)]
Text = Annotated[str, Field(min_length=1)]
Count = Annotated[int, Field(ge=0, strict=True)]
Minutes = Annotated[float, Field(ge=0, strict=True)]
Percent = Annotated[float, Field(ge=0, le=100, strict=True)]
Weight = Annotated[float, Field(ge=0, strict=True)]
Longitude = Annotated[float, Field(ge=-180, le=180, strict=True)]
Latitude = Annotated[float, Field(ge=-90, le=90, strict=True)]
LngLat = tuple[Longitude, Latitude]
DataMode = Literal["real", "synthetic", "mixed"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Point(Contract):
    type: Literal["Point"] = "Point"
    coordinates: LngLat


class LineString(Contract):
    type: Literal["LineString"] = "LineString"
    coordinates: Annotated[list[LngLat], Field(min_length=2)]


Ring = Annotated[list[LngLat], Field(min_length=4)]


class Polygon(Contract):
    type: Literal["Polygon"] = "Polygon"
    coordinates: Annotated[list[Ring], Field(min_length=1)]


class MultiPolygon(Contract):
    type: Literal["MultiPolygon"] = "MultiPolygon"
    coordinates: Annotated[list[Annotated[list[Ring], Field(min_length=1)]], Field(min_length=1)]


Geometry = Annotated[Point | LineString | Polygon | MultiPolygon, Field(discriminator="type")]


class Provenance(Contract):
    id: Id
    source: Text
    dataset: Text
    source_url: HttpUrl | None
    source_updated_at: AwareDatetime | date | None
    ingested_at: AwareDatetime
    licence: Text | None
    data_mode: Literal["real", "synthetic"]
    record_id: Id | None = None


class Evidence(Contract):
    id: Id
    claim: Text
    provenance_ids: Annotated[list[Id], Field(min_length=1)]
    verification: Literal["synthetic", "unverified", "verified"]


class PopulationProfile(Contract):
    total_residents: Count
    aged_65_plus_residents: Count | None
    no_car_households: Count | None
    target_cohort_residents: Count | None
    cohort_method: Literal["observed", "estimated", "unknown", "synthetic"]
    provenance_ids: Annotated[list[Id], Field(min_length=1)]


class ObjectivePopulation(Contract):
    min_age: Annotated[int, Field(ge=0, le=120, strict=True)] | None
    car_access: bool | None


class ObjectiveConstraint(Contract):
    maximum_journey_minutes: Annotated[float, Field(gt=0, le=1440, strict=True)]
    target_access_percent: Percent | None = None


class CivicObjective(Contract):
    id: Id
    text: Annotated[str, Field(min_length=12, max_length=500)]
    domain: Text
    target_service: Text
    geography: Text
    region_id: Id
    population: ObjectivePopulation
    constraint: ObjectiveConstraint
    objective: Literal["maximize_accessibility"]


class DemandConfig(Contract):
    """Explicit policy weights; Person B computes demand in accessibility/."""

    id: Id
    objective_relevance: Weight
    demographic_need: Weight
    transport_dependency: Weight
    vulnerability: Weight
    missing_data_policy: Literal["reject", "explicit_estimate"]


class Community(Contract):
    id: Id
    name: Text
    region_id: Id
    center: LngLat
    geometry: Polygon | MultiPolygon
    population: PopulationProfile
    data_mode: DataMode
    provenance_ids: Annotated[list[Id], Field(min_length=1)]


class ServiceLocation(Contract):
    id: Id
    name: Text
    kind: Text
    geometry: Point
    opening_hours_known: bool
    data_mode: DataMode
    provenance_ids: Annotated[list[Id], Field(min_length=1)]


class JourneyLeg(Contract):
    id: Id
    mode: Text  # Open vocabulary: walk, bus, rail, transfer, wait, service, etc.
    label: Text
    start_at: AwareDatetime
    end_at: AwareDatetime
    duration_minutes: Minutes
    status: Literal["feasible", "failed", "unavailable"]
    geometry: LineString | None = None
    evidence_ids: list[Id] = Field(default_factory=list)


class Journey(Contract):
    id: Id
    community_id: Id
    service_id: Id
    departure_at: AwareDatetime
    timezone: Text
    legs: list[JourneyLeg]
    total_minutes: Minutes | None
    feasible: bool
    data_mode: DataMode


class FailureReason(Contract):
    code: Literal[
        "no_path", "missed_connection", "journey_too_long", "walking_limit",
        "service_closed", "service_cancelled", "missing_data",
    ]
    description: Text
    evidence_ids: list[Id] = Field(default_factory=list)


class AccessibilityResult(Contract):
    community_id: Id
    cohort_residents: Count
    reachable_residents: Count
    access_percent: Percent | None
    weighted_demand: Weight
    journey_ids: list[Id]
    failures: list[FailureReason]
    data_mode: DataMode


class TimetableChange(Contract):
    kind: Literal["timetable_change"]
    trip_id: Id
    shift_minutes: Annotated[int, Field(ge=-1440, le=1440, strict=True)]


class FeederService(Contract):
    kind: Literal["feeder_service"]
    stop_ids: Annotated[list[Id], Field(min_length=2)]
    departure_at: AwareDatetime
    geometry: LineString


class MobileService(Contract):
    kind: Literal["mobile_service"]
    service_kind: Text
    location: Point
    starts_at: AwareDatetime
    ends_at: AwareDatetime


InterventionChange = Annotated[
    TimetableChange | FeederService | MobileService, Field(discriminator="kind")
]


class MapFeatureProperties(Contract):
    entity_id: Id
    label: Text
    layer: Literal["community", "service", "transport", "journey", "intervention", "disruption"]
    state: Literal["existing", "proposed", "failing", "served", "disrupted"]
    data_mode: DataMode
    evidence_ids: list[Id] = Field(default_factory=list)


class MapFeature(Contract):
    type: Literal["Feature"] = "Feature"
    id: Id
    geometry: Geometry
    properties: MapFeatureProperties


class Intervention(Contract):
    id: Id
    objective_id: Id
    community_ids: Annotated[list[Id], Field(min_length=1)]
    name: Text
    description: Text
    changes: Annotated[list[InterventionChange], Field(min_length=1)]
    features: list[MapFeature]
    evidence_ids: list[Id]
    data_mode: DataMode
    # Proposals carry no uncomputed impact; results live in SimulationRun.


class SimulationMetrics(Contract):
    cohort_residents: Count
    reachable_residents: Count
    access_percent: Percent | None
    weighted_population_gaining_access: Weight
    additional_vehicle_minutes: Minutes | None
    additional_distance_km: Weight | None
    number_of_changes: Count
    indicative_cost_eur_week: Weight | None


class StressScenario(Contract):
    id: Id
    name: Text
    kind: Literal["flood", "road_closure", "service_closure", "cancellation"]
    closed_edge_ids: list[Id]
    closed_service_ids: list[Id]
    cancelled_trip_ids: list[Id]
    features: list[MapFeature]
    data_mode: DataMode
    provenance_ids: list[Id]
    # No preset percentage loss: the deterministic engine must recompute it.


class SimulationRun(Contract):
    schema_version: Literal[1] = 1
    id: Id
    objective: CivicObjective
    kind: Literal["baseline", "intervention", "stress_test"]
    status: Literal["queued", "running", "succeeded", "failed", "cancelled"]
    phase: Text
    data_mode: DataMode
    created_at: AwareDatetime
    updated_at: AwareDatetime
    departure_at: AwareDatetime
    timezone: Text
    input_dataset_ids: list[Id]
    demand_config_id: Id
    engine_version: Text
    baseline_run_id: Id | None = None
    intervention_id: Id | None = None
    scenario_id: Id | None = None
    before: SimulationMetrics | None = None
    after: SimulationMetrics | None = None
    accessibility: list[AccessibilityResult] = Field(default_factory=list)
    journeys: list[Journey] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    provenance: list[Provenance] = Field(default_factory=list)
    error_code: str | None = None

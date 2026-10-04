"""Small, explicitly synthetic GTFS and population fixture."""
from datetime import date, datetime

from backend.domain.models import (
    CivicObjective, Community, DemandConfig, Evidence, ObjectiveConstraint,
    ObjectivePopulation, Point, Polygon, PopulationProfile, Provenance,
    ServiceLocation,
)
from backend.routing.gtfs import parse_gtfs
from backend.simulation.service import WalkEdge, build_snapshot

DATASET_ID = "synthetic-missed-connection-v1"
SERVICE_DATE = date(2026, 10, 5)  # Monday, Europe/Dublin
DEPARTURE = datetime.fromisoformat("2026-10-05T07:25:00+01:00")


def gtfs_tables():
    weekdays = {name: "1" if name in ("monday", "tuesday", "wednesday", "thursday", "friday") else "0"
                for name in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")}
    return {
        "agency": [{"agency_id": "synthetic-agency", "agency_name": "Synthetic", "agency_url": "https://example.invalid", "agency_timezone": "Europe/Dublin"}],
        "stops": [
            {"stop_id": "village", "stop_name": "Village", "stop_lat": "52.8", "stop_lon": "-7.8"},
            {"stop_id": "hub", "stop_name": "Interchange", "stop_lat": "52.79", "stop_lon": "-7.79"},
            {"stop_id": "mid", "stop_name": "Middle stop", "stop_lat": "52.785", "stop_lon": "-7.785"},
            {"stop_id": "clinic-stop", "stop_name": "Clinic stop", "stop_lat": "52.78", "stop_lon": "-7.78"},
        ],
        "routes": [
            {"route_id": "feeder-route", "agency_id": "synthetic-agency", "route_type": "3"},
            {"route_id": "connection-route", "agency_id": "synthetic-agency", "route_type": "2"},
        ],
        "trips": [
            {"route_id": "feeder-route", "service_id": "weekday", "trip_id": "feeder-trip"},
            {"route_id": "connection-route", "service_id": "weekday", "trip_id": "connection-trip"},
        ],
        "stop_times": [
            {"trip_id": "feeder-trip", "arrival_time": "07:35:00", "departure_time": "07:35:00", "stop_id": "village", "stop_sequence": "1"},
            {"trip_id": "feeder-trip", "arrival_time": "08:10:00", "departure_time": "08:10:00", "stop_id": "hub", "stop_sequence": "2"},
            {"trip_id": "connection-trip", "arrival_time": "07:55:00", "departure_time": "07:55:00", "stop_id": "hub", "stop_sequence": "1"},
            {"trip_id": "connection-trip", "arrival_time": "08:05:00", "departure_time": "08:10:00", "stop_id": "mid", "stop_sequence": "2"},
            {"trip_id": "connection-trip", "arrival_time": "08:20:00", "departure_time": "08:20:00", "stop_id": "clinic-stop", "stop_sequence": "3"},
        ],
        "calendar": [{"service_id": "weekday", **weekdays, "start_date": "20261001", "end_date": "20261031"}],
        "calendar_dates": [],
    }


def fixture():
    provenance = Provenance(id="prov-mini", source="Authored synthetic fixture", dataset=DATASET_ID,
        source_url=None, source_updated_at=None, ingested_at=datetime.fromisoformat("2026-10-04T12:00:00+00:00"),
        licence="Synthetic", data_mode="synthetic")
    evidence = Evidence(id="ev-mini", claim="All fixture population, timetable, walk links and hours are synthetic.",
        provenance_ids=[provenance.id], verification="synthetic")
    ring_a = [[-7.81, 52.81], [-7.79, 52.81], [-7.79, 52.79], [-7.81, 52.79], [-7.81, 52.81]]
    ring_b = [[-7.83, 52.83], [-7.82, 52.83], [-7.82, 52.82], [-7.83, 52.82], [-7.83, 52.83]]
    ring_c = [[-7.84, 52.84], [-7.83, 52.84], [-7.83, 52.83], [-7.84, 52.83], [-7.84, 52.84]]
    communities = [
        Community(id="rural-a", name="Synthetic feeder village", region_id="tipperary", center=(-7.8, 52.8),
            geometry=Polygon(coordinates=[ring_a]), population=PopulationProfile(total_residents=100,
                aged_65_plus_residents=55, no_car_households=32, target_cohort_residents=100,
                cohort_method="synthetic", provenance_ids=[provenance.id]), data_mode="synthetic", provenance_ids=[provenance.id]),
        Community(id="rural-b", name="Synthetic walkable village", region_id="tipperary", center=(-7.825, 52.825),
            geometry=Polygon(coordinates=[ring_b]), population=PopulationProfile(total_residents=10,
                aged_65_plus_residents=6, no_car_households=4, target_cohort_residents=10,
                cohort_method="synthetic", provenance_ids=[provenance.id]), data_mode="synthetic", provenance_ids=[provenance.id]),
        Community(id="rural-c", name="Synthetic middle-stop village", region_id="tipperary", center=(-7.835, 52.835),
            geometry=Polygon(coordinates=[ring_c]), population=PopulationProfile(total_residents=20,
                aged_65_plus_residents=12, no_car_households=8, target_cohort_residents=20,
                cohort_method="synthetic", provenance_ids=[provenance.id]), data_mode="synthetic", provenance_ids=[provenance.id]),
    ]
    service = ServiceLocation(id="clinic", name="Synthetic primary care", kind="primary_care",
        geometry=Point(coordinates=(-7.78, 52.78)), opening_hours_known=True,
        data_mode="synthetic", provenance_ids=[provenance.id])
    edges = [
        WalkEdge("walk-a-to-village", "community:rural-a", "village", 5.0, 0.25, "synthetic_fixture"),
        WalkEdge("walk-stop-to-clinic", "clinic-stop", "service:clinic", 2.0, 0.1, "synthetic_fixture"),
        WalkEdge("walk-b-direct", "community:rural-b", "service:clinic", 10.0, 0.5, "synthetic_fixture"),
        WalkEdge("walk-c-to-middle", "community:rural-c", "mid", 20.0, 1.0, "synthetic_fixture"),
    ]
    daily_hours = {day: ((0, 1440),) for day in range(7)}
    snapshot = build_snapshot(DATASET_ID, parse_gtfs(gtfs_tables()), communities, [service], edges,
        minimum_transfer_minutes={"hub": 5.0}, service_hours={"clinic": daily_hours},
        provenance=[provenance], evidence=[evidence], data_mode="synthetic",
        trip_changes_supported=True,
        operational_assumptions=("Synthetic fixture assumes independent trips with no vehicle block/interlining or capacity constraints.",),)
    objective = CivicObjective(id="objective-mini", text="Make synthetic primary care reachable within 90 minutes for the target cohort.",
        domain="healthcare", target_service="primary_care", geography="Synthetic Tipperary", region_id="tipperary",
        population=ObjectivePopulation(min_age=65, car_access=False),
        constraint=ObjectiveConstraint(maximum_journey_minutes=90), objective="maximize_accessibility")
    demand = DemandConfig(id="demand-unity-v1", objective_relevance=1, demographic_need=1,
        transport_dependency=1, vulnerability=1, missing_data_policy="reject")
    return snapshot, objective, demand

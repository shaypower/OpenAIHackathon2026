"""Structural integration guardrails, not assertions of civic/engine truth."""

import json
import unittest

from pydantic import TypeAdapter, ValidationError

from backend.domain.models import (
    CivicObjective, Community, InterventionChange, JourneyLeg, MapFeature,
    PopulationProfile, Provenance, SimulationMetrics, SimulationRun,
)


def objective_payload():
    return {
        "id": "goal-test", "text": "Healthcare within 45 minutes for over-65s without cars.",
        "domain": "healthcare", "target_service": "primary_care",
        "geography": "North Tipperary", "region_id": "tipperary",
        "population": {"min_age": 65, "car_access": False},
        "constraint": {"maximum_journey_minutes": 45},
        "objective": "maximize_accessibility",
    }


def population_payload():
    return {
        "total_residents": 10, "aged_65_plus_residents": None,
        "no_car_households": None, "target_cohort_residents": None,
        "cohort_method": "unknown", "provenance_ids": ["fixture-test"],
    }


class ContractTests(unittest.TestCase):
    def test_objective_round_trips_without_accepting_model_written_metrics(self):
        goal = CivicObjective.model_validate(objective_payload())
        self.assertEqual(CivicObjective.model_validate_json(goal.model_dump_json()), goal)
        self.assertEqual(goal.constraint.maximum_journey_minutes, 45)
        for field in ("population_count", "travel_minutes", "access_percent", "impact"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                CivicObjective.model_validate({**objective_payload(), field: 94})

    def test_counts_are_people_or_households_with_explicit_unknowns(self):
        profile = PopulationProfile.model_validate(population_payload())
        self.assertIsNone(profile.target_cohort_residents)
        self.assertIsNone(profile.no_car_households)
        for count in (-1, 1.5, True, "10"):
            with self.subTest(count=count), self.assertRaises(ValidationError):
                PopulationProfile.model_validate({**population_payload(), "total_residents": count})
        with self.assertRaises(ValidationError):
            PopulationProfile.model_validate({**population_payload(), "withoutCar": 10})

    def test_provenance_keeps_source_date_precision_and_requires_acquisition(self):
        payload = {
            "id": "fixture-test", "source": "Local test fixture", "dataset": "Test v1",
            "source_url": None, "source_updated_at": "2026-10-04",
            "ingested_at": "2026-10-04T12:00:00Z", "licence": None,
            "data_mode": "synthetic",
        }
        self.assertEqual(Provenance.model_validate(payload).model_dump(mode="json")["source_updated_at"], "2026-10-04")
        for timestamp in (None, "2026-10-04T12:00:00"):
            with self.subTest(timestamp=timestamp), self.assertRaises(ValidationError):
                Provenance.model_validate({**payload, "ingested_at": timestamp})
        with self.assertRaises(ValidationError):
            Provenance.model_validate({**payload, "source_url": "not-a-url"})

    def test_unknown_change_types_or_missing_change_parameters_fail(self):
        adapter = TypeAdapter(InterventionChange)
        shift = adapter.validate_python({"kind": "timetable_change", "trip_id": "trip-test", "shift_minutes": -14})
        self.assertEqual(shift.shift_minutes, -14)
        for payload in (
            {"kind": "new_stop", "name": "Unsupported shape"},
            {"kind": "timetable_change", "shift_minutes": 14},
            {"kind": "timetable_change", "trip_id": "trip-test", "shift_minutes": 1.5},
            {"kind": "timetable_change", "trip_id": "trip-test", "shift_minutes": 14, "impact": 100},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                adapter.validate_python(payload)

    def test_map_coordinates_are_bounded_and_metadata_cannot_omit_mode(self):
        feature = {
            "id": "point-test", "geometry": {"type": "Point", "coordinates": [-7.95, 52.75]},
            "properties": {"entity_id": "community-test", "label": "Test location",
                           "layer": "community", "state": "existing", "data_mode": "synthetic"},
        }
        self.assertEqual(MapFeature.model_validate(feature).model_dump(mode="json")["geometry"]["coordinates"], [-7.95, 52.75])
        for coordinates in ([52.75, -187.95], [-181, 52.75], [0, 91], [float("nan"), 0]):
            with self.subTest(coordinates=coordinates), self.assertRaises(ValidationError):
                MapFeature.model_validate({**feature, "geometry": {"type": "Point", "coordinates": coordinates}})
        props = dict(feature["properties"])
        props.pop("data_mode")
        with self.assertRaises(ValidationError):
            MapFeature.model_validate({**feature, "properties": props})

    def test_community_accepts_multipolygon_without_renderer_dependency(self):
        ring = [[-8, 52], [-7.9, 52], [-7.9, 52.1], [-8, 52]]
        community = Community.model_validate({
            "id": "community-test", "name": "Synthetic test area", "region_id": "tipperary",
            "center": [-7.95, 52.05], "geometry": {"type": "MultiPolygon", "coordinates": [[ring]]},
            "population": population_payload(), "data_mode": "synthetic", "provenance_ids": ["fixture-test"],
        })
        self.assertEqual(community.geometry.type, "MultiPolygon")

    def test_metrics_reject_impossible_field_ranges_and_non_finite_values(self):
        payload = {
            "cohort_residents": 0, "reachable_residents": 0, "access_percent": None,
            "weighted_population_gaining_access": 0, "additional_vehicle_minutes": None,
            "additional_distance_km": None, "number_of_changes": 0, "indicative_cost_eur_week": None,
        }
        self.assertIsNone(SimulationMetrics.model_validate(payload).access_percent)
        for value in (-1, 101, float("inf"), float("nan")):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                SimulationMetrics.model_validate({**payload, "access_percent": value})

    def test_journey_requires_dated_aware_times_and_non_negative_minutes(self):
        payload = {
            "id": "leg-test", "mode": "rail", "label": "Test connection",
            "start_at": "2026-10-05T07:00:00+01:00", "end_at": "2026-10-05T07:10:00+01:00",
            "duration_minutes": 10, "status": "feasible",
        }
        self.assertEqual(JourneyLeg.model_validate(payload).mode, "rail")
        for update in ({"start_at": "07:00"}, {"end_at": "2026-10-05T07:10:00"}, {"duration_minutes": -1}):
            with self.subTest(update=update), self.assertRaises(ValidationError):
                JourneyLeg.model_validate({**payload, **update})

    def test_queued_run_has_no_invented_result_and_serialisable_schema(self):
        run = SimulationRun.model_validate({
            "id": "run-test", "objective": objective_payload(), "kind": "baseline",
            "status": "queued", "phase": "loading_population", "data_mode": "synthetic",
            "created_at": "2026-10-04T12:00:00Z", "updated_at": "2026-10-04T12:00:00Z",
            "departure_at": "2026-10-05T07:00:00+01:00", "timezone": "Europe/Dublin",
            "input_dataset_ids": ["fixture-test"], "demand_config_id": "demand-test", "engine_version": "test-v1",
        })
        self.assertIsNone(run.before)
        self.assertIsNone(run.after)
        self.assertEqual(SimulationRun.model_validate_json(run.model_dump_json()), run)
        schema = json.loads(json.dumps(SimulationRun.model_json_schema()))
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()

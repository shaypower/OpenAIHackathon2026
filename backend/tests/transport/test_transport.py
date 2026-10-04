from datetime import date, datetime
from dataclasses import replace
import unittest

from pydantic import ValidationError

from backend.domain.models import StressScenario
from backend.routing.gtfs import TransportError, parse_gtfs, parse_gtfs_time
from backend.simulation.service import (
    SHIFT_WINDOW_MINUTES, generate_candidates, rank_candidates, run_baseline,
    simulate_candidate, stress_test_candidate,
)
from backend.tests.transport.fixtures import DEPARTURE, fixture, gtfs_tables


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.snapshot, self.objective, self.demand = fixture()
        self.baseline = run_baseline(self.snapshot, self.objective, DEPARTURE, self.demand)

    def test_dated_baseline_finds_missed_connection_without_invented_duration(self):
        by_community = {a.community_id: a for a in self.baseline.accessibility}
        rural = by_community["rural-a"]
        self.assertEqual((rural.cohort_residents, rural.reachable_residents, rural.access_percent), (100, 0, 0.0))
        self.assertEqual(rural.failures[0].code, "missed_connection")
        journey = next(j for j in self.baseline.journeys if j.community_id == "rural-a")
        self.assertFalse(journey.feasible)
        self.assertIsNone(journey.total_minutes)
        self.assertEqual(journey.timezone, "Europe/Dublin")
        self.assertEqual(self.baseline.metrics.cohort_residents, 130)
        self.assertEqual(self.baseline.metrics.reachable_residents, 30)

    def test_calendar_exception_overrides_normal_weekday(self):
        tables = gtfs_tables()
        tables["calendar_dates"] = [{"service_id": "weekday", "date": "20261005", "exception_type": "2"}]
        feed = parse_gtfs(tables)
        self.assertNotIn("weekday", feed.active_service_ids(date(2026, 10, 5)))
        self.assertIn("weekday", feed.active_service_ids(date(2026, 10, 6)))

    def test_no_active_service_on_selected_date_is_not_a_fake_duration(self):
        result = run_baseline(self.snapshot, self.objective,
            datetime.fromisoformat("2026-10-04T07:25:00+01:00"), self.demand)
        rural = next(a for a in result.accessibility if a.community_id == "rural-a")
        self.assertEqual(rural.failures[0].code, "no_path")
        self.assertIn("No GTFS service is active", rural.failures[0].description)
        self.assertIsNone(next(j for j in result.journeys if j.community_id == "rural-a").total_minutes)

    def test_after_midnight_times_remain_on_service_date_then_roll_forward(self):
        self.assertEqual(parse_gtfs_time("25:10:00"), 90600)
        # Sunday exception makes a 25:10 connection part of Sunday's service.
        tables = gtfs_tables()
        tables["calendar_dates"] = [
            {"service_id": "weekday", "date": "20261004", "exception_type": "1"},
            {"service_id": "weekday", "date": "20261005", "exception_type": "2"},
        ]
        tables["stop_times"][0]["arrival_time"] = tables["stop_times"][0]["departure_time"] = "24:00:00"
        tables["stop_times"][1]["arrival_time"] = tables["stop_times"][1]["departure_time"] = "24:30:00"
        tables["stop_times"][2]["arrival_time"] = tables["stop_times"][2]["departure_time"] = "25:10:00"
        tables["stop_times"][3]["arrival_time"] = "25:25:00"
        tables["stop_times"][3]["departure_time"] = "25:30:00"
        tables["stop_times"][4]["arrival_time"] = tables["stop_times"][4]["departure_time"] = "25:55:00"
        feed = parse_gtfs(tables)
        self.assertIn("weekday", feed.active_service_ids(date(2026, 10, 4)))
        self.assertNotIn("weekday", feed.active_service_ids(date(2026, 10, 5)))
        snapshot = replace(self.snapshot, feed=feed)
        objective = self.objective.model_copy(update={"constraint": self.objective.constraint.model_copy(update={"maximum_journey_minutes": 180.0})})
        departure = datetime.fromisoformat("2026-10-04T23:30:00+01:00")
        result = run_baseline(snapshot, objective, departure, self.demand)
        journey = next(j for j in result.journeys if j.community_id == "rural-a")
        self.assertTrue(journey.feasible)
        self.assertEqual(journey.timezone, "Europe/Dublin")
        self.assertEqual(journey.legs[-1].end_at.date(), date(2026, 10, 5))

    def test_candidate_grid_has_bounded_shift_and_minimum_transfer_equality(self):
        candidates = generate_candidates(self.snapshot, self.objective,
            [a for a in self.baseline.accessibility if a.failures],
            max_candidates=20, diagnostics=self.baseline.diagnostics)
        self.assertLessEqual(len(candidates), 20)
        self.assertTrue(all(abs(c.changes[0].shift_minutes) <= SHIFT_WINDOW_MINUTES for c in candidates))
        fifteen = next(c for c in candidates if c.changes[0].shift_minutes == 15)
        failed = simulate_candidate(self.snapshot, self.objective, DEPARTURE, self.demand, self.baseline, fifteen)
        self.assertEqual(next(a for a in failed.accessibility if a.community_id == "rural-a").failures[0].code, "missed_connection")
        twenty = next(c for c in candidates if c.changes[0].shift_minutes == 20)
        improved = simulate_candidate(self.snapshot, self.objective, DEPARTURE, self.demand, self.baseline, twenty)
        rural = next(a for a in improved.accessibility if a.community_id == "rural-a")
        self.assertEqual(rural.reachable_residents, 100)
        journey = next(j for j in improved.journeys if j.community_id == "rural-a")
        transfer = next(leg for leg in journey.legs if leg.mode == "transfer")
        self.assertEqual(transfer.duration_minutes, 5.0)
        self.assertEqual(improved.metrics.weighted_population_gaining_access, 100.0)
        self.assertIsNone(improved.metrics.indicative_cost_eur_week)

    def test_closure_cancels_graph_edge_and_reruns_accessibility(self):
        candidates = generate_candidates(self.snapshot, self.objective,
            [a for a in self.baseline.accessibility if a.failures], diagnostics=self.baseline.diagnostics)
        change = next(c for c in candidates if c.changes[0].shift_minutes == 20)
        scenario = StressScenario(id="closure-mini", name="Closed connection edge", kind="road_closure",
            closed_edge_ids=["ride:connection-trip:1"], closed_service_ids=[], cancelled_trip_ids=[],
            features=[], data_mode="synthetic", provenance_ids=["prov-mini"])
        stressed = stress_test_candidate(self.snapshot, self.objective, DEPARTURE, self.demand, self.baseline, change, scenario)
        rural = next(a for a in stressed.accessibility if a.community_id == "rural-a")
        self.assertEqual(rural.reachable_residents, 0)
        self.assertEqual(next(a for a in stressed.accessibility if a.community_id == "rural-b").reachable_residents, 10)
        self.assertEqual(stressed.removed_ids, ("ride:connection-trip:1",))
        self.assertEqual(stressed.before.reachable_residents, 130)
        self.assertEqual(stressed.after.reachable_residents, 10)

    def test_candidate_that_breaks_previously_reachable_riders_is_rejected(self):
        candidates = generate_candidates(self.snapshot, self.objective,
            [a for a in self.baseline.accessibility if a.failures], diagnostics=self.baseline.diagnostics)
        early = next(c for c in candidates if c.changes[0].shift_minutes == -30)
        with self.assertRaisesRegex(TransportError, "removes access"):
            simulate_candidate(self.snapshot, self.objective, DEPARTURE, self.demand, self.baseline, early)

    def test_walking_limit_unknown_opening_hours_and_service_closure_are_explicit(self):
        from dataclasses import replace
        restricted = replace(self.snapshot, maximum_walking_minutes=4.0)
        walked = run_baseline(restricted, self.objective, DEPARTURE, self.demand)
        self.assertEqual(next(a for a in walked.accessibility if a.community_id == "rural-a").failures[0].code, "walking_limit")
        unknown = replace(self.snapshot, service_hours={"clinic": None})
        unknown_result = run_baseline(unknown, self.objective, DEPARTURE, self.demand)
        self.assertEqual(next(a for a in unknown_result.accessibility if a.community_id == "rural-b").failures[0].code, "missing_data")
        candidates = generate_candidates(self.snapshot, self.objective,
            [a for a in self.baseline.accessibility if a.failures], diagnostics=self.baseline.diagnostics)
        change = next(c for c in candidates if c.changes[0].shift_minutes == 20)
        closed = StressScenario(id="closed-clinic", name="Synthetic service closure", kind="service_closure",
            closed_edge_ids=[], closed_service_ids=["clinic"], cancelled_trip_ids=[], features=[],
            data_mode="synthetic", provenance_ids=["prov-mini"])
        result = stress_test_candidate(self.snapshot, self.objective, DEPARTURE, self.demand, self.baseline, change, closed)
        self.assertEqual(next(a for a in result.accessibility if a.community_id == "rural-b").failures[0].code, "service_closed")
        cancelled = StressScenario(id="cancelled-train", name="Synthetic cancellation", kind="cancellation",
            closed_edge_ids=[], closed_service_ids=[], cancelled_trip_ids=["connection-trip"], features=[],
            data_mode="synthetic", provenance_ids=["prov-mini"])
        cancellation_result = stress_test_candidate(self.snapshot, self.objective, DEPARTURE, self.demand, self.baseline, change, cancelled)
        self.assertEqual(next(a for a in cancellation_result.accessibility if a.community_id == "rural-a").failures[0].code, "service_cancelled")

    def test_zero_cohort_has_null_percentage_and_missing_feed_refs_reject(self):
        # A structurally valid zero-sized cohort is not reported as 100 percent.
        from dataclasses import replace
        from backend.domain.models import PopulationProfile
        zero_communities = tuple(c.model_copy(update={"population": c.population.model_copy(update={"target_cohort_residents": 0})}) for c in self.snapshot.communities)
        zero_snapshot = replace(self.snapshot, communities=zero_communities)
        result = run_baseline(zero_snapshot, self.objective, DEPARTURE, self.demand)
        self.assertIsNone(result.metrics.access_percent)
        malformed = gtfs_tables()
        malformed["stop_times"][0]["stop_id"] = "not-a-stop"
        with self.assertRaisesRegex(TransportError, "unknown trip or stop"):
            parse_gtfs(malformed)

    def test_missing_cohort_rejects_by_default_and_only_uses_evidenced_estimate(self):
        changed = tuple(c.model_copy(update={"population": c.population.model_copy(update={
            "target_cohort_residents": None, "cohort_method": "unknown"})}) if c.id == "rural-a" else c for c in self.snapshot.communities)
        unknown = replace(self.snapshot, communities=changed)
        with self.assertRaisesRegex(TransportError, "Target-cohort residents are unknown"):
            run_baseline(unknown, self.objective, DEPARTURE, self.demand)
        estimated = replace(unknown, cohort_estimates={"rural-a": (40, "synthetic joint-cohort fixture estimate", "ev-mini")})
        policy = self.demand.model_copy(update={"missing_data_policy": "explicit_estimate"})
        result = run_baseline(estimated, self.objective, DEPARTURE, policy)
        self.assertEqual(next(a for a in result.accessibility if a.community_id == "rural-a").cohort_residents, 40)

    def test_unknown_cost_never_becomes_zero_and_ranking_is_repeatable(self):
        candidates = generate_candidates(self.snapshot, self.objective,
            [a for a in self.baseline.accessibility if a.failures], diagnostics=self.baseline.diagnostics)
        from backend.simulation.service import evaluate_candidates
        evaluated = evaluate_candidates(self.snapshot, self.objective, DEPARTURE, self.demand, self.baseline, candidates)
        one = rank_candidates(evaluated, "gain-changes-v1")
        two = rank_candidates(evaluated, "gain-changes-v1")
        self.assertEqual(one, two)
        self.assertTrue(all(item.score_components["indicative_cost_eur_week"] is None for item in one))
        self.assertTrue(all("Incomplete" in item.score_components["limitation"] for item in one))

    def test_candidate_limit_is_enforced(self):
        with self.assertRaisesRegex(TransportError, "max_candidates"):
            generate_candidates(self.snapshot, self.objective, [], max_candidates=21)
        with self.assertRaisesRegex(TransportError, "Unsupported intervention"):
            generate_candidates(self.snapshot, self.objective, [], allowed_kinds=("feeder_service",))


if __name__ == "__main__":
    unittest.main()

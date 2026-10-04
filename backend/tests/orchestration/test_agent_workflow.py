"""MOCKED simulator tools; tests prove policy/validation, not transport maths."""

import asyncio
import unittest

from backend.agents.reporting import summarize_run
from backend.agents.workflow import AgentOutcome, AgentWorkflow, CandidateEvaluation, CandidateRanking
from backend.domain.models import FailureReason
from backend.orchestration.errors import WorkflowError
from backend.orchestration.execution import ExecutionContext, RunLimits
from backend.orchestration.service import Orchestrator
from fixtures import MockBaselineBackend, analysis_request


class MockCandidateTools:
    supported_intervention_kinds = ("timetable_change",)

    def __init__(self, behavior="success"):
        self.behavior = behavior
        self.generated, self.simulated, self.ranked = 0, 0, 0
        self.next_id = 0
        self.cancelled = False
        self.capacities = []

    def validate_candidate(self, baseline, candidate):
        if self.behavior == "unknown_graph":
            raise WorkflowError(422, "unknown_trip", "Candidate trip is unavailable.")

    async def generate_candidates(self, baseline, *, community_ids, allowed_kinds, max_candidates, previous_evaluations):
        self.generated += 1
        self.capacities.append(max_candidates)
        if self.behavior == "mutate":
            baseline.objective.text = "Mutated tool-private copy of objective"
        if self.behavior == "empty":
            return {"items": []}
        items = []
        for _ in range(min(2, max_candidates)):
            self.next_id += 1
            item = {
                "id": f"mock-proposal-{self.next_id}", "objective_id": baseline.objective.id,
                "community_ids": list(community_ids), "name": "MOCKED timetable proposal",
                "description": "Authored test fixture; no real routing or proposal model.",
                "changes": [{"kind": "timetable_change", "trip_id": "mock-trip", "shift_minutes": 5}],
                "features": [], "evidence_ids": ["test-evidence"], "data_mode": "synthetic",
            }
            if self.behavior == "model_impact":
                item["impact"] = {"access_percent": 99}
            elif self.behavior == "wrong_objective":
                item["objective_id"] = "other-objective"
            elif self.behavior == "unknown_evidence":
                item["evidence_ids"] = ["invented-citation"]
            elif self.behavior == "real_proposal":
                item["data_mode"] = "real"
            elif self.behavior == "duplicate":
                item["id"] = "duplicate"
            items.append(item)
        if self.behavior == "oversize":
            items *= max_candidates + 1
        return {"items": items}

    async def simulate_candidate(self, baseline, candidate):
        self.simulated += 1
        if self.behavior == "wait":
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.cancelled = True
                raise
        data = {
            "id": f"mock-evaluation-{candidate.id}", "baseline_run_id": baseline.id,
            "intervention_id": candidate.id, "objective_id": baseline.objective.id,
            "input_dataset_ids": baseline.input_dataset_ids, "demand_config_id": baseline.demand_config_id,
            "departure_at": baseline.departure_at, "timezone": baseline.timezone, "engine_version": baseline.engine_version,
            "result": {"metrics": baseline.before.model_dump(),
                       "accessibility": [item.model_dump() for item in baseline.accessibility],
                       "journeys": [item.model_dump() for item in baseline.journeys],
                       "evidence": [item.model_dump() for item in baseline.evidence],
                       "provenance": [item.model_dump() for item in baseline.provenance],
                       "limitations": ["MOCKED evaluation; no impact was calculated."]},
        }
        # Authored synthetic outcomes belong only to this explicitly mocked adapter.
        data["result"]["metrics"].update(reachable_residents=6, access_percent=60.0, number_of_changes=1)
        data["result"]["accessibility"][0].update(reachable_residents=6, access_percent=60.0)
        if self.behavior == "wrong_snapshot":
            data["input_dataset_ids"] = ["other-snapshot"]
        elif self.behavior == "wrong_counts":
            data["result"]["metrics"]["access_percent"] = 99.0
        elif self.behavior == "wrong_cohort":
            data["result"]["metrics"].update(cohort_residents=20, access_percent=30.0)
            data["result"]["accessibility"][0].update(cohort_residents=20, access_percent=30.0)
        elif self.behavior == "real_result":
            data["result"]["accessibility"][0]["data_mode"] = "real"
        elif self.behavior == "tampered_result":
            typed = CandidateEvaluation.model_validate(data)
            typed.result.metrics.indicative_cost_eur_week = -1
            return typed
        return data

    async def rank_candidates(self, baseline, evaluations):
        self.ranked += 1
        # Deliberately reverse authored fixture order to prove C preserves B's ranking.
        items = [
            {"intervention_id": item.intervention_id, "evaluation_id": item.id,
             "rank": index + 1, "score_components": {"mock_policy_score": 1.0}}
            for index, item in enumerate(reversed(evaluations))
        ]
        if self.behavior == "wrong_ranking":
            items[0]["evaluation_id"] = "unevaluated-result"
        elif self.behavior == "nonfinite_score":
            items[0]["score_components"]["mock_policy_score"] = float("nan")
        elif self.behavior == "tampered_ranking":
            typed = CandidateRanking(items=items)
            typed.items[0].score_components["mock_policy_score"] = float("nan")
            return typed
        return {"items": items}


class AgentWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        service = Orchestrator(backend=MockBaselineBackend("success"))
        acceptance = await service.submit(analysis_request())
        await service._tasks[acceptance["run_id"]]
        self.baseline = service.store.get(acceptance["run_id"]).run
        await service.close()

    async def run_workflow(self, behavior="success", **options):
        self.tools = MockCandidateTools(behavior)
        self.context = ExecutionContext(options.pop("limits", RunLimits()))
        return await AgentWorkflow(self.tools).run(self.baseline, self.context, allowed_kinds=("timetable_change",), **options)

    async def test_evaluates_then_ranks_and_selects_only_b_supplied_results(self):
        result = await self.run_workflow()
        self.assertEqual(len(result.candidates), 2)
        self.assertEqual(len(result.evaluations), 2)
        self.assertEqual(result.selected_intervention_id, result.candidates[-1].id)
        self.assertEqual(self.tools.ranked, 1)
        self.assertEqual([item["tool"] for item in self.context.trace], [
            "generate_candidate_interventions", "simulate_candidate", "simulate_candidate", "rank_candidates",
        ])
        refs = {artifact.id for artifact in result.artifacts}
        self.assertEqual(refs, {item["output_ref"] for item in self.context.trace})
        self.assertEqual(AgentOutcome.model_validate_json(result.model_dump_json()), result)
        self.assertEqual(self.baseline.before.access_percent, 40)
        self.assertEqual(result.evaluations[0].result.metrics.access_percent, 60)
        self.assertNotIn("impact", result.candidates[0].model_dump())

    async def test_one_refinement_shares_total_candidate_and_action_budget(self):
        result = await self.run_workflow(refine=True, max_candidates=3)
        self.assertEqual(len(result.evaluations), 3)
        self.assertEqual(self.context.refinements, 1)
        self.assertEqual(self.context.candidates, 3)
        self.assertEqual(self.tools.generated, 2)
        self.assertEqual(self.tools.ranked, 2)
        self.assertEqual(self.tools.capacities, [2, 1])
        self.assertEqual(len(self.context.trace), 7)

    async def test_budget_limits_candidate_plan_before_generation(self):
        result = await self.run_workflow(max_candidates=20, limits=RunLimits(max_tool_actions=4))
        self.assertEqual(self.tools.capacities, [2])
        self.assertEqual(len(result.evaluations), 2)
        self.assertTrue(result.limitations)
        with self.assertRaises(WorkflowError) as caught:
            await self.run_workflow(refine=True, limits=RunLimits(max_tool_actions=5))
        self.assertEqual(caught.exception.code, "agent_budget_exhausted")
        self.assertEqual(self.tools.generated, 0)

    async def test_no_unmet_cohort_or_no_proposals_returns_no_fake_selection(self):
        self.baseline.before.reachable_residents = 10
        self.baseline.before.access_percent = 100.0
        self.baseline.accessibility[0].reachable_residents = 10
        self.baseline.accessibility[0].access_percent = 100.0
        result = await self.run_workflow()
        self.assertIsNone(result.selected_intervention_id)
        self.assertEqual(self.context.trace, [])
        self.assertEqual(self.tools.generated, 0)
        self.baseline.before.reachable_residents = 4
        self.baseline.before.access_percent = 40.0
        self.baseline.accessibility[0].reachable_residents = 4
        self.baseline.accessibility[0].access_percent = 40.0
        result = await self.run_workflow("empty")
        self.assertIsNone(result.selected_intervention_id)
        self.assertEqual(self.tools.simulated, 0)

    async def test_model_metric_scope_and_citation_fabrication_stop_before_evaluation(self):
        for behavior in ("model_impact", "wrong_objective", "unknown_evidence", "real_proposal", "duplicate", "oversize", "unknown_graph"):
            with self.subTest(behavior=behavior):
                with self.assertRaises(WorkflowError):
                    await self.run_workflow(behavior)
                self.assertEqual(self.tools.simulated, 0)
                self.assertEqual(self.context.trace[-1]["status"], "failed")
                self.assertIsNone(self.context.trace[-1]["output_ref"])

    async def test_invalid_evaluation_cannot_reach_ranking(self):
        for behavior in ("wrong_snapshot", "wrong_counts", "wrong_cohort", "real_result", "tampered_result"):
            with self.subTest(behavior=behavior):
                with self.assertRaises(WorkflowError):
                    await self.run_workflow(behavior)
                self.assertEqual(self.tools.ranked, 0)

    async def test_unknown_evaluations_and_nonfinite_scores_cannot_be_selected(self):
        for behavior in ("wrong_ranking", "nonfinite_score", "tampered_ranking"):
            with self.subTest(behavior=behavior):
                with self.assertRaises(WorkflowError):
                    await self.run_workflow(behavior)
                self.assertEqual(self.context.trace[-1]["tool"], "rank_candidates")
                self.assertEqual(self.context.trace[-1]["status"], "failed")

    async def test_timeout_cancels_tool_and_never_calls_ranking(self):
        with self.assertRaises(WorkflowError) as caught:
            await self.run_workflow("wait", limits=RunLimits(run_deadline_seconds=0.01))
        self.assertEqual(caught.exception.code, "execution_deadline")
        self.assertTrue(self.tools.cancelled)
        self.assertEqual(self.tools.ranked, 0)

    async def test_adapter_mutation_cannot_change_authoritative_baseline(self):
        original = self.baseline.model_dump_json()
        await self.run_workflow("mutate")
        self.assertEqual(self.baseline.model_dump_json(), original)

    async def test_unready_baseline_and_unsupported_changes_fail_before_tools(self):
        self.baseline.status = "failed"
        with self.assertRaises(WorkflowError) as caught:
            await self.run_workflow()
        self.assertEqual(caught.exception.code, "baseline_not_ready")
        self.assertEqual(self.tools.generated, 0)
        self.baseline.status = "succeeded"
        tools = MockCandidateTools()
        with self.assertRaises(WorkflowError) as caught:
            await AgentWorkflow(tools).run(self.baseline, ExecutionContext(RunLimits()), allowed_kinds=("unsupported",))
        self.assertEqual(caught.exception.code, "unsupported_intervention")

    async def test_summary_cites_only_reported_tool_failures_and_successful_results(self):
        self.baseline.accessibility[0].failures = [FailureReason(
            code="missed_connection", description="MOCKED tool reported a missed connection.", evidence_ids=["test-evidence"],
        )]
        summary = summarize_run(self.baseline)
        self.assertEqual(summary["run_id"], self.baseline.id)
        self.assertEqual(summary["evidence_ids"], ["test-evidence"])
        self.assertEqual(summary["generated_by"], "deterministic_tool_summary")
        self.assertIn("4 of 10", summary["text"])
        self.assertIn("synthetic", summary["text"])
        self.baseline.status = "failed"
        self.assertIsNone(summarize_run(self.baseline))

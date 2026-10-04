"""Integration with B's actual synthetic facade, without a model or network."""

import asyncio
from unittest.mock import AsyncMock, patch
import unittest

from fastapi.testclient import TestClient

from backend.agents.objectives import TemplateCompiler
from backend.agents.workflow import AgentWorkflow
from backend.main import create_app
from backend.orchestration.errors import WorkflowError
from backend.orchestration.execution import ExecutionContext, RunLimits
from backend.orchestration.service import Orchestrator
from backend.orchestration.transport_adapter import SyntheticTransportAdapter
from fixtures import analysis_request


class TransportAgentIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def baseline(self):
        self.adapter = SyntheticTransportAdapter()
        service = Orchestrator(backend=self.adapter)
        self.addAsyncCleanup(service.close)
        request = analysis_request(
            text=analysis_request().text.replace("45", "90"), departure_at="2026-10-05T07:25:00+01:00",
        )
        accepted = await service.submit(request)
        await service._tasks[accepted["run_id"]]
        baseline = service.store.get(accepted["run_id"]).run
        self.assertEqual(baseline.status, "succeeded")
        self.assertEqual(baseline.before.reachable_residents, 30)
        return baseline

    async def test_real_b_tools_produce_improvement_and_preserve_unknown_costs(self):
        baseline = await self.baseline()
        # Leave one of the twelve overall actions for the already completed baseline.
        context = ExecutionContext(RunLimits(max_tool_actions=11))
        output = await AgentWorkflow(self.adapter).run(
            baseline, context, allowed_kinds=("timetable_change",), max_candidates=9,
        )
        self.assertEqual(output.selected_intervention_id, "timetable:connection-trip:+20m")
        winner = next(item for item in output.evaluations if item.intervention_id == output.selected_intervention_id)
        self.assertEqual(winner.result.metrics.cohort_residents, 130)
        self.assertEqual(winner.result.metrics.reachable_residents, 130)
        self.assertEqual(winner.result.metrics.weighted_population_gaining_access, 100)
        self.assertIsNone(output.ranking[0].score_components["indicative_cost_eur_week"])
        self.assertIn("Incomplete", output.ranking[0].score_components["limitation"])
        self.assertEqual(len(context.trace), 11)
        self.assertTrue(all(item["status"] == "succeeded" for item in context.trace))
        self.assertEqual(baseline.before.reachable_residents, 30)

    async def test_rebuilt_fixture_must_match_pinned_baseline(self):
        baseline = await self.baseline()
        baseline.objective.constraint.maximum_journey_minutes = 1
        with self.assertRaises(WorkflowError) as caught:
            await self.adapter.generate_candidates(baseline, community_ids=("rural-a",),
                allowed_kinds=("timetable_change",), max_candidates=1, previous_evaluations=())
        self.assertEqual(caught.exception.code, "baseline_context_mismatch")

    async def test_timed_out_worker_is_killed_and_reaped(self):
        class WaitingProcess:
            returncode = None
            killed = False
            reaped = False

            async def communicate(self, _):
                await asyncio.Event().wait()

            def kill(self):
                self.killed = True

            async def wait(self):
                self.reaped = True
                self.returncode = -9

        process = WaitingProcess()
        adapter = SyntheticTransportAdapter()
        context = ExecutionContext(RunLimits(run_deadline_seconds=0.02))
        with patch("backend.orchestration.transport_adapter.asyncio.create_subprocess_exec", AsyncMock(return_value=process)):
            with self.assertRaises(WorkflowError) as caught:
                await context.call_tool("run_baseline", [], "test-result", lambda: adapter._invoke({"action": "baseline"}))
        self.assertEqual(caught.exception.code, "execution_deadline")
        self.assertTrue(process.killed)
        self.assertTrue(process.reaped)
        self.assertEqual(context.trace[0]["status"], "failed")
        self.assertIsNone(context.trace[0]["output_ref"])


class TransportHTTPIntegrationTests(unittest.TestCase):
    def test_default_and_opt_in_are_distinct_and_no_routes_shadow_civic_contracts(self):
        with patch.dict("os.environ", {"CIVIC_ENABLE_SYNTHETIC_BASELINE": "1"}):
            app = create_app(compiler=TemplateCompiler())
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/").content, b'{"status":"ok"}')
            self.assertEqual(client.get("/api/sources").json()["data"]["real_civic_datasets_ingested"], 6)
            status = client.get("/api/status").json()["data"]
            baseline = next(item for item in status["capabilities"] if item["name"] == "baseline")
            self.assertEqual(baseline["status"], "IMPLEMENTED")
            self.assertEqual(status["data_mode"], "synthetic")
            self.assertEqual(status["supported_regions"], ["tipperary"])
            request = analysis_request(departure_at="2026-10-05T07:25:00+01:00").model_dump(mode="json")
            accepted = client.post("/api/objectives/analyse", json=request)
            self.assertEqual(accepted.status_code, 202)
            data = accepted.json()["data"]

            async def finish():
                task = app.state.orchestrator._tasks.get(data["run_id"])
                if task:
                    await task

            client.portal.call(finish)
            run = client.get(data["poll_url"]).json()["data"]
            self.assertEqual(run["run"]["status"], "succeeded")
            self.assertEqual(run["run"]["before"]["cohort_residents"], 130)
            self.assertEqual(run["run"]["before"]["reachable_residents"], 10)
            self.assertEqual(run["tool_trace"][0]["status"], "succeeded")
            self.assertTrue(run["agent_summary"])
            self.assertEqual(client.post("/api/objectives/analyse", json=request).json(), accepted.json())
            for path in ("/", "/static/index.html", "/api/data/tipperary/tipperary_census_access_screen.geojson",
                         "/api/simulations/accessibility/demo"):
                self.assertEqual(client.get(path).status_code, 200, path)
            self.assertEqual(client.get("/api/data/tipperary/secret.txt").status_code, 404)
            routes = [(route.path, method) for route in app.routes for method in getattr(route, "methods", ())]
            self.assertEqual(len(routes), len(set(routes)))
        with TestClient(create_app(compiler=TemplateCompiler(), backend=None)) as client:
            self.assertEqual(client.post("/api/objectives/analyse", json=request).status_code, 503)

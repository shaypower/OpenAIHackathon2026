import unittest

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.orchestration.execution import RunLimits
from backend.orchestration.service import Orchestrator
from backend.orchestration.store import MemoryRunStore
from fixtures import MockBaselineBackend, analysis_request
from backend.agents.objectives import TemplateCompiler


class RunAPITests(unittest.TestCase):
    def start_app(self, *, behavior="wait", limits=None, store=None):
        self.backend = MockBaselineBackend(behavior)
        self.service = Orchestrator(backend=self.backend, limits=limits, store=store)
        self.app = create_app(compiler=TemplateCompiler())
        self.app.state.orchestrator = self.service
        self.client = self.enterContext(TestClient(self.app))
        return analysis_request().model_dump(mode="json")

    def finish(self, run_id):
        async def wait():
            task = self.service._tasks.get(run_id)
            if task:
                await task
        self.client.portal.call(wait)

    def test_http_acceptance_polling_replay_conflict_and_result_evidence(self):
        payload = self.start_app()
        response = self.client.post("/api/objectives/analyse", json=payload)
        self.assertEqual(response.status_code, 202)
        accepted = response.json()
        poll = accepted["data"]["poll_url"]
        self.client.portal.call(self.backend.started.wait)
        running = self.client.get(poll).json()["data"]
        self.assertEqual(running["run"]["status"], "running")
        self.assertIsNone(running["run"]["before"])
        self.assertEqual(running["tool_trace"][0]["status"], "running")
        self.assertIsNone(running["tool_trace"][0]["output_ref"])
        replay_payload = payload | {"text": "  " + payload["text"] + "  "}
        self.assertEqual(self.client.post("/api/objectives/analyse", json=replay_payload).json(), accepted)
        conflict = self.client.post("/api/objectives/analyse", json=payload | {"text": payload["text"].replace("45", "30")})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["error"]["code"], "idempotency_conflict")
        busy = self.client.post("/api/objectives/analyse", json=payload | {"client_request_id": "second"})
        self.assertEqual(busy.status_code, 429)
        self.client.portal.call(self.backend.release.set)
        self.finish(accepted["data"]["run_id"])
        result = self.client.get(poll).json()["data"]
        self.assertEqual(result["run"]["status"], "succeeded")
        self.assertEqual(result["run"]["before"]["access_percent"], 40.0)
        self.assertEqual(result["run"]["data_mode"], "synthetic")
        self.assertEqual(result["run"]["evidence"][0]["verification"], "synthetic")
        self.assertEqual(result["tool_trace"][0]["status"], "succeeded")
        self.assertEqual(result["ranking"], [])
        self.assertEqual(result["agent_summary"]["run_id"], accepted["data"]["run_id"])
        self.assertEqual(result["agent_summary"]["generated_by"], "deterministic_tool_summary")
        self.assertIn("synthetic", result["agent_summary"]["text"])
        self.assertTrue(any("MOCKED" in item for item in result["limitations"]))
        self.assertEqual(self.client.post("/api/objectives/analyse", json=payload).json(), accepted)
        self.assertEqual(self.backend.calls, 1)
        status = self.client.get("/api/status").json()["data"]
        self.assertEqual(next(item for item in status["capabilities"] if item["name"] == "baseline")["status"], "MOCKED")

    def test_http_timeout_readback_has_no_successful_metrics(self):
        payload = self.start_app(limits=RunLimits(run_deadline_seconds=0.02))
        accepted = self.client.post("/api/objectives/analyse", json=payload).json()["data"]
        self.finish(accepted["run_id"])
        result = self.client.get(accepted["poll_url"]).json()["data"]
        self.assertEqual(result["run"]["status"], "failed")
        self.assertEqual(result["run"]["error_code"], "execution_deadline")
        self.assertIsNone(result["run"]["before"])
        self.assertIsNone(result["run"]["after"])
        self.assertIsNone(result["agent_summary"])

    def test_http_expiry_and_restart_give_explicit_404(self):
        now = [0.0]
        payload = self.start_app(behavior="success", store=MemoryRunStore(ttl_seconds=10, clock=lambda: now[0]))
        accepted = self.client.post("/api/objectives/analyse", json=payload).json()["data"]
        self.finish(accepted["run_id"])
        self.assertEqual(self.client.get(accepted["poll_url"]).status_code, 200)
        now[0] = 10.0
        response = self.client.get(accepted["poll_url"])
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"]["code"], "run_not_found")
        with TestClient(create_app(compiler=TemplateCompiler())) as restarted:
            self.assertEqual(restarted.get(accepted["poll_url"]).status_code, 404)

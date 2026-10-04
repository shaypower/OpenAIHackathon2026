import unittest

from backend.orchestration.errors import WorkflowError
from backend.orchestration.execution import ExecutionContext, RunLimits
from backend.orchestration.service import Orchestrator
from backend.orchestration.store import MemoryRunStore, fingerprint
from fixtures import MockBaselineBackend, analysis_request


class RunTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.backend = MockBaselineBackend()
        self.service = Orchestrator(backend=self.backend)
        self.addAsyncCleanup(self.service.close)

    async def finish(self, service, run_id):
        task = service._tasks.get(run_id)
        if task:
            await task
        return service.store.get(run_id)

    async def test_queued_running_succeeded_and_snapshot_isolation(self):
        self.backend.behavior = "wait"
        request = analysis_request()
        accepted = await self.service.submit(request)
        run_id = accepted["run_id"]
        self.assertEqual(self.service.store.get(run_id).run.status, "queued")
        request.dataset_ids.append("client-mutated-after-acceptance")
        await self.backend.started.wait()
        running = self.service.store.get(run_id)
        self.assertEqual(running.run.status, "running")
        self.assertIsNone(running.run.before)
        self.backend.release.set()
        record = await self.finish(self.service, run_id)
        self.assertEqual(record.run.status, "succeeded")
        self.assertEqual(record.run.before.access_percent, 40.0)
        self.assertIsNone(record.run.after)
        self.assertNotIn("client-mutated-after-acceptance", record.run.input_dataset_ids)
        self.assertEqual(record.tool_trace[0]["status"], "succeeded")
        self.assertEqual(record.tool_trace[0]["output_ref"], run_id)
        record.run.input_dataset_ids.clear()
        record.run.before.access_percent = 99
        self.assertEqual(self.service.store.get(run_id).run.before.access_percent, 40)
        self.assertEqual(len(self.service.store.get(run_id).run.input_dataset_ids), 2)

    async def test_duplicate_request_does_not_repeat_tool_and_conflicts_return_409(self):
        request = analysis_request()
        accepted = await self.service.submit(request)
        self.assertEqual(await self.service.submit(request), accepted)
        await self.finish(self.service, accepted["run_id"])
        self.assertEqual(await self.service.submit(request), accepted)
        self.assertEqual(self.backend.calls, 1)
        with self.assertRaises(WorkflowError) as caught:
            await self.service.submit(analysis_request(text=request.text.replace("45", "30")))
        self.assertEqual(caught.exception.status_code, 409)
        with self.assertRaises(WorkflowError):
            self.service.store.replay(request.client_request_id, fingerprint("POST /other", request.model_dump(mode="json")))

    async def test_one_active_run_and_retry_after_completion(self):
        self.backend.behavior = "wait"
        accepted = await self.service.submit(analysis_request())
        with self.assertRaises(WorkflowError) as caught:
            await self.service.submit(analysis_request(client_request_id="second"))
        self.assertEqual(caught.exception.status_code, 429)
        self.backend.release.set()
        await self.finish(self.service, accepted["run_id"])
        second = await self.service.submit(analysis_request(client_request_id="second"))
        await self.finish(self.service, second["run_id"])
        self.assertEqual(self.backend.calls, 2)

    async def test_timeout_fails_without_metrics_and_cancels_tool(self):
        self.service.limits = RunLimits(run_deadline_seconds=0.02)
        self.backend.behavior = "wait"
        accepted = await self.service.submit(analysis_request())
        record = await self.finish(self.service, accepted["run_id"])
        self.assertEqual(record.run.status, "failed")
        self.assertEqual(record.run.error_code, "execution_deadline")
        self.assertIsNone(record.run.before)
        self.assertIsNone(record.run.after)
        self.assertTrue(self.backend.cancelled)
        self.assertEqual(record.tool_trace[0]["error_code"], "execution_deadline")

    async def test_invalid_or_failed_tools_never_publish_metrics(self):
        for behavior, code in (("fail", "tool_failed"), ("invalid", "invalid_tool_result"), ("extra", "invalid_tool_result")):
            with self.subTest(behavior=behavior):
                self.backend.behavior = behavior
                accepted = await self.service.submit(analysis_request(client_request_id=behavior))
                record = await self.finish(self.service, accepted["run_id"])
                self.assertEqual(record.run.status, "failed")
                self.assertEqual(record.run.error_code, code)
                self.assertIsNone(record.run.before)
                self.assertEqual(record.tool_trace[0]["status"], "failed")
                self.assertNotIn("credential", repr(record))

    async def test_unknown_dataset_and_config_are_rejected_before_acceptance(self):
        for request in (analysis_request(dataset_ids=["unknown"]), analysis_request(demand_config_id="unknown")):
            with self.assertRaises(WorkflowError) as caught:
                await self.service.submit(request)
            self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(self.backend.calls, 0)
        self.assertEqual(len(self.service.store._runs), 0)

    async def test_known_but_incomplete_context_is_rejected_before_acceptance(self):
        with self.assertRaises(WorkflowError) as caught:
            await self.service.submit(analysis_request(dataset_ids=["synthetic-small-areas-v1"]))
        self.assertEqual(caught.exception.code, "missing_data")
        self.assertEqual(self.backend.calls, 0)
        self.assertEqual(len(self.service.store._runs), 0)

    async def test_ttl_eviction_and_restart_remove_run_and_replay_records(self):
        now = [0.0]
        self.service.store = MemoryRunStore(max_runs=2, ttl_seconds=10, clock=lambda: now[0])
        ids = []
        for key in ("first", "second", "third"):
            accepted = await self.service.submit(analysis_request(client_request_id=key))
            ids.append(accepted["run_id"])
            await self.finish(self.service, ids[-1])
        with self.assertRaises(WorkflowError):
            self.service.store.get(ids[0])
        self.assertNotIn("first", self.service.store._requests)
        self.assertEqual(len(self.service.store._runs), 2)
        now[0] = 10.0
        with self.assertRaises(WorkflowError) as caught:
            self.service.store.get(ids[-1])
        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(len(self.service.store._requests), 0)
        with self.assertRaises(WorkflowError):
            MemoryRunStore().get(ids[-1])

    async def test_shutdown_cancels_queued_and_running_jobs(self):
        for start in (False, True):
            backend = MockBaselineBackend("wait")
            service = Orchestrator(backend=backend)
            accepted = await service.submit(analysis_request())
            if start:
                await backend.started.wait()
            await service.close()
            record = service.store.get(accepted["run_id"])
            self.assertEqual(record.run.status, "cancelled")
            self.assertIsNone(record.run.before)
            self.assertEqual(record.run.error_code, "server_shutdown")

    async def test_active_run_is_not_expired_or_evicted_mid_execution(self):
        now = [0.0]
        self.service.store = MemoryRunStore(max_runs=1, ttl_seconds=1, clock=lambda: now[0])
        self.backend.behavior = "wait"
        accepted = await self.service.submit(analysis_request())
        await self.backend.started.wait()
        now[0] = 2.0
        self.assertEqual(self.service.store.get(accepted["run_id"]).run.status, "running")
        with self.assertRaises(WorkflowError) as caught:
            await self.service.submit(analysis_request(client_request_id="second"))
        self.assertEqual(caught.exception.status_code, 429)
        task = self.service._tasks[accepted["run_id"]]
        self.backend.release.set()
        await task
        with self.assertRaises(WorkflowError):
            self.service.store.get(accepted["run_id"])

    async def test_terminal_lifecycle_and_input_changes_are_rejected(self):
        accepted = await self.service.submit(analysis_request())
        run_id = accepted["run_id"]
        await self.finish(self.service, run_id)
        with self.assertRaises(WorkflowError):
            self.service.store.transition(run_id, "running", phase="stale-event")
        self.assertEqual(self.service.store.get(run_id).run.status, "succeeded")
        self.backend.behavior = "wait"
        active = await self.service.submit(analysis_request(client_request_id="active"))
        with self.assertRaises(WorkflowError) as caught:
            self.service.store.transition(active["run_id"], "running", phase="baseline", input_dataset_ids=["changed"])
        self.assertEqual(caught.exception.code, "immutable_run_input")

    async def test_tool_candidate_and_refinement_budgets(self):
        context = ExecutionContext(RunLimits(max_tool_actions=1))
        calls = []
        async def operation():
            calls.append(1)
            return "result"
        await context.call_tool("registered_test_tool", ["input"], "output", operation)
        with self.assertRaises(WorkflowError):
            await context.call_tool("registered_test_tool", ["input"], "output", operation)
        self.assertEqual(len(calls), 1)
        context.reserve_candidates(20)
        with self.assertRaises(WorkflowError):
            context.reserve_candidates(1)
        context.reserve_refinement()
        with self.assertRaises(WorkflowError):
            context.reserve_refinement()

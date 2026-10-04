"""Injected model responses only; no credentials or paid API calls."""

import asyncio
from decimal import Decimal
import importlib.util
import json
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.agents.config import compiler_from_environment
from backend.agents.model_compiler import (
    ModelPolicy, ModelReply, StructuredObjectiveCompiler, TransientModelError,
)
from backend.main import create_app
from backend.orchestration.errors import WorkflowError
from backend.orchestration.service import Orchestrator
from backend.orchestration.store import MemoryRunStore
from fixtures import MockBaselineBackend, analysis_request

TEXT = "Help elderly residents without cars in rural Tipperary reach primary healthcare within 30 minutes."
EXTRACTION = {
    "decision": "supported", "domain": "healthcare", "target_service": "primary_care",
    "geography": "rural Tipperary", "min_age": 65, "car_access": False,
    "maximum_journey_minutes": 30.0, "target_access_percent": None,
}


class FakeModelProvider:
    def __init__(self, replies=None, *, tokens=200, wait=False):
        self.replies = list(replies or [ModelReply(dict(EXTRACTION), tokens, 100)])
        self.tokens, self.wait = tokens, wait
        self.calls, self.count_calls, self.closed = 0, 0, False
        self.requests = []
        self.cancelled = False

    async def count_tokens(self, request):
        self.count_calls += 1
        self.requests.append(request)
        return self.tokens

    async def generate(self, request, max_output_tokens):
        self.calls += 1
        if self.wait:
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.cancelled = True
                raise
        value = self.replies.pop(0)
        if isinstance(value, Exception):
            raise value
        return value

    async def close(self):
        self.closed = True


def compiler(provider=None, **policy):
    limits = ModelPolicy(max_cost_usd="0.1", input_usd_per_million="1", output_usd_per_million="2", **policy)
    return StructuredObjectiveCompiler(provider or FakeModelProvider(), model="configured-test-model", policy=limits)


class ModelCompilerTests(unittest.IsolatedAsyncioTestCase):
    async def assert_error(self, expected, operation):
        with self.assertRaises(WorkflowError) as caught:
            await operation
        self.assertEqual(caught.exception.code, expected)
        return caught.exception

    async def test_paraphrase_is_compiled_without_metric_or_model_supplied_ids(self):
        provider = FakeModelProvider()
        result = await compiler(provider).compile(TEXT)
        self.assertEqual(result.parser_mode, "openai_structured")
        self.assertEqual(result.objective.text, TEXT)
        self.assertEqual(result.objective.constraint.maximum_journey_minutes, 30)
        self.assertEqual(result.objective.population.min_age, 65)
        self.assertTrue(result.objective.id.startswith("objective-"))
        self.assertTrue(any("65" in item for item in result.assumptions))
        self.assertEqual(provider.calls, 1)
        self.assertEqual(result.model_usage.input_tokens, 200)
        self.assertEqual(result.model_usage.generation_attempts, 1)
        self.assertGreater(result.model_usage.reserved_tokens, result.model_usage.input_tokens + result.model_usage.output_tokens)
        request = provider.requests[0]
        schema = request["text"]["format"]["schema"]
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(set(schema["required"]), set(EXTRACTION))
        for forbidden in ("id", "impact", "population", "metrics", "ranking", "evidence"):
            self.assertNotIn(forbidden, schema["properties"])
        self.assertNotIn("tools", request)

    async def test_omitted_bound_and_explicit_target_are_preserved(self):
        provider = FakeModelProvider([ModelReply(EXTRACTION | {"maximum_journey_minutes": None}, 200, 100)])
        result = await compiler(provider).compile(TEXT.replace(" within 30 minutes", ""))
        self.assertEqual(result.objective.constraint.maximum_journey_minutes, 45)
        self.assertTrue(any("defaulted" in value for value in result.assumptions))
        provider = FakeModelProvider([ModelReply(EXTRACTION | {"target_access_percent": 80.0}, 200, 100)])
        result = await compiler(provider).compile(TEXT + " Target 80% access.")
        self.assertEqual(result.objective.constraint.target_access_percent, 80)

    async def test_model_cannot_overwrite_explicit_time_or_coverage(self):
        for payload, text in ((EXTRACTION | {"maximum_journey_minutes": 45.0}, TEXT),
                              (EXTRACTION | {"target_access_percent": 90.0}, TEXT + " Target 80 percent.")):
            provider = FakeModelProvider([ModelReply(payload, 200, 100)])
            await self.assert_error("invalid_model_result", compiler(provider).compile(text))

    async def test_model_cannot_silently_supply_another_region_or_missing_cohort(self):
        await self.assert_error("unsupported_objective", compiler().compile(TEXT.replace("Tipperary", "Cork")))
        await self.assert_error("unsupported_objective", compiler().compile(TEXT.replace("primary healthcare", "schools")))
        await self.assert_error("clarification_required", compiler().compile(TEXT.replace("elderly residents", "residents")))
        await self.assert_error("clarification_required", compiler().compile(TEXT.replace(" without cars", "")))
        provider = FakeModelProvider()
        await self.assert_error("invalid_objective", compiler(provider).compile(TEXT.replace("30 minutes", "0 minutes")))
        self.assertEqual(provider.count_calls, 0)
        await self.assert_error("invalid_objective", compiler().compile(TEXT.replace("30 minutes", "-30 minutes")))
        provider = FakeModelProvider([ModelReply(EXTRACTION | {"maximum_journey_minutes": 90.0}, 200, 100)])
        result = await compiler(provider).compile(TEXT.replace("30 minutes", "1.5 hours"))
        self.assertEqual(result.objective.constraint.maximum_journey_minutes, 90)

    async def test_unsupported_ambiguous_refused_and_incomplete_results_are_distinct(self):
        for value, expected in (
            (ModelReply(EXTRACTION | {"decision": "unsupported"}, 200, 100), "unsupported_objective"),
            (ModelReply(EXTRACTION | {"decision": "clarify"}, 200, 100), "clarification_required"),
            (ModelReply(None, 200, 100, "refused"), "model_refused"),
            (ModelReply(None, 200, 100, "incomplete"), "model_incomplete"),
        ):
            await self.assert_error(expected, compiler(FakeModelProvider([value])).compile(TEXT))

    async def test_invalid_and_injected_quantitative_fields_are_rejected_without_leak(self):
        for payload in (
            EXTRACTION | {"population": 9999}, EXTRACTION | {"id": "private-secret"},
            EXTRACTION | {"maximum_journey_minutes": float("nan")},
            EXTRACTION | {"min_age": None}, EXTRACTION | {"geography": "Cork"},
        ):
            error = await self.assert_error("invalid_model_result", compiler(FakeModelProvider([ModelReply(payload, 200, 100)])).compile(TEXT))
            self.assertNotIn("private-secret", str(error))
        await self.assert_error("clarification_required", compiler().compile(TEXT + " Or within 45 minutes."))

    async def test_timeout_cancels_provider_and_has_no_template_fallback(self):
        provider = FakeModelProvider(wait=True)
        await self.assert_error("model_timeout", compiler(provider, deadline_seconds=0.01).compile(TEXT))
        self.assertTrue(provider.cancelled)
        self.assertEqual(provider.calls, 1)

    async def test_one_transient_retry_with_unknown_charge_reserved(self):
        provider = FakeModelProvider([TransientModelError(), ModelReply(EXTRACTION, 200, 100)])
        compiled = await compiler(provider).compile(TEXT)
        self.assertEqual(compiled.parser_mode, "openai_structured")
        self.assertEqual(compiled.model_usage.generation_attempts, 2)
        self.assertEqual(provider.calls, 2)
        provider = FakeModelProvider([TransientModelError(), TransientModelError(), ModelReply(EXTRACTION, 200, 100)])
        await self.assert_error("model_unavailable", compiler(provider).compile(TEXT))
        self.assertEqual(provider.calls, 2)

    async def test_input_total_and_cost_budgets_block_generation_or_retry(self):
        provider = FakeModelProvider(tokens=5000)
        await self.assert_error("model_budget_exhausted", compiler(provider).compile(TEXT))
        self.assertEqual(provider.calls, 0)
        provider = FakeModelProvider([TransientModelError(), ModelReply(EXTRACTION, 200, 100)])
        await self.assert_error("model_budget_exhausted", compiler(provider, max_total_tokens=1000).compile(TEXT))
        self.assertEqual(provider.calls, 1)
        provider = FakeModelProvider()
        configured = compiler(provider)
        configured.policy.max_cost_usd = Decimal("0.00001")
        await self.assert_error("model_budget_exhausted", configured.compile(TEXT))
        self.assertEqual(provider.calls, 0)

    async def test_usage_over_reserved_tokens_is_rejected(self):
        for response in (ModelReply(EXTRACTION, 201, 100), ModelReply(EXTRACTION, 200, 769)):
            await self.assert_error("invalid_model_usage", compiler(FakeModelProvider([response])).compile(TEXT))

    async def test_missing_backend_rejects_before_any_paid_compilation(self):
        provider = FakeModelProvider()
        service = Orchestrator(compiler=compiler(provider))
        error = await self.assert_error("simulation_unavailable", service.submit(analysis_request(text=TEXT)))
        self.assertFalse(error.details["objective_validated"])
        self.assertEqual(provider.count_calls, 0)
        await service.close()
        self.assertTrue(provider.closed)

    async def test_duplicate_concurrent_submit_compiles_and_runs_only_once(self):
        provider, backend = FakeModelProvider(), MockBaselineBackend("wait")
        service = Orchestrator(compiler=compiler(provider), backend=backend)
        self.addAsyncCleanup(service.close)
        request = analysis_request(text=TEXT)
        first, second = await asyncio.gather(service.submit(request), service.submit(request))
        self.assertEqual(first, second)
        self.assertEqual(provider.calls, 1)
        await backend.started.wait()
        self.assertEqual(backend.calls, 1)
        self.assertEqual(service.store.get(first["run_id"]).model_usage["generation_attempts"], 1)
        await self.assert_error("run_capacity_exceeded", service.submit(analysis_request(text=TEXT, client_request_id="other")))
        self.assertEqual(provider.calls, 1)

    async def test_failed_compilation_replay_is_bounded_conflicts_and_expires(self):
        provider = FakeModelProvider([ModelReply(None, 200, 100, "refused"), ModelReply(None, 200, 100, "refused")])
        now = [0.0]
        store = MemoryRunStore(max_runs=1, ttl_seconds=10, clock=lambda: now[0])
        service = Orchestrator(compiler=compiler(provider), backend=MockBaselineBackend(), store=store)
        self.addAsyncCleanup(service.close)
        request = analysis_request(text=TEXT)
        for _ in range(2):
            await self.assert_error("model_refused", service.submit(request))
        self.assertEqual(provider.calls, 1)
        await self.assert_error("idempotency_conflict", service.submit(analysis_request(text=TEXT + " Please.", client_request_id=request.client_request_id)))
        now[0] = 11.0
        await self.assert_error("model_refused", service.submit(request))
        self.assertEqual(provider.calls, 2)
        self.assertEqual(len(service._compilations), 1)

    async def test_unknown_dataset_blocks_paid_compilation(self):
        provider = FakeModelProvider()
        service = Orchestrator(compiler=compiler(provider), backend=MockBaselineBackend())
        self.addAsyncCleanup(service.close)
        await self.assert_error("dataset_not_found", service.submit(analysis_request(text=TEXT, dataset_ids=["missing"])))
        self.assertEqual(provider.count_calls, 0)


class CompilerConfigurationTests(unittest.TestCase):
    def test_default_mode_needs_no_key_or_optional_sdk(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(compiler_from_environment().mode, "deterministic_template")

    def test_explicit_model_mode_requires_key_model_and_prices(self):
        with patch.dict(os.environ, {"CIVIC_OBJECTIVE_COMPILER": "openai"}, clear=True):
            with self.assertRaises(ValueError) as error:
                compiler_from_environment()
            self.assertIn("OPENAI_API_KEY", str(error.exception))
            self.assertIn("CIVIC_MODEL_MAX_COST_USD", str(error.exception))
        for values in ({"max_cost_usd": "NaN"}, {"input_usd_per_million": "Infinity"}, {"output_usd_per_million": "-1"}):
            with self.assertRaises(ValidationError):
                ModelPolicy.model_validate({"max_cost_usd": "1", "input_usd_per_million": "1", "output_usd_per_million": "1"} | values)

    def test_http_model_paraphrase_and_failure_envelope(self):
        provider = FakeModelProvider([ModelReply(EXTRACTION, 200, 100), ModelReply(EXTRACTION | {"impact": "private-secret"}, 200, 100)])
        with TestClient(create_app(compiler=compiler(provider))) as client:
            response = client.post("/api/objectives/validate", json={"text": TEXT})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["data"]["parser_mode"], "openai_structured")
            self.assertFalse(response.json()["data"]["evaluable"])
            self.assertEqual(response.json()["data"]["model_usage"]["model"], "configured-test-model")
            response = client.post("/api/objectives/validate", json={"text": TEXT})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["error"]["code"], "invalid_model_result")
            self.assertNotIn("private-secret", response.text)
            status = client.get("/api/status").json()["data"]
            self.assertTrue(any("OpenAI structured" in value for value in status["limitations"]))
        self.assertTrue(provider.closed)


@unittest.skipUnless(importlib.util.find_spec("openai"), "Optional SDK checks require requirements-agent.txt")
class OpenAITransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_sdk_posts_same_schema_to_count_and_generate_without_network(self):
        import httpx
        from openai import AsyncOpenAI
        from backend.agents.openai_provider import OpenAIProvider
        requests = []

        def transport(request):
            body = json.loads(request.content)
            requests.append((request.url.path, body))
            if request.url.path.endswith("input_tokens"):
                return httpx.Response(200, json={"object": "response.input_tokens", "input_tokens": 200})
            return httpx.Response(200, json={
                "id": "resp_test", "object": "response", "created_at": 1, "status": "completed",
                "model": "configured-test-model", "output": [{
                    "id": "msg_test", "type": "message", "role": "assistant", "status": "completed",
                    "content": [{"type": "output_text", "text": json.dumps(EXTRACTION), "annotations": []}],
                }], "usage": {"input_tokens": 200, "output_tokens": 100, "total_tokens": 300},
            })

        provider = OpenAIProvider("test-only-no-real-key")
        await provider.close()
        provider.client = AsyncOpenAI(api_key="test-only-no-real-key", max_retries=0,
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(transport)))
        self.addAsyncCleanup(provider.close)
        result = await compiler(provider).compile(TEXT)
        self.assertEqual(result.objective.constraint.maximum_journey_minutes, 30)
        self.assertEqual(requests[0][0], "/v1/responses/input_tokens")
        self.assertEqual(requests[1][0], "/v1/responses")
        self.assertEqual(requests[0][1]["text"], requests[1][1]["text"])
        self.assertFalse(requests[1][1]["store"])
        self.assertEqual(requests[1][1]["max_output_tokens"], 768)

"""Optional OpenAI Responses transport, loaded only for explicit model mode."""

import json

from backend.agents.model_compiler import ModelReply, TransientModelError
from backend.orchestration.errors import WorkflowError


class OpenAIProvider:
    def __init__(self, api_key: str):
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise ValueError("Install backend/requirements-agent.txt for OpenAI mode") from exc
        self.client = AsyncOpenAI(api_key=api_key, base_url="https://api.openai.com/v1", max_retries=0, timeout=10.0)

    async def _call(self, operation, **kwargs):
        from openai import APIConnectionError, APIStatusError
        try:
            return await operation(**kwargs)
        except APIConnectionError as exc:
            raise TransientModelError() from exc
        except APIStatusError as exc:
            if exc.status_code == 429 or exc.status_code >= 500:
                raise TransientModelError() from exc
            raise WorkflowError(503, "model_configuration_error", "Objective model credentials or configuration were rejected.") from exc

    async def count_tokens(self, request: dict) -> int:
        response = await self._call(self.client.responses.input_tokens.count, **request)
        return response.input_tokens

    async def generate(self, request: dict, max_output_tokens: int) -> ModelReply:
        response = await self._call(
            self.client.responses.create, **request, max_output_tokens=max_output_tokens, store=False,
        )
        if response.usage is None:
            raise WorkflowError(503, "invalid_model_usage", "Objective model did not report usage.")
        status = "completed" if response.status == "completed" else "incomplete"
        if any(part.type == "refusal" for output in response.output if output.type == "message" for part in output.content):
            status = "refused"
        payload = None
        if status == "completed":
            if len(response.output_text.encode("utf-8")) > 32768:
                raise WorkflowError(503, "invalid_model_result", "Objective output exceeds the allowed size.")
            try:
                payload = json.loads(response.output_text)
            except (ValueError, TypeError) as exc:
                raise WorkflowError(503, "invalid_model_result", "Objective model did not return valid JSON.") from exc
        return ModelReply(payload, response.usage.input_tokens, response.usage.output_tokens, status)

    async def close(self) -> None:
        await self.client.close()

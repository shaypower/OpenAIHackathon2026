"""Budgets for cooperative asynchronous tools; no tool is registered by default."""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import time
import math
from typing import Awaitable, Callable, TypeVar
from uuid import uuid4

from backend.orchestration.errors import WorkflowError

T = TypeVar("T")


def validate_tool_output(schema, output):
    """Rebuild nested models so mutated/model_construct instances cannot skip fields."""
    value = schema.model_validate(output)
    return schema.model_validate(value.model_dump())


@dataclass(frozen=True)
class RunLimits:
    max_tool_actions: int = 12
    max_candidates: int = 20
    max_refinements: int = 1
    run_deadline_seconds: float = 30.0

    def __post_init__(self):
        if (
            any(type(value) is not int or value < 1 for value in (self.max_tool_actions, self.max_candidates, self.max_refinements))
            or not math.isfinite(self.run_deadline_seconds) or self.run_deadline_seconds <= 0
        ):
            raise ValueError("Execution limits must be positive")


class ExecutionContext:
    def __init__(self, limits: RunLimits, *, deadline: float | None = None, on_trace=None):
        self.limits = limits
        self.deadline = deadline if deadline is not None else time.monotonic() + limits.run_deadline_seconds
        self.trace: list[dict] = []
        self.candidates = 0
        self.refinements = 0
        self.on_trace = on_trace

    def check_deadline(self):
        if time.monotonic() >= self.deadline:
            raise WorkflowError(504, "execution_deadline", "Run execution deadline was reached.")

    def reserve_candidates(self, count: int):
        self.check_deadline()
        if type(count) is not int or count < 0 or self.candidates + count > self.limits.max_candidates:
            raise WorkflowError(429, "candidate_budget_exhausted", "Candidate evaluation limit was reached.")
        self.candidates += count

    def reserve_refinement(self):
        self.check_deadline()
        if self.refinements >= self.limits.max_refinements:
            raise WorkflowError(429, "refinement_budget_exhausted", "Refinement limit was reached.")
        self.refinements += 1

    async def call_tool(self, name: str, input_refs: list[str], output_ref: str, operation: Callable[[], Awaitable[T]]) -> T:
        self.check_deadline()
        if len(self.trace) >= self.limits.max_tool_actions:
            raise WorkflowError(429, "tool_budget_exhausted", "Tool action limit was reached.")
        action = {
            "action_id": f"action-{uuid4()}", "tool": name, "status": "running",
            "input_refs": list(input_refs), "output_ref": None,
            "started_at": datetime.now(timezone.utc), "ended_at": None, "error_code": None,
        }
        self.trace.append(action)
        if self.on_trace:
            self.on_trace(self.trace)
        try:
            result = await asyncio.wait_for(operation(), timeout=max(0, self.deadline - time.monotonic()))
            self.check_deadline()
        except TimeoutError as exc:
            action.update(status="failed", error_code="execution_deadline")
            raise WorkflowError(504, "execution_deadline", "Run execution deadline was reached.") from exc
        except asyncio.CancelledError:
            action.update(status="cancelled", error_code="run_cancelled")
            raise
        except WorkflowError as exc:
            action.update(status="failed", error_code=exc.code)
            raise
        except Exception as exc:
            action.update(status="failed", error_code="tool_failed")
            raise WorkflowError(503, "tool_failed", "A deterministic tool failed.") from exc
        else:
            action.update(status="succeeded", output_ref=output_ref)
            return result
        finally:
            action["ended_at"] = datetime.now(timezone.utc)
            if self.on_trace:
                self.on_trace(self.trace)

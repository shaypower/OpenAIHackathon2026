"""Baseline boundary for B's future adapter; the production backend is unavailable."""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import math
import time
from typing import Literal, Protocol
from uuid import uuid4

from pydantic import Field, ValidationError, model_validator

from backend.agents.objectives import compile_objective
from backend.domain.models import (
    AccessibilityResult, CivicObjective, Contract, DataMode, Evidence, Journey,
    Provenance, SimulationMetrics, SimulationRun,
)
from backend.orchestration.errors import WorkflowError
from backend.orchestration.execution import ExecutionContext, RunLimits
from backend.orchestration.store import MemoryRunStore, RunRecord, fingerprint


class BaselineResult(Contract):
    metrics: SimulationMetrics
    accessibility: list[AccessibilityResult] = Field(default_factory=list)
    journeys: list[Journey] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    provenance: list[Provenance] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def consistent_results(self):
        for item in [self.metrics, *self.accessibility]:
            if item.reachable_residents > item.cohort_residents:
                raise ValueError("Reachable count exceeds cohort")
            if item.cohort_residents == 0:
                if item.access_percent is not None:
                    raise ValueError("Zero cohort must have null access")
            elif item.access_percent is None or not math.isclose(
                item.access_percent, 100 * item.reachable_residents / item.cohort_residents, abs_tol=0.01,
            ):
                raise ValueError("Access percentage disagrees with counts")
        if not self.accessibility and self.metrics.cohort_residents:
            raise ValueError("Nonempty cohort needs community accessibility results")
        if self.accessibility:
            if sum(item.cohort_residents for item in self.accessibility) != self.metrics.cohort_residents:
                raise ValueError("Community cohorts disagree with aggregate")
            if sum(item.reachable_residents for item in self.accessibility) != self.metrics.reachable_residents:
                raise ValueError("Community reachability disagrees with aggregate")
        for records, key in ((self.accessibility, "community_id"), (self.journeys, "id"), (self.evidence, "id"), (self.provenance, "id")):
            ids = [getattr(item, key) for item in records]
            if len(ids) != len(set(ids)):
                raise ValueError("Duplicate result IDs")
        journeys = {item.id for item in self.journeys}
        evidence = {item.id for item in self.evidence}
        provenance = {item.id: item for item in self.provenance}
        for item in self.accessibility:
            if not set(item.journey_ids) <= journeys:
                raise ValueError("Unresolved journey reference")
            for failure in item.failures:
                if not set(failure.evidence_ids) <= evidence:
                    raise ValueError("Unresolved failure evidence")
        for item in self.evidence:
            if not set(item.provenance_ids) <= provenance.keys():
                raise ValueError("Unresolved provenance reference")
            if item.verification == "verified" and any(provenance[key].data_mode == "synthetic" for key in item.provenance_ids):
                raise ValueError("Synthetic evidence cannot be publicly verified")
        for journey in self.journeys:
            for leg in journey.legs:
                if not set(leg.evidence_ids) <= evidence:
                    raise ValueError("Unresolved journey evidence")
        return self


@dataclass(frozen=True)
class BackendCapabilities:
    region_ids: tuple[str, ...]
    dataset_ids: tuple[str, ...]
    demand_config_ids: tuple[str, ...]
    data_mode: DataMode
    engine_version: str
    implementation_status: Literal["IMPLEMENTED", "MOCKED"] = "IMPLEMENTED"


@dataclass(frozen=True)
class BaselineInputs:
    objective_json: str
    dataset_ids: tuple[str, ...]
    demand_config_id: str
    departure_at: datetime
    timezone: str

    @property
    def objective(self) -> CivicObjective:
        return CivicObjective.model_validate_json(self.objective_json)


class BaselineBackend(Protocol):
    """Adapter must resolve immutable IDs, support the compiled cohort and cooperate with cancellation.

    This is C's integration seam, not an implementation of B's simulation facade.
    CPU-bound routing must be bounded/isolated by B; async timeouts cannot interrupt it.
    """

    capabilities: BackendCapabilities

    def validate_inputs(self, inputs: BaselineInputs) -> None:
        """Pure, bounded check of loaded snapshot/config/cohort compatibility before acceptance."""
        ...

    async def run_baseline(self, inputs: BaselineInputs, context: ExecutionContext) -> BaselineResult: ...


class Orchestrator:
    def __init__(self, *, store=None, backend: BaselineBackend | None = None, limits=None):
        self.store = store if store is not None else MemoryRunStore()
        self.backend = backend
        self.limits = limits if limits is not None else RunLimits()
        self._tasks: dict[str, asyncio.Task] = {}
        self._closing = False

    async def submit(self, request) -> dict:
        payload = request.model_dump(mode="json")
        digest = fingerprint("POST /api/objectives/analyse", payload)
        replay = self.store.replay(request.client_request_id, digest)
        if replay is not None:
            return replay
        compiled = compile_objective(request.text)
        if self.backend is None:
            raise WorkflowError(
                503, "simulation_unavailable", "No deterministic simulation backend is connected.",
                retryable=True, details={"objective_validated": True, "parser_mode": "deterministic_template"},
            )
        if self._closing:
            raise WorkflowError(503, "server_stopping", "Server is shutting down.", retryable=True)
        caps = self.backend.capabilities
        if compiled.objective.region_id not in caps.region_ids:
            raise WorkflowError(422, "unsupported_objective", "The backend does not evaluate this geography.")
        if not set(request.dataset_ids) <= set(caps.dataset_ids):
            raise WorkflowError(404, "dataset_not_found", "One or more dataset IDs are unavailable.")
        if request.demand_config_id not in caps.demand_config_ids:
            raise WorkflowError(404, "demand_config_not_found", "Demand configuration is unavailable.")

        inputs = BaselineInputs(
            objective_json=compiled.objective.model_dump_json(), dataset_ids=tuple(request.dataset_ids),
            demand_config_id=request.demand_config_id, departure_at=request.departure_at, timezone=request.timezone,
        )
        try:
            self.backend.validate_inputs(inputs)
        except WorkflowError:
            raise
        except Exception as exc:
            raise WorkflowError(503, "invalid_backend_context", "Backend could not validate the requested context.") from exc

        now = datetime.now(timezone.utc)
        run_id = f"run-{uuid4()}"
        run = SimulationRun(
            id=run_id, objective=compiled.objective, kind="baseline", status="queued", phase="queued",
            data_mode=caps.data_mode, created_at=now, updated_at=now,
            departure_at=request.departure_at, timezone=request.timezone,
            input_dataset_ids=request.dataset_ids, demand_config_id=request.demand_config_id,
            engine_version=caps.engine_version,
        )
        acceptance = {
            "run_id": run_id, "status": "queued", "data_mode": caps.data_mode,
            "objective": compiled.objective.model_dump(mode="json"),
            "assumptions": list(compiled.assumptions), "poll_url": f"/api/runs/{run_id}",
        }
        record = RunRecord(
            run, acceptance, list(compiled.assumptions),
            ["Runs and replay records are process-local and lost on restart, expiry or eviction."],
        )
        acceptance, created = self.store.create(record, request.client_request_id, digest)
        if created:
            deadline = time.monotonic() + self.limits.run_deadline_seconds
            task = asyncio.create_task(self._execute(run_id, inputs, self.backend, deadline))
            self._tasks[run_id] = task
            task.add_done_callback(lambda completed: self._tasks.pop(run_id, None))
        return acceptance

    async def _execute(self, run_id, inputs, backend, deadline):
        context = ExecutionContext(self.limits, deadline=deadline, on_trace=lambda trace: self.store.set_trace(run_id, trace))
        try:
            self.store.transition(run_id, "running", phase="baseline")

            async def baseline():
                output = await backend.run_baseline(inputs, context)
                try:
                    result = BaselineResult.model_validate(output)
                    mode = backend.capabilities.data_mode
                    if mode != "mixed" and any(item.data_mode != mode for item in [*result.accessibility, *result.journeys]):
                        raise ValueError("Result data mode disagrees with backend")
                    return result
                except (ValidationError, ValueError) as exc:
                    raise WorkflowError(503, "invalid_tool_result", "Simulation tool returned an invalid result.") from exc

            result = await context.call_tool(
                "run_baseline", [inputs.objective.id, *inputs.dataset_ids, inputs.demand_config_id], run_id, baseline,
            )
            self.store.transition(
                run_id, "succeeded", phase="completed", before=result.metrics,
                accessibility=result.accessibility, journeys=result.journeys,
                evidence=result.evidence, provenance=result.provenance,
            )
            # Limitations belong to the immutable readback, alongside tool results.
            self.store.add_limitations(run_id, result.limitations)
        except asyncio.CancelledError:
            self.store.transition(run_id, "cancelled", phase="cancelled", error_code="server_shutdown")
            raise
        except WorkflowError as exc:
            self.store.transition(run_id, "failed", phase="failed", error_code=exc.code)
        except Exception:
            self.store.transition(run_id, "failed", phase="failed", error_code="tool_failed")
        finally:
            self.store.set_trace(run_id, context.trace)

    async def close(self):
        self._closing = True
        pending = list(self._tasks.items())
        tasks = [task for _, task in pending]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        # A task cancelled before its coroutine first runs has no finally block.
        for run_id, _ in pending:
            try:
                record = self.store.get(run_id)
                if record.run.status in {"queued", "running"}:
                    self.store.transition(run_id, "cancelled", phase="cancelled", error_code="server_shutdown")
            except WorkflowError:
                pass

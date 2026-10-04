"""Bounded process-local snapshots and idempotency; all records are lost on restart."""

from collections import OrderedDict
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import json
from threading import RLock
import time
from typing import Callable

from backend.domain.models import SimulationRun
from backend.orchestration.errors import WorkflowError

TERMINAL = {"succeeded", "failed", "cancelled"}
TRANSITIONS = {"queued": {"running", "failed", "cancelled"}, "running": TERMINAL}


@dataclass
class RunRecord:
    run: SimulationRun
    acceptance: dict
    assumptions: list[str]
    limitations: list[str]
    tool_trace: list[dict] = field(default_factory=list)
    model_usage: dict | None = None


@dataclass
class StoredRun:
    record: RunRecord
    request_id: str
    fingerprint: str
    expires_at: float


def fingerprint(method: str, payload: dict) -> str:
    encoded = json.dumps([method, payload], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class MemoryRunStore:
    def __init__(self, *, max_runs=100, ttl_seconds=3600, clock: Callable[[], float] = time.monotonic):
        if max_runs < 1 or ttl_seconds <= 0:
            raise ValueError("Store capacity and TTL must be positive")
        self.max_runs = max_runs
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._runs: OrderedDict[str, StoredRun] = OrderedDict()
        self._requests: dict[str, str] = {}
        self._lock = RLock()

    def _remove(self, run_id):
        item = self._runs.pop(run_id)
        self._requests.pop(item.request_id, None)

    def _prune(self):
        for run_id, item in list(self._runs.items()):
            if item.expires_at <= self.clock() and item.record.run.status in TERMINAL:
                self._remove(run_id)

    def replay(self, request_id: str, digest: str) -> dict | None:
        with self._lock:
            self._prune()
            run_id = self._requests.get(request_id)
            if run_id is None:
                return None
            item = self._runs[run_id]
            if item.fingerprint != digest:
                raise WorkflowError(409, "idempotency_conflict", "Request ID was already used with a different method or payload.")
            return deepcopy(item.record.acceptance)

    def create(self, record: RunRecord, request_id: str, digest: str) -> tuple[dict, bool]:
        with self._lock:
            replay = self.replay(request_id, digest)
            if replay is not None:
                return replay, False
            if any(item.record.run.status not in TERMINAL for item in self._runs.values()):
                raise WorkflowError(429, "run_capacity_exceeded", "One run is already active in this local server.", retryable=True)
            run_id = record.run.id
            if run_id in self._runs:
                raise WorkflowError(409, "duplicate_run", "Run ID already exists.")
            if len(self._runs) >= self.max_runs:
                # Active records are never evicted; completed records retain insertion order.
                self._remove(next(iter(self._runs)))
            self._runs[run_id] = StoredRun(deepcopy(record), request_id, digest, self.clock() + self.ttl_seconds)
            self._requests[request_id] = run_id
            return deepcopy(record.acceptance), True

    def get(self, run_id: str) -> RunRecord:
        with self._lock:
            self._prune()
            item = self._runs.get(run_id)
            if item is None:
                raise WorkflowError(404, "run_not_found", "Run is unknown, expired, evicted or lost after restart.")
            return deepcopy(item.record)

    def has_active_run(self) -> bool:
        with self._lock:
            self._prune()
            return any(item.record.run.status not in TERMINAL for item in self._runs.values())

    def transition(self, run_id: str, status: str, *, phase: str, **changes) -> None:
        with self._lock:
            item = self._runs[run_id]
            old = item.record.run
            if status not in TRANSITIONS.get(old.status, set()):
                raise WorkflowError(409, "invalid_run_transition", "Run lifecycle cannot move to the requested state.")
            immutable = {"id", "objective", "kind", "created_at", "departure_at", "timezone", "input_dataset_ids", "demand_config_id", "engine_version", "data_mode"}
            if immutable.intersection(changes):
                raise WorkflowError(409, "immutable_run_input", "Run inputs cannot change after acceptance.")
            updated = old.model_dump()
            updated.update(deepcopy(changes), status=status, phase=phase, updated_at=datetime.now(timezone.utc))
            if status in {"failed", "cancelled"}:
                updated.update(before=None, after=None, accessibility=[], journeys=[], evidence=[], provenance=[])
            if status == "succeeded" and updated.get("before") is None:
                raise WorkflowError(409, "result_not_ready", "A succeeded baseline must contain tool-calculated results.")
            item.record.run = SimulationRun.model_validate(updated)

    def set_trace(self, run_id: str, trace: list[dict]) -> None:
        with self._lock:
            if run_id in self._runs:
                self._runs[run_id].record.tool_trace = deepcopy(trace)

    def add_limitations(self, run_id: str, limitations: list[str]) -> None:
        with self._lock:
            if run_id in self._runs:
                self._runs[run_id].record.limitations.extend(list(limitations))

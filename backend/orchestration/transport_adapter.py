"""C-owned cancellation and DTO adapter around B's synthetic transport facade."""

import asyncio
import json
from pathlib import Path
import sys
from uuid import uuid4

from backend.agents.workflow import CandidateBatch, CandidateEvaluation, CandidateRanking
from backend.orchestration.errors import WorkflowError
from backend.orchestration.service import BaselineResult
from backend.orchestration.execution import validate_tool_output
from backend.simulation.c_backend import SyntheticBaselineBackend


class SyntheticTransportAdapter(SyntheticBaselineBackend):
    """Explicit opt-in only; never interprets A's real layers as a valid cohort.

    Each action runs in a fresh, killable process. Candidate operations rebuild
    B's immutable synthetic fixture and verify its baseline against C's record.
    No routing calculation is performed on the API event loop.
    """

    supported_intervention_kinds = ("timetable_change",)

    async def _invoke(self, payload):
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "backend.orchestration.transport_worker",
            cwd=Path(__file__).resolve().parents[2],
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            output, _ = await process.communicate(json.dumps(payload, allow_nan=False).encode())
            if process.returncode != 0 or len(output) > 2_000_000:
                raise WorkflowError(503, "tool_failed", "Transport worker failed.")
            response = json.loads(output)
            if "error" in response:
                known = {"would_remove_access", "invalid_change", "invalid_reference", "unsupported_change",
                         "unsupported_operational_assumptions", "missing_data", "candidate_limit"}
                code = response["error"].get("code")
                code = code if code in known else "tool_failed"
                raise WorkflowError(422 if code in known else 503, code, "Transport tool could not evaluate these inputs.")
            return response["data"]
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()

    @staticmethod
    def _context(baseline):
        return {"objective": baseline.objective.model_dump(mode="json"),
                "departure_at": baseline.departure_at.isoformat(),
                "demand_config_id": baseline.demand_config_id}

    @staticmethod
    def _check_baseline(baseline, output):
        recomputed = validate_tool_output(BaselineResult, output)
        if (recomputed.metrics != baseline.before or recomputed.accessibility != baseline.accessibility
                or recomputed.journeys != baseline.journeys or recomputed.evidence != baseline.evidence
                or recomputed.provenance != baseline.provenance):
            raise WorkflowError(409, "baseline_context_mismatch", "Transport inputs do not reproduce the pinned baseline.")

    async def run_baseline(self, inputs, context):
        context.check_deadline()
        result = await self._invoke({"action": "baseline", "objective": inputs.objective.model_dump(mode="json"),
            "departure_at": inputs.departure_at.isoformat(), "demand_config_id": inputs.demand_config_id})
        context.check_deadline()
        return validate_tool_output(BaselineResult, result)

    def validate_candidate(self, baseline, candidate):
        if (baseline.engine_version != self.capabilities.engine_version
                or set(baseline.input_dataset_ids) != set(self.capabilities.dataset_ids)
                or baseline.demand_config_id not in self.capabilities.demand_config_ids
                or baseline.timezone != self.snapshot.feed.timezone
                or baseline.data_mode != self.capabilities.data_mode
                or candidate.objective_id != baseline.objective.id
                or candidate.data_mode != baseline.data_mode
                or not candidate.community_ids
                or not set(candidate.community_ids) <= {item.community_id for item in baseline.accessibility}
                or not set(candidate.evidence_ids) <= {item.id for item in baseline.evidence}
                or len(candidate.changes) != 1 or candidate.changes[0].kind != "timetable_change"):
            raise WorkflowError(422, "unsupported_intervention", "Candidate or baseline does not match the synthetic transport context.")
        change = candidate.changes[0]
        trip = self.snapshot.feed.trips.get(change.trip_id)
        if (trip is None or abs(change.shift_minutes) > 30
                or trip.service_id not in self.snapshot.feed.active_service_ids(baseline.departure_at.date())):
            raise WorkflowError(422, "invalid_change", "Trip is unknown, inactive, or outside the supported shift window.")

    async def generate_candidates(self, baseline, *, community_ids, allowed_kinds, max_candidates, previous_evaluations):
        output = await self._invoke(self._context(baseline) | {"action": "generate",
            "community_ids": list(community_ids), "allowed_kinds": list(allowed_kinds),
            "max_candidates": max_candidates,
            "previous_intervention_ids": [item.intervention_id for item in previous_evaluations]})
        self._check_baseline(baseline, output["baseline"])
        return validate_tool_output(CandidateBatch, output["output"])

    async def simulate_candidate(self, baseline, candidate):
        self.validate_candidate(baseline, candidate)
        output = await self._invoke(self._context(baseline) | {"action": "simulate",
            "candidate": candidate.model_dump(mode="json")})
        self._check_baseline(baseline, output["baseline"])
        return CandidateEvaluation(id=f"evaluation-{uuid4()}", baseline_run_id=baseline.id,
            intervention_id=candidate.id, objective_id=baseline.objective.id,
            input_dataset_ids=baseline.input_dataset_ids, demand_config_id=baseline.demand_config_id,
            departure_at=baseline.departure_at, timezone=baseline.timezone,
            engine_version=baseline.engine_version, result=validate_tool_output(BaselineResult, output["output"]))

    async def rank_candidates(self, baseline, evaluations):
        output = await self._invoke({"action": "rank", "evaluations": [{"id": item.id,
            "intervention_id": item.intervention_id, "metrics": item.result.metrics.model_dump(mode="json")}
            for item in evaluations]})
        return validate_tool_output(CandidateRanking, output)

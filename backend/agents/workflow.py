"""C's predictable agent policy around B-owned proposal/evaluation/ranking tools.

No default adapter or HTTP operation is registered. Inputs must be a succeeded
baseline; evaluation metrics and scores must come from the injected simulator.
"""

from typing import Annotated, Literal, Protocol
from uuid import uuid4

from pydantic import AwareDatetime, Field, ValidationError

from backend.domain.models import Contract, Id, Intervention, SimulationRun
from backend.orchestration.errors import WorkflowError
from backend.orchestration.execution import ExecutionContext, validate_tool_output
from backend.orchestration.service import BaselineResult


class CandidateBatch(Contract):
    items: Annotated[list[Intervention], Field(max_length=20)]


class CandidateEvaluation(Contract):
    id: Id
    baseline_run_id: Id
    intervention_id: Id
    objective_id: Id
    input_dataset_ids: list[Id]
    demand_config_id: Id
    departure_at: AwareDatetime
    timezone: str
    engine_version: str
    result: BaselineResult


class CandidateRank(Contract):
    intervention_id: Id
    evaluation_id: Id
    rank: Annotated[int, Field(ge=1, strict=True)]
    score_components: dict[str, Annotated[float, Field(strict=True)]]


class CandidateRanking(Contract):
    items: Annotated[list[CandidateRank], Field(max_length=20)]


class ProposalArtifact(Contract):
    kind: Literal["proposals"] = "proposals"
    id: Id
    data: CandidateBatch


class EvaluationArtifact(Contract):
    kind: Literal["evaluation"] = "evaluation"
    id: Id
    data: CandidateEvaluation


class RankingArtifact(Contract):
    kind: Literal["ranking"] = "ranking"
    id: Id
    data: CandidateRanking


ToolArtifact = Annotated[ProposalArtifact | EvaluationArtifact | RankingArtifact, Field(discriminator="kind")]


class AgentOutcome(Contract):
    baseline_run_id: Id
    candidates: list[Intervention]
    evaluations: list[CandidateEvaluation]
    ranking: list[CandidateRank]
    selected_intervention_id: Id | None
    limitations: list[str]
    artifacts: list[ToolArtifact] = Field(default_factory=list)


class CandidateTools(Protocol):
    """Proposed C adapter contract; B must agree/map its actual facade to this."""

    supported_intervention_kinds: tuple[str, ...]

    def validate_candidate(self, baseline: SimulationRun, candidate: Intervention) -> None:
        """Bounded pure check of canonical change/graph IDs, scope and dated support."""
        ...

    async def generate_candidates(
        self, baseline: SimulationRun, *, community_ids: tuple[str, ...],
        allowed_kinds: tuple[str, ...], max_candidates: int,
        previous_evaluations: tuple[CandidateEvaluation, ...],
    ) -> CandidateBatch: ...

    async def simulate_candidate(self, baseline: SimulationRun, candidate: Intervention) -> CandidateEvaluation: ...

    async def rank_candidates(
        self, baseline: SimulationRun, evaluations: tuple[CandidateEvaluation, ...],
    ) -> CandidateRanking: ...


class AgentWorkflow:
    def __init__(self, tools: CandidateTools):
        self.tools = tools

    async def run(
        self, baseline: SimulationRun, context: ExecutionContext, *, allowed_kinds: tuple[str, ...],
        max_candidates: int = 3, refine: bool = False,
    ) -> AgentOutcome:
        baseline = SimulationRun.model_validate(baseline.model_dump())
        if baseline.kind != "baseline" or baseline.status != "succeeded" or baseline.before is None:
            raise WorkflowError(409, "baseline_not_ready", "Agent evaluation requires a succeeded baseline.")
        try:
            BaselineResult(
                metrics=baseline.before, accessibility=baseline.accessibility, journeys=baseline.journeys,
                evidence=baseline.evidence, provenance=baseline.provenance,
            )
        except ValidationError as exc:
            raise WorkflowError(503, "invalid_tool_result", "Baseline context is inconsistent.") from exc
        if type(max_candidates) is not int or not 1 <= max_candidates <= 20 or type(refine) is not bool:
            raise WorkflowError(422, "invalid_agent_policy", "Request 1–20 candidates and a boolean refinement policy.")
        if (not allowed_kinds or len(set(allowed_kinds)) != len(allowed_kinds)
                or not set(allowed_kinds) <= set(self.tools.supported_intervention_kinds)):
            raise WorkflowError(422, "unsupported_intervention", "Agent requested a change kind the simulator does not support.")
        communities = tuple(item.community_id for item in baseline.accessibility if item.reachable_residents < item.cohort_residents)
        if not communities:
            return AgentOutcome(
                baseline_run_id=baseline.id, candidates=[], evaluations=[], ranking=[],
                selected_intervention_id=None, limitations=["Baseline contains no cohort residents lacking access; no candidate tool was called."],
            )
        candidates, evaluations, ranks, limitations, artifacts = [], [], [], [], []
        for iteration in range(2 if refine else 1):
            context.check_deadline()
            if iteration:
                context.reserve_refinement()
            # Generation and ranking each consume one action. Reserve one complete
            # future refinement (generate/evaluate/rank), never exceed the outer cap.
            future_actions = 3 if refine and iteration == 0 else 0
            capacity = min(
                max_candidates - len(candidates) - (1 if future_actions else 0),
                context.limits.max_candidates - context.candidates - (1 if future_actions else 0),
                context.limits.max_tool_actions - len(context.trace) - 2 - future_actions,
            )
            if capacity < 1:
                raise WorkflowError(429, "agent_budget_exhausted", "Agent cannot complete the requested evaluation within its action/candidate budget.")
            if capacity < max_candidates:
                limitations.append(f"Candidate batch limited to {capacity} by the remaining execution budget.")

            async def generate():
                batch = validate_tool_output(CandidateBatch, await self.tools.generate_candidates(
                    baseline.model_copy(deep=True), community_ids=communities, allowed_kinds=allowed_kinds,
                    max_candidates=capacity, previous_evaluations=tuple(item.model_copy(deep=True) for item in evaluations),
                ))
                ids = [item.id for item in batch.items]
                if len(ids) != len(set(ids)) or len(ids) > capacity or set(ids).intersection(item.id for item in candidates):
                    raise ValueError("Candidate batch exceeds the cap or duplicates a proposal")
                for item in batch.items:
                    self._validate_proposal(baseline, item, communities, allowed_kinds)
                    self.tools.validate_candidate(baseline.model_copy(deep=True), item.model_copy(deep=True))
                return batch

            proposal_ref = f"agent-output-{uuid4()}"
            batch = await context.call_tool(
                "generate_candidate_interventions", [baseline.id, *communities], proposal_ref, generate,
            )
            artifacts.append(ProposalArtifact(id=proposal_ref, data=batch.model_copy(deep=True)))
            if not batch.items:
                limitations.append("Simulator proposal tool returned no supported candidates.")
                break
            context.reserve_candidates(len(batch.items))
            for candidate in batch.items:
                async def evaluate(candidate=candidate):
                    evaluation = validate_tool_output(CandidateEvaluation, await self.tools.simulate_candidate(
                        baseline.model_copy(deep=True), candidate.model_copy(deep=True),
                    ))
                    self._validate_evaluation(baseline, candidate, evaluation)
                    if evaluation.id in {item.id for item in evaluations}:
                        raise ValueError("Duplicate evaluation reference")
                    return evaluation

                evaluation_ref = f"agent-output-{uuid4()}"
                evaluation = await context.call_tool(
                    "simulate_candidate", [baseline.id, candidate.id], evaluation_ref, evaluate,
                )
                artifacts.append(EvaluationArtifact(id=evaluation_ref, data=evaluation.model_copy(deep=True)))
                candidates.append(candidate.model_copy(deep=True))
                evaluations.append(evaluation.model_copy(deep=True))

            async def rank():
                output = validate_tool_output(CandidateRanking, await self.tools.rank_candidates(
                    baseline.model_copy(deep=True), tuple(item.model_copy(deep=True) for item in evaluations),
                ))
                expected = {(item.intervention_id, item.id) for item in evaluations}
                actual = [(item.intervention_id, item.evaluation_id) for item in output.items]
                if (len(actual) != len(expected) or set(actual) != expected
                        or [item.rank for item in output.items] != list(range(1, len(actual) + 1))):
                    raise ValueError("Ranking must cover each successful evaluation once in rank order")
                return output

            ranking_ref = f"agent-output-{uuid4()}"
            output = await context.call_tool("rank_candidates", [item.id for item in evaluations], ranking_ref, rank)
            artifacts.append(RankingArtifact(id=ranking_ref, data=output.model_copy(deep=True)))
            ranks = output.items
        return AgentOutcome(
            baseline_run_id=baseline.id, candidates=candidates, evaluations=evaluations, ranking=ranks,
            selected_intervention_id=ranks[0].intervention_id if ranks else None, limitations=limitations, artifacts=artifacts,
        )

    def _validate_proposal(self, baseline, item, communities, allowed_kinds):
        known_evidence = {evidence.id for evidence in baseline.evidence}
        if (item.objective_id != baseline.objective.id or item.data_mode != baseline.data_mode
                or len(set(item.community_ids)) != len(item.community_ids)
                or not set(item.community_ids) <= set(communities)
                or not set(item.evidence_ids) <= known_evidence
                or any(change.kind not in allowed_kinds for change in item.changes)
                or any(feature.properties.data_mode != baseline.data_mode
                       or not set(feature.properties.evidence_ids) <= known_evidence for feature in item.features)):
            raise ValueError("Proposal does not match baseline scope, mode, evidence or supported changes")

    def _validate_evaluation(self, baseline, candidate, evaluation):
        expected_context = (
            baseline.id, candidate.id, baseline.objective.id, baseline.input_dataset_ids,
            baseline.demand_config_id, baseline.departure_at, baseline.timezone, baseline.engine_version,
        )
        actual_context = (
            evaluation.baseline_run_id, evaluation.intervention_id, evaluation.objective_id, evaluation.input_dataset_ids,
            evaluation.demand_config_id, evaluation.departure_at, evaluation.timezone, evaluation.engine_version,
        )
        if actual_context != expected_context:
            raise ValueError("Evaluation changed immutable baseline references")
        original_cohorts = {item.community_id: item.cohort_residents for item in baseline.accessibility}
        new_cohorts = {item.community_id: item.cohort_residents for item in evaluation.result.accessibility}
        if original_cohorts != new_cohorts or evaluation.result.metrics.cohort_residents != baseline.before.cohort_residents:
            raise ValueError("Candidate evaluation changed the cohort denominator")
        if any(item.data_mode != baseline.data_mode for item in [*evaluation.result.accessibility, *evaluation.result.journeys]):
            raise ValueError("Candidate evaluation changed analytical data mode")

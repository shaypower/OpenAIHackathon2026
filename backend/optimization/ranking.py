"""Deterministic candidate ranking with explicit unknown operational dimensions."""
from dataclasses import dataclass
from typing import Iterable, Mapping

from backend.routing.gtfs import TransportError
from backend.optimization.search import CANDIDATE_CAP


@dataclass(frozen=True)
class RankedCandidate:
    intervention_id: str
    simulation_run_id: str | None
    rank: int
    score_components: Mapping[str, object]


def rank_candidates(evaluated_candidates: Iterable[object], ranking_config_id: str) -> list[RankedCandidate]:
    values = [item for item in evaluated_candidates if item.result is not None]
    if len(values) > CANDIDATE_CAP:
        raise TransportError("candidate_limit", f"Ranking is capped at {CANDIDATE_CAP} evaluations.")
    if not ranking_config_id.strip():
        raise TransportError("invalid_config", "ranking_config_id is required.")
    # Omit unavailable dimensions consistently; null is never interpreted as free.
    ordered = sorted(values, key=lambda item: (-item.result.metrics.weighted_population_gaining_access,
        item.result.metrics.number_of_changes, item.intervention.id))
    return [RankedCandidate(item.intervention.id, item.simulation_run_id, rank, {
        "weighted_population_gaining_access": item.result.metrics.weighted_population_gaining_access,
        "additional_vehicle_minutes": None, "additional_distance_km": None,
        "number_of_changes": item.result.metrics.number_of_changes, "indicative_cost_eur_week": None,
        "ranking_config_id": ranking_config_id,
        "limitation": "Incomplete operational and cost data; ranked by verified weighted access gain, number of changes, then stable intervention ID.",
    }) for rank, item in enumerate(ordered, 1)]

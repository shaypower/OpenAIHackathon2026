"""Validated target-cohort demand; marginal counts are never intersected here."""
from dataclasses import dataclass

from backend.domain.models import Community, DemandConfig
from backend.routing.gtfs import TransportError


@dataclass(frozen=True)
class Demand:
    residents: int
    weighted_residents: float


def community_demand(community: Community, config: DemandConfig, estimates: dict[str, tuple[int, str, str]] | None = None) -> Demand:
    profile = community.population
    count = profile.target_cohort_residents
    estimate = (estimates or {}).get(community.id)
    if count is None and config.missing_data_policy == "explicit_estimate":
        if estimate is not None:
            count, method, evidence_id = estimate
            if not method.strip() or not evidence_id.strip() or count < 0 or count > profile.total_residents:
                raise TransportError("missing_cohort", f"Invalid evidenced cohort estimate for {community.id!r}.")
    estimated_with_evidence = count is not None and estimate is not None and estimate[0] == count and bool(estimate[1].strip() and estimate[2].strip()) and config.missing_data_policy == "explicit_estimate"
    if profile.cohort_method == "estimated" and not estimated_with_evidence:
        raise TransportError("missing_cohort", f"Estimated cohort for {community.id!r} needs its method and evidence record.")
    if count is None or (profile.cohort_method == "unknown" and not estimated_with_evidence):
        raise TransportError("missing_cohort", f"Target-cohort residents are unknown for {community.id!r}.")
    if count > profile.total_residents:
        raise TransportError("invalid_cohort", f"Target cohort exceeds total residents for {community.id!r}.")
    # The four config values are explicit additive relevance factors. Their
    # mean keeps a 1/1/1/1 policy in resident units and avoids multiplying
    # demographic marginals as if their intersection had been observed.
    factor = (config.objective_relevance + config.demographic_need + config.transport_dependency + config.vulnerability) / 4.0
    return Demand(count, count * factor)

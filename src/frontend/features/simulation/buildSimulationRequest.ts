import type { Intervention, StressScenario } from "@/frontend/domain/models";
import type { SimulationRequest } from "@/frontend/domain/models/simulation";
import type { WorkspaceState } from "@/frontend/features/workspace/state";

/** Capture a bounded snapshot before crossing a simulation provider boundary. */
export function buildSimulationRequest(
  state: WorkspaceState,
  intervention: Intervention,
  scenario?: StressScenario,
): SimulationRequest {
  const community = state.communities.find(
    (c) => c.id === intervention.communityId,
  );
  const baseline = state.results.find(
    (r) => r.communityId === intervention.communityId,
  );
  if (!state.objective || !community || !baseline)
    throw new Error(
      "Simulation requires an objective, community and baseline.",
    );
  if (state.objective.regionId !== community.regionId)
    throw new Error(
      "The objective and community must belong to the same region.",
    );
  const journey =
    state.journey?.communityId === community.id ? state.journey : undefined;
  const investigation =
    state.investigation?.communityId === community.id
      ? state.investigation
      : undefined;
  const observations =
    state.site?.communityId === community.id ? state.site.observations : [];
  const evidence = [
    ...new Map(
      [
        ...community.evidence,
        ...baseline.reason.evidence,
        ...state.services.flatMap((s) => s.evidence),
        ...intervention.evidence,
        ...(investigation?.evidence ?? []),
        ...observations.flatMap((o) => o.evidence),
      ].map((e) => [e.id, e]),
    ).values(),
  ];
  const sources = [
    ...new Map(evidence.map((e) => [e.source.id, e.source])).values(),
  ];
  // This builder is scoped to the current synthetic workspace, not real ingestion.
  if (
    !state.objective.mock ||
    !baseline.mock ||
    !intervention.mock ||
    sources.some((s) => !s.mock)
  )
    throw new Error(
      "The demo context builder accepts synthetic inputs only. Use a validated snapshot adapter for real data.",
    );
  return structuredClone({
    context: {
      schemaVersion: 1,
      objective: state.objective,
      community,
      baseline,
      services: state.services,
      transit: { routes: state.routes, stops: state.stops },
      journey,
      investigation,
      observations,
      evidence,
      sources,
      missingInputs: [
        "Joint count of residents aged 65+ without car access",
        "Routable street graph and accessible walking constraints",
        "Dated transit trips, stop times and service calendars",
        "Facility opening hours, appointment capacity and eligibility",
        "Executable intervention changes and disruption edge/service/trip IDs",
        "Evaluation departure window and cost/resource limits",
      ],
      reproducibility: {
        snapshotId: "synthetic-tipperary-v1",
        engineVersion: "fixture-replay-v1",
        seed: 0,
        timezone: "Europe/Dublin",
      },
      mock: true,
    },
    intervention,
    scenario,
  });
}

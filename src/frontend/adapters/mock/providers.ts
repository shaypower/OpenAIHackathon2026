import type {
  FrontendProviders,
  RequestContext,
} from "@/frontend/domain/contracts/providers";
import type { CivicEvent, CivicEventPayload } from "@/frontend/domain/events";
import type { SimulationRequest } from "@/frontend/domain/models/simulation";
import type { CivicObjective, SimulationRun } from "@/frontend/domain/models";
import {
  communities,
  evidence,
  interventionsFor,
  journeyFor,
  results,
  routes,
  scenarios,
  services,
  siteFor,
  stops,
} from "@/frontend/mocks/fixtures";
import { schematicSceneProvider } from "@/frontend/adapters/spatial/schematicScene";
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
      return;
    }
    const finish = () => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    function cancel() {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
    }
    signal.addEventListener("abort", cancel, { once: true });
  });
}
function requireCommunity(id: string) {
  const c = communities.find((c) => c.id === id);
  if (!c)
    throw new Error("Community not found. Choose an available demo community.");
  return c;
}
export function createMockProviders(
  options: { latency?: number; failNext?: () => boolean } = {},
): FrontendProviders {
  const latency = options.latency ?? 380;
  const wait = async (ctx: RequestContext, factor = 1) => {
    await delay(latency * factor, ctx.signal);
    if (options.failNext?.())
      throw new Error(
        "The demo provider is temporarily unavailable. Retry or reset the demo.",
      );
  };
  const simulation = (
    request: SimulationRequest,
    status: SimulationRun["status"] = "verified",
  ): SimulationRun => ({
    id: `simulation-${request.intervention.id}`,
    communityId: request.context.community.id,
    interventionId: request.intervention.id,
    beforePercent: request.context.baseline.accessPercent,
    afterPercent: request.intervention.impact.accessPercent,
    affectedResidents: 0,
    status,
    mock: true,
  });
  return {
    data: {
      async getCommunities(ctx) {
        await wait(ctx);
        return structuredClone(communities);
      },
      async getServices(ctx) {
        await wait(ctx);
        return structuredClone(services);
      },
      async getTransit(ctx) {
        await wait(ctx);
        return structuredClone({ routes, stops });
      },
      async getSiteAudit(id, ctx) {
        requireCommunity(id);
        await wait(ctx);
        return siteFor(id);
      },
    },
    accessibility: {
      async *submitObjective(text, ctx) {
        if (text.trim().length < 12)
          throw new Error(
            "Describe a civic objective in at least 12 characters.",
          );
        let sequence = 0;
        const objective: CivicObjective = {
          id: ctx.operationId,
          text: text.trim(),
          regionId: "tipperary",
          targetMinutes: 45,
          targetAccessPercent: 90,
          cohort: "Residents aged 65+ without cars",
          mock: true,
        };
        const wrap = (event: CivicEventPayload): CivicEvent => ({
          ...event,
          operationId: ctx.operationId,
          sequence: ++sequence,
          timestamp: new Date().toISOString(),
          schemaVersion: 1 as const,
        });
        await wait(ctx);
        yield wrap({ type: "objective.parsed", objective });
        await wait(ctx);
        yield wrap({ type: "analysis.started" });
        for (const result of results) {
          await wait(ctx, 0.7);
          yield wrap({
            type: "community.failed",
            result: structuredClone(result),
          });
        }
        await wait(ctx);
        yield wrap({
          type: "investigation.started",
          communityId: communities[0].id,
        });
        for (const item of evidence) {
          yield wrap({ type: "evidence.found", evidence: item });
        }
        await wait(ctx);
        yield wrap({ type: "analysis.completed" });
      },
      async getCommunityAnalysis(id, ctx) {
        requireCommunity(id);
        await wait(ctx);
        return structuredClone(results.find((r) => r.communityId === id)!);
      },
      async getJourney(id, ctx) {
        requireCommunity(id);
        await wait(ctx);
        return journeyFor(id);
      },
    },
    investigation: {
      async investigate(id, ctx) {
        requireCommunity(id);
        await wait(ctx);
        return {
          communityId: id,
          rootCause: results.find((r) => r.communityId === id)!.reason
            .description,
          evidence: structuredClone(evidence),
          queriedDatasets: [
            "Synthetic timetable",
            "Synthetic population profile",
            "Synthetic service availability",
          ],
        };
      },
    },
    interventions: {
      async generateInterventions(id, _objective, ctx) {
        requireCommunity(id);
        await wait(ctx, 2);
        return interventionsFor(id);
      },
      async generateContingency(v, s, ctx) {
        await wait(ctx, 2);
        const c = requireCommunity(v.communityId);
        return {
          ...v,
          id: `${v.id}-contingency`,
          name: `Contingency for ${s.name.toLowerCase()}`,
          kind: "contingency",
          description:
            "Reroute the accessible feeder and retain the mobile clinic as an independent fallback.",
          impact: { ...v.impact, accessPercent: 91, resiliencePercent: 96 },
          features: [
            {
              id: "contingency-route",
              label: "Contingency feeder",
              kind: "route",
              geometry: {
                type: "LineString",
                coordinates: [
                  c.center,
                  [c.center[0] - 0.06, c.center[1] - 0.025],
                  [-7.917, 52.658],
                  [-7.813, 52.68],
                ],
              },
            },
            {
              id: "contingency-clinic",
              label: "Backup mobile clinic",
              kind: "facility",
              geometry: {
                type: "Point",
                coordinates: [c.center[0] + 0.018, c.center[1] - 0.008],
              },
            },
          ],
        };
      },
    },
    simulation: {
      async simulateIntervention(request, ctx) {
        await wait(ctx, 2);
        return simulation(
          request,
          request.intervention.kind === "contingency" ? "repaired" : "verified",
        );
      },
      getStressScenarios() {
        return structuredClone(scenarios);
      },
      async runStressScenario(request, ctx) {
        await wait(ctx, 2);
        const { intervention: v, scenario: s } = request;
        return {
          ...simulation(request, "degraded"),
          id: `stress-${s.id}`,
          afterPercent: Math.max(
            0,
            v.impact.accessPercent - s.lossPercentPoints,
          ),
          scenarioId: s.id,
          affectedResidents: s.affectedResidents,
        };
      },
    },
    scene: schematicSceneProvider,
  };
}

import { describe, it, expect } from "vitest";
import { createMockProviders, delay } from "@/frontend/adapters/mock/providers";
import { initialState, workspaceReducer, type WorkspaceState } from "./state";
import {
  DEFAULT_OBJECTIVE,
  communities,
  services,
  routes,
  stops,
  results,
  scenarios,
  siteFor,
} from "@/frontend/mocks/fixtures";
import { mapFeatures } from "@/frontend/adapters/spatial/mapFeatures";
import { buildSimulationRequest } from "@/frontend/features/simulation/buildSimulationRequest";
import type { CivicEvent } from "@/frontend/domain/events";
const context = () => ({
  signal: new AbortController().signal,
  operationId: "test-operation",
});
describe("deterministic civic workflow", () => {
  it("streams failures then simulates, disrupts and repairs a civic patch", async () => {
    const providers = createMockProviders({ latency: 0 });
    const ctx = context();
    let state: WorkspaceState = {
      ...initialState,
      communities,
      services,
      routes,
      stops,
      operationId: ctx.operationId,
    };
    for await (const event of providers.accessibility.submitObjective(
      DEFAULT_OBJECTIVE,
      ctx,
    ))
      state = workspaceReducer(state, { type: "stream", event });
    expect(state.phase.kind).toBe("failures-found");
    expect(state.results).toHaveLength(3);
    expect(state.objective?.mock).toBe(true);
    const candidates = await providers.interventions.generateInterventions(
      "borrisoleigh",
      state.objective!,
      ctx,
    );
    const run = await providers.simulation.simulateIntervention(
      buildSimulationRequest(state, candidates[2]),
      ctx,
    );
    expect(run.beforePercent).toBe(57);
    expect(run.afterPercent).toBe(94);
    const degraded = await providers.simulation.runStressScenario(
      {
        ...buildSimulationRequest(state, candidates[2]),
        scenario: scenarios[0],
      },
      ctx,
    );
    expect(degraded.afterPercent).toBe(68);
    expect(degraded.affectedResidents).toBe(1421);
    const contingency = await providers.interventions.generateContingency(
      candidates[2],
      scenarios[0],
      ctx,
    );
    const repair = await providers.simulation.simulateIntervention(
      buildSimulationRequest(state, contingency, scenarios[0]),
      ctx,
    );
    expect(repair.status).toBe("repaired");
    expect(repair.afterPercent).toBe(91);
  });
  it("ignores duplicate or stale events after reset or operation replacement", () => {
    const e: CivicEvent = {
      type: "analysis.completed",
      operationId: "op1",
      sequence: 3,
      timestamp: "2026-10-04T09:00:00Z",
      schemaVersion: 1,
    };
    const active = { ...initialState, operationId: "op1" };
    const next = workspaceReducer(active, { type: "stream", event: e });
    expect(next.phase.kind).toBe("failures-found");
    expect(workspaceReducer(next, { type: "stream", event: e })).toBe(next);
    expect(
      workspaceReducer(
        { ...next, operationId: "op2" },
        { type: "stream", event: e },
      ).phase.kind,
    ).toBe("failures-found");
    const reset = workspaceReducer(next, { type: "reset" });
    expect(workspaceReducer(reset, { type: "stream", event: e })).toBe(reset);
  });
  it("cancels pending work without emitting successful completion", async () => {
    const controller = new AbortController();
    const pending = delay(500, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const providers = createMockProviders({ latency: 0 });
    const ctx = { signal: controller.signal, operationId: "cancelled" };
    await expect(providers.data.getCommunities(ctx)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
  it("returns explicit recoverable errors for invalid requests and provider failures", async () => {
    const providers = createMockProviders({ latency: 0 });
    await expect(
      providers.data.getSiteAudit("missing", context()),
    ).rejects.toThrow("Community not found");
    const invalidEvents = providers.accessibility.submitObjective(
      "x",
      context(),
    );
    const iterator = invalidEvents[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow("at least 12");
    const broken = createMockProviders({ latency: 0, failNext: () => true });
    await expect(broken.data.getCommunities(context())).rejects.toThrow(
      "temporarily unavailable",
    );
  });
  it("changes map coverage and intervention geometry with before/after and disruption", async () => {
    const providers = createMockProviders({ latency: 0 });
    const objective = {
      id: "goal",
      text: DEFAULT_OBJECTIVE,
      regionId: "tipperary",
      targetMinutes: 45,
      targetAccessPercent: 90,
      cohort: "65+",
      mock: true,
    };
    const [v] = await providers.interventions.generateInterventions(
      "borrisoleigh",
      objective,
      context(),
    );
    const state = {
      ...initialState,
      communities,
      services,
      routes,
      stops,
      results,
      objective,
      selectedId: "borrisoleigh",
      intervention: v,
    };
    const snapshot = {
      state,
      layers: {
        healthcare: true,
        vulnerability: false,
        transport: true,
        failures: true,
      },
      camera: "region" as const,
      offline: true,
    };
    expect(
      mapFeatures(snapshot).communities.features[0].properties?.served,
    ).toBe(false);
    const after = {
      ...snapshot,
      state: { ...state, compare: "after" as const },
    };
    expect(mapFeatures(after).communities.features[0].properties?.served).toBe(
      true,
    );
    const simulation = await providers.simulation.runStressScenario(
      { ...buildSimulationRequest(state, v), scenario: scenarios[0] },
      context(),
    );
    expect(
      mapFeatures({
        ...after,
        state: { ...after.state, simulation, scenario: scenarios[0] },
      }).communities.features[0].properties?.served,
    ).toBe(false);
  });
  it("keeps fixture geometry valid and observations linked to scene annotations", () => {
    for (const c of communities) {
      const ring = c.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring.at(-1));
      for (const [lng, lat] of ring) {
        expect(Number.isFinite(lng) && lng >= -180 && lng <= 180).toBe(true);
        expect(Number.isFinite(lat) && lat >= -90 && lat <= 90).toBe(true);
      }
    }
    const site = siteFor("borrisoleigh");
    for (const o of site.observations) {
      expect(site.annotations.some((a) => a.id === o.annotationId)).toBe(true);
      expect(o.evidence.every((e) => e.source.mock)).toBe(true);
    }
  });
});

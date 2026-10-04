import { describe, expect, it } from "vitest";
import { buildSimulationRequest } from "./buildSimulationRequest";
import { initialState } from "@/frontend/features/workspace/state";
import {
  communities,
  edges,
  transportSources,
  DEFAULT_OBJECTIVE,
  interventionsFor,
  journeyFor,
  results,
  routes,
  scenarios,
  services,
  stops,
} from "@/frontend/mocks/fixtures";

const state = {
  ...initialState,
  communities,
  results,
  routes,
  services,
  stops,
  edges,
  transportSources,
  objective: {
    id: "objective-1",
    text: DEFAULT_OBJECTIVE,
    regionId: "tipperary",
    targetMinutes: 45,
    targetAccessPercent: 90,
    cohort: "Residents aged 65+ without cars",
    mock: true,
  },
  journey: journeyFor("borrisoleigh"),
};
const intervention = interventionsFor("borrisoleigh")[2];

describe("simulation context boundary", () => {
  it("captures serializable, isolated inputs with evidence and reproducibility", () => {
    const request = buildSimulationRequest(state, intervention, scenarios[0]);
    const payload = JSON.parse(JSON.stringify(request));
    expect(payload.context.objective.targetMinutes).toBe(45);
    expect(payload.context.baseline.accessPercent).toBe(57);
    expect(payload.context.journey.legs).toHaveLength(
      state.journey.legs.length,
    );
    expect(payload.context.sources).toHaveLength(3);
    expect(payload.context.transit.edges).toHaveLength(25);
    expect(payload.context.transit.sources[0].kind).toBe("gtfs-shape");
    expect(
      payload.context.sources.every((s: { mock: boolean }) => s.mock),
    ).toBe(true);
    expect(payload.context.missingInputs).toHaveLength(6);
    expect(payload.context.reproducibility.engineVersion).toBe(
      "fixture-replay-v1",
    );
    expect(payload.scenario.id).toBe(scenarios[0].id);
    request.context.community.population.total = 0;
    expect(state.communities[0].population.total).toBe(684);
    request.intervention.impact!.accessPercent = 0;
    expect(intervention.impact!.accessPercent).toBe(94);
  });
  it("rejects incomplete or mixed real/demo input and omits another community's journey", () => {
    expect(() => buildSimulationRequest(initialState, intervention)).toThrow(
      "requires",
    );
    expect(() =>
      buildSimulationRequest(
        { ...state, objective: { ...state.objective, regionId: "other" } },
        intervention,
      ),
    ).toThrow("same region");
    expect(() =>
      buildSimulationRequest(
        { ...state, objective: { ...state.objective, mock: false } },
        intervention,
      ),
    ).toThrow("synthetic inputs only");
    const request = buildSimulationRequest(
      { ...state, journey: journeyFor("roscrea") },
      intervention,
    );
    expect(request.context.journey).toBeUndefined();
  });
});

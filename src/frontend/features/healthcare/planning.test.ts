import { describe, expect, it } from "vitest";
import { hospitalSearchAreas, healthcareSources } from "@/frontend/adapters/data/healthcareSites";
import { calculateHospitalPlan, capitalRange, hospitalMassing, offsetCoordinate, rectangle } from "./planning";
import { mapFeatures } from "@/frontend/adapters/spatial/mapFeatures";
import { initialState } from "@/frontend/features/workspace/state";
import type { HospitalCapacity } from "@/frontend/domain/models/healthcare";

describe("hospital planning calculations and evidence boundary", () => {
  it("accounts for both cost endpoints and refuses unsupported capacities", () => {
    const plan = calculateHospitalPlan(60);
    expect(plan.grossFloorAreaM2).toBe(7200);
    expect(plan.baseCapitalEur).toEqual([66_000_000, 90_000_000]);
    expect(plan.contingencyEur).toEqual([13_200_000, 31_500_000]);
    expect(plan.capitalEur).toEqual([79_200_000, 121_500_000]);
    expect(capitalRange(plan)).toBe("€79.2–121.5m");
    expect(calculateHospitalPlan(40).capitalEur[1]).toBe(81_000_000);
    expect(calculateHospitalPlan(80).capitalEur[0]).toBe(105_600_000);
    for (const invalid of [0, 41, NaN, Infinity])
      expect(() => calculateHospitalPlan(invalid as HospitalCapacity)).toThrow("Unsupported");
  });

  it("preserves metre dimensions, closed polygons and floor area at every supported capacity", () => {
    const area = hospitalSearchAreas[0];
    const radians = Math.PI / 180;
    for (const capacity of [40, 60, 80] as const) {
      const plan = calculateHospitalPlan(capacity);
      const blocks = hospitalMassing(area, plan);
      expect(blocks.reduce((sum, block) => sum + block.grossFloorAreaM2, 0)).toBe(plan.grossFloorAreaM2);
      for (const block of blocks) {
        const ring = block.geometry.coordinates[0];
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        const width = (ring[1][0] - ring[0][0]) * radians * 6_378_137 * Math.cos(block.center[1] * radians);
        const depth = (ring[2][1] - ring[1][1]) * radians * 6_378_137;
        expect(width * depth * block.floors).toBeCloseTo(block.grossFloorAreaM2, 4);
        // Largest programme must stay inside the illustrative 200 m square.
        for (const point of ring) {
          const east = (point[0] - area.center[0]) * radians * 6_378_137 * Math.cos(area.center[1] * radians);
          const north = (point[1] - area.center[1]) * radians * 6_378_137;
          expect(Math.abs(east)).toBeLessThan(100);
          expect(Math.abs(north)).toBeLessThan(100);
        }
      }
    }
    expect(() => offsetCoordinate([NaN, 52], 1, 1)).toThrow();
    expect(() => offsetCoordinate([-8, 90], 1, 1)).toThrow();
    expect(() => rectangle([-8, 52], -20, 50)).toThrow();
  });

  it("keeps preview geometry out of existing context and never creates accessibility results", () => {
    const base = { state: initialState, layers: { healthcare: true, vulnerability: false, transport: true, failures: true }, camera: "region" as const, offline: true };
    const healthcare = { areas: hospitalSearchAreas, selectedId: hospitalSearchAreas[0].id, plan: calculateHospitalPlan(60), showProposal: false };
    const context = mapFeatures({ ...base, healthcare });
    expect(context["hospital-search"].features).toHaveLength(3);
    expect(context["hospital-blocks"].features).toHaveLength(0);
    expect(context["hospital-site"].features).toHaveLength(0);
    // Requesting a preview alone must not emit unverified buildings.
    expect(mapFeatures({ ...base, healthcare: { ...healthcare, showProposal: true } })["hospital-blocks"].features).toHaveLength(0);
    const preview = mapFeatures({ ...base, healthcare: { ...healthcare, showProposal: true,
      placement: { status: "clear", areaId: healthcare.selectedId, beds: 60, center: hospitalSearchAreas[0].center, checkedBuildings: 1, checkedObstacles: 2, checkedAt: "2026-10-04T14:00:00Z" },
    } });
    expect(preview["hospital-blocks"].features).toHaveLength(3);
    expect(preview["hospital-site"].features).toHaveLength(1);
    expect(preview.communities).toEqual(context.communities);
    expect(initialState.results).toEqual([]);
    expect(mapFeatures(base)["hospital-search"].features).toHaveLength(0);
  });

  it("provides unique search areas with attributable evidence and valid geographic anchors", () => {
    expect(new Set(hospitalSearchAreas.map((area) => area.id)).size).toBe(3);
    const sourceIds = new Set(healthcareSources.map((source) => source.id));
    for (const area of hospitalSearchAreas) {
      expect(area.center[0]).toBeGreaterThan(-9);
      expect(area.center[0]).toBeLessThan(-7);
      expect(area.center[1]).toBeGreaterThan(52);
      expect(area.center[1]).toBeLessThan(54);
      expect(area.constraints.length).toBeGreaterThan(0);
      for (const id of area.sourceIds) expect(sourceIds.has(id)).toBe(true);
    }
    for (const source of healthcareSources) {
      expect(new URL(source.url).protocol).toBe("https:");
      expect(source.checkedOn).toBe("2026-10-04");
    }
  });
});

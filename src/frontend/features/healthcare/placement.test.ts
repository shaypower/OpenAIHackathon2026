import { describe, expect, it } from "vitest";
import raw from "@/frontend/public/data/hospital-context.json";
import { parseHospitalContext, screenCapturedHospital, hospitalBenefits } from "./context";
import { envelopeIsClear } from "./placement";
import { offsetCoordinate, rectangle } from "./planning";

describe("hospital placement and local benefit evidence", () => {
  it("independently clears every captured site and capacity against the full obstacle set", () => {
    const context = parseHospitalContext(raw);
    for (const areaId of Object.keys(context.areas)) for (const beds of [40, 60, 80] as const) {
      const result = screenCapturedHospital(context, areaId, beds);
      expect(result.status).toBe("clear");
      if (result.status !== "clear") throw new Error("Blocked fixture");
      expect(result.checkedBuildings).toBeGreaterThan(100);
      const benefits = hospitalBenefits(context, result.center);
      expect(benefits.residents).toBeGreaterThan(0);
      expect(benefits.olderResidents).toBeLessThanOrEqual(benefits.residents);
      expect(benefits.communities.every((c) => c.distanceM <= 3000)).toBe(true);
      expect(benefits.localResidents).toBeLessThanOrEqual(benefits.residents);
    }
  });
  it("rejects a crossing road, surrounding building, inner building and boundary contact", () => {
    const center: [number, number] = [-8.19, 52.85];
    for (const size of [10, 200, 400]) expect(envelopeIsClear(center, 200,
      [{ kind: "building", geometry: rectangle(center, size, size) }])).toBe(false);
    expect(envelopeIsClear(center, 200, [{ kind: "transport", geometry: {
      type: "LineString", coordinates: [offsetCoordinate(center, -300, 0), offsetCoordinate(center, 300, 0)],
    } }])).toBe(false);
    expect(() => envelopeIsClear(center, NaN, [])).toThrow();
    const c = structuredClone(parseHospitalContext(raw));
    c.areas["nenagh-tyone"].features.push({ type: "Feature", geometry: rectangle(c.areas["nenagh-tyone"].screenedCenter!, 20, 20),
      properties: { kind: "building", name: "New obstruction", height: 9 } });
    expect(screenCapturedHospital(c, "nenagh-tyone", 60).status).toBe("blocked");
  });
});

import { describe, expect, it, vi } from "vitest";
import type { HospitalPlacement } from "@/frontend/domain/models/healthcare";
import { confirmHospitalPlacement } from "./confirmPlacement";

const local: Extract<HospitalPlacement, { status: "clear" }> = {
  status: "clear", areaId: "nenagh-tyone", beds: 60, center: [-8.191, 52.86],
  checkedBuildings: 2088, checkedObstacles: 2576, checkedAt: "2026-10-04T14:00:00Z",
  basis: "snapshot", snapshotId: "a".repeat(64),
};
const response = (placement: unknown) => new Response(JSON.stringify({ schema_version: 1, data: { placement } }));

describe("hospital API confirmation", () => {
  it("confirms matching context without overwriting the independently checked geometry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...local, basis: "api" }));
    expect(await confirmHospitalPlacement(local, fetcher)).toEqual({ ...local, basis: "api" });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ area_id: local.areaId, beds: 60, context_id: local.snapshotId });
  });
  it("blocks a contradictory or malformed successful response instead of silently accepting local clearance", async () => {
    for (const change of [{ center: [-8.2, 52.9] }, { beds: 80 }, { areaId: "roscrea" }, { snapshotId: "b".repeat(64) }, { checkedBuildings: 0 }]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...local, ...change }));
      expect((await confirmHospitalPlacement(local, fetcher)).status).toBe("blocked");
    }
    const invalid = vi.fn<typeof fetch>().mockResolvedValue(new Response("not JSON"));
    expect((await confirmHospitalPlacement(local, invalid)).status).toBe("blocked");
  });
  it("preserves an explicit server refusal and labels genuine offline fallback as a snapshot", async () => {
    const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 409 }));
    expect((await confirmHospitalPlacement(local, denied)).status).toBe("blocked");
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Network unavailable"));
    expect(await confirmHospitalPlacement(local, offline)).toEqual(local);
    const unavailable = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 }));
    expect(await confirmHospitalPlacement(local, unavailable)).toEqual(local);
  });
});

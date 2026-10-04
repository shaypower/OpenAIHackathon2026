import type { Polygon } from "geojson";
import type { HospitalBenefits, HospitalCapacity, HospitalContext, HospitalPlacement } from "@/frontend/domain/models/healthcare";
import { envelopeIsClear } from "./placement";
import { offsetCoordinate } from "./planning";

export function distanceMetres(a: [number, number], b: [number, number]): number {
  const radians = Math.PI / 180;
  const x = Math.sin((b[1] - a[1]) * radians / 2) ** 2
    + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin((b[0] - a[0]) * radians / 2) ** 2;
  return 2 * 6_378_137 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function parseHospitalContext(value: unknown): HospitalContext {
  const c = value as HospitalContext;
  if (!c || c.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(c.osmSha256) || !Number.isFinite(Date.parse(c.capturedAt))
    || !Array.isArray(c.communities) || !c.communities.length || c.communities.length > 640 || !c.areas) throw new Error("Hospital context is incomplete.");
  const coordinate = (p: number[]) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= -180 && p[0] <= 180 && p[1] >= -85 && p[1] <= 85;
  for (const area of Object.values(c.areas)) {
    if (!Array.isArray(area.features) || area.features.length < 1 || area.features.length > 20_000 || area.siteSideM !== 200
      || area.bounds.length !== 4 || !area.bounds.every(Number.isFinite) || area.bounds[0] >= area.bounds[2] || area.bounds[1] >= area.bounds[3]
      || (area.screenedCenter && !coordinate(area.screenedCenter))) throw new Error("Invalid mapped obstacles.");
    if (!area.features.some((f) => f.properties.kind === "building")) throw new Error("Building coverage is missing.");
    for (const f of area.features) {
      if (!f.geometry || !["building", "transport", "water", "protected-land"].includes(f.properties.kind)) throw new Error("Invalid obstacle category.");
    }
  }
  if (new Set(c.communities.map((item) => item.id)).size !== c.communities.length) throw new Error("Duplicate Census areas.");
  for (const item of c.communities) {
    if (!coordinate(item.center) || !["Polygon", "MultiPolygon"].includes(item.geometry.type)
      || !Number.isInteger(item.residents) || item.residents < 0
      || [item.olderResidents, item.noCarHouseholds].some((n) => n !== null && (!Number.isInteger(n) || n < 0))) throw new Error("Invalid Census counts.");
  }
  return c;
}

/** A preview is emitted only after checking the entire 4 ha envelope again. */
export function screenCapturedHospital(context: HospitalContext, areaId: string, beds: HospitalCapacity): HospitalPlacement {
  const area = context.areas[areaId];
  if (!area || !area.screenedCenter) return { status: "blocked", areaId, beds, reason: "No clear four-hectare site found in this mapped search area. Choose another area." };
  const center = area.screenedCenter;
  const sw = offsetCoordinate(center, -115, -115), ne = offsetCoordinate(center, 115, 115);
  if (sw[0] < area.bounds[0] || sw[1] < area.bounds[1] || ne[0] > area.bounds[2] || ne[1] > area.bounds[3]
    || !envelopeIsClear(center, area.siteSideM, area.features.map((f) => ({ geometry: f.geometry, kind: f.properties.kind }))))
    return { status: "blocked", areaId, beds, reason: "The full site does not pass the mapped-obstacle check. No hospital has been placed." };
  return { status: "clear", areaId, beds, center, checkedBuildings: area.features.filter((f) => f.properties.kind === "building").length,
    checkedObstacles: area.features.length, checkedAt: context.capturedAt, basis: "snapshot", snapshotId: context.osmSha256 };
}

export function hospitalBenefits(context: HospitalContext, center: [number, number]): HospitalBenefits {
  const communities = context.communities.map((c) => ({ ...c, distanceM: distanceMetres(center, c.center) })).filter((c) => c.distanceM <= 3000);
  return { communities, areaCount: communities.length,
    residents: communities.reduce((n, c) => n + c.residents, 0),
    localResidents: communities.filter((c) => c.distanceM <= 1000).reduce((n, c) => n + c.residents, 0),
    olderResidents: communities.some((c) => c.olderResidents === null) ? null : communities.reduce((n, c) => n + c.olderResidents!, 0),
    noCarHouseholds: communities.some((c) => c.noCarHouseholds === null) ? null : communities.reduce((n, c) => n + c.noCarHouseholds!, 0),
  };
}

export function distanceRing(center: [number, number], radiusM: number): Polygon {
  const ring = Array.from({ length: 97 }, (_, index) => {
    const theta = index / 96 * Math.PI * 2;
    return offsetCoordinate(center, Math.cos(theta) * radiusM, Math.sin(theta) * radiusM);
  });
  ring[ring.length - 1] = ring[0];
  return { type: "Polygon", coordinates: [ring] };
}

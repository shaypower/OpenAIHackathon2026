import type { Polygon } from "geojson";
import type { HospitalBlock, HospitalCapacity, HospitalPlan, HospitalSearchArea, HospitalPlacement } from "@/frontend/domain/models/healthcare";

export const HOSPITAL_CAPACITIES: readonly HospitalCapacity[] = [40, 60, 80];
// Explicit concept allowances, not fitted rates, tender prices or indexed benchmarks.
export const HOSPITAL_ASSUMPTIONS = {
  capitalPerBedEur: [1_100_000, 1_500_000] as const,
  contingency: [0.2, 0.35] as const,
  grossFloorAreaPerBedM2: 120,
  siteAreaHa: 4,
};

export function calculateHospitalPlan(beds: HospitalCapacity): HospitalPlan {
  if (!HOSPITAL_CAPACITIES.includes(beds)) throw new Error("Unsupported hospital capacity");
  const base: [number, number] = [beds * HOSPITAL_ASSUMPTIONS.capitalPerBedEur[0], beds * HOSPITAL_ASSUMPTIONS.capitalPerBedEur[1]];
  const contingency: [number, number] = [
    Math.round(base[0] * HOSPITAL_ASSUMPTIONS.contingency[0]),
    Math.round(base[1] * HOSPITAL_ASSUMPTIONS.contingency[1]),
  ];
  return {
    beds, grossFloorAreaM2: beds * HOSPITAL_ASSUMPTIONS.grossFloorAreaPerBedM2,
    siteAreaHa: HOSPITAL_ASSUMPTIONS.siteAreaHa,
    baseCapitalEur: base, contingencyEur: contingency,
    capitalEur: [base[0] + contingency[0], base[1] + contingency[1]],
  };
}

/** Small-area local tangent-plane conversion in metres; WGS84 longitude first. */
export function offsetCoordinate(center: [number, number], eastM: number, northM: number): [number, number] {
  if (![...center, eastM, northM].every(Number.isFinite) || Math.abs(center[1]) > 85 || Math.abs(center[0]) > 180)
    throw new Error("Invalid local geographic origin");
  const degrees = 180 / Math.PI;
  return [center[0] + eastM / (6_378_137 * Math.cos(center[1] / degrees)) * degrees,
    center[1] + northM / 6_378_137 * degrees];
}

export function rectangle(center: [number, number], widthM: number, depthM: number): Polygon {
  if (!Number.isFinite(widthM) || !Number.isFinite(depthM) || widthM <= 0 || depthM <= 0)
    throw new Error("Invalid concept dimensions");
  const ring = [[-widthM / 2, -depthM / 2], [widthM / 2, -depthM / 2], [widthM / 2, depthM / 2], [-widthM / 2, depthM / 2], [-widthM / 2, -depthM / 2]];
  return { type: "Polygon", coordinates: [ring.map(([x, y]) => offsetCoordinate(center, x, y))] };
}

export function hospitalMassing(area: HospitalSearchArea, plan: HospitalPlan): HospitalBlock[] {
  const scale = Math.sqrt(plan.beds / 60);
  const definitions = [
    { id: "ward-a", label: `Inpatient A · ${plan.beds / 2} beds`, kind: "ward" as const, x: -34, y: 25, share: 0.35, floors: 3, width: 42, height: 12 },
    { id: "ward-b", label: `Inpatient B · ${plan.beds / 2} beds`, kind: "ward" as const, x: 34, y: 25, share: 0.35, floors: 3, width: 42, height: 12 },
    { id: "diagnostics", label: "Diagnostics + outpatient", kind: "diagnostics" as const, x: 0, y: -26, share: 0.3, floors: 1, width: 60, height: 6 },
  ];
  return definitions.map((d) => {
    const center = offsetCoordinate(area.center, d.x * scale, d.y * scale);
    const grossFloorAreaM2 = plan.grossFloorAreaM2 * d.share;
    const width = d.width * scale;
    return { id: `${area.id}-${d.id}`, label: d.label, kind: d.kind, center, floors: d.floors,
      heightM: d.height, grossFloorAreaM2,
      geometry: rectangle(center, width, grossFloorAreaM2 / d.floors / width) };
  });
}

export function euroMillions(value: number): string {
  return `€${(value / 1_000_000).toFixed(1)}m`;
}
export function capitalRange(plan: HospitalPlan): string {
  return `€${(plan.capitalEur[0] / 1_000_000).toFixed(1)}–${(plan.capitalEur[1] / 1_000_000).toFixed(1)}m`;
}

export function exportHospitalPlan(area: HospitalSearchArea, plan: HospitalPlan, sourceUrls: string[], placement?: HospitalPlacement) {
  const placedArea = placement?.status === "clear" && placement.areaId === area.id && placement.beds === plan.beds ? { ...area, center: placement.center } : undefined;
  const blob = new Blob([JSON.stringify({ schemaVersion: 1, status: "concept-only", area,
    plan, assumptions: HOSPITAL_ASSUMPTIONS, sourceUrls,
    exclusions: ["land", "off-site infrastructure", "VAT", "future inflation", "annual operations"],
    landAvailability: "unverified", planningApproval: "unverified", accessibilityImpact: null,
    geometryStatus: "illustrative; approximate anchor; no surveyed parcel",
    placement: placement ?? { status: "not-requested" },
    blocks: placedArea ? hospitalMassing(placedArea, plan) : [],
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `civic-hospital-${area.id}-${plan.beds}-beds.concept.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

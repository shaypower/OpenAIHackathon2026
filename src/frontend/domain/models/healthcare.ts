import type { Polygon, Feature, Geometry, MultiPolygon } from "geojson";

export interface PlanningSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  checkedOn: string;
  finding: string;
}

/** Search anchors are approximate locations, never property boundaries. */
export interface HospitalSearchArea {
  id: string;
  name: string;
  locality: string;
  approach: string;
  center: [number, number];
  rationale: string;
  evidence: string;
  constraints: string[];
  sourceIds: string[];
}

export type HospitalCapacity = 40 | 60 | 80;
export interface HospitalPlan {
  beds: HospitalCapacity;
  grossFloorAreaM2: number;
  siteAreaHa: number;
  baseCapitalEur: [number, number];
  contingencyEur: [number, number];
  capitalEur: [number, number];
}
export interface HospitalBlock {
  id: string;
  label: string;
  kind: "ward" | "diagnostics";
  geometry: Polygon;
  center: [number, number];
  heightM: number;
  floors: number;
  grossFloorAreaM2: number;
}
export interface HealthcareMapState {
  areas: readonly HospitalSearchArea[];
  selectedId: string | null;
  plan: HospitalPlan;
  showProposal: boolean;
  placement?: HospitalPlacement;
  context?: HospitalContext;
  view?: "site" | "benefits";
  benefits?: HospitalBenefits;
}

export type HospitalPlacement =
  | { status: "checking"; areaId: string; beds: HospitalCapacity }
  | { status: "blocked"; areaId: string; beds: HospitalCapacity; reason: string }
  | { status: "clear"; areaId: string; beds: HospitalCapacity; center: [number, number]; checkedBuildings: number; checkedObstacles: number; checkedAt: string; basis?: "api" | "snapshot"; snapshotId?: string };

export interface HospitalCommunity {
  id: string;
  name: string;
  center: [number, number];
  geometry: Polygon | MultiPolygon;
  residents: number;
  olderResidents: number | null;
  noCarHouseholds: number | null;
}
export interface HospitalContext {
  schemaVersion: 1;
  capturedAt: string;
  osmBase: string | null;
  osmSha256: string;
  sourceUrl: string;
  attribution: string;
  censusDataset: string;
  censusSha256: string;
  limitations: string[];
  areas: Record<string, {
    bounds: [number, number, number, number];
    features: Feature<Geometry, { kind: "building" | "transport" | "water" | "protected-land"; name: string; height: number }>[];
    screenedCenter: [number, number] | null;
    searchRadiusM: number;
    siteSideM: number;
  }>;
  communities: HospitalCommunity[];
}
export interface HospitalBenefits {
  residents: number;
  olderResidents: number | null;
  noCarHouseholds: number | null;
  localResidents: number;
  areaCount: number;
  communities: (HospitalCommunity & { distanceM: number })[];
}

import type {
  Geometry,
  Point,
  Polygon,
  MultiPolygon,
  LineString,
} from "geojson";
export type Id = string;
export type {
  TransitStop,
  TransitRoute,
  TransitEdge,
  TransportSource,
  TransportNetwork,
  TransportSelection,
} from "./transport";
export type LngLat = [longitude: number, latitude: number];
export interface DataSource {
  id: Id;
  name: string;
  dataset: string;
  updatedAt: string;
  mock: boolean;
  url?: string;
}
export interface Evidence {
  id: Id;
  claim: string;
  source: DataSource;
  confidence: number;
  status: "synthetic" | "verified" | "unverified";
}
export type EvidenceSource = DataSource;
export interface CivicObjective {
  id: Id;
  text: string;
  regionId: Id;
  targetMinutes: number;
  targetAccessPercent: number;
  cohort: string;
  mock: boolean;
}
export interface PopulationProfile {
  total: number;
  aged65Plus: number;
  withoutCar: number;
}
export interface Community {
  id: Id;
  name: string;
  regionId: Id;
  center: LngLat;
  geometry: Polygon | MultiPolygon;
  population: PopulationProfile;
  evidence: Evidence[];
}
export interface ServiceLocation {
  id: Id;
  name: string;
  kind: "healthcare" | "mobile-clinic" | "public-service";
  geometry: Point;
  evidence: Evidence[];
}
export type Service = ServiceLocation;
export interface FailureReason {
  id: Id;
  title: string;
  description: string;
  severity: "high" | "medium";
  evidence: Evidence[];
}
export interface AccessibilityResult {
  communityId: Id;
  accessPercent: number;
  targetPercent: number;
  travelMinutes: number;
  affectedResidents: number;
  status: "pass" | "fail";
  reason: FailureReason;
  mock: boolean;
}
export interface JourneyLeg {
  id: Id;
  mode: string;
  label: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  geometry?: LineString;
  status: "completed" | "failed" | "unavailable";
  detail?: string;
  routeId?: Id;
  edgeIds?: Id[];
  fromStopId?: Id;
  toStopId?: Id;
}
export type JourneySegment = JourneyLeg;
export interface JourneyOutcome {
  status: "failed" | "completed" | "unavailable";
  legId?: Id;
  time?: string;
  summary: string;
  location?: { label: string; coordinates: LngLat; stopId?: Id };
}
export interface Journey {
  id: Id;
  communityId: Id;
  residentDescription: string;
  timezone: string;
  legs: JourneyLeg[];
  outcome?: JourneyOutcome;
  mock: boolean;
}
export interface Investigation {
  communityId: Id;
  rootCause: string;
  evidence: Evidence[];
  queriedDatasets: string[];
}
export interface InterventionMetric {
  name: string;
  value: number;
  unit: "%" | "residents" | "EUR/week";
}
export interface InterventionImpact {
  accessPercent: number;
  residentsHelped: number;
  operatingCostWeekly: number;
  resiliencePercent: number;
  equityPercent: number;
}
export interface SpatialFeature {
  id: Id;
  label: string;
  kind: "route" | "stop" | "facility" | "infrastructure" | "coverage";
  geometry: Geometry;
}
export interface Intervention {
  id: Id;
  communityId: Id;
  name: string;
  description: string;
  kind: "schedule" | "service" | "facility" | "combined" | "contingency";
  impact?: InterventionImpact;
  metrics: InterventionMetric[];
  features: SpatialFeature[];
  evidence: Evidence[];
  mock: boolean;
}
export interface StressScenario {
  id: Id;
  name: string;
  kind: "road-closure" | "flood" | "gp-closure" | "cancellation";
  description: string;
  features: SpatialFeature[];
  lossPercentPoints: number;
  affectedResidents: number;
  blockedEdgeIds?: Id[];
}
export interface SimulationRun {
  id: Id;
  communityId: Id;
  interventionId: Id;
  beforePercent: number;
  afterPercent: number;
  affectedResidents: number;
  scenarioId?: Id;
  status: "verified" | "degraded" | "repaired";
  mock: boolean;
}
export type SimulationResult = SimulationRun;
export interface SpatialAnnotation {
  id: Id;
  label: string;
  position: [number, number, number];
  kind: "issue" | "existing" | "proposed";
}
export interface InfrastructureObservation {
  id: Id;
  category: "kerb" | "pavement" | "crossing" | "seating" | "shelter";
  label: string;
  confidence: number;
  annotationId: Id;
  evidence: Evidence[];
}
export type VisionFinding = InfrastructureObservation;
export interface DigitalTwinAsset {
  id: Id;
  format: "schematic" | "splat" | "3d-tiles" | "glb";
  url?: string;
  coordinateSystem: "local-metres";
  origin: LngLat;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
}
export interface SiteAudit {
  id: Id;
  name: string;
  communityId: Id;
  asset: DigitalTwinAsset;
  annotations: SpatialAnnotation[];
  observations: InfrastructureObservation[];
  proposedFeatures: SpatialAnnotation[];
  mock: boolean;
}

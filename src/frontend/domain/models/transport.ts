import type { LineString, Point } from "geojson";
import type { Id } from "./index";

/** Geometry provenance is independent of synthetic service/impact provenance. */
export interface TransportSource {
  id: Id;
  name: string;
  dataset: string;
  kind: "gtfs-shape" | "road-path";
  url: string;
  licence: string;
  acquiredAt: string;
  version: string;
  sha256: string;
  limitations: string;
  validFrom?: string;
  validUntil?: string;
}
export interface TransitStop {
  id: Id;
  name: string;
  geometry: Point;
  sourceId: Id;
}
/** Connected display segments, not a street graph or timetable routing engine. */
export interface TransitEdge {
  id: Id;
  fromStopId: Id;
  toStopId: Id;
  geometry: LineString;
  distanceMetres: number;
  sourceId: Id;
}
export interface TransitRoute {
  id: Id;
  name: string;
  shortName: string;
  operator: string;
  geometry: LineString;
  stopIds: Id[];
  edgeIds: Id[];
  sourceId: Id;
  serviceContext: "published" | "synthetic";
  status: "existing" | "proposed" | "disrupted";
  shapeId?: string;
}
export interface TransportNetwork {
  routes: TransitRoute[];
  stops: TransitStop[];
  edges: TransitEdge[];
  sources: TransportSource[];
}
export type TransportSelection = { kind: "route" | "stop"; id: Id };

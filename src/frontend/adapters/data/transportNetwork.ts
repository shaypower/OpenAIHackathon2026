import type {
  TransportNetwork,
  TransitEdge,
  TransitRoute,
  TransitStop,
  TransportSource,
} from "@/frontend/domain/models";
import type { LineString, Point } from "geojson";
import { routePath } from "@/frontend/features/transport/topology";

/** Validate normalized provider data, never raw GTFS or backend documents. */
export function parseTransportNetwork(input: unknown): TransportNetwork {
  const fail = (message: string): never => {
    throw new Error(`Invalid transport network: ${message}`);
  };
  const record = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : fail("expected an object");
  const list = (v: unknown, limit = 5000): unknown[] =>
    Array.isArray(v) && v.length <= limit
      ? v
      : fail("invalid or oversized collection");
  const text = (v: unknown): string =>
    typeof v === "string" && v.length > 0 && v.length <= 1000
      ? v
      : fail("missing text");
  const number = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0
      ? v
      : fail("non-finite or negative metric");
  const choice = <T extends string>(v: unknown, values: readonly T[]): T =>
    typeof v === "string" && values.includes(v as T)
      ? (v as T)
      : fail("unsupported enum value");
  const url = (v: unknown) => {
    const value = text(v);
    const parsed = new URL(value);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      fail("unsafe source URL");
    return value;
  };
  const position = (v: unknown): [number, number] => {
    const p = list(v, 2);
    if (
      p.length !== 2 ||
      typeof p[0] !== "number" ||
      typeof p[1] !== "number" ||
      !Number.isFinite(p[0]) ||
      !Number.isFinite(p[1]) ||
      Math.abs(p[0]) > 180 ||
      Math.abs(p[1]) > 90
    )
      return fail("invalid WGS84 position");
    return [p[0], p[1]];
  };
  const line = (v: unknown): LineString => {
    const g = record(v);
    if (g.type !== "LineString") return fail("expected LineString");
    const coordinates = list(g.coordinates, 20000).map(position);
    if (coordinates.length < 2) return fail("short path");
    return { type: "LineString", coordinates };
  };
  const point = (v: unknown): Point => {
    const g = record(v);
    if (g.type !== "Point") return fail("expected Point");
    return { type: "Point", coordinates: position(g.coordinates) };
  };
  const data = record(input);
  if (data.schemaVersion !== undefined && data.schemaVersion !== 1)
    fail("unsupported schema version");
  const sources: TransportSource[] = list(data.sources, 100).map((value) => {
    const s = record(value);
    const acquiredAt = text(s.acquiredAt);
    if (!Number.isFinite(Date.parse(acquiredAt)))
      return fail("invalid acquisition timestamp");
    const sha256 = text(s.sha256);
    if (!/^[a-f0-9]{64}$/.test(sha256)) return fail("invalid source checksum");
    return {
      id: text(s.id),
      name: text(s.name),
      dataset: text(s.dataset),
      kind: choice(s.kind, ["gtfs-shape", "road-path"]),
      url: url(s.url),
      licence: text(s.licence),
      acquiredAt,
      version: text(s.version),
      sha256,
      limitations: text(s.limitations),
      ...(s.validFrom ? { validFrom: text(s.validFrom) } : {}),
      ...(s.validUntil ? { validUntil: text(s.validUntil) } : {}),
    };
  });
  const stops: TransitStop[] = list(data.stops).map((value) => {
    const s = record(value);
    return {
      id: text(s.id),
      name: text(s.name),
      geometry: point(s.geometry),
      sourceId: text(s.sourceId),
    };
  });
  const edges: TransitEdge[] = list(data.edges, 10000).map((value) => {
    const e = record(value);
    return {
      id: text(e.id),
      fromStopId: text(e.fromStopId),
      toStopId: text(e.toStopId),
      geometry: line(e.geometry),
      distanceMetres: number(e.distanceMetres),
      sourceId: text(e.sourceId),
    };
  });
  const routes: TransitRoute[] = list(data.routes, 500).map((value) => {
    const r = record(value);
    return {
      id: text(r.id),
      name: text(r.name),
      shortName: text(r.shortName),
      operator: text(r.operator),
      geometry: line(r.geometry),
      stopIds: list(r.stopIds).map(text),
      edgeIds: list(r.edgeIds).map(text),
      sourceId: text(r.sourceId),
      serviceContext: choice(r.serviceContext, ["published", "synthetic"]),
      status: choice(r.status, ["existing", "proposed", "disrupted"]),
      ...(r.shapeId ? { shapeId: text(r.shapeId) } : {}),
    };
  });
  const network = { sources, stops, edges, routes };
  for (const items of [sources, stops, edges, routes])
    if (new Set(items.map((v) => v.id)).size !== items.length)
      fail("duplicate entity IDs");
  const sourceIds = new Set(sources.map((s) => s.id));
  const stopById = new Map(stops.map((s) => [s.id, s]));
  for (const entity of [...stops, ...edges, ...routes])
    if (!sourceIds.has(entity.sourceId)) fail("unresolved geometry source");
  for (const edge of edges) {
    const from = stopById.get(edge.fromStopId),
      to = stopById.get(edge.toStopId);
    if (!from || !to) fail("unresolved segment stops");
    if (
      JSON.stringify(from!.geometry.coordinates) !==
        JSON.stringify(edge.geometry.coordinates[0]) ||
      JSON.stringify(to!.geometry.coordinates) !==
        JSON.stringify(edge.geometry.coordinates.at(-1))
    )
      fail("segment endpoints do not match stops");
  }
  for (const route of routes) {
    if (
      route.edgeIds.length !== route.stopIds.length - 1 ||
      route.stopIds.some((id) => !stopById.has(id))
    )
      fail("invalid ordered stop/edge chain");
    if (
      route.serviceContext === "published" &&
      sources.find((s) => s.id === route.sourceId)?.kind !== "gtfs-shape"
    )
      fail("published service requires GTFS shape provenance");
    const path = routePath(network, route.id);
    if (JSON.stringify(path.geometry) !== JSON.stringify(route.geometry))
      fail("route geometry diverges from its segment chain");
  }
  return network;
}

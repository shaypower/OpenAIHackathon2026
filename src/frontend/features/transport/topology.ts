import type { LineString } from "geojson";
import type { TransportNetwork } from "@/frontend/domain/models";

/** Resolve an ordered route segment chain; never invent a straight-line fallback. */
export function routePath(
  network: TransportNetwork,
  routeId: string,
  fromStopId?: string,
  toStopId?: string,
) {
  const route = network.routes.find((r) => r.id === routeId);
  if (!route) throw new Error(`Unknown transport route: ${routeId}`);
  const start = fromStopId ? route.stopIds.indexOf(fromStopId) : 0;
  const end = toStopId
    ? route.stopIds.indexOf(toStopId)
    : route.stopIds.length - 1;
  if (start < 0 || end < 0 || start >= end)
    throw new Error("The requested stops do not form an ordered route path.");
  const ids = route.edgeIds.slice(start, end);
  const edges = ids.map((id) => {
    const edge = network.edges.find((e) => e.id === id);
    if (!edge) throw new Error(`Missing transport segment: ${id}`);
    return edge;
  });
  if (edges.length !== end - start)
    throw new Error("Incomplete transport path.");
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (
      edge.fromStopId !== route.stopIds[start + i] ||
      edge.toStopId !== route.stopIds[start + i + 1]
    )
      throw new Error("Disconnected transport segment references.");
    if (
      i &&
      JSON.stringify(edges[i - 1].geometry.coordinates.at(-1)) !==
        JSON.stringify(edge.geometry.coordinates[0])
    )
      throw new Error("Disconnected transport geometry.");
  }
  const geometry: LineString = {
    type: "LineString",
    coordinates: edges.flatMap((e, i) =>
      i ? e.geometry.coordinates.slice(1) : e.geometry.coordinates,
    ),
  };
  return {
    route,
    edges,
    edgeIds: ids,
    geometry,
    distanceMetres: edges.reduce((total, e) => total + e.distanceMetres, 0),
  };
}

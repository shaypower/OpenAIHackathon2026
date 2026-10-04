import type { FeatureCollection, Feature, Geometry } from "geojson";
import type { WorkspaceState } from "@/frontend/features/workspace/state";
export type MapLayerKey =
  | "healthcare"
  | "vulnerability"
  | "transport"
  | "failures";
export type LayerVisibility = Record<MapLayerKey, boolean>;
export interface MapSnapshot {
  state: WorkspaceState;
  layers: LayerVisibility;
  camera: "region" | "street";
  offline: boolean;
}
export function mapFeatures({
  state,
}: MapSnapshot): Record<string, FeatureCollection> {
  const collection = (features: Feature<Geometry>[]): FeatureCollection => ({
    type: "FeatureCollection",
    features,
  });
  const after = state.compare === "after" && !!state.intervention;
  const degraded = after && state.simulation?.status === "degraded";
  return {
    communities: collection(
      state.communities.map((c) => ({
        type: "Feature",
        id: c.id,
        geometry: c.geometry,
        properties: {
          id: c.id,
          name: c.name,
          selected: c.id === state.selectedId,
          failed: state.results.some((r) => r.communityId === c.id),
          served: after && c.id === state.selectedId && !degraded,
          vulnerability: c.population.aged65Plus / c.population.total,
        },
      })),
    ),
    centers: collection(
      state.communities.map((c) => ({
        type: "Feature",
        id: c.id,
        geometry: { type: "Point", coordinates: c.center },
        properties: { id: c.id, name: c.name },
      })),
    ),
    services: collection(
      state.services.map((s) => ({
        type: "Feature",
        id: s.id,
        geometry: s.geometry,
        properties: { id: s.id, name: s.name },
      })),
    ),
    stops: collection(
      state.stops.map((s) => ({
        type: "Feature",
        id: s.id,
        geometry: s.geometry,
        properties: { id: s.id, name: s.name },
      })),
    ),
    routes: collection(
      state.routes.map((r) => ({
        type: "Feature",
        id: r.id,
        geometry: r.geometry,
        properties: { id: r.id, name: r.name },
      })),
    ),
    intervention: collection(
      after
        ? (state.intervention?.features ?? []).map((f) => ({
            type: "Feature",
            id: f.id,
            geometry: f.geometry,
            properties: { id: f.id, name: f.label },
          }))
        : [],
    ),
    disruption: collection(
      after
        ? (state.scenario?.features ?? []).map((f) => ({
            type: "Feature",
            id: f.id,
            geometry: f.geometry,
            properties: { id: f.id, name: f.label },
          }))
        : [],
    ),
    journey: collection(
      state.view === "journey"
        ? (state.journey?.legs ?? []).flatMap((leg) =>
            leg.geometry
              ? [
                  {
                    type: "Feature" as const,
                    id: leg.id,
                    geometry: leg.geometry,
                    properties: { name: leg.label },
                  },
                ]
              : [],
          )
        : [],
    ),
  };
}

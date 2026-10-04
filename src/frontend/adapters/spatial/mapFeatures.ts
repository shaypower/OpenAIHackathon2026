import type { FeatureCollection, Feature, Geometry } from "geojson";
import type { WorkspaceState } from "@/frontend/features/workspace/state";
import type { PlaybackClock } from "@/frontend/features/journeys/playback";
import type { Theme } from "@/frontend/hooks/useTheme";
import type { HealthcareMapState } from "@/frontend/domain/models/healthcare";
import { hospitalMassing, rectangle } from "@/frontend/features/healthcare/planning";
import { distanceRing } from "@/frontend/features/healthcare/context";
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
  theme?: Theme;
  playback?: PlaybackClock;
  healthcare?: HealthcareMapState;
}
export function mapFeatures({
  state,
  healthcare,
}: MapSnapshot): Record<string, FeatureCollection> {
  const collection = (features: Feature<Geometry>[]): FeatureCollection => ({
    type: "FeatureCollection",
    features,
  });
  const after = state.compare === "after" && !!state.intervention;
  const served =
    after &&
    !!state.simulation &&
    state.simulation.afterPercent >=
      (state.objective?.targetAccessPercent ?? 90);
  const selectedArea = healthcare?.areas.find((a) => a.id === healthcare.selectedId);
  const placement = healthcare?.placement;
  const area = selectedArea && placement?.status === "clear" && placement.areaId === selectedArea.id && placement.beds === healthcare?.plan.beds
    ? { ...selectedArea, center: placement.center } : undefined;
  return {
    "hospital-context": collection(healthcare?.context ? Object.entries(healthcare.context.areas)
      .filter(([id]) => !healthcare.selectedId || id === healthcare.selectedId).flatMap(([, context]) => context.features) : []),
    "hospital-benefits": collection(area && healthcare?.showProposal && healthcare.view === "benefits" ? (healthcare.benefits?.communities ?? []).map((c) => ({
      type: "Feature", id: c.id, geometry: c.geometry,
      properties: { id: c.id, name: c.name, residents: c.residents, olderResidents: c.olderResidents, distanceM: c.distanceM },
    })) : []),
    "hospital-distance": collection(area && healthcare?.showProposal && healthcare.view === "benefits" ? [3000, 1000].map((radiusM) => ({
      type: "Feature", id: `radius-${radiusM}`, geometry: distanceRing(area.center, radiusM), properties: { radiusM },
    })) : []),
    "hospital-search": collection((healthcare?.areas ?? []).map((area) => ({
      type: "Feature", id: area.id,
      geometry: { type: "Point", coordinates: area.center },
      properties: { id: area.id, name: area.name, selected: area.id === healthcare?.selectedId },
    }))),
    "hospital-site": collection(area && healthcare?.showProposal ? [{
      type: "Feature", id: area.id,
      geometry: rectangle(area.center, Math.sqrt(healthcare.plan.siteAreaHa * 10_000), Math.sqrt(healthcare.plan.siteAreaHa * 10_000)),
      properties: { id: area.id, name: "Illustrative site envelope · not a property boundary" },
    }] : []),
    "hospital-blocks": collection(area && healthcare?.showProposal ? hospitalMassing(area, healthcare.plan).map((block) => ({
      type: "Feature", id: block.id, geometry: block.geometry,
      properties: { id: block.id, name: block.label, kind: block.kind, heightM: block.heightM, floors: block.floors },
    })) : []),
    communities: collection(
      state.communities.map((c) => ({
        type: "Feature",
        id: c.id,
        geometry: c.geometry,
        properties: {
          id: c.id,
          name: c.name,
          selected: c.id === state.selectedId,
          failed: state.results.some(
            (r) => r.communityId === c.id && r.status === "fail",
          ),
          served: served && c.id === state.selectedId,
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
        properties: {
          id: s.id,
          name: s.name,
          selected:
            state.transportSelection?.kind === "stop" &&
            state.transportSelection.id === s.id,
        },
      })),
    ),
    routes: collection(
      state.routes
        .filter(
          (r) =>
            r.status !== "proposed" || state.transportSelection?.id === r.id,
        )
        .map((r) => ({
          type: "Feature",
          id: r.id,
          geometry: r.geometry,
          properties: {
            id: r.id,
            name: r.name,
            synthetic: r.serviceContext === "synthetic",
            selected:
              state.transportSelection?.kind === "route" &&
              state.transportSelection.id === r.id,
          },
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
                    properties: { id: leg.id, name: leg.label },
                  },
                ]
              : [],
          )
        : [],
    ),
  };
}

import {
  Layers,
  Cross,
  Users,
  Route,
  CircleAlert,
  ChevronRight,
  Compass,
  Box,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/frontend/components/ui/toggle-group";
import type {
  LayerVisibility,
  MapLayerKey,
} from "@/frontend/adapters/spatial/mapFeatures";
import type { WorkspaceController } from "@/frontend/features/workspace/useWorkspace";
import { isBusy } from "@/frontend/features/workspace/state";
const layerItems = [
  { id: "healthcare" as const, label: "Healthcare access", icon: Cross },
  {
    id: "vulnerability" as const,
    label: "Population vulnerability",
    icon: Users,
  },
  { id: "transport" as const, label: "Transport network", icon: Route },
  { id: "failures" as const, label: "Civic failures", icon: CircleAlert },
];
export function MapOverlays({
  workspace,
  layers,
  onLayer,
  camera,
  onCamera,
  offline,
  onOffline,
}: {
  workspace: WorkspaceController;
  layers: LayerVisibility;
  onLayer: (key: MapLayerKey) => void;
  camera: "region" | "street";
  onCamera: (v: "region" | "street") => void;
  offline: boolean;
  onOffline: () => void;
}) {
  const { state } = workspace;
  const busy = isBusy(state.phase);
  return (
    <>
      <div className="map-left-overlays">
        <details className="layer-selector" open>
          <summary>
            <Layers size={15} />
            Layers
            <ChevronRight size={14} />
          </summary>
          <fieldset>
            <legend className="sr-only">Map layers</legend>
            {layerItems.map((item) => {
              const Icon = item.icon;
              return (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={layers[item.id]}
                    onChange={() => onLayer(item.id)}
                  />
                  <Icon size={14} />
                  {item.label}
                </label>
              );
            })}
          </fieldset>
          <label className="offline-toggle">
            <input type="checkbox" checked={offline} onChange={onOffline} />
            Offline map
          </label>
        </details>
        <div className="community-selector">
          <div className="overlay-heading">
            <span>
              {state.results.length ? "Baseline failures" : "Demo communities"}
            </span>
            <span>{state.communities.length.toString().padStart(2, "0")}</span>
          </div>
          {state.communities.map((c) => {
            const result = state.results.find((r) => r.communityId === c.id);
            return (
              <button
                key={c.id}
                disabled={busy}
                onClick={() => workspace.select(c.id)}
                aria-pressed={state.selectedId === c.id}
                className={state.selectedId === c.id ? "active" : ""}
              >
                <span
                  className={result ? "community-dot failed" : "community-dot"}
                />
                <span>{c.name}</span>
                <small>{result ? `${result.accessPercent}%` : "Explore"}</small>
                <ChevronRight size={12} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="map-top-controls">
        <ToggleGroup
          type="single"
          value={camera}
          aria-label="Map perspective"
          onValueChange={(v) => {
            if (v === "region" || v === "street") onCamera(v);
          }}
        >
          <ToggleGroupItem value="region">
            <Compass size={14} />
            Region
          </ToggleGroupItem>
          <ToggleGroupItem value="street" disabled={!state.selectedId}>
            <Box size={14} />
            3D site
          </ToggleGroupItem>
        </ToggleGroup>
        {state.intervention ? (
          <ToggleGroup
            type="single"
            value={state.compare}
            onValueChange={(v) => {
              if (v === "before" || v === "after") workspace.setCompare(v);
            }}
            aria-label="Before and after comparison"
          >
            <ToggleGroupItem value="before">Before</ToggleGroupItem>
            <ToggleGroupItem value="after">After</ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>
      <div className="map-legend">
        <span>
          <i
            className={
              state.compare === "after" &&
              state.intervention &&
              state.simulation?.status !== "degraded"
                ? "legend-served"
                : "legend-failure"
            }
          />
          {state.compare === "after" &&
          state.intervention &&
          state.simulation?.status !== "degraded"
            ? "Served catchment"
            : state.results.length
              ? "Underserved catchment"
              : "Demo catchment"}
        </span>
        <span>
          <i className="legend-service" />
          Primary care
        </span>
        {state.intervention ? (
          <span>
            <i className="legend-route" />
            Proposed intervention
          </span>
        ) : null}
        {state.scenario ? (
          <span>
            <i className="legend-disruption" />
            Disruption
          </span>
        ) : null}
      </div>
      {state.objective ? (
        <div className="map-mission-label">
          <span className="eyebrow">Active civic objective</span>
          <span>45 min / primary healthcare / age 65+</span>
        </div>
      ) : null}
      <Button
        className="sr-only focus:not-sr-only"
        onClick={() =>
          workspace.select(state.communities[0]?.id ?? "borrisoleigh")
        }
      >
        Select first community
      </Button>
    </>
  );
}

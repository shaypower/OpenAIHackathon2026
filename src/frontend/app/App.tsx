import { lazy, Suspense, useMemo, useState } from "react";
import {
  Activity,
  RotateCcw,
  ArrowUpRight,
  CircleAlert,
  LoaderCircle,
  Moon,
  Sun,
} from "lucide-react";
import type { FrontendProviders } from "@/frontend/domain/contracts/providers";
import type { LayerVisibility } from "@/frontend/adapters/spatial/mapFeatures";
import { useWorkspace } from "@/frontend/features/workspace/useWorkspace";
import { isBusy, phaseLabel } from "@/frontend/features/workspace/state";
import { Button } from "@/frontend/components/ui/button";
import { ContextPanel } from "@/frontend/components/panels/ContextPanel";
import { ObjectiveBar } from "@/frontend/components/layout/ObjectiveBar";
import { MapOverlays } from "@/frontend/components/map/MapOverlays";
import { SiteTwinViewer } from "@/frontend/features/digital-twin/SiteTwinViewer";
import { useTheme } from "@/frontend/hooks/useTheme";
import { useJourneyPlayback } from "@/frontend/features/journeys/useJourneyPlayback";
const MapCanvas = lazy(() =>
  import("@/frontend/components/map/MapCanvas").then((m) => ({
    default: m.MapCanvas,
  })),
);
export function App({ providers }: { providers: FrontendProviders }) {
  const workspace = useWorkspace(providers);
  const { state } = workspace;
  const { theme, toggleTheme } = useTheme();
  const playback = useJourneyPlayback(
    state.journey,
    state.view === "journey" && !isBusy(state.phase),
  );
  const [layers, setLayers] = useState<LayerVisibility>({
    healthcare: true,
    vulnerability: false,
    transport: true,
    failures: true,
  });
  const [camera, setCamera] = useState<"region" | "street">("region");
  const [offline, setOffline] = useState(false);
  const [stressOpen, setStressOpen] = useState(false);
  const snapshot = useMemo(
    () => ({ state, layers, camera, offline, theme, playback: playback.clock }),
    [state, layers, camera, offline, theme, playback.clock],
  );
  const scenarios = useMemo(
    () => providers.simulation.getStressScenarios(),
    [providers],
  );
  const reset = () => {
    workspace.reset();
    setCamera("region");
    setStressOpen(false);
    setLayers({
      healthcare: true,
      vulnerability: false,
      transport: true,
      failures: true,
    });
  };
  return (
    <main className="app-shell" data-theme={theme}>
      <header className="app-header">
        <a
          href="#main-workspace"
          className="brand"
          aria-label="CIVIC workspace"
        >
          <Activity size={27} strokeWidth={1.7} />
          <strong>
            CIVIC<span> / </span>
          </strong>
          <span className="brand-caption">
            Intelligence into
            <br />
            public impact
          </span>
        </a>
        <div className="region-label">
          Ireland<span>/</span>
          {state.objective ? "Tipperary" : "Planning workspace"}
        </div>
        <div className="header-actions">
          <span className="dataset-state">
            <i />
            Synthetic demo
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            onClick={toggleTheme}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw data-icon="inline-start" />
            <span>Reset demo</span>
          </Button>
        </div>
      </header>
      <div id="main-workspace" className="main-workspace">
        <section
          className="spatial-workspace"
          aria-label="Spatial planning canvas"
        >
          <Suspense
            fallback={
              <div className="map-fallback">Loading spatial workspace…</div>
            }
          >
            <MapCanvas
              snapshot={snapshot}
              onSelect={workspace.select}
              onInspectTransport={workspace.selectTransport}
            />
          </Suspense>
          <MapOverlays
            workspace={workspace}
            layers={layers}
            onLayer={(key) =>
              setLayers((value) => ({ ...value, [key]: !value[key] }))
            }
            camera={camera}
            onCamera={setCamera}
            offline={offline}
            onOffline={() => setOffline((v) => !v)}
          />
          {isBusy(state.phase) ? (
            <div className="analysis-progress" role="status">
              <LoaderCircle size={18} className="spin" />
              <div>
                <strong>{phaseLabel(state.phase)}</strong>
                <span>Deterministic demo workflow</span>
              </div>
              {state.phase.kind === "analysing" ? (
                <span>
                  {state.results.length}/{state.communities.length} areas
                </span>
              ) : null}
            </div>
          ) : null}
        </section>
        <ContextPanel
          workspace={workspace}
          scenarios={scenarios}
          stressOpen={stressOpen}
          onStressOpen={() => setStressOpen((v) => !v)}
          playback={playback}
        />
      </div>
      {state.error ? (
        <div className="error-banner" role="alert">
          <CircleAlert size={18} />
          <span>{state.error}</span>
          <Button size="sm" variant="outline" onClick={reset}>
            Reset & retry
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </div>
      ) : null}
      <ObjectiveBar
        phase={state.phase}
        onSubmit={(text) => {
          setCamera("region");
          setStressOpen(false);
          void workspace.submit(text);
        }}
        onReset={reset}
      />
      <footer className="app-footer">
        <span>IRELAND · WGS84 / EPSG:4326</span>
        <span>
          Synthetic outcomes · route shapes © NTA / CC BY 4.0 · map ©
          OpenStreetMap / OpenFreeMap
        </span>
        <span>CIVIC / 01</span>
      </footer>
      {state.site ? (
        <SiteTwinViewer
          audit={state.site}
          provider={providers.scene}
          onClose={workspace.closeSite}
        />
      ) : null}
    </main>
  );
}

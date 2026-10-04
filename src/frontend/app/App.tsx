import { lazy, Suspense, useMemo, useState, useEffect, useRef } from "react";
import {
  Activity,
  RotateCcw,
  ArrowUpRight,
  CircleAlert,
  LoaderCircle,
  Moon,
  Sun,
  Plug,
  Building2,
  Cross,
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
import type { BackendProvider } from "@/frontend/domain/contracts/backend";
import { useBackend } from "@/frontend/features/backend/useBackend";
import { BackendPanel } from "@/frontend/features/backend/BackendPanel";
import { HospitalPanel } from "@/frontend/features/healthcare/HospitalPanel";
import { HospitalMapOverlays } from "@/frontend/features/healthcare/HospitalMapOverlays";
import { hospitalSearchAreas } from "@/frontend/adapters/data/healthcareSites";
import { calculateHospitalPlan } from "@/frontend/features/healthcare/planning";
import type { HospitalCapacity, HospitalPlacement, HospitalContext } from "@/frontend/domain/models/healthcare";
import { hospitalBenefits, parseHospitalContext, screenCapturedHospital } from "@/frontend/features/healthcare/context";
const MapCanvas = lazy(() =>
  import("@/frontend/components/map/MapCanvas").then((m) => ({
    default: m.MapCanvas,
  })),
);
export function App({
  providers,
  backendProvider,
}: {
  providers: FrontendProviders;
  backendProvider: BackendProvider;
}) {
  const backend = useBackend(backendProvider);
  const [backendOpen, setBackendOpen] = useState(false);
  const [hospitalOpen, setHospitalOpen] = useState(true);
  const [hospitalAreaId, setHospitalAreaId] = useState<string | null>(null);
  const [hospitalBeds, setHospitalBeds] = useState<HospitalCapacity>(60);
  const [showHospitalProposal, setShowHospitalProposal] = useState(false);
  const [hospitalPlacement, setHospitalPlacement] = useState<HospitalPlacement>();
  const [hospitalContext, setHospitalContext] = useState<HospitalContext>();
  const [hospitalContextError, setHospitalContextError] = useState<string>();
  const [hospitalView, setHospitalView] = useState<"site" | "benefits">("site");
  const placementSequence = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/hospital-context.json", { signal: controller.signal }).then((r) => {
      if (!r.ok) throw new Error("Hospital map context could not be loaded. Reload to retry.");
      return r.json();
    }).then(parseHospitalContext).then(setHospitalContext).catch((error) => {
      if (!controller.signal.aborted) setHospitalContextError(error instanceof Error ? error.message : "Hospital context unavailable.");
    });
    return () => controller.abort();
  }, []);
  const checkHospital = async (areaId: string, beds: HospitalCapacity) => {
    const sequence = ++placementSequence.current;
    setHospitalPlacement({ status: "checking", areaId, beds });
    if (!hospitalContext) {
      setHospitalPlacement({ status: "blocked", areaId, beds, reason: hospitalContextError ?? "Building context is still loading. Please retry in a moment." });
      return;
    }
    try {
      let result = screenCapturedHospital(hospitalContext, areaId, beds);
      if (result.status === "clear" && backend.status && !backend.statusError) {
        try {
          const response = await fetch("/api/hospitals/preview", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ area_id: areaId, beds, context_id: hospitalContext.osmSha256 }), signal: AbortSignal.timeout(4000) });
          if (response.ok) {
            const value = (await response.json()).data;
            if (value?.placement?.status !== "clear" || value.placement.snapshotId !== hospitalContext.osmSha256
              || value.placement.areaId !== areaId || value.placement.beds !== beds
              || JSON.stringify(value.placement.center) !== JSON.stringify(result.center)) throw new Error("Hospital context mismatch.");
            result = { ...result, basis: "api" };
          } else if (response.status !== 404 && response.status < 500) {
            result = { status: "blocked", areaId, beds, reason: "The server could not confirm this site. Refresh the app to load the current map context." };
          }
        } catch { /* The independently checked captured context remains available offline. */ }
      }
      if (sequence === placementSequence.current) setHospitalPlacement(result);
    } catch {
      if (sequence === placementSequence.current) setHospitalPlacement({ status: "blocked", areaId, beds, reason: "The mapped site could not be verified. No hospital has been placed." });
    }
  };
  const toggleHospitalProposal = (show: boolean) => {
    setShowHospitalProposal(show);
    setHospitalView("site");
    if (show && hospitalAreaId) void checkHospital(hospitalAreaId, hospitalBeds);
    else { placementSequence.current++; setHospitalPlacement(undefined); }
  };
  const changeHospitalCapacity = (beds: HospitalCapacity) => {
    setHospitalBeds(beds);
    if (showHospitalProposal && hospitalAreaId) void checkHospital(hospitalAreaId, beds);
  };
  const hospitalPlan = useMemo(() => calculateHospitalPlan(hospitalBeds), [hospitalBeds]);
  const selectHospital = (id: string | null) => {
    placementSequence.current++;
    setHospitalAreaId(id);
    setShowHospitalProposal(false);
    setHospitalPlacement(undefined);
    setHospitalView("site");
    setBackendOpen(false);
    setHospitalOpen(true);
  };
  const [objectiveMode, setObjectiveMode] = useState<"demo" | "backend">(
    "demo",
  );
  const workspace = useWorkspace(providers);
  const { state } = workspace;
  const { theme, toggleTheme } = useTheme();
  const playback = useJourneyPlayback(
    state.journey,
    state.view === "journey" && !backendOpen && !hospitalOpen && !isBusy(state.phase),
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
  const benefits = useMemo(() => hospitalContext && hospitalPlacement?.status === "clear"
    ? hospitalBenefits(hospitalContext, hospitalPlacement.center) : undefined, [hospitalContext, hospitalPlacement]);
  const snapshot = useMemo(
    () => ({ state, layers, camera, offline, theme, playback: playback.clock,
      healthcare: hospitalOpen ? { areas: hospitalSearchAreas, selectedId: hospitalAreaId, plan: hospitalPlan, showProposal: showHospitalProposal, placement: hospitalPlacement, context: hospitalContext, view: hospitalView, benefits } : undefined,
    }),
    [state, layers, camera, offline, theme, playback.clock, hospitalOpen, hospitalAreaId, hospitalPlan, showHospitalProposal, hospitalPlacement, hospitalContext, hospitalView, benefits],
  );
  const scenarios = useMemo(
    () => providers.simulation.getStressScenarios(),
    [providers],
  );
  const reset = () => {
    placementSequence.current++;
    workspace.reset();
    backend.reset();
    setBackendOpen(false);
    setHospitalAreaId(null);
    setShowHospitalProposal(false);
    setHospitalBeds(60);
    setHospitalPlacement(undefined);
    setHospitalView("site");
    setCamera("region");
    setStressOpen(false);
    setLayers({
      healthcare: true,
      vulnerability: false,
      transport: true,
      failures: true,
    });
  };
  const changeMode = (mode: "demo" | "backend") => {
    if (mode === objectiveMode) {
      setBackendOpen(mode === "backend");
      return;
    }
    reset();
    setObjectiveMode(mode);
    setBackendOpen(mode === "backend");
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
          {hospitalOpen || state.objective ? "Tipperary" : "Planning workspace"}
        </div>
        <div className="header-actions">
          <span className="dataset-state">
            <i />
            {hospitalOpen ? "Hospital concept" : objectiveMode === "demo" ? "Synthetic demo" : "Synthetic map"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="backend-control"
            aria-label="Inspect backend integration"
            onClick={() => { setHospitalOpen(false); setBackendOpen((v) => !v); }}
          >
            <Plug size={15} />
            <span>
              API ·{" "}
              {backend.checking
                ? "checking"
                : backend.statusError
                  ? "offline"
                  : backend.status
                    ? "connected"
                    : "offline"}
            </span>
          </Button>
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
      <nav className="workspace-mode-bar" aria-label="Healthcare workspace">
        <button aria-pressed={hospitalOpen} disabled={isBusy(state.phase)} onClick={() => { setHospitalOpen(true); setBackendOpen(false); }}><Building2 size={15} /> Hospital planner</button>
        <button aria-pressed={!hospitalOpen} onClick={() => { setHospitalOpen(false); setBackendOpen(false); }}><Cross size={14} /> Healthcare access</button>
        <span>{hospitalOpen ? "Research → compare areas → preview a hospital" : "Synthetic access scenario / existing demo"}</span>
      </nav>
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
              onSelectHospital={selectHospital}
            />
          </Suspense>
          {hospitalOpen ? <HospitalMapOverlays
            area={hospitalSearchAreas.find((area) => area.id === hospitalAreaId)}
            plan={hospitalPlan} showProposal={showHospitalProposal}
            placement={hospitalPlacement}
            benefits={benefits} view={hospitalView} onView={setHospitalView}
            offline={offline} onOffline={() => setOffline((v) => !v)} onCompare={() => selectHospital(null)}
          /> : <MapOverlays
            workspace={workspace}
            layers={layers}
            onLayer={(key) =>
              setLayers((value) => ({ ...value, [key]: !value[key] }))
            }
            camera={camera}
            onCamera={setCamera}
            offline={offline}
            onOffline={() => setOffline((v) => !v)}
          />}
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
        {hospitalOpen ? <HospitalPanel
          areas={hospitalSearchAreas} selectedId={hospitalAreaId} plan={hospitalPlan}
          showProposal={showHospitalProposal} onSelect={selectHospital}
          placement={hospitalPlacement}
          benefits={benefits} view={hospitalView} onView={setHospitalView}
          contextReady={!!hospitalContext} contextError={hospitalContextError}
          onCapacity={changeHospitalCapacity} onProposal={toggleHospitalProposal}
        /> : backendOpen ? (
          <BackendPanel
            backend={backend}
            onClose={() => setBackendOpen(false)}
            onValidate={() => changeMode("backend")}
          />
        ) : (
          <ContextPanel
            workspace={workspace}
            scenarios={scenarios}
            stressOpen={stressOpen}
            onStressOpen={() => setStressOpen((v) => !v)}
            playback={playback}
          />
        )}
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
      {hospitalOpen ? <div className="hospital-planning-dock"><div><Cross size={20} /><span><strong>Plan care closer to home.</strong><small>Evidence-led area screening · transparent cost assumptions · a labelled hospital concept</small></span></div><Button variant="outline" onClick={() => setHospitalOpen(false)}>Explore healthcare access <ArrowUpRight size={15} /></Button></div> : <ObjectiveBar
        phase={state.phase}
        mode={objectiveMode}
        onModeChange={changeMode}
        validating={backend.validating}
        validationState={
          backend.validationError
            ? "Validation failed"
            : backend.validation
              ? "Validated · not evaluated"
              : "Ready for backend validation"
        }
        onSubmit={(text) => {
          setCamera("region");
          setHospitalOpen(false);
          setStressOpen(false);
          if (objectiveMode === "backend") {
            setBackendOpen(true);
            void backend.validate(text);
          } else void workspace.submit(text);
        }}
        onReset={reset}
      />}
      <footer className="app-footer">
        <span>IRELAND · WGS84 / EPSG:4326</span>
        <span>
          {hospitalOpen ? "Researched area context · illustrative buildings & costs · map © OpenStreetMap / OpenFreeMap" : "Synthetic outcomes · route shapes © NTA / CC BY 4.0 · map © OpenStreetMap / OpenFreeMap"}
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

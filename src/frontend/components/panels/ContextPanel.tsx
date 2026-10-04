import { useEffect, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Footprints,
  Search,
  Users,
  Box,
  LoaderCircle,
  CircleAlert,
  Route,
  Check,
} from "lucide-react";
import type { WorkspaceController } from "@/frontend/features/workspace/useWorkspace";
import type { StressScenario } from "@/frontend/domain/models";
import { isBusy } from "@/frontend/features/workspace/state";
import { Button } from "@/frontend/components/ui/button";
import { JourneyPanel } from "@/frontend/components/visualisation/JourneyPanel";
import { EvidencePanel } from "./EvidencePanel";
import { InterventionPanel } from "./InterventionPanel";
import { StressPanel } from "./StressPanel";
import { WelcomePanel } from "./WelcomePanel";
import { CommunitySummary } from "./CommunitySummary";
import { NetworkPanel } from "@/frontend/features/transport/NetworkPanel";
import type { JourneyPlayback } from "@/frontend/features/journeys/useJourneyPlayback";
import { exportSimulationRequest } from "@/frontend/features/simulation/exportSimulationRequest";
export function ContextPanel({
  workspace,
  scenarios,
  stressOpen,
  onStressOpen,
  playback,
}: {
  workspace: WorkspaceController;
  scenarios: StressScenario[];
  stressOpen: boolean;
  onStressOpen: () => void;
  playback: JourneyPlayback;
}) {
  const { state } = workspace;
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (
      ["intervention-verified", "degraded", "intervention-candidates"].includes(
        state.phase.kind,
      )
    )
      panel.current?.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [state.phase.kind]);
  const community = state.communities.find((c) => c.id === state.selectedId);
  const result = state.results.find((r) => r.communityId === state.selectedId);
  const busy = isBusy(state.phase);
  if (state.view === "network") return <NetworkPanel workspace={workspace} />;
  if (!community) return <WelcomePanel state={state} />;
  return (
    <aside
      ref={panel}
      className="context-panel"
      aria-label="Community inspector"
    >
      <CommunitySummary state={state} community={community} result={result} />
      <div className="inspector-tabs">
        <Button
          variant={state.view === "overview" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => workspace.setView("overview")}
        >
          Overview
        </Button>
        <Button
          variant={state.view === "journey" ? "secondary" : "ghost"}
          size="sm"
          disabled={!result || busy || !!state.loadingResource}
          onClick={() => void workspace.inspect("journey")}
        >
          Journey
        </Button>
        <Button
          variant={state.view === "investigation" ? "secondary" : "ghost"}
          size="sm"
          disabled={!result || busy || !!state.loadingResource}
          onClick={() => void workspace.inspect("investigation")}
        >
          Evidence
        </Button>
      </div>
      {state.loadingResource ? (
        <div className="panel-progress" role="status">
          <LoaderCircle size={16} className="spin" />
          Loading {state.loadingResource}…
        </div>
      ) : null}
      {state.view === "journey" && state.journey ? (
        <JourneyPanel
          journey={state.journey}
          onBack={() => workspace.setView("overview")}
          playback={playback}
          targetMinutes={state.objective?.targetMinutes ?? 45}
        />
      ) : state.view === "investigation" && state.investigation ? (
        <EvidencePanel
          investigation={state.investigation}
          onBack={() => workspace.setView("overview")}
        />
      ) : (
        <>
          {result && !state.candidates.length ? (
            <>
              <div className="failure-cause">
                <Route size={20} />
                <div>
                  <h3>{result.reason.title}</h3>
                  <p>{result.reason.description}</p>
                  <small>
                    {result.travelMinutes} min to care ·{" "}
                    {result.reason.severity} severity
                  </small>
                </div>
              </div>
              <div className="population-row">
                <Users size={20} />
                <div>
                  <strong>{community.population.total}</strong>
                  <small>catchment residents</small>
                </div>
                <div>
                  <strong>{community.population.aged65Plus}</strong>
                  <small>aged 65+</small>
                </div>
              </div>
              <p className="affected-line">
                {result.affectedResidents} residents miss the objective
              </p>
              <Button
                variant="outline"
                className="w-full"
                size="lg"
                disabled={busy || !!state.loadingResource}
                onClick={() => void workspace.inspect("journey")}
              >
                <Footprints data-icon="inline-start" />
                Inspect journey
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                size="lg"
                disabled={busy || !!state.loadingResource}
                onClick={() => void workspace.inspect("investigation")}
              >
                <Search data-icon="inline-start" />
                Investigation
                <ArrowUpRight data-icon="inline-end" />
              </Button>
              <div className="confidence-note">
                <Check size={14} />
                {Math.round(result.reason.evidence[0].confidence * 100)}%
                fixture confidence · 3 synthetic sources
              </div>
              <Button
                className="w-full"
                size="lg"
                disabled={busy}
                onClick={() => void workspace.generate()}
              >
                {state.phase.kind === "intervention-generation"
                  ? "Generating interventions…"
                  : "Generate interventions"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </>
          ) : null}
          {state.candidates.length ? (
            <InterventionPanel workspace={workspace} />
          ) : null}
          {state.simulation ? (
            <>
              <Button
                className="w-full"
                size="lg"
                variant="outline"
                disabled={busy}
                onClick={onStressOpen}
              >
                <CircleAlert data-icon="inline-start" />
                {stressOpen ? "Hide stress test" : "Stress test"}
              </Button>
              {stressOpen ? (
                <StressPanel workspace={workspace} scenarios={scenarios} />
              ) : null}
            </>
          ) : null}
        </>
      )}
      <div className="site-action">
        <Button
          data-site-trigger
          variant="ghost"
          size="lg"
          className="w-full justify-start"
          disabled={busy || !!state.loadingResource}
          onClick={() => void workspace.inspect("site")}
        >
          <Box data-icon="inline-start" />
          Enter site
          <ArrowUpRight data-icon="inline-end" />
        </Button>
        <small>Digital Twin / schematic preview</small>
      </div>
      <p className="panel-footnote">
        All accessibility, population and impact estimates are demonstration
        fixtures.
      </p>
      {state.simulationRequest ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => exportSimulationRequest(state.simulationRequest!)}
        >
          Export simulation context · JSON
        </Button>
      ) : null}
    </aside>
  );
}

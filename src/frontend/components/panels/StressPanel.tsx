import { CloudRain, Construction, Cross, Bus, ShieldCheck } from "lucide-react";
import type { WorkspaceController } from "@/frontend/features/workspace/useWorkspace";
import type { StressScenario } from "@/frontend/domain/models";
import { Button } from "@/frontend/components/ui/button";
import { isBusy } from "@/frontend/features/workspace/state";
const icons = {
  flood: CloudRain,
  "road-closure": Construction,
  "gp-closure": Cross,
  cancellation: Bus,
};
export function StressPanel({
  workspace,
  scenarios,
}: {
  workspace: WorkspaceController;
  scenarios: StressScenario[];
}) {
  const { state, stress, contingency } = workspace;
  const busy = isBusy(state.phase);
  return (
    <section className="stress-panel">
      <p className="eyebrow">Stress test / synthetic disruption</p>
      <h3>What if the network fails?</h3>
      <div className="scenario-list">
        {scenarios.map((s) => {
          const Icon = icons[s.kind];
          return (
            <Button
              variant={state.scenario?.id === s.id ? "destructive" : "outline"}
              key={s.id}
              disabled={busy}
              onClick={() => void stress(s)}
            >
              <Icon data-icon="inline-start" />
              {s.name}
            </Button>
          );
        })}
      </div>
      {state.scenario ? (
        <div className="disruption-detail">
          <strong>{state.scenario.name}</strong>
          <p>{state.scenario.description}</p>
          {state.simulation?.status === "degraded" ? (
            <>
              <div className="disruption-score">
                <span>
                  {state.intervention?.impact
                    ? `${state.intervention.impact.accessPercent}%`
                    : "Not evaluated"}
                </span>
                <span>→</span>
                <strong>{state.simulation.afterPercent}%</strong>
              </div>
              <p>
                {state.simulation.affectedResidents.toLocaleString("en-IE")}{" "}
                residents affected across the synthetic network
              </p>
              <Button
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={() => void contingency()}
              >
                <ShieldCheck data-icon="inline-start" />
                {state.phase.kind === "contingency-generation"
                  ? "Generating contingency…"
                  : "Generate contingency"}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {state.simulation?.status === "repaired" ? (
        <div className="repaired-note">
          <ShieldCheck size={20} />
          <div>
            <strong>
              Contingency restored access to {state.simulation.afterPercent}%
            </strong>
            <p>
              An independent clinic and rerouted feeder keep the objective
              reachable.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

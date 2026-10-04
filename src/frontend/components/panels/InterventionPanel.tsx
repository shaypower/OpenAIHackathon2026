import { ArrowUpRight, Check, Play, ShieldCheck } from "lucide-react";
import type { WorkspaceController } from "@/frontend/features/workspace/useWorkspace";
import { Button } from "@/frontend/components/ui/button";
import { isBusy } from "@/frontend/features/workspace/state";
export function InterventionPanel({
  workspace,
}: {
  workspace: WorkspaceController;
}) {
  const { state, preview, apply } = workspace;
  const busy = isBusy(state.phase);
  if (state.simulation && state.intervention)
    return (
      <section className="applied-patch">
        <p className="eyebrow">Applied civic patch / synthetic</p>
        <h3>{state.intervention.name}</h3>
        <p>{state.intervention.description}</p>
        <div className="impact-detail">
          <span>
            Resilience{" "}
            <strong>{state.intervention.impact.resiliencePercent}%</strong>
          </span>
          <span>
            Equity <strong>{state.intervention.impact.equityPercent}%</strong>
          </span>
        </div>
        <div className="verified-note">
          <Check size={15} />
          Mock simulation complete
        </div>
        <details>
          <summary>Compare other candidates</summary>
          {state.candidates.map((v) => (
            <button
              key={v.id}
              disabled={busy}
              className="compact-candidate"
              onClick={() => preview(v)}
            >
              <span>{v.name}</span>
              <strong>{v.impact.accessPercent}%</strong>
            </button>
          ))}
        </details>
      </section>
    );
  return (
    <section className="interventions">
      <p className="eyebrow">Candidate civic patches</p>
      <h3>Three ways to close the gap</h3>
      <p className="muted">Illustrative options · impact is synthetic</p>
      <div className="candidate-list">
        {state.candidates.map((v, i) => (
          <button
            key={v.id}
            className={`candidate${v.id === state.intervention?.id ? " active" : ""}`}
            disabled={busy}
            onClick={() => preview(v)}
            aria-pressed={v.id === state.intervention?.id}
          >
            <div className="candidate-top">
              <span>
                {String.fromCharCode(65 + i)} / {v.kind}
              </span>
              <strong>{v.impact.accessPercent}%</strong>
            </div>
            <h4>{v.name}</h4>
            <p>{v.description}</p>
            <div className="candidate-metrics">
              <span>€{v.impact.operatingCostWeekly}/wk</span>
              <span>{v.impact.residentsHelped} helped</span>
            </div>
            {i === 2 ? (
              <small>
                <ShieldCheck size={12} />
                Most resilient option
              </small>
            ) : null}
          </button>
        ))}
      </div>
      {state.intervention ? (
        <>
          <div className="impact-detail">
            <span>
              Resilience{" "}
              <strong>{state.intervention.impact.resiliencePercent}%</strong>
            </span>
            <span>
              Equity <strong>{state.intervention.impact.equityPercent}%</strong>
            </span>
          </div>
          {state.phase.kind === "intervention-selected" ||
          state.phase.kind === "simulation-running" ? (
            <Button
              className="w-full"
              size="lg"
              disabled={busy}
              onClick={() => void apply()}
            >
              <Play data-icon="inline-start" />
              {busy ? "Simulating…" : "Apply & simulate"}
              <ArrowUpRight data-icon="inline-end" />
            </Button>
          ) : (
            <div className="verified-note">
              <Check size={15} />
              Mock simulation complete
            </div>
          )}
        </>
      ) : (
        <p className="selection-hint">
          Select a candidate to preview it on the map.
        </p>
      )}
    </section>
  );
}

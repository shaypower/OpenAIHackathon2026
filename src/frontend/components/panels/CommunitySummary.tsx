import { ArrowRight } from "lucide-react";
import type { Community, AccessibilityResult } from "@/frontend/domain/models";
import type { WorkspaceState } from "@/frontend/features/workspace/state";
export function CommunitySummary({
  state,
  community,
  result,
}: {
  state: WorkspaceState;
  community: Community;
  result?: AccessibilityResult;
}) {
  const score =
    state.compare === "after" && state.simulation
      ? state.simulation.afterPercent
      : result?.accessPercent;
  const passed = score !== undefined && score >= (result?.targetPercent ?? 90);
  const degraded =
    state.compare === "after" && state.simulation?.status === "degraded";
  return (
    <>
      <div className="panel-heading">
        <p
          className={`eyebrow ${degraded ? "danger" : passed ? "success" : result ? "warning" : ""}`}
        >
          {degraded
            ? "Network disrupted"
            : passed
              ? "Objective met · mock"
              : result
                ? "Access failure"
                : "Community / explore"}
        </p>
        <span className="micro">SYNTHETIC</span>
      </div>
      <h2>{community.name}</h2>
      <p className="panel-subtitle">
        {state.objective?.cohort ?? "Primary healthcare · residents 65+"}
      </p>
      {result ? (
        <>
          <div
            className={`access-score ${degraded ? "danger" : passed ? "success" : "warning"}`}
          >
            <strong>
              {score}
              <span>%</span>
            </strong>
            <div>
              <span>
                can reach care
                <br />
                within {state.objective?.targetMinutes ?? 45} minutes
              </span>
              <small>{result.targetPercent}% target</small>
            </div>
          </div>
          <div className="score-track">
            <span
              style={{
                width: `${score}%`,
                background: degraded
                  ? "var(--danger)"
                  : passed
                    ? "var(--teal)"
                    : "var(--amber)",
              }}
            />
            <i style={{ left: `${result.targetPercent}%` }} />
          </div>
          {state.simulation ? (
            <div className="before-after-summary">
              <span>
                BEFORE <b>{state.simulation.beforePercent}%</b>
              </span>
              <ArrowRight size={15} />
              <span>
                AFTER <b>{state.simulation.afterPercent}%</b>
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <p className="explore-notice">
          Run the objective to evaluate this catchment.
        </p>
      )}
    </>
  );
}

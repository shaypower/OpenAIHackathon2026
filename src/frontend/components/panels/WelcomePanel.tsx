import { Target, CircleAlert, LoaderCircle } from "lucide-react";
import {
  isBusy,
  phaseLabel,
  type WorkspaceState,
} from "@/frontend/features/workspace/state";
export function WelcomePanel({ state }: { state: WorkspaceState }) {
  const busy = isBusy(state.phase);
  return (
    <aside className="context-panel welcome">
      <p className="eyebrow">Civic intelligence / Ireland</p>
      <h1>
        A better connection.
        <br />A fairer place.
      </h1>
      <p>
        Find the communities a public service leaves behind. Explore a change.
        Test what happens next.
      </p>
      <div className="welcome-rule" />
      <Target size={28} />
      <h3>Give the map an objective</h3>
      <p>
        The command below starts a synthetic healthcare access scenario in
        County Tipperary.
      </p>
      <div className="welcome-sequence">
        <span>01 / Find the gap</span>
        <span>02 / Design a civic patch</span>
        <span>03 / Test its resilience</span>
      </div>
      <div className="fixture-notice">
        <CircleAlert size={16} />
        <p>Demonstration fixtures. No figures here are verified public data.</p>
      </div>
      {busy ? (
        <div className="panel-progress">
          <LoaderCircle size={16} className="spin" />
          {phaseLabel(state.phase)}
        </div>
      ) : state.results.length ? (
        <p className="ready-prompt">
          Choose a highlighted community to investigate.
        </p>
      ) : null}
    </aside>
  );
}

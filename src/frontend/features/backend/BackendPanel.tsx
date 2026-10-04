import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import type { BackendController } from "./useBackend";

export function BackendPanel({
  backend,
  onClose,
  onValidate,
}: {
  backend: BackendController;
  onClose: () => void;
  onValidate: () => void;
}) {
  const [runId, setRunId] = useState("");
  const compilation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (backend.validating || backend.validation || backend.validationError)
      compilation.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [backend.validating, backend.validation, backend.validationError]);
  const { status, sources, validation, run } = backend;
  return (
    <aside
      className="context-panel backend-panel"
      aria-label="Backend integration inspector"
    >
      <div className="backend-toolbar">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft size={14} />
          Workspace
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={backend.checking}
          aria-label="Refresh backend capabilities"
          onClick={() => void backend.refresh()}
        >
          <RefreshCw size={15} />
        </Button>
      </div>
      <p className="eyebrow">Connected capabilities</p>
      <h2>Backend integration</h2>
      <p className="muted">
        Inspect connected services. The map and civic demo remain synthetic.
      </p>
      {backend.checking ? <p role="status">Checking backend…</p> : null}
      {backend.statusError ? (
        <p role="alert" className="backend-error">
          {backend.statusError}
          {status ? " Last status retained below." : ""}
        </p>
      ) : null}
      {status ? (
        <section>
          <div className="backend-state">
            <strong>{status.state}</strong>
            <span>{status.dataMode} data mode</span>
          </div>
          <p className="eyebrow">Runtime capabilities</p>
          <dl className="capability-list">
            {status.capabilities.map((c) => (
              <div key={c.name}>
                <dt>{c.name.replaceAll("_", " ")}</dt>
                <dd>{c.state}</dd>
              </div>
            ))}
          </dl>
          <p className="backend-note">
            Source-backed geometry does not establish analytical readiness.
            Evaluation requires compatible datasets and deterministic tools.
          </p>
          <details>
            <summary>Execution limits and limitations</summary>
            <p>
              {status.runDeadlineSeconds === null
                ? "Deadline not advertised"
                : `${status.runDeadlineSeconds}s run deadline`}{" "}
              · {status.storage} store
            </p>
            <p>{status.restartBehavior}</p>
            <ul>
              {status.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
      <section ref={compilation}>
        <p className="eyebrow">Objective compilation</p>
        <h3>Validate the goal</h3>
        <p>
          Check geography, cohort and time bound through the backend’s
          deterministic template parser. Validation does not run accessibility
          or AI.
        </p>
        <Button className="w-full" variant="outline" onClick={onValidate}>
          Use backend validation
        </Button>
        {backend.validating ? <p role="status">Validating objective…</p> : null}
        {backend.validationError ? (
          <p role="alert" className="backend-error">
            {backend.validationError}
          </p>
        ) : null}
        {validation ? (
          <div className="compiled-objective">
            <p className="eyebrow">Validated · not evaluated</p>
            <h3>{validation.objective.geography}</h3>
            <strong>{validation.objective.targetMinutes} min</strong>
            <dl className="capability-list">
              <div>
                <dt>Minimum age</dt>
                <dd>{validation.objective.minimumAge ?? "Not specified"}</dd>
              </div>
              <div>
                <dt>Car access</dt>
                <dd>
                  {validation.objective.carAccess === null
                    ? "Not specified"
                    : validation.objective.carAccess
                      ? "Yes"
                      : "Without a car"}
                </dd>
              </div>
              <div>
                <dt>Coverage target</dt>
                <dd>
                  {validation.objective.targetAccessPercent === null
                    ? "Not specified"
                    : `${validation.objective.targetAccessPercent}%`}
                </dd>
              </div>
            </dl>
            <p>No baseline or simulation has been created.</p>
            <ul>
              {[...validation.assumptions, ...validation.limitations].map(
                (l, i) => (
                  <li key={i}>{l}</li>
                ),
              )}
            </ul>
          </div>
        ) : null}
      </section>
      <section>
        <p className="eyebrow">Pinned run readback</p>
        <h3>Inspect an existing run</h3>
        <p>
          Without a registered baseline tool, the server cannot create runs.
          Watching a run never applies its metrics to the demo map.
        </p>
        <form
          className="run-inspection"
          onSubmit={(e) => {
            e.preventDefault();
            void backend.inspectRun(runId);
          }}
        >
          <label htmlFor="backend-run-id">Run ID</label>
          <input
            id="backend-run-id"
            maxLength={160}
            required
            value={runId}
            disabled={backend.watching}
            onChange={(e) => setRunId(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            disabled={backend.watching || !runId.trim()}
          >
            Inspect run
          </Button>
        </form>
        {backend.watching ? (
          <Button size="sm" variant="outline" onClick={backend.stopWatching}>
            Stop watching
          </Button>
        ) : null}
        {backend.runError ? (
          <p role="alert" className="backend-error">
            {backend.runError}
            {run ? " Last snapshot retained below." : ""}
          </p>
        ) : null}
        {run ? (
          <div className="run-readback">
            <p className="eyebrow">
              {run.dataMode} · {run.kind}
            </p>
            <h3>{run.state}</h3>
            <p>
              {run.phase} · {run.engineVersion}
            </p>
            <small>
              {run.id} · updated{" "}
              {new Date(run.updatedAt).toLocaleString("en-IE")}
            </small>
            {run.errorCode ? <p>Failure code: {run.errorCode}</p> : null}
            <dl className="capability-list">
              {(["before", "after"] as const).map((key) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>
                    {run[key] === null
                      ? "Not computed"
                      : run[key].accessPercent === null
                        ? "Not applicable · zero cohort"
                        : `${run[key].accessPercent}% · ${run[key].reachableResidents}/${run[key].cohortResidents} residents`}
                  </dd>
                </div>
              ))}
            </dl>
            <p>Snapshots: {run.datasetIds.join(", ")}</p>
            <ul>
              {[...run.assumptions, ...run.limitations].map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <p className="eyebrow">Executed tool trace</p>
            {run.trace.length ? (
              <ol>
                {run.trace.map((t) => (
                  <li key={t.id}>
                    {t.tool} · {t.state}
                    {t.outputRef ? ` · ${t.outputRef}` : ""}
                  </li>
                ))}
              </ol>
            ) : (
              <p>No tool actions recorded.</p>
            )}
          </div>
        ) : null}
      </section>
      <section>
        <p className="eyebrow">Source inventory</p>
        <h3>
          {sources
            ? `${sources.realCivicDatasets} real civic datasets ingested`
            : "Inventory unavailable"}
        </h3>
        {backend.sourcesError ? (
          <p role="alert" className="backend-error">
            {backend.sourcesError}
            {sources ? " Last inventory retained below." : ""}
          </p>
        ) : null}
        {sources ? (
          <>
            <small>Inventory inspected {sources.inspectedOn}</small>
            <div className="backend-sources">
              {sources.sources.map((s) => (
                <details key={s.id}>
                  <summary>
                    {s.name}
                    <small>
                      {s.state} · {s.dataMode}
                    </small>
                  </summary>
                  <p>{s.dataset}</p>
                  <dl className="capability-list">
                    <div>
                      <dt>Source freshness</dt>
                      <dd>{s.updatedAt ?? "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Acquired</dt>
                      <dd>{s.acquiredAt ?? "Not acquired"}</dd>
                    </div>
                    <div>
                      <dt>Licence</dt>
                      <dd>{s.licence ?? "Unknown"}</dd>
                    </div>
                  </dl>
                  <p>{s.notes}</p>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      Inspect source
                    </a>
                  ) : null}
                </details>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </aside>
  );
}

import {
  ArrowLeft,
  ArrowRight,
  Bus,
  MapPin,
  ExternalLink,
  Route,
} from "lucide-react";
import type { WorkspaceController } from "@/frontend/features/workspace/useWorkspace";
import { Button } from "@/frontend/components/ui/button";
import { routePath } from "./topology";

export function NetworkPanel({
  workspace,
}: {
  workspace: WorkspaceController;
}) {
  const { state, selectTransport, closeTransport } = workspace;
  const selection = state.transportSelection;
  const selectedRoute =
    selection?.kind === "route"
      ? state.routes.find((r) => r.id === selection.id)
      : undefined;
  const selectedStop =
    selection?.kind === "stop"
      ? state.stops.find((s) => s.id === selection.id)
      : undefined;
  const source = state.transportSources.find(
    (s) => s.id === (selectedRoute?.sourceId ?? selectedStop?.sourceId),
  );
  const path = selectedRoute
    ? routePath(
        {
          routes: state.routes,
          stops: state.stops,
          edges: state.edges,
          sources: state.transportSources,
        },
        selectedRoute.id,
      )
    : undefined;
  const relatedRoutes = selectedStop
    ? state.routes.filter((r) => r.stopIds.includes(selectedStop.id))
    : state.routes;
  return (
    <aside
      className="context-panel network-panel"
      aria-label="Transport inspector"
    >
      <Button variant="ghost" size="sm" onClick={closeTransport}>
        <ArrowLeft size={14} />
        {state.selectedId ? "Community" : "Workspace"}
      </Button>
      <p className="eyebrow">Transport / connected geography</p>
      <h2>
        {selectedStop
          ? selectedStop.name
          : selectedRoute
            ? `Route ${selectedRoute.shortName}`
            : "Follow the network"}
      </h2>
      <p className="panel-subtitle">
        {selectedRoute?.operator ??
          "Select a route or stop to inspect its connections."}
      </p>
      {selectedRoute && path ? (
        <>
          <div className="network-metrics">
            <span>
              <strong>{(path.distanceMetres / 1000).toFixed(1)}</strong> km of
              captured path
            </span>
            <span>
              <strong>{selectedRoute.stopIds.length}</strong> ordered stops
            </span>
          </div>
          <p
            className={`network-source-label ${selectedRoute.serviceContext === "synthetic" ? "warning" : "success"}`}
          >
            {selectedRoute.serviceContext === "published"
              ? "Published GTFS shape · selected pattern"
              : "Synthetic service · captured road geometry"}
          </p>
        </>
      ) : null}
      {selectedStop ? (
        <div className="stop-location">
          <MapPin size={18} />
          <span>
            {selectedStop.geometry.coordinates[1].toFixed(5)}° N ·{" "}
            {Math.abs(selectedStop.geometry.coordinates[0]).toFixed(5)}° W
            <small>WGS84 · {selectedStop.id}</small>
          </span>
        </div>
      ) : null}
      <div
        className="network-route-list"
        aria-label="Available transport routes"
      >
        <p className="eyebrow">
          {selectedStop ? "Connected routes" : "Captured routes"}
        </p>
        {relatedRoutes.map((r) => (
          <button
            key={r.id}
            aria-pressed={r.id === selectedRoute?.id}
            onClick={() => selectTransport({ kind: "route", id: r.id })}
          >
            <span
              className={`route-number ${r.serviceContext === "synthetic" ? "synthetic" : ""}`}
            >
              {r.shortName}
            </span>
            <span>
              <strong>{r.name.replace(`${r.shortName} · `, "")}</strong>
              <small>
                {r.serviceContext === "published"
                  ? "NTA route shape"
                  : "Synthetic service corridor"}{" "}
                · {r.edgeIds.length} segments
              </small>
            </span>
            <ArrowRight size={13} />
          </button>
        ))}
      </div>
      {selectedRoute ? (
        <>
          <p className="eyebrow">Stop order / connected segments</p>
          <ol className="network-stops">
            {selectedRoute.stopIds.map((id, i) => {
              const stop = state.stops.find((s) => s.id === id)!;
              return (
                <li key={id}>
                  <button onClick={() => selectTransport({ kind: "stop", id })}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <strong>{stop.name}</strong>
                    <MapPin size={13} />
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
      {selectedStop ? (
        <div className="connected-segments">
          <p className="eyebrow">Adjacent segments</p>
          {state.edges
            .filter(
              (e) =>
                e.fromStopId === selectedStop.id ||
                e.toStopId === selectedStop.id,
            )
            .map((e) => (
              <p key={e.id}>
                <Route size={13} />
                {state.stops.find((s) => s.id === e.fromStopId)?.name} →{" "}
                {state.stops.find((s) => s.id === e.toStopId)?.name}
                <small>
                  {(e.distanceMetres / 1000).toFixed(1)} km · {e.id}
                </small>
              </p>
            ))}
        </div>
      ) : null}
      {source ? (
        <section className="transport-provenance">
          <p className="eyebrow">Geometry provenance</p>
          <h3>{source.name}</h3>
          <p>{source.dataset}</p>
          <dl>
            <dt>Captured</dt>
            <dd>
              {new Date(source.acquiredAt).toLocaleDateString("en-IE", {
                timeZone: "Europe/Dublin",
              })}
            </dd>
            <dt>Licence</dt>
            <dd>{source.licence}</dd>
            <dt>Version</dt>
            <dd title={source.version}>{source.version}</dd>
          </dl>
          <a href={source.url} target="_blank" rel="noreferrer">
            Inspect source <ExternalLink size={12} />
          </a>
          <small>{source.limitations}</small>
        </section>
      ) : null}
      <p className="panel-footnote">
        <Bus size={13} /> Route geometry is geographic context. All journey
        clocks, population and intervention impacts remain synthetic.
      </p>
    </aside>
  );
}

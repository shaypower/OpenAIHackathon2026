import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { createMapRenderer } from "@/frontend/adapters/spatial/mapRenderer";
import type { MapSnapshot } from "@/frontend/adapters/spatial/mapFeatures";
import type { TransportSelection } from "@/frontend/domain/models";
export function MapCanvas({
  snapshot,
  onSelect,
  onInspectTransport,
  onSelectHospital,
}: {
  snapshot: MapSnapshot;
  onSelect: (id: string) => void;
  onInspectTransport: (selection: TransportSelection) => void;
  onSelectHospital: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof createMapRenderer> | null>(null);
  const latest = useRef(onSelect);
  const transport = useRef(onInspectTransport);
  const hospital = useRef(onSelectHospital);
  useEffect(() => {
    latest.current = onSelect;
    transport.current = onInspectTransport;
    hospital.current = onSelectHospital;
  }, [onSelect, onInspectTransport, onSelectHospital]);
  const [status, setStatus] = useState("Starting WebGL");
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!container.current) return;
    try {
      renderer.current = createMapRenderer(
        container.current,
        (id) => latest.current(id),
        setStatus,
        (selection) => transport.current(selection),
        (id) => hospital.current(id),
      );
    } catch {
      // External WebGL initialization can fail synchronously; reflect that failure in the UI.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        "WebGL is unavailable on this device. Use the community list to run the complete demo.",
      );
    }
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);
  useEffect(() => {
    renderer.current?.render(snapshot);
  }, [snapshot]);
  useEffect(() => {
    if (renderer.current)
      renderer.current.setEnvironment(
        snapshot.offline,
        snapshot.theme ?? "light",
      );
  }, [snapshot.offline, snapshot.theme]);
  return (
    <>
      <div
        ref={container}
        className="map-canvas"
        aria-label="Interactive Ireland planning map"
      />
      {error ? (
        <div className="map-fallback" role="status">
          <h2>Spatial view unavailable</h2>
          <p>{error}</p>
        </div>
      ) : null}
      <div className="map-provider-status">{status}</div>
    </>
  );
}

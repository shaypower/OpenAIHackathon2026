import {
  Map,
  NavigationControl,
  ScaleControl,
  Marker,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection } from "geojson";
import land from "@/frontend/mocks/land.geojson.json";
import { mapFeatures, type MapSnapshot } from "./mapFeatures";
setWorkerUrl(workerUrl);
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const offlineStyle: StyleSpecification = {
  version: 8,
  sources: { land: { type: "geojson", data: land as FeatureCollection } },
  layers: [
    {
      id: "water",
      type: "background",
      paint: { "background-color": "#dce9e8" },
    },
    {
      id: "land",
      type: "fill",
      source: "land",
      paint: { "fill-color": "#edf1e8", "fill-outline-color": "#bdcec2" },
    },
  ],
};
export function createMapRenderer(
  container: HTMLDivElement,
  onSelect: (id: string) => void,
  onStatus: (message: string) => void,
) {
  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const map = new Map({
    container,
    style: offlineStyle,
    center: [-8.1, 53.1],
    zoom: 6.4,
    pitch: 25,
    bearing: -8,
    attributionControl: { compact: true },
    maxPitch: 65,
  });
  map.addControl(
    new NavigationControl({ visualizePitch: true }),
    "bottom-left",
  );
  map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
  const popup = new Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
  });
  let snapshot: MapSnapshot | null = null,
    ready = false,
    disposed = false,
    hoverId: string | number | null = null,
    lastCamera = "",
    fallback = false,
    remoteAttempt = 0,
    basemapTimer: ReturnType<typeof setTimeout> | undefined;
  let labels: Marker[] = [];
  const sourceIds = [
    "communities",
    "centers",
    "services",
    "stops",
    "routes",
    "intervention",
    "disruption",
    "journey",
  ];
  const getSource = (id: string) =>
    map.getSource(`civic-${id}`) as GeoJSONSource | undefined;
  function install() {
    ready = true;
    for (const id of sourceIds)
      map.addSource(`civic-${id}`, { type: "geojson", data: EMPTY });
    map.addLayer({
      id: "vulnerability",
      type: "fill",
      source: "civic-communities",
      paint: {
        "fill-color": "#688296",
        "fill-opacity": ["*", ["get", "vulnerability"], 0.65],
      },
    });
    map.addLayer({
      id: "catchments",
      type: "fill",
      source: "civic-communities",
      paint: {
        "fill-color": [
          "case",
          ["get", "served"],
          "#087f74",
          ["get", "failed"],
          "#b77620",
          "#789c88",
        ],
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.36,
          ["get", "selected"],
          0.26,
          0.13,
        ],
        "fill-opacity-transition": { duration: 500 },
      },
    });
    map.addLayer({
      id: "catchment-borders",
      type: "line",
      source: "civic-communities",
      paint: {
        "line-color": [
          "case",
          ["get", "served"],
          "#087f74",
          ["get", "failed"],
          "#b77620",
          "#789c88",
        ],
        "line-width": ["case", ["get", "selected"], 3, 1.4],
        "line-dasharray": [3, 2],
      },
    });
    map.addLayer({
      id: "routes",
      type: "line",
      source: "civic-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#62897d", "line-width": 2.2 },
    });
    map.addLayer({
      id: "journey",
      type: "line",
      source: "civic-journey",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": "#b77620",
        "line-width": 5,
        "line-dasharray": [2, 1],
      },
    });
    map.addLayer({
      id: "patch-halo",
      type: "line",
      source: "civic-intervention",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#fff", "line-width": 9, "line-opacity": 0.8 },
    });
    map.addLayer({
      id: "patch-route",
      type: "line",
      source: "civic-intervention",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#087f74", "line-width": 4 },
    });
    map.addLayer({
      id: "patch-sites",
      type: "circle",
      source: "civic-intervention",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 9,
        "circle-color": "#087f74",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 3,
      },
    });
    map.addLayer({
      id: "flood-area",
      type: "fill",
      source: "civic-disruption",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#b4483e", "fill-opacity": 0.32 },
    });
    map.addLayer({
      id: "disrupted-lines",
      type: "line",
      source: "civic-disruption",
      filter: ["!=", ["geometry-type"], "Point"],
      paint: {
        "line-color": "#b4483e",
        "line-width": 5,
        "line-dasharray": [1, 1],
      },
    });
    map.addLayer({
      id: "closed-sites",
      type: "circle",
      source: "civic-disruption",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 14,
        "circle-color": "#b4483e",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#fff",
      },
    });
    map.addLayer({
      id: "stops",
      type: "circle",
      source: "civic-stops",
      paint: {
        "circle-radius": 4,
        "circle-color": "#18342f",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1.5,
      },
    });
    map.addLayer({
      id: "services",
      type: "circle",
      source: "civic-services",
      paint: {
        "circle-radius": 8,
        "circle-color": "#087f74",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 3,
      },
    });
    if (snapshot) render(snapshot);
  }
  function render(next: MapSnapshot) {
    snapshot = next;
    if (!ready) return;
    const data = mapFeatures(next);
    for (const [id, features] of Object.entries(data))
      getSource(id)?.setData(features);
    const visibility = (ids: string[], show: boolean) =>
      ids.forEach((id) =>
        map.setLayoutProperty(id, "visibility", show ? "visible" : "none"),
      );
    visibility(["catchments", "catchment-borders"], next.layers.failures);
    visibility(["vulnerability"], next.layers.vulnerability);
    visibility(["routes", "stops"], next.layers.transport);
    visibility(["services"], next.layers.healthcare);
    labels.forEach((l) => l.remove());
    labels = [];
    for (const c of next.state.communities) {
      const button = document.createElement("button");
      button.className = `map-label${c.id === next.state.selectedId ? " selected" : ""}`;
      button.textContent = c.name;
      button.disabled = [
        "objective-parsing",
        "analysing",
        "intervention-generation",
        "simulation-running",
        "stress-testing",
        "contingency-generation",
      ].includes(next.state.phase.kind);
      button.setAttribute("aria-label", `Select ${c.name} on map`);
      button.onclick = () => onSelect(c.id);
      labels.push(
        new Marker({ element: button, anchor: "bottom", offset: [0, -9] })
          .setLngLat(c.center)
          .addTo(map),
      );
    }
    const cameraKey = `${next.state.objective?.id ?? "ireland"}:${next.state.selectedId ?? "all"}:${next.camera}`;
    if (cameraKey !== lastCamera) {
      lastCamera = cameraKey;
      map.stop();
      const selected = next.state.communities.find(
        (c) => c.id === next.state.selectedId,
      );
      const mobile = container.clientWidth < 640;
      if (selected && next.camera === "street") {
        map.easeTo({
          center: selected.center,
          zoom: 16.4,
          pitch: mobile ? 40 : 58,
          bearing: -24,
          duration: reduced() ? 0 : 1400,
          padding: { left: 0, right: 0, top: 40, bottom: 30 },
        });
      } else if (selected) {
        const ring = selected.geometry.coordinates[0];
        const lngs = ring.map((p) => p[0]),
          lats = ring.map((p) => p[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          {
            pitch: 32,
            bearing: -8,
            padding: {
              left: mobile ? 35 : 240,
              right: 35,
              top: 70,
              bottom: 85,
            },
            duration: reduced() ? 0 : 1100,
            maxZoom: 11.7,
          },
        );
      } else if (next.state.objective) {
        map.fitBounds(
          [
            [-8.57, 52.56],
            [-7.6, 53.08],
          ],
          {
            padding: {
              left: mobile ? 35 : 240,
              right: 35,
              top: 65,
              bottom: 90,
            },
            pitch: 30,
            bearing: -8,
            duration: reduced() ? 0 : 1400,
          },
        );
      } else
        map.easeTo({
          center: [-8.1, 53.1],
          zoom: 6.4,
          pitch: 25,
          bearing: -8,
          duration: reduced() ? 0 : 900,
          padding: 0,
        });
    }
  }
  const switchOffline = () => {
    clearTimeout(basemapTimer);
    remoteAttempt++;
    fallback = true;
    ready = false;
    hoverId = null;
    popup.remove();
    map.setStyle(offlineStyle, { diff: false });
    onStatus("Offline map · local land + synthetic network");
  };
  async function loadBasemap() {
    const attempt = ++remoteAttempt;
    ready = false;
    fallback = false;
    onStatus("Loading geographic context");
    try {
      const response = await fetch(
        "https://tiles.openfreemap.org/styles/liberty",
        { signal: AbortSignal.timeout(6000) },
      );
      if (!response.ok) throw new Error("Basemap unavailable");
      const style: StyleSpecification = await response.json();
      // The public style has shield filters that assume numeric references and a missing gate sprite.
      // Keep this civic map uncluttered by omitting shields and minor POI symbols.
      style.layers = style.layers.filter(
        (layer) =>
          ![
            "road_shield_us",
            "highway-shield-us-interstate",
            "highway-shield-non-us",
          ].includes(layer.id) && !layer.id.startsWith("poi"),
      );
      if (disposed || attempt !== remoteAttempt) return;
      basemapTimer = setTimeout(() => {
        if (!disposed && attempt === remoteAttempt) switchOffline();
      }, 6500);
      map.setStyle(style, { diff: false });
    } catch {
      if (!disposed && attempt === remoteAttempt) switchOffline();
    }
  }
  map.on("style.load", () => {
    clearTimeout(basemapTimer);
    hoverId = null;
    install();
    if (map.getLayer("building-3d")) {
      map.setPaintProperty("building-3d", "fill-extrusion-color", "#b5c4b8");
      map.setPaintProperty("building-3d", "fill-extrusion-opacity", 0.85);
    }
    onStatus(
      fallback
        ? "Offline map · local land + synthetic network"
        : "OpenFreeMap · WebGL",
    );
  });
  map.on("error", () => {
    if (!fallback) onStatus("Some map tiles unavailable · use Offline map");
  });
  map.on("mousemove", "catchments", (event) => {
    const feature = event.features?.[0];
    if (hoverId !== null)
      map.setFeatureState(
        { source: "civic-communities", id: hoverId },
        { hover: false },
      );
    hoverId = feature?.id ?? null;
    if (hoverId !== null)
      map.setFeatureState(
        { source: "civic-communities", id: hoverId },
        { hover: true },
      );
    map.getCanvas().style.cursor = feature ? "pointer" : "";
  });
  map.on("mouseleave", "catchments", () => {
    if (hoverId !== null)
      map.setFeatureState(
        { source: "civic-communities", id: hoverId },
        { hover: false },
      );
    hoverId = null;
    map.getCanvas().style.cursor = "";
  });
  map.on("click", "catchments", (event) => {
    if (
      map.queryRenderedFeatures(event.point, {
        layers: ["services", "routes", "stops", "patch-sites", "patch-route"],
      }).length
    )
      return;
    const id = event.features?.[0]?.properties.id;
    if (typeof id === "string") onSelect(id);
  });
  for (const layer of [
    "services",
    "routes",
    "stops",
    "patch-sites",
    "patch-route",
  ]) {
    map.on("click", layer, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const div = document.createElement("div");
      div.textContent = String(feature.properties.name ?? "Synthetic feature");
      popup.setLngLat(event.lngLat).setDOMContent(div).addTo(map);
    });
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }
  const resize = new ResizeObserver(() => map.resize());
  resize.observe(container);
  return {
    render,
    setOffline(value: boolean) {
      if (value) switchOffline();
      else void loadBasemap();
    },
    dispose() {
      disposed = true;
      remoteAttempt++;
      clearTimeout(basemapTimer);
      resize.disconnect();
      labels.forEach((l) => l.remove());
      popup.remove();
      map.remove();
    },
  };
}

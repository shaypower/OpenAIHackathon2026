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
import type { FeatureCollection, Geometry } from "geojson";
import type { TransportSelection } from "@/frontend/domain/models";
import type { Theme } from "@/frontend/hooks/useTheme";
import { geometryBounds } from "./geometryBounds";
import { mapPalette } from "./mapTheme";
import { createJourneyRenderer } from "./journeyRenderer";
import land from "@/frontend/mocks/land.geojson.json";
import { mapFeatures, type MapSnapshot } from "./mapFeatures";
setWorkerUrl(workerUrl);
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const offlineStyle = (theme: Theme): StyleSpecification => ({
  version: 8,
  sources: { land: { type: "geojson", data: land as FeatureCollection } },
  layers: [
    {
      id: "water",
      type: "background",
      paint: { "background-color": mapPalette(theme).water },
    },
    {
      id: "land",
      type: "fill",
      source: "land",
      paint: {
        "fill-color": mapPalette(theme).land,
        "fill-outline-color": mapPalette(theme).border,
      },
    },
  ],
});
export function createMapRenderer(
  container: HTMLDivElement,
  onSelect: (id: string) => void,
  onStatus: (message: string) => void,
  onInspectTransport: (selection: TransportSelection) => void,
) {
  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const map = new Map({
    container,
    style: offlineStyle("light"),
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
  const traveller = createJourneyRenderer(map);
  let theme: Theme = "light";
  let basemapRequest: AbortController | undefined;
  const styles: Partial<Record<Theme, StyleSpecification>> = {};
  let routeHoverId: string | number | null = null;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionChanged = () => {
    if (motion.matches) {
      map.stop();
      traveller.pause();
    }
    if (ready && map.getLayer("catchments")) {
      map.setPaintProperty("catchments", "fill-opacity-transition", {
        duration: motion.matches ? 0 : 450,
      });
      map.setPaintProperty("catchments", "fill-color-transition", {
        duration: motion.matches ? 0 : 450,
      });
    }
  };
  motion.addEventListener("change", motionChanged);
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
    const palette = mapPalette(theme);
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
          palette.teal,
          ["get", "failed"],
          palette.amber,
          palette.neutral,
        ],
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.36,
          ["get", "selected"],
          0.26,
          0.13,
        ],
        "fill-opacity-transition": { duration: reduced() ? 0 : 450 },
        "fill-color-transition": { duration: reduced() ? 0 : 450 },
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
          palette.teal,
          ["get", "failed"],
          palette.amber,
          palette.neutral,
        ],
        "line-width": ["case", ["get", "selected"], 3, 1.4],
        "line-dasharray": [3, 2],
      },
    });
    map.addLayer({
      id: "routes",
      filter: ["==", ["get", "synthetic"], false],
      type: "line",
      source: "civic-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "case",
          ["get", "selected"],
          palette.teal,
          palette.network,
        ],
        "line-width": [
          "case",
          ["get", "selected"],
          6,
          ["boolean", ["feature-state", "hover"], false],
          4,
          2.5,
        ],
        "line-opacity": 0.9,
      },
    });
    map.addLayer({
      id: "demo-routes",
      type: "line",
      source: "civic-routes",
      filter: ["==", ["get", "synthetic"], true],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "case",
          ["get", "selected"],
          palette.teal,
          palette.network,
        ],
        "line-width": ["case", ["get", "selected"], 5, 2.5],
        "line-dasharray": [3, 2],
      },
    });
    map.addLayer({
      id: "journey",
      type: "line",
      source: "civic-journey",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": palette.amber,
        "line-width": 5,
        "line-dasharray": [2, 1],
      },
    });
    map.addLayer({
      id: "patch-halo",
      type: "line",
      source: "civic-intervention",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": palette.halo,
        "line-width": 9,
        "line-opacity": 0.8,
      },
    });
    map.addLayer({
      id: "patch-route",
      type: "line",
      source: "civic-intervention",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": palette.teal, "line-width": 4 },
    });
    map.addLayer({
      id: "patch-sites",
      type: "circle",
      source: "civic-intervention",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 9,
        "circle-color": palette.teal,
        "circle-stroke-color": palette.halo,
        "circle-stroke-width": 3,
      },
    });
    map.addLayer({
      id: "flood-area",
      type: "fill",
      source: "civic-disruption",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": palette.danger, "fill-opacity": 0.32 },
    });
    map.addLayer({
      id: "disrupted-lines",
      type: "line",
      source: "civic-disruption",
      filter: ["!=", ["geometry-type"], "Point"],
      paint: {
        "line-color": palette.danger,
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
        "circle-color": palette.danger,
        "circle-stroke-width": 3,
        "circle-stroke-color": palette.halo,
      },
    });
    map.addLayer({
      id: "stops",
      type: "circle",
      source: "civic-stops",
      paint: {
        "circle-radius": ["case", ["get", "selected"], 8, 4],
        "circle-color": palette.ink,
        "circle-stroke-color": palette.halo,
        "circle-stroke-width": 1.5,
      },
    });
    map.addLayer({
      id: "services",
      type: "circle",
      source: "civic-services",
      paint: {
        "circle-radius": 8,
        "circle-color": palette.teal,
        "circle-stroke-color": palette.halo,
        "circle-stroke-width": 3,
      },
    });
    traveller.install(theme);
    if (snapshot) render(snapshot);
  }
  function render(next: MapSnapshot) {
    snapshot = next;
    if (!ready) return;
    traveller.render(
      next.state.journey,
      next.playback,
      next.state.view === "journey",
    );
    const data = mapFeatures(next);
    for (const [id, features] of Object.entries(data))
      getSource(id)?.setData(features);
    const visibility = (ids: string[], show: boolean) =>
      ids.forEach((id) =>
        map.setLayoutProperty(id, "visibility", show ? "visible" : "none"),
      );
    visibility(["catchments", "catchment-borders"], next.layers.failures);
    visibility(["vulnerability"], next.layers.vulnerability);
    visibility(["routes", "demo-routes", "stops"], next.layers.transport);
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
    const patchCamera = next.state.simulation
      ? (next.state.intervention?.id ?? "")
      : "";
    const cameraKey = `${patchCamera}:${next.state.objective?.id ?? "ireland"}:${next.state.selectedId ?? "all"}:${next.camera}:${next.state.view === "network" ? next.state.transportSelection?.id : next.state.view === "journey" ? next.state.journey?.id : ""}`;
    if (cameraKey !== lastCamera) {
      lastCamera = cameraKey;
      map.stop();
      const selected = next.state.communities.find(
        (c) => c.id === next.state.selectedId,
      );
      const mobile = container.clientWidth < 640;
      const transport =
        next.state.view === "network"
          ? next.state.transportSelection
          : undefined;
      const route =
        transport?.kind === "route"
          ? next.state.routes.find((r) => r.id === transport.id)
          : undefined;
      const stop =
        transport?.kind === "stop"
          ? next.state.stops.find((s) => s.id === transport.id)
          : undefined;
      const journeyCoordinates =
        next.state.view === "journey"
          ? next.state.journey?.legs.flatMap(
              (l) => l.geometry?.coordinates ?? [],
            )
          : undefined;
      const path = route?.geometry.coordinates ?? journeyCoordinates;
      const focusedGeometry: Geometry | undefined = path?.length
        ? { type: "LineString", coordinates: path }
        : next.state.simulation &&
            next.state.intervention &&
            next.camera === "region" &&
            next.state.view !== "network" &&
            next.state.view !== "journey"
          ? {
              type: "GeometryCollection",
              geometries: [
                ...(selected ? [selected.geometry] : []),
                ...next.state.intervention.features.map((f) => f.geometry),
              ],
            }
          : undefined;
      if (focusedGeometry) {
        map.fitBounds(geometryBounds(focusedGeometry), {
          padding: {
            left: mobile ? 35 : 240,
            right: 45,
            top: 70,
            bottom: 90,
          },
          pitch: 25,
          bearing: 0,
          duration: reduced() ? 0 : 1000,
          maxZoom: 13,
        });
      } else if (stop) {
        map.easeTo({
          center: [stop.geometry.coordinates[0], stop.geometry.coordinates[1]],
          zoom: 14.2,
          pitch: 30,
          bearing: 0,
          duration: reduced() ? 0 : 900,
          padding: { left: mobile ? 0 : 140, right: 20, top: 60, bottom: 60 },
        });
      } else if (selected && next.camera === "street") {
        map.easeTo({
          center: selected.center,
          zoom: 16.4,
          pitch: mobile ? 40 : 58,
          bearing: -24,
          duration: reduced() ? 0 : 1400,
          padding: { left: 0, right: 0, top: 40, bottom: 30 },
        });
      } else if (selected) {
        map.fitBounds(geometryBounds(selected.geometry), {
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
        });
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
    traveller.pause();
    basemapRequest?.abort();
    map.setStyle(offlineStyle(theme), { diff: false });
    onStatus("Offline map · local land + captured route context");
  };
  async function loadBasemap() {
    const attempt = ++remoteAttempt;
    ready = false;
    fallback = false;
    onStatus("Loading geographic context");
    try {
      basemapRequest?.abort();
      basemapRequest = new AbortController();
      const response = styles[theme]
        ? null
        : await fetch(
            `https://tiles.openfreemap.org/styles/${theme === "dark" ? "dark" : "liberty"}`,
            {
              signal: AbortSignal.any([
                basemapRequest.signal,
                AbortSignal.timeout(6000),
              ]),
            },
          );
      if (response && !response.ok) throw new Error("Basemap unavailable");
      const style: StyleSpecification = styles[theme]
        ? structuredClone(styles[theme]!)
        : await response!.json();
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
      for (const layer of style.layers) {
        // Dark's place marker references a missing sprite; retain the text label.
        if (
          layer.type === "symbol" &&
          JSON.stringify(layer.layout?.["icon-image"])?.includes("circle-11") &&
          layer.layout
        )
          delete layer.layout["icon-image"];
        if (layer.type === "fill" && layer.paint?.["fill-pattern"])
          delete layer.paint["fill-pattern"];
        if (
          theme === "dark" &&
          layer.type === "symbol" &&
          layer.paint?.["text-color"]
        ) {
          layer.paint["text-color"] = "#a1b5ab";
          layer.paint["text-halo-color"] = "#15231e";
        }
        if (
          theme === "dark" &&
          layer.type === "line" &&
          /highway|road/.test(layer.id) &&
          layer.paint?.["line-color"]
        )
          layer.paint["line-color"] = "#40554b";
      }
      if (disposed || attempt !== remoteAttempt) return;
      styles[theme] = structuredClone(style);
      traveller.pause();
      basemapTimer = setTimeout(() => {
        if (!disposed && attempt === remoteAttempt) switchOffline();
      }, 6500);
      // The initial local style may finish loading while the remote fetch is pending.
      // Disable updates again at the actual swap, not only before the fetch.
      ready = false;
      map.setStyle(style, { diff: false });
    } catch {
      if (!disposed && attempt === remoteAttempt) switchOffline();
    }
  }
  map.on("style.load", () => {
    clearTimeout(basemapTimer);
    hoverId = null;
    routeHoverId = null;
    if (!map.getLayer("building-3d") && map.getSource("openmaptiles"))
      map.addLayer({
        id: "building-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": mapPalette(theme).building,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      });
    install();
    if (map.getLayer("building-3d")) {
      map.setPaintProperty(
        "building-3d",
        "fill-extrusion-color",
        mapPalette(theme).building,
      );
      map.setPaintProperty("building-3d", "fill-extrusion-opacity", 0.85);
    }
    onStatus(
      fallback
        ? "Offline map · local land + captured route context"
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
        layers: [
          "services",
          "routes",
          "demo-routes",
          "stops",
          "patch-sites",
          "patch-route",
        ],
      }).length
    )
      return;
    const id = event.features?.[0]?.properties.id;
    if (typeof id === "string") onSelect(id);
  });
  for (const layer of [
    "services",
    "routes",
    "demo-routes",
    "stops",
    "patch-sites",
    "patch-route",
  ]) {
    map.on("click", layer, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const priorities = [
        "patch-sites",
        "services",
        "stops",
        "patch-route",
        "routes",
        "demo-routes",
      ];
      const underPointer = map.queryRenderedFeatures(event.point, {
        layers: priorities,
      });
      const preferred = priorities.find((id) =>
        underPointer.some((f) => f.layer.id === id),
      );
      if (preferred !== layer) return;
      if (
        ["routes", "demo-routes", "stops"].includes(layer) &&
        typeof feature.properties.id === "string"
      ) {
        popup.remove();
        onInspectTransport({
          kind: layer === "stops" ? "stop" : "route",
          id: feature.properties.id,
        });
        return;
      }
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
  for (const layer of ["routes", "demo-routes"]) {
    map.on("mousemove", layer, (event) => {
      if (routeHoverId !== null)
        map.setFeatureState(
          { source: "civic-routes", id: routeHoverId },
          { hover: false },
        );
      routeHoverId = event.features?.[0]?.id ?? null;
      if (routeHoverId !== null)
        map.setFeatureState(
          { source: "civic-routes", id: routeHoverId },
          { hover: true },
        );
    });
    map.on("mouseleave", layer, () => {
      if (routeHoverId !== null)
        map.setFeatureState(
          { source: "civic-routes", id: routeHoverId },
          { hover: false },
        );
      routeHoverId = null;
    });
  }
  const resize = new ResizeObserver(() => {
    map.resize();
    lastCamera = "";
    if (snapshot) render(snapshot);
  });
  resize.observe(container);
  return {
    render,
    setEnvironment(value: boolean, nextTheme: Theme) {
      theme = nextTheme;
      if (value) switchOffline();
      else void loadBasemap();
    },
    dispose() {
      disposed = true;
      remoteAttempt++;
      clearTimeout(basemapTimer);
      basemapRequest?.abort();
      traveller.dispose();
      motion.removeEventListener("change", motionChanged);
      resize.disconnect();
      labels.forEach((l) => l.remove());
      popup.remove();
      map.remove();
    },
  };
}

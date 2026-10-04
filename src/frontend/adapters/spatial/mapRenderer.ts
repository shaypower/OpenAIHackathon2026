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
import { hospitalMassing } from "@/frontend/features/healthcare/planning";
import type { HospitalPlacement } from "@/frontend/domain/models/healthcare";
import { findClearHospitalEnvelope, type PlacementObstacle } from "@/frontend/features/healthcare/placement";
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
  onSelectHospital: (id: string) => void,
  onHospitalPlacement: (placement: HospitalPlacement) => void,
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
  let placementRequest: HospitalPlacement | undefined;
  let placementTimer: ReturnType<typeof setTimeout> | undefined;
  let basemapTileFailed = false;
  function reportBlocked(request: HospitalPlacement, reason: string) {
    clearTimeout(placementTimer);
    if (snapshot?.healthcare?.placement === request && request.status === "checking")
      onHospitalPlacement({ status: "blocked", areaId: request.areaId, beds: request.beds, reason });
  }
  function screenHospitalPlacement() {
    const hospital = snapshot?.healthcare;
    const request = hospital?.placement;
    if (!hospital || request?.status !== "checking" || request !== placementRequest || !ready || map.isMoving()) return;
    if (fallback || snapshot?.offline) {
      reportBlocked(request, "Building footprints are unavailable offline. Go online and retry the placement check.");
      return;
    }
    if (!map.getSource("openmaptiles") || !map.isSourceLoaded("openmaptiles") || map.getZoom() < 15) return;
    if (basemapTileFailed) {
      reportBlocked(request, "Some map tiles failed to load. Existing-building clearance could not be verified; reload the map and retry.");
      return;
    }
    const area = hospital.areas.find((area) => area.id === request.areaId);
    if (!area) return;
    try {
      const buildings = [
        ...map.querySourceFeatures("openmaptiles", { sourceLayer: "building" }),
        ...map.queryRenderedFeatures({ layers: ["building-3d"] }),
      ];
      if (!buildings.length) {
        reportBlocked(request, "No usable building footprints loaded. The planner cannot assume empty map data means vacant land.");
        return;
      }
      const roads = map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" });
      const water = map.querySourceFeatures("openmaptiles", { sourceLayer: "water" });
      const land = map.querySourceFeatures("openmaptiles", { sourceLayer: "landuse" }).filter((f) =>
        ["cemetery", "park", "recreation_ground", "pitch", "forest", "wood"].includes(String(f.properties.class)));
      const cover = map.querySourceFeatures("openmaptiles", { sourceLayer: "landcover" }).filter((f) =>
        ["wood", "wetland"].includes(String(f.properties.class)));
      const obstacles: PlacementObstacle[] = [
        ...buildings.map((f) => ({ geometry: f.geometry, kind: "building" as const })),
        ...roads.map((f) => ({ geometry: f.geometry, kind: "transport" as const })),
        ...water.map((f) => ({ geometry: f.geometry, kind: "water" as const })),
        ...[...land, ...cover].map((f) => ({ geometry: f.geometry, kind: "protected-land" as const })),
      ];
      const bounds = map.getBounds();
      const center = findClearHospitalEnvelope(area.center, Math.sqrt(hospital.plan.siteAreaHa * 10_000), obstacles,
        [[bounds.getWest(), bounds.getSouth()], [bounds.getEast(), bounds.getNorth()]]);
      if (!center) {
        reportBlocked(request, "No clear four-hectare envelope found within 400 m in the loaded map. Try another search area; no hospital has been placed here.");
        return;
      }
      clearTimeout(placementTimer);
      onHospitalPlacement({ status: "clear", areaId: area.id, beds: hospital.plan.beds, center,
        checkedBuildings: buildings.length, checkedObstacles: obstacles.length, checkedAt: new Date().toISOString() });
    } catch {
      reportBlocked(request, "The map's obstacle geometry could not be checked. No hospital has been placed; retry with complete map data.");
    }
  }
  map.on("idle", screenHospitalPlacement);
  const sourceIds = [
    "communities",
    "centers",
    "services",
    "stops",
    "routes",
    "intervention",
    "disruption",
    "journey",
    "hospital-search",
    "hospital-site",
    "hospital-blocks",
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
    map.addLayer({
      id: "hospital-search", type: "circle", source: "civic-hospital-search",
      paint: { "circle-radius": ["case", ["get", "selected"], 11, 8], "circle-color": palette.teal,
        "circle-stroke-color": palette.halo, "circle-stroke-width": 3 },
    });
    map.addLayer({
      id: "hospital-site", type: "fill", source: "civic-hospital-site",
      paint: { "fill-color": palette.amber, "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: "hospital-site-border", type: "line", source: "civic-hospital-site",
      paint: { "line-color": palette.amber, "line-width": 2, "line-dasharray": [3, 2] },
    });
    map.addLayer({
      id: "hospital-footprint", type: "fill", source: "civic-hospital-blocks",
      paint: { "fill-color": palette.teal, "fill-opacity": 0.28 },
    });
    map.addLayer({
      id: "hospital-buildings", type: "fill-extrusion", source: "civic-hospital-blocks",
      paint: { "fill-extrusion-color": ["case", ["==", ["get", "kind"], "diagnostics"], palette.network, palette.teal],
        "fill-extrusion-height": ["get", "heightM"], "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.95 },
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
      next.state.view === "journey" && !next.healthcare,
    );
    const data = mapFeatures(next);
    for (const [id, features] of Object.entries(data))
      getSource(id)?.setData(features);
    const visibility = (ids: string[], show: boolean) =>
      ids.forEach((id) =>
        map.setLayoutProperty(id, "visibility", show ? "visible" : "none"),
      );
    visibility(["catchments", "catchment-borders"], !next.healthcare && next.layers.failures);
    visibility(["vulnerability"], !next.healthcare && next.layers.vulnerability);
    visibility(["routes", "demo-routes", "stops"], !next.healthcare && next.layers.transport);
    visibility(["services"], !next.healthcare && next.layers.healthcare);
    visibility(["journey", "patch-halo", "patch-route", "patch-sites", "flood-area", "disrupted-lines", "closed-sites"], !next.healthcare);
    labels.forEach((l) => l.remove());
    labels = [];
    for (const c of next.healthcare ? [] : next.state.communities) {
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
    const outcome =
      next.state.view === "journey" && !next.healthcare ? next.state.journey?.outcome : undefined;
    if (outcome?.location) {
      const element = document.createElement("div");
      element.className = `journey-end-marker ${outcome.status}`;
      element.setAttribute(
        "aria-label",
        `Journey ${outcome.status} at ${outcome.location.label}`,
      );
      const pin = document.createElement("span");
      pin.textContent = outcome.status === "completed" ? "✓" : "×";
      const label = document.createElement("strong");
      label.textContent = `${outcome.status === "completed" ? "Arrival" : "Failure"} · ${outcome.location.label}`;
      element.append(label, pin);
      labels.push(
        new Marker({ element, anchor: "bottom", offset: [0, 14] })
          .setLngLat(outcome.location.coordinates)
          .addTo(map),
      );
    }
    if (next.healthcare) {
      const hospital = next.healthcare;
      const area = hospital.areas.find((a) => a.id === hospital.selectedId);
      const checked = hospital.placement?.status === "clear" && hospital.placement.areaId === area?.id && hospital.placement.beds === hospital.plan.beds
        ? hospital.placement : undefined;
      const placedArea = area && checked ? { ...area, center: checked.center } : undefined;
      const proposalVisible = !!placedArea && hospital.showProposal;
      if (hospital.placement?.status === "checking" && hospital.placement !== placementRequest) {
        clearTimeout(placementTimer);
        placementRequest = hospital.placement;
        const request = placementRequest;
        placementTimer = setTimeout(() => reportBlocked(request, "Map screening timed out. No hospital has been placed; retry when the geographic context is available."), 8000);
      } else if (hospital.placement?.status !== "checking") clearTimeout(placementTimer);
      for (const candidate of hospital.areas) {
        if (proposalVisible && candidate.id === area?.id) continue;
        const button = document.createElement("button");
        button.className = `hospital-map-label${candidate.id === hospital.selectedId ? " selected" : ""}`;
        button.textContent = `+ ${candidate.name}`;
        button.setAttribute("aria-label", `Inspect hospital search area ${candidate.name}`);
        button.onclick = () => onSelectHospital(candidate.id);
        labels.push(new Marker({ element: button, anchor: "bottom", offset: [0, -14] }).setLngLat(candidate.center).addTo(map));
      }
      if (placedArea && proposalVisible) {
        for (const block of hospitalMassing(placedArea, hospital.plan)) {
          const element = document.createElement("div");
          element.className = "hospital-block-label";
          element.textContent = block.label;
          labels.push(new Marker({ element, anchor: "bottom", offset: [0, -16] }).setLngLat(block.center).addTo(map));
        }
        const label = document.createElement("div");
        label.className = "hospital-envelope-label";
        label.textContent = `${hospital.plan.siteAreaHa} ha illustrative envelope · land unverified`;
        labels.push(new Marker({ element: label, anchor: "top", offset: [0, 12] })
          .setLngLat([placedArea.center[0], placedArea.center[1] - 0.0009]).addTo(map));
      }
      const checking = hospital.placement?.status === "checking";
      const hospitalKey = `hospital:${hospital.selectedId ?? "all"}:${proposalVisible}:${checking}:${checked?.center.join(",") ?? ""}`;
      if (lastCamera !== hospitalKey) {
        lastCamera = hospitalKey;
        map.stop();
        popup.remove();
        const mobile = container.clientWidth < 640;
        if (area) map.easeTo({ center: placedArea?.center ?? area.center, zoom: proposalVisible ? 16.8 : checking ? 15.2 : 13.2,
          pitch: proposalVisible ? 55 : checking ? 0 : 25, bearing: proposalVisible ? -20 : 0,
          padding: checking ? 0 : { left: 25, right: 25, top: 105, bottom: mobile ? 115 : 85 }, duration: reduced() ? 0 : 1000 });
        else map.fitBounds(geometryBounds({ type: "MultiPoint", coordinates: hospital.areas.map((a) => a.center) }), {
          padding: { left: mobile ? 55 : 95, right: mobile ? 55 : 95, top: 125, bottom: 85 },
          pitch: 20, bearing: 0, maxZoom: 10.6, duration: reduced() ? 0 : 1100,
        });
      }
      if (checking && (next.offline || fallback)) screenHospitalPlacement();
      return;
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
            right:
              next.state.view === "journey" && outcome?.location ? 130 : 45,
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
    if (snapshot?.healthcare?.placement?.status === "checking")
      reportBlocked(snapshot.healthcare.placement, "Building footprints are unavailable offline. Go online and retry the placement check.");
    basemapRequest?.abort();
    map.setStyle(offlineStyle(theme), { diff: false });
    onStatus("Offline map · local land + captured route context");
  };
  async function loadBasemap() {
    const attempt = ++remoteAttempt;
    ready = false;
    fallback = false;
    basemapTileFailed = false;
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
  map.on("error", (event) => {
    if ("sourceId" in event && event.sourceId === "openmaptiles") basemapTileFailed = true;
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
    if (snapshot?.healthcare) return;
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
      if (snapshot?.healthcare) return;
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
  map.on("click", "hospital-search", (event) => {
    const id = event.features?.[0]?.properties.id;
    if (typeof id === "string") onSelectHospital(id);
  });
  for (const layer of ["hospital-search", "hospital-buildings"]) {
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  }
  map.on("click", "hospital-buildings", (event) => {
    const label = document.createElement("div");
    label.textContent = `${event.features?.[0]?.properties.name ?? "Hospital"} · illustrative concept`;
    popup.setLngLat(event.lngLat).setDOMContent(label).addTo(map);
  });
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
      clearTimeout(placementTimer);
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

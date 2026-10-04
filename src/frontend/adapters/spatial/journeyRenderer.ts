import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { Journey } from "@/frontend/domain/models";
import {
  elapsedAt,
  prepareJourney,
  type PlaybackClock,
} from "@/frontend/features/journeys/playback";
import { mapPalette } from "./mapTheme";
import type { Theme } from "@/frontend/hooks/useTheme";
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** One renderer-owned animation loop. Only a point source changes per frame. */
export function createJourneyRenderer(map: Map) {
  let journey: Journey | undefined,
    clock: PlaybackClock | undefined,
    prepared: ReturnType<typeof prepareJourney> | undefined;
  let visible = false,
    frame = 0,
    lastPaint = 0,
    activeLeg = "";
  const pause = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const source = () =>
    map.getSource("civic-traveller") as GeoJSONSource | undefined;
  function draw(now: number) {
    if (!visible || !prepared || !clock || !source()) return;
    if (now - lastPaint >= 32 || !frame) {
      lastPaint = now;
      const current = prepared.frame(elapsedAt(clock, prepared.duration, now));
      source()!.setData(
        current?.position
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  id: "traveller",
                  geometry: { type: "Point", coordinates: current.position },
                  properties: { failed: current.leg.status !== "completed" },
                },
              ],
            }
          : EMPTY,
      );
      if (current?.leg.id !== activeLeg) {
        activeLeg = current?.leg.id ?? "";
        if (map.getLayer("journey-active"))
          map.setFilter("journey-active", ["==", ["get", "id"], activeLeg]);
      }
    }
    if (
      clock.startedAt !== null &&
      !document.hidden &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      elapsedAt(clock, prepared.duration, now) < prepared.duration
    )
      frame = requestAnimationFrame(draw);
    else frame = 0;
  }
  const visibility = () => {
    if (document.hidden) pause();
  };
  document.addEventListener("visibilitychange", visibility);
  return {
    install(theme: Theme) {
      pause();
      activeLeg = "";
      const colors = mapPalette(theme);
      map.addSource("civic-traveller", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "journey-active",
        type: "line",
        source: "civic-journey",
        filter: ["==", ["get", "id"], ""],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": colors.amber,
          "line-width": 7,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "journey-traveller-halo",
        type: "circle",
        source: "civic-traveller",
        paint: {
          "circle-radius": 14,
          "circle-color": colors.halo,
          "circle-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "journey-traveller",
        type: "circle",
        source: "civic-traveller",
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "case",
            ["get", "failed"],
            colors.danger,
            colors.amber,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": colors.halo,
        },
      });
    },
    render(
      nextJourney: Journey | undefined,
      nextClock: PlaybackClock | undefined,
      show: boolean,
    ) {
      pause();
      if (journey !== nextJourney) {
        journey = nextJourney;
        prepared = journey ? prepareJourney(journey) : undefined;
      }
      clock = nextClock;
      visible = show;
      lastPaint = 0;
      if (!show) {
        source()?.setData(EMPTY);
        if (map.getLayer("journey-active"))
          map.setFilter("journey-active", ["==", ["get", "id"], ""]);
        return;
      }
      draw(performance.now());
    },
    pause,
    dispose() {
      pause();
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}

import type { Journey, JourneyLeg, LngLat } from "@/frontend/domain/models";
import type { LineString } from "geojson";

export interface PlaybackClock {
  journeyId: string;
  elapsedMinutes: number;
  startedAt: number | null;
  /** Simulated minutes per real second. No live vehicle inference. */
  speed: number;
}
export interface JourneyFrame {
  elapsedMinutes: number;
  leg: JourneyLeg;
  index: number;
  legProgress: number;
  position?: LngLat;
}
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export function elapsedAt(
  clock: PlaybackClock,
  duration: number,
  now = performance.now(),
) {
  return clamp(
    clock.elapsedMinutes +
      (clock.startedAt === null
        ? 0
        : (Math.max(0, now - clock.startedAt) / 1000) * clock.speed),
    0,
    duration,
  );
}
export function segmentMetres(a: number[], b: number[]) {
  const radians = Math.PI / 180;
  const lat1 = a[1] * radians,
    lat2 = b[1] * radians;
  const dlat = lat2 - lat1,
    dlng = (b[0] - a[0]) * radians;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function lineSampler(line: LineString) {
  const points = line.coordinates;
  if (points.length < 2)
    throw new Error("A playback path needs at least two points.");
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(distances[i - 1] + segmentMetres(points[i - 1], points[i]));
  const total = distances.at(-1)!;
  return (progress: number): LngLat => {
    const target = clamp(progress, 0, 1) * total;
    let low = 1,
      high = distances.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (distances[mid] < target) low = mid + 1;
      else high = mid;
    }
    const i = low,
      span = distances[i] - distances[i - 1];
    const ratio = span ? (target - distances[i - 1]) / span : 0;
    return [
      points[i - 1][0] + (points[i][0] - points[i - 1][0]) * ratio,
      points[i - 1][1] + (points[i][1] - points[i - 1][1]) * ratio,
    ];
  };
}
export function prepareJourney(journey: Journey) {
  let duration = 0;
  const legs = journey.legs.map((leg, index) => {
    const start = duration;
    duration += Math.max(0, leg.durationMinutes);
    const previous = journey.legs
      .slice(0, index)
      .reverse()
      .find((l) => l.geometry)
      ?.geometry?.coordinates.at(-1);
    const next = journey.legs.slice(index).find((l) => l.geometry)?.geometry
      ?.coordinates[0];
    return {
      leg,
      start,
      end: duration,
      sample: leg.geometry ? lineSampler(leg.geometry) : undefined,
      anchor: (previous ?? next) as LngLat | undefined,
    };
  });
  return {
    duration,
    starts: legs.map((l) => l.start),
    frame(elapsed: number): JourneyFrame | undefined {
      if (!legs.length) return;
      const elapsedMinutes = clamp(elapsed, 0, duration);
      const index = legs.findIndex((l) => elapsedMinutes < l.end);
      const selected = index === -1 ? legs.length - 1 : index;
      const { leg, start, end, sample, anchor } = legs[selected];
      const legProgress =
        end > start ? clamp((elapsedMinutes - start) / (end - start), 0, 1) : 1;
      return {
        elapsedMinutes,
        leg,
        index: selected,
        legProgress,
        position: sample ? sample(legProgress) : anchor,
      };
    },
  };
}

export function journeyClock(start: string | undefined, elapsed: number) {
  const match = start?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return `${Math.floor(elapsed)} min`;
  const minutes =
    Number(match[1]) * 60 + Number(match[2]) + Math.floor(elapsed);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

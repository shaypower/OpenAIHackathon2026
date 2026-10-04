import type { Geometry, Position } from "geojson";
import { offsetCoordinate } from "./planning";

export interface PlacementObstacle {
  geometry: Geometry;
  kind: "building" | "transport" | "water" | "protected-land";
}
type Point = [number, number];
type Bounds = [number, number, number, number];

function coordinates(point: Position, origin: Point): Point {
  if (point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))
    throw new Error("Invalid obstacle geometry");
  return [(point[0] - origin[0]) * Math.PI / 180 * 6_378_137 * Math.cos(origin[1] * Math.PI / 180),
    (point[1] - origin[1]) * Math.PI / 180 * 6_378_137];
}

function contains(point: Point, bounds: Bounds): boolean {
  return point[0] >= bounds[0] && point[0] <= bounds[2] && point[1] >= bounds[1] && point[1] <= bounds[3];
}

/** Slab intersection catches segments crossing an envelope with both endpoints outside. */
function crosses(a: Point, b: Point, bounds: Bounds): boolean {
  let min = 0, max = 1;
  for (const axis of [0, 1] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < bounds[axis] || a[axis] > bounds[axis + 2]) return false;
      continue;
    }
    const t1 = (bounds[axis] - a[axis]) / delta;
    const t2 = (bounds[axis + 2] - a[axis]) / delta;
    min = Math.max(min, Math.min(t1, t2));
    max = Math.min(max, Math.max(t1, t2));
    if (min > max) return false;
  }
  return true;
}

function inRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

interface LocalObstacle {
  bounds: Bounds;
  lines: Point[][];
  polygons: Point[][][];
  points: Point[];
  clearance: number;
}

function localObstacle(obstacle: PlacementObstacle, origin: Point): LocalObstacle {
  const lines: Point[][] = [], polygons: Point[][][] = [], points: Point[] = [];
  const convert = (ring: Position[]) => ring.map((point) => coordinates(point, origin));
  const visit = (geometry: Geometry) => {
    switch (geometry.type) {
      case "Polygon": polygons.push(geometry.coordinates.map(convert)); break;
      case "MultiPolygon": polygons.push(...geometry.coordinates.map((polygon) => polygon.map(convert))); break;
      case "LineString": lines.push(convert(geometry.coordinates)); break;
      case "MultiLineString": lines.push(...geometry.coordinates.map(convert)); break;
      case "Point": points.push(coordinates(geometry.coordinates, origin)); break;
      case "MultiPoint": points.push(...geometry.coordinates.map((point) => coordinates(point, origin))); break;
      case "GeometryCollection": geometry.geometries.forEach(visit); break;
    }
  };
  visit(obstacle.geometry);
  const all = [...points, ...lines.flat(), ...polygons.flat(2)];
  if (!all.length || all.length > 100_000) throw new Error("Unusable obstacle geometry");
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const point of all) { west = Math.min(west, point[0]); south = Math.min(south, point[1]); east = Math.max(east, point[0]); north = Math.max(north, point[1]); }
  return { bounds: [west, south, east, north], lines, polygons, points, clearance: obstacle.kind === "transport" ? 15 : 8 };
}

function obstructs(obstacle: LocalObstacle, envelope: Bounds): boolean {
  const margin = obstacle.clearance;
  const bounds: Bounds = [envelope[0] - margin, envelope[1] - margin, envelope[2] + margin, envelope[3] + margin];
  const bbox = obstacle.bounds;
  if (bbox[2] < bounds[0] || bbox[0] > bounds[2] || bbox[3] < bounds[1] || bbox[1] > bounds[3]) return false;
  const lineHits = (line: Point[]) => line.some((point) => contains(point, bounds)) || line.slice(1).some((point, index) => crosses(line[index], point, bounds));
  if (obstacle.points.some((point) => contains(point, bounds)) || obstacle.lines.some(lineHits)) return true;
  const corners: Point[] = [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]];
  return obstacle.polygons.some((rings) => {
    if (!rings[0]?.length) throw new Error("Unusable polygon");
    return rings.some(lineHits) || corners.some((point) => inRing(point, rings[0]) && !rings.slice(1).some((hole) => inRing(point, hole)));
  });
}

export function envelopeIsClear(center: Point, sideM: number, obstacles: PlacementObstacle[]): boolean {
  if (!center.every(Number.isFinite) || !Number.isFinite(sideM) || sideM <= 0 || !obstacles.length)
    throw new Error("Missing or invalid placement context");
  const half = sideM / 2;
  return !obstacles.map((obstacle) => localObstacle(obstacle, center)).some((obstacle) => obstructs(obstacle, [-half, -half, half, half]));
}

/** Nearest-first bounded grid: clearance is assessed for the whole site, not just roofs. */
export function findClearHospitalEnvelope(origin: Point, sideM: number, obstacles: PlacementObstacle[], loadedBounds: [Point, Point]): Point | null {
  if (!Number.isFinite(sideM) || sideM <= 0 || !obstacles.length || obstacles.length > 20_000)
    throw new Error("Insufficient or excessive placement context");
  const local = obstacles.map((obstacle) => localObstacle(obstacle, origin));
  const sw = coordinates(loadedBounds[0], origin), ne = coordinates(loadedBounds[1], origin);
  const half = sideM / 2;
  const candidates: Point[] = [];
  for (let east = -400; east <= 400; east += 25)
    for (let north = -400; north <= 400; north += 25)
      if (Math.hypot(east, north) <= 400) candidates.push([east, north]);
  candidates.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  for (const [east, north] of candidates) {
    const envelope: Bounds = [east - half, north - half, east + half, north + half];
    // Keep the envelope and clearance within the loaded viewport, not unseen tiles.
    if (envelope[0] - 15 < sw[0] || envelope[1] - 15 < sw[1] || envelope[2] + 15 > ne[0] || envelope[3] + 15 > ne[1]) continue;
    if (!local.some((obstacle) => obstructs(obstacle, envelope))) return offsetCoordinate(origin, east, north);
  }
  return null;
}

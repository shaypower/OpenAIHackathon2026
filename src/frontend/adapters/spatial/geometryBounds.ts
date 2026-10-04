import type { Geometry } from "geojson";

/** Handles large polygons and disjoint Small Areas without spreading coordinate arrays. */
export function geometryBounds(
  geometry: Geometry,
): [[number, number], [number, number]] {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  function collect(value: unknown) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      if (!Number.isFinite(value[0]) || !Number.isFinite(value[1]))
        throw new Error(
          "No finite coordinates available to frame this geometry.",
        );
      west = Math.min(west, value[0]);
      south = Math.min(south, value[1]);
      east = Math.max(east, value[0]);
      north = Math.max(north, value[1]);
    } else value.forEach(collect);
  }
  function visit(g: Geometry) {
    if (g.type === "GeometryCollection") g.geometries.forEach(visit);
    else collect(g.coordinates);
  }
  visit(geometry);
  if (!Number.isFinite(west))
    throw new Error("No finite coordinates available to frame this geometry.");
  return [
    [west, south],
    [east, north],
  ];
}

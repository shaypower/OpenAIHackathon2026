import { expect, it } from "vitest";
import { geometryBounds } from "./geometryBounds";
it("frames every polygon part and rejects empty/non-finite geometry", () => {
  expect(
    geometryBounds({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-8, 52],
            [-7, 52],
            [-7, 53],
            [-8, 52],
          ],
        ],
        [
          [
            [-9, 54],
            [-8, 54],
            [-8, 55],
            [-9, 54],
          ],
        ],
      ],
    }),
  ).toEqual([
    [-9, 52],
    [-7, 55],
  ]);
  expect(() => geometryBounds({ type: "LineString", coordinates: [] })).toThrow(
    "finite coordinates",
  );
  expect(() =>
    geometryBounds({ type: "Point", coordinates: [NaN, 52] }),
  ).toThrow("finite coordinates");
});

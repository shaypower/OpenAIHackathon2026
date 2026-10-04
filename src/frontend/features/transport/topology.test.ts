import { describe, expect, it } from "vitest";
import fixture from "@/frontend/mocks/transport/network.json";
import { transportNetwork, communityPath } from "@/frontend/mocks/transport";
import { parseTransportNetwork } from "@/frontend/adapters/data/transportNetwork";
import { routePath } from "./topology";
import {
  journeyFor,
  interventionsFor,
  scenarios,
} from "@/frontend/mocks/fixtures";

describe("connected transport display boundary", () => {
  it("retains attributed GTFS patterns and validates every ordered segment connection", () => {
    const network = parseTransportNetwork(fixture);
    expect(network.routes).toHaveLength(4);
    expect(network.stops).toHaveLength(26);
    expect(network.edges).toHaveLength(25);
    expect(network.sources[0].licence).toBe("CC BY 4.0");
    for (const route of network.routes) {
      const path = routePath(network, route.id);
      expect(path.geometry).toEqual(route.geometry);
      expect(path.edges).toHaveLength(route.stopIds.length - 1);
      expect(path.geometry.coordinates.length).toBeGreaterThan(100);
      for (const edge of path.edges) {
        expect(edge.geometry.coordinates[0]).toEqual(
          network.stops.find((s) => s.id === edge.fromStopId)!.geometry
            .coordinates,
        );
        expect(edge.geometry.coordinates.at(-1)).toEqual(
          network.stops.find((s) => s.id === edge.toStopId)!.geometry
            .coordinates,
        );
      }
    }
  });
  it("rejects malformed, disconnected or falsely attributed provider payloads", () => {
    const cases = [
      (v: typeof fixture) => {
        v.stops[0].geometry.coordinates[0] = NaN;
      },
      (v: typeof fixture) => {
        v.routes[0].edgeIds[0] = "missing";
      },
      (v: typeof fixture) => {
        v.edges[0].toStopId = "missing";
      },
      (v: typeof fixture) => {
        v.edges[0].geometry.coordinates[0] = [0, 0];
      },
      (v: typeof fixture) => {
        v.sources[0].url = "javascript:alert(1)";
      },
      (v: typeof fixture) => {
        v.routes[0].sourceId = "osm-road-context";
      },
      (v: typeof fixture) => {
        v.stops.push(v.stops[0]);
      },
    ];
    for (const mutate of cases) {
      const bad = structuredClone(fixture);
      mutate(bad);
      expect(() => parseTransportNetwork(bad)).toThrow();
    }
    expect(() =>
      parseTransportNetwork({ ...fixture, schemaVersion: 2 }),
    ).toThrow("schema version");
  });
  it("resolves community journeys and proposals to captured paths instead of chords", () => {
    for (const id of ["borrisoleigh", "roscrea", "newport"]) {
      const path = communityPath(id);
      const leg = journeyFor(id).legs.find((l) => l.mode === "bus")!;
      expect(leg.geometry).toEqual(path.geometry);
      expect(leg.edgeIds).toEqual(path.edgeIds);
      expect(interventionsFor(id)[2].features[0].geometry).toEqual(
        path.geometry,
      );
    }
    expect(communityPath("borrisoleigh").distanceMetres).toBeGreaterThan(13000);
    expect(communityPath("borrisoleigh").distanceMetres).toBeLessThan(15000);
    expect(journeyFor("borrisoleigh").legs[0].geometry).toBeUndefined();
  });
  it("keeps the contingency chain outside the synthetic blocked segment and rejects reverse/unknown chains", () => {
    const baseline = communityPath("borrisoleigh"),
      alternate = communityPath("borrisoleigh", true);
    expect(
      baseline.edgeIds.some((id) => scenarios[0].blockedEdgeIds!.includes(id)),
    ).toBe(true);
    expect(
      alternate.edgeIds.some((id) => scenarios[0].blockedEdgeIds!.includes(id)),
    ).toBe(false);
    expect(alternate.geometry.coordinates[0]).toEqual(
      baseline.geometry.coordinates[0],
    );
    expect(alternate.geometry.coordinates.at(-1)).toEqual(
      baseline.geometry.coordinates.at(-1),
    );
    expect(() =>
      routePath(
        transportNetwork,
        "demo-feeder",
        "843000001",
        "demo-borrisoleigh",
      ),
    ).toThrow("ordered route");
    expect(() => routePath(transportNetwork, "missing")).toThrow(
      "Unknown transport",
    );
  });
});

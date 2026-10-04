import { describe, expect, it } from "vitest";
import {
  elapsedAt,
  lineSampler,
  prepareJourney,
  journeyClock,
} from "./playback";
import { journeyFor } from "@/frontend/mocks/fixtures";
describe("one journey replay clock", () => {
  it("formats the actual fixture elapsed clock rather than a frozen leg departure", () => {
    expect(journeyClock("07:18", 22)).toBe("07:40");
    expect(journeyClock("23:59", 62)).toBe("25:01");
    expect(journeyClock(undefined, 22)).toBe("22 min");
  });
  it("derives elapsed time from one anchor without drift, bounds overflow and preserves pauses", () => {
    const clock = {
      journeyId: "demo",
      elapsedMinutes: 21,
      startedAt: 1000,
      speed: 12,
    };
    expect(elapsedAt(clock, 225, 2000)).toBe(33);
    expect(elapsedAt(clock, 225, 500)).toBe(21);
    expect(elapsedAt(clock, 225, 100000)).toBe(225);
    expect(elapsedAt({ ...clock, startedAt: null }, 225, 100000)).toBe(21);
  });
  it("interpolates along successive path segments and never cuts a corner", () => {
    const sample = lineSampler({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0, 0.001],
        [0.001, 0.001],
      ],
    });
    expect(sample(0)).toEqual([0, 0]);
    expect(sample(1)).toEqual([0.001, 0.001]);
    expect(sample(0.25)[0]).toBe(0);
    expect(sample(0.75)[1]).toBe(0.001);
    expect(() => lineSampler({ type: "LineString", coordinates: [] })).toThrow(
      "two points",
    );
  });
  it("seeks exact leg boundaries and keeps waits/failed transfers at the arrival stop", () => {
    const journey = journeyFor("borrisoleigh"),
      prepared = prepareJourney(journey);
    expect(prepared.duration).toBe(225);
    expect(prepared.frame(13)?.leg.id).toBe("stop");
    expect(prepared.frame(21)?.leg.id).toBe("bus");
    const bus = journey.legs.find((l) => l.id === "bus")!;
    expect(prepared.frame(21)?.position).toEqual(bus.geometry!.coordinates[0]);
    expect(prepared.frame(59)?.leg.id).toBe("transfer");
    expect(prepared.frame(59)?.position).toEqual(
      bus.geometry!.coordinates.at(-1),
    );
    expect(prepared.frame(160)?.position).toEqual(prepared.frame(59)?.position);
    expect(prepared.frame(999)?.elapsedMinutes).toBe(225);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "@/frontend/mocks/backend/run.synthetic-test.json";
import { parseRun } from "@/frontend/adapters/http/backendMapping";
import { watchRun } from "./watchRun";
const completed = parseRun(fixture);
afterEach(() => vi.useRealTimers());
describe("bounded run observation", () => {
  it("polls active states and stops at the terminal result without fictitious events", async () => {
    vi.useFakeTimers();
    const snapshots: string[] = [];
    const getRun = vi
      .fn()
      .mockResolvedValueOnce({ ...completed, state: "queued", before: null })
      .mockResolvedValueOnce({ ...completed, state: "running", before: null })
      .mockResolvedValue(completed);
    const watching = watchRun(
      { getRun },
      completed.id,
      { signal: new AbortController().signal, operationId: "watch" },
      (r) => snapshots.push(r.state),
    );
    await vi.advanceTimersByTimeAsync(2000);
    await watching;
    expect(snapshots).toEqual(["queued", "running", "succeeded"]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(getRun).toHaveBeenCalledTimes(3);
  });
  it("stops on readback failure while leaving the previous snapshot with the consumer", async () => {
    vi.useFakeTimers();
    const snapshot = vi.fn(),
      getRun = vi
        .fn()
        .mockResolvedValueOnce({ ...completed, state: "running", before: null })
        .mockRejectedValueOnce(new Error("connection lost"));
    const watching = watchRun(
      { getRun },
      completed.id,
      { signal: new AbortController().signal, operationId: "watch" },
      snapshot,
    );
    const assertion = expect(watching).rejects.toThrow("connection lost");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(getRun).toHaveBeenCalledTimes(2);
  });
  it("enforces the observation deadline and stops scheduled polling on cancellation", async () => {
    vi.useFakeTimers();
    const getRun = vi
      .fn()
      .mockResolvedValue({ ...completed, state: "running", before: null });
    const watching = watchRun(
      { getRun },
      completed.id,
      { signal: new AbortController().signal, operationId: "watch" },
      () => {},
    );
    const assertion = expect(watching).rejects.toThrow(
      "server was not cancelled",
    );
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
    const calls = getRun.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(getRun).toHaveBeenCalledTimes(calls);
    const controller = new AbortController();
    const cancelled = watchRun(
      { getRun },
      completed.id,
      { signal: controller.signal, operationId: "cancel" },
      () => {},
    );
    const cancellation = expect(cancelled).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await cancellation;
  });
});

import type { BackendProvider } from "@/frontend/domain/contracts/backend";
import type { RequestContext } from "@/frontend/domain/contracts/providers";
import type { BackendRun } from "@/frontend/domain/models/backend";

/** Observation only: aborting this watcher does not cancel server execution. */
export async function watchRun(
  provider: Pick<BackendProvider, "getRun">,
  id: string,
  context: RequestContext,
  onSnapshot: (run: BackendRun) => void,
  intervalMs = 1000,
  deadlineMs = 30000,
) {
  if (!id.trim() || id.length > 160)
    throw new Error("Enter a run ID of at most 160 characters.");
  const deadline = new AbortController(),
    handle = setTimeout(() => deadline.abort(), deadlineMs);
  const signal = AbortSignal.any([context.signal, deadline.signal]);
  const wait = () =>
    new Promise<void>((resolve, reject) => {
      const aborted = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", aborted);
        resolve();
      }, intervalMs);
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();
    });
  try {
    while (true) {
      signal.throwIfAborted();
      const run = await provider.getRun(id, { ...context, signal });
      signal.throwIfAborted();
      onSnapshot(run);
      if (!["queued", "running"].includes(run.state)) return;
      await wait();
    }
  } catch (error) {
    if (deadline.signal.aborted && !context.signal.aborted)
      throw new Error(
        "Stopped watching after 30 seconds. Inspect the same run again; the server was not cancelled.",
      );
    throw error;
  } finally {
    clearTimeout(handle);
  }
}

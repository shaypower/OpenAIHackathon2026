import { useCallback, useEffect, useRef, useState } from "react";
import type { BackendProvider } from "@/frontend/domain/contracts/backend";
import type {
  BackendRun,
  BackendStatus,
  ObjectiveValidation,
  SourceInventory,
} from "@/frontend/domain/models/backend";
import { watchRun } from "./watchRun";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Backend request failed.";

export function useBackend(provider: BackendProvider) {
  const [status, setStatus] = useState<BackendStatus>();
  const [sources, setSources] = useState<SourceInventory>();
  const [statusError, setStatusError] = useState<string>();
  const [sourcesError, setSourcesError] = useState<string>();
  const [checking, setChecking] = useState(true);
  const [validation, setValidation] = useState<ObjectiveValidation>();
  const [validationError, setValidationError] = useState<string>();
  const [validating, setValidating] = useState(false);
  const [run, setRun] = useState<BackendRun>();
  const [runError, setRunError] = useState<string>();
  const [watching, setWatching] = useState(false);
  const bootstrap = useRef<AbortController | null>(null),
    compiler = useRef<AbortController | null>(null),
    observer = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    bootstrap.current?.abort();
    const controller = new AbortController();
    bootstrap.current = controller;
    setChecking(true);
    setStatusError(undefined);
    setSourcesError(undefined);
    const context = {
      signal: controller.signal,
      operationId: crypto.randomUUID(),
    };
    const [a, b] = await Promise.allSettled([
      provider.getStatus(context),
      provider.getSources(context),
    ]);
    if (controller.signal.aborted) return;
    if (a.status === "fulfilled") setStatus(a.value);
    else setStatusError(message(a.reason));
    if (b.status === "fulfilled") setSources(b.value);
    else setSourcesError(message(b.reason));
    setChecking(false);
  }, [provider]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(timer);
      bootstrap.current?.abort();
      compiler.current?.abort();
      observer.current?.abort();
    };
  }, [refresh]);
  async function validate(text: string) {
    compiler.current?.abort();
    const controller = new AbortController();
    compiler.current = controller;
    setValidating(true);
    setValidationError(undefined);
    setValidation(undefined);
    try {
      const value = await provider.validateObjective(text, {
        signal: controller.signal,
        operationId: crypto.randomUUID(),
      });
      if (!controller.signal.aborted) setValidation(value);
    } catch (e) {
      if (!controller.signal.aborted) setValidationError(message(e));
    } finally {
      if (!controller.signal.aborted) setValidating(false);
    }
  }
  async function inspectRun(id: string) {
    observer.current?.abort();
    const controller = new AbortController();
    observer.current = controller;
    setRun(undefined);
    setRunError(undefined);
    setWatching(true);
    try {
      await watchRun(
        provider,
        id.trim(),
        { signal: controller.signal, operationId: crypto.randomUUID() },
        (value) => {
          if (!controller.signal.aborted) setRun(value);
        },
      );
    } catch (e) {
      if (!controller.signal.aborted) setRunError(message(e));
    } finally {
      if (!controller.signal.aborted) setWatching(false);
    }
  }
  function stopWatching() {
    observer.current?.abort();
    setWatching(false);
    setRunError("Observation stopped. The server run was not cancelled.");
  }
  function reset() {
    compiler.current?.abort();
    observer.current?.abort();
    setValidating(false);
    setWatching(false);
    setValidation(undefined);
    setValidationError(undefined);
    setRun(undefined);
    setRunError(undefined);
  }
  return {
    status,
    sources,
    statusError,
    sourcesError,
    checking,
    validation,
    validationError,
    validating,
    run,
    runError,
    watching,
    refresh,
    validate,
    inspectRun,
    stopWatching,
    reset,
  };
}
export type BackendController = ReturnType<typeof useBackend>;

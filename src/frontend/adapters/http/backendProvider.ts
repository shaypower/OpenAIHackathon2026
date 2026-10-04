import type { BackendProvider } from "@/frontend/domain/contracts/backend";
import type { RequestContext } from "@/frontend/domain/contracts/providers";
import {
  parseObjective,
  parseRun,
  parseSources,
  parseStatus,
} from "./backendMapping";
import { object, text } from "./validation";

export class BackendError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}
/** Same-origin transport. No retries or fixture fallback; credentials remain on the server. */
export function createBackendProvider(
  fetcher: typeof fetch = fetch,
): BackendProvider {
  async function request<T>(
    path: string,
    parse: (v: unknown) => T,
    context: RequestContext,
    body?: unknown,
    timeoutMs = 8000,
  ): Promise<T> {
    const timer = new AbortController(),
      handle = setTimeout(() => timer.abort(), timeoutMs);
    try {
      const response = await fetcher(`/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.any([context.signal, timer.signal]),
        cache: "no-store",
      });
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new BackendError(
          "The backend did not return a civic JSON response.",
          "invalid_response",
          false,
        );
      }
      if (!response.ok) {
        let error: BackendError;
        try {
          const envelope = object(raw);
          if (envelope.schema_version !== 1) throw new Error();
          const e = object(envelope.error);
          if (typeof e.retryable !== "boolean") throw new Error();
          error = new BackendError(
            text(e.message),
            text(e.code),
            e.retryable,
            text(e.request_id),
          );
        } catch {
          error = new BackendError(
            `Backend request failed (HTTP ${response.status}).`,
            "http_error",
            response.status >= 500,
          );
        }
        throw error;
      }
      try {
        return parse(raw);
      } catch {
        throw new BackendError(
          "The backend returned an invalid or unsupported response.",
          "invalid_response",
          false,
        );
      }
    } catch (error) {
      if (context.signal.aborted)
        throw (
          context.signal.reason ?? new DOMException("Aborted", "AbortError")
        );
      if (timer.signal.aborted)
        throw new BackendError(
          "Backend request timed out. Retry when the service is available.",
          "request_timeout",
          true,
        );
      if (error instanceof BackendError) throw error;
      throw new BackendError(
        "Cannot reach the backend. The synthetic demo is still available.",
        "backend_unavailable",
        true,
      );
    } finally {
      clearTimeout(handle);
    }
  }
  return {
    getStatus: (c) => request("/status", parseStatus, c),
    getSources: (c) => request("/sources", parseSources, c),
    validateObjective: (value, c) =>
      request("/objectives/validate", parseObjective, c, { text: value }, 12000),
    getRun: (id, c) =>
      request(
        `/runs/${encodeURIComponent(id)}`,
        (v) => {
          const r = parseRun(v);
          if (r.id !== id) throw new Error("Run ID mismatch");
          return r;
        },
        c,
      ),
  };
}

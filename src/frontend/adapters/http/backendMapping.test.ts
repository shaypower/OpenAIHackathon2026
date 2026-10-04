import { describe, expect, it, vi, afterEach } from "vitest";
import status from "@/frontend/mocks/backend/status.json";
import sources from "@/frontend/mocks/backend/sources.json";
import validation from "@/frontend/mocks/backend/validation.json";
import run from "@/frontend/mocks/backend/run.synthetic-test.json";
import {
  parseObjective,
  parseRun,
  parseSources,
  parseStatus,
} from "./backendMapping";
import { createBackendProvider } from "./backendProvider";

const context = () => ({
  signal: new AbortController().signal,
  operationId: "frontend-contract-test",
});
afterEach(() => vi.useRealTimers());
describe("C API adapter boundary", () => {
  it("accepts C's configured model compiler without claiming evaluation", () => {
    const compiled = parseObjective({
      ...validation,
      data: { ...validation.data, parser_mode: "openai_structured" },
    });
    expect(compiled.parser).toBe("openai_structured");
    expect(compiled.evaluable).toBe(false);
    expect(() => parseObjective({
      ...validation,
      data: { ...validation.data, parser_mode: "unknown_provider" },
    })).toThrow();
  });
  it("maps actual C metadata without promoting readiness or inventing nullable values", () => {
    expect(parseStatus(status).state).toBe("degraded");
    expect(
      parseStatus(status).capabilities.find((c) => c.name === "baseline")
        ?.state,
    ).toBe("PLANNED");
    const inventory = parseSources(sources);
    expect(inventory.realCivicDatasets).toBe(0);
    expect(
      inventory.sources.find((s) => s.id === sources.data.sources[0].id)
        ?.acquiredAt,
    ).toBeNull();
    const compiled = parseObjective(validation);
    expect(compiled.objective.targetMinutes).toBe(30);
    expect(compiled.objective.targetAccessPercent).toBeNull();
    expect(compiled.evaluable).toBe(false);
  });
  it("rejects schema drift, duplicated sources, contradictory ingestion and unsafe links", () => {
    expect(() => parseStatus({ ...status, schema_version: 2 })).toThrow();
    const duplicate = structuredClone(sources);
    duplicate.data.sources.push(duplicate.data.sources[0]);
    expect(() => parseSources(duplicate)).toThrow();
    const count = structuredClone(sources);
    count.data.real_civic_datasets_ingested = 1;
    expect(() => parseSources(count)).toThrow();
    const unsafe = structuredClone(sources);
    unsafe.data.sources[0].source_url = "javascript:alert(1)";
    expect(() => parseSources(unsafe)).toThrow();
    expect(() =>
      parseObjective({
        ...validation,
        data: { ...validation.data, evaluable: true },
      }),
    ).toThrow();
  });
  it("keeps baseline after uncomputed and enforces calculated cohort metrics and terminal states", () => {
    const parsed = parseRun(run);
    expect(parsed.state).toBe("succeeded");
    expect(parsed.before?.accessPercent).toBe(40);
    expect(parsed.after).toBeNull();
    const wrong = structuredClone(run);
    wrong.data.run.before!.access_percent = 94;
    expect(() => parseRun(wrong)).toThrow();
    const failed = structuredClone(run);
    failed.data.run.status = "failed";
    expect(() => parseRun(failed)).toThrow();
    const zero = structuredClone(run);
    Object.assign(zero.data.run.before!, {
      cohort_residents: 0,
      reachable_residents: 0,
      access_percent: null,
    });
    expect(parseRun(zero).before?.accessPercent).toBeNull();
  });
  it("uses same-origin HTTP and preserves server error codes instead of replaying fixtures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            schema_version: 1,
            error: {
              code: "run_not_found",
              message: "Run not found.",
              retryable: false,
              request_id: "request-test",
              details: {},
            },
          }),
          { status: 404 },
        ),
      );
    const provider = createBackendProvider(fetcher);
    await expect(
      provider.getRun("unknown/run", context()),
    ).rejects.toMatchObject({
      code: "run_not_found",
      retryable: false,
      requestId: "request-test",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/runs/unknown%2Frun");
  });
  it("validates success JSON and does not leak snake-case schemas to consumers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(validation)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...validation, schema_version: 2 })),
      );
    const provider = createBackendProvider(fetcher);
    expect(
      (
        await provider.validateObjective(
          validation.data.objective.text,
          context(),
        )
      ).objective.targetMinutes,
    ).toBe(30);
    expect(fetcher.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ text: validation.data.objective.text }),
    );
    await expect(
      provider.validateObjective("test", context()),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("bounds a stalled HTTP request and honours caller cancellation without retry", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const provider = createBackendProvider(fetcher),
      promise = provider.getStatus(context());
    const assertion = expect(promise).rejects.toMatchObject({
      code: "request_timeout",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    const controller = new AbortController();
    const cancelled = provider.getStatus({
      signal: controller.signal,
      operationId: "cancel",
    });
    const cancellation = expect(cancelled).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await cancellation;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

import type {
  BackendRun,
  BackendStatus,
  CompiledObjective,
  ObjectiveValidation,
  RunMetrics,
  SourceInventory,
} from "@/frontend/domain/models/backend";
import {
  choice,
  count,
  data,
  date,
  invalid,
  list,
  modes,
  nullable,
  numeric,
  object,
  percentage,
  publicUrl,
  text,
  texts,
} from "./validation";

function objective(v: unknown): CompiledObjective {
  const o = object(v),
    c = object(o.constraint),
    p = object(o.population);
  const targetMinutes = numeric(c.maximum_journey_minutes);
  if (targetMinutes <= 0 || targetMinutes > 1440) invalid();
  const minimumAge = nullable(p.min_age, count);
  if (minimumAge !== null && minimumAge > 120) invalid();
  return {
    id: text(o.id),
    text: text(o.text),
    geography: text(o.geography),
    regionId: text(o.region_id),
    targetMinutes,
    targetAccessPercent: nullable(c.target_access_percent, percentage),
    minimumAge,
    carAccess: nullable(p.car_access, (v) =>
      typeof v === "boolean" ? v : invalid(),
    ),
  };
}
export function parseStatus(v: unknown): BackendStatus {
  const s = data(v),
    limits = object(s.limits),
    store = object(s.run_store);
  const capabilities = list(s.capabilities, 100).map((v) => {
    const c = object(v);
    return {
      name: text(c.name),
      state: choice(c.status, ["IMPLEMENTED", "MOCKED", "PLANNED"]),
    };
  });
  if (new Set(capabilities.map((c) => c.name)).size !== capabilities.length)
    invalid();
  return {
    state: choice(s.status, ["ready", "degraded"]),
    dataMode: choice(s.data_mode, modes),
    capabilities,
    regions: texts(s.supported_regions),
    limitations: texts(s.limitations),
    runDeadlineSeconds: nullable(limits.run_deadline_seconds, numeric),
    storage: choice(store.storage, ["memory", "unavailable"]),
    restartBehavior: text(store.restart_behavior),
  };
}
export function parseSources(v: unknown): SourceInventory {
  const s = data(v);
  if (s.schema_version !== 1) invalid();
  const sources = list(s.sources).map((v) => {
    const r = object(v);
    return {
      id: text(r.id),
      name: text(r.name),
      dataset: text(r.dataset),
      category: choice(r.category, ["civic", "fixture", "context"]),
      state: choice(r.status, [
        "PLANNED",
        "BUNDLED",
        "REMOTE_CONTEXT",
        "INGESTED",
        "FAILED",
      ]),
      dataMode: choice(r.data_mode, modes),
      url: nullable(r.source_url, publicUrl),
      updatedAt: nullable(r.source_updated_at, date),
      acquiredAt: nullable(r.ingested_at, date),
      licence: nullable(r.licence, text),
      notes: text(r.notes),
    };
  });
  const realCivicDatasets = count(s.real_civic_datasets_ingested);
  if (
    new Set(sources.map((s) => s.id)).size !== sources.length ||
    sources.some((s) => s.state === "INGESTED" && (!s.url || !s.acquiredAt)) ||
    realCivicDatasets !==
      sources.filter(
        (s) =>
          s.category === "civic" &&
          s.state === "INGESTED" &&
          s.dataMode === "real",
      ).length
  )
    invalid();
  return { inspectedOn: date(s.inspected_on), realCivicDatasets, sources };
}
export function parseObjective(v: unknown): ObjectiveValidation {
  const s = data(v);
  if (s.evaluable !== false) invalid();
  return {
    objective: objective(s.objective),
    parser: choice(s.parser_mode, ["deterministic_template"]),
    evaluable: false,
    assumptions: texts(s.assumptions),
    limitations: texts(s.limitations),
  };
}
function metrics(v: unknown): RunMetrics {
  const m = object(v),
    cohortResidents = count(m.cohort_residents),
    reachableResidents = count(m.reachable_residents),
    accessPercent = nullable(m.access_percent, percentage);
  if (
    reachableResidents > cohortResidents ||
    (cohortResidents === 0
      ? accessPercent !== null
      : accessPercent === null ||
        Math.abs(accessPercent - (reachableResidents / cohortResidents) * 100) >
          0.011)
  )
    invalid();
  return { cohortResidents, reachableResidents, accessPercent };
}
/** Project inspection fields only; full analytical/map mapping waits for B/A's outputs. */
export function parseRun(v: unknown): BackendRun {
  const s = data(v),
    r = object(s.run);
  if (r.schema_version !== 1) invalid();
  const state = choice(r.status, [
      "queued",
      "running",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    kind = choice(r.kind, ["baseline", "intervention", "stress_test"]);
  const before = nullable(r.before, metrics),
    after = nullable(r.after, metrics);
  if (state !== "succeeded" && (before || after)) invalid();
  if (
    state === "succeeded" &&
    (!before ||
      (kind !== "baseline" && !after) ||
      (kind === "baseline" && after))
  )
    invalid();
  const trace = list(s.tool_trace, 100).map((v) => {
    const t = object(v);
    return {
      id: text(t.action_id),
      tool: text(t.tool),
      state: choice(t.status, ["running", "succeeded", "failed", "cancelled"]),
      outputRef: nullable(t.output_ref, text),
    };
  });
  return {
    id: text(r.id),
    state,
    kind,
    phase: text(r.phase),
    dataMode: choice(r.data_mode, modes),
    objective: objective(r.objective),
    datasetIds: texts(r.input_dataset_ids),
    engineVersion: text(r.engine_version),
    updatedAt: date(r.updated_at),
    before,
    after,
    errorCode: nullable(r.error_code, text),
    assumptions: texts(s.assumptions),
    limitations: texts(s.limitations),
    trace,
  };
}

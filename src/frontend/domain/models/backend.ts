/** Inspection contracts; backend lifecycle never overwrites synthetic map outcomes. */
export type DataMode = "real" | "synthetic" | "mixed";
export interface BackendStatus {
  state: "ready" | "degraded";
  dataMode: DataMode;
  capabilities: { name: string; state: "IMPLEMENTED" | "MOCKED" | "PLANNED" }[];
  regions: string[];
  limitations: string[];
  runDeadlineSeconds: number | null;
  storage: "memory" | "unavailable";
  restartBehavior: string;
}
export interface BackendSource {
  id: string;
  name: string;
  dataset: string;
  category: "civic" | "fixture" | "context";
  state: "PLANNED" | "BUNDLED" | "REMOTE_CONTEXT" | "INGESTED" | "FAILED";
  dataMode: DataMode;
  url: string | null;
  updatedAt: string | null;
  acquiredAt: string | null;
  licence: string | null;
  notes: string;
}
export interface SourceInventory {
  inspectedOn: string;
  realCivicDatasets: number;
  sources: BackendSource[];
}
export interface CompiledObjective {
  id: string;
  text: string;
  geography: string;
  regionId: string;
  targetMinutes: number;
  targetAccessPercent: number | null;
  minimumAge: number | null;
  carAccess: boolean | null;
}
export interface ObjectiveValidation {
  objective: CompiledObjective;
  parser: "deterministic_template";
  evaluable: false;
  assumptions: string[];
  limitations: string[];
}
export interface RunMetrics {
  cohortResidents: number;
  reachableResidents: number;
  accessPercent: number | null;
}
export interface BackendRun {
  id: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  kind: "baseline" | "intervention" | "stress_test";
  phase: string;
  dataMode: DataMode;
  objective: CompiledObjective;
  datasetIds: string[];
  engineVersion: string;
  updatedAt: string;
  before: RunMetrics | null;
  after: RunMetrics | null;
  errorCode: string | null;
  assumptions: string[];
  limitations: string[];
  trace: {
    id: string;
    tool: string;
    state: string;
    outputRef: string | null;
  }[];
}

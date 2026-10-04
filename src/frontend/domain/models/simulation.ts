import type {
  AccessibilityResult,
  CivicObjective,
  Community,
  DataSource,
  Evidence,
  InfrastructureObservation,
  Intervention,
  Investigation,
  Journey,
  ServiceLocation,
  StressScenario,
  TransportNetwork,
} from "./index";

/** Serializable analytical inputs, distinct from request cancellation/tracing. */
export interface SimulationContext {
  schemaVersion: 1;
  objective: CivicObjective;
  community: Community;
  baseline: AccessibilityResult;
  services: ServiceLocation[];
  transit: TransportNetwork;
  journey?: Journey;
  investigation?: Investigation;
  observations: InfrastructureObservation[];
  evidence: Evidence[];
  sources: DataSource[];
  /** Explicit gaps prevent an agent treating a display fixture as routing data. */
  missingInputs: string[];
  reproducibility: {
    snapshotId: string;
    engineVersion: string;
    seed: number;
    timezone: string;
  };
  mock: boolean;
}

export interface SimulationRequest {
  context: SimulationContext;
  intervention: Intervention;
  scenario?: StressScenario;
}

export type StressSimulationRequest = SimulationRequest & {
  scenario: StressScenario;
};

import type {
  AccessibilityResult,
  CivicObjective,
  Evidence,
  Intervention,
  SimulationRun,
} from "@/frontend/domain/models";
interface Envelope {
  operationId: string;
  sequence: number;
  timestamp: string;
  schemaVersion: 1;
}
export type CivicEventPayload =
  | { type: "objective.parsed"; objective: CivicObjective }
  | { type: "analysis.started" }
  | { type: "community.failed"; result: AccessibilityResult }
  | { type: "investigation.started"; communityId: string }
  | { type: "evidence.found"; evidence: Evidence }
  | { type: "analysis.completed" }
  | { type: "intervention.generated"; intervention: Intervention }
  | {
      type: "simulation.updated" | "stress_test.updated";
      simulation: SimulationRun;
    };

export type CivicEvent = Envelope & CivicEventPayload;

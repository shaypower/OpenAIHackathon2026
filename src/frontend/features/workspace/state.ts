import type {
  CivicObjective,
  AccessibilityResult,
  Community,
  Intervention,
  Investigation,
  Journey,
  ServiceLocation,
  SimulationRun,
  SiteAudit,
  StressScenario,
  TransitRoute,
  TransitStop,
  TransitEdge,
  TransportSource,
  TransportSelection,
} from "@/frontend/domain/models";
import type { CivicEvent } from "@/frontend/domain/events";
import type { SimulationRequest } from "@/frontend/domain/models/simulation";
export type Phase =
  | { kind: "idle" }
  | { kind: "objective-parsing" }
  | { kind: "analysing"; stage: "evaluating" | "finding" | "investigating" }
  | { kind: "failures-found" }
  | { kind: "community-selected" }
  | { kind: "intervention-generation" }
  | { kind: "intervention-candidates" }
  | { kind: "intervention-selected" }
  | { kind: "simulation-running" }
  | { kind: "intervention-verified" }
  | { kind: "stress-testing" }
  | { kind: "degraded" }
  | { kind: "contingency-generation" };
export interface WorkspaceState {
  phase: Phase;
  communities: Community[];
  services: ServiceLocation[];
  routes: TransitRoute[];
  stops: TransitStop[];
  edges: TransitEdge[];
  transportSources: TransportSource[];
  transportSelection?: TransportSelection;
  results: AccessibilityResult[];
  objective?: CivicObjective;
  selectedId?: string;
  journey?: Journey;
  investigation?: Investigation;
  candidates: Intervention[];
  intervention?: Intervention;
  simulation?: SimulationRun;
  simulationRequest?: SimulationRequest;
  scenario?: StressScenario;
  site?: SiteAudit;
  compare: "before" | "after";
  view: "overview" | "journey" | "investigation" | "network";
  error?: string;
  operationId?: string;
  eventSequence: number;
  eventLog: string[];
  loadingResource?: "journey" | "investigation" | "site";
}
export const initialState: WorkspaceState = {
  phase: { kind: "idle" },
  communities: [],
  services: [],
  routes: [],
  stops: [],
  edges: [],
  transportSources: [],
  results: [],
  candidates: [],
  compare: "before",
  view: "overview",
  eventSequence: 0,
  eventLog: [],
};
export type Action =
  | { type: "patch"; patch: Partial<WorkspaceState> }
  | { type: "reset" }
  | { type: "stream"; event: CivicEvent };
export function workspaceReducer(
  state: WorkspaceState,
  action: Action,
): WorkspaceState {
  if (action.type === "reset")
    return {
      ...initialState,
      communities: state.communities,
      services: state.services,
      routes: state.routes,
      stops: state.stops,
      edges: state.edges,
      transportSources: state.transportSources,
    };
  if (action.type === "patch") return { ...state, ...action.patch };
  const e = action.event;
  if (e.operationId !== state.operationId || e.sequence <= state.eventSequence)
    return state;
  const next = {
    ...state,
    eventSequence: e.sequence,
    eventLog: [...state.eventLog.slice(-11), e.type],
  };
  switch (e.type) {
    case "objective.parsed":
      return {
        ...next,
        objective: e.objective,
        phase: { kind: "analysing", stage: "evaluating" },
      };
    case "analysis.started":
      return { ...next, phase: { kind: "analysing", stage: "finding" } };
    case "community.failed":
      return {
        ...next,
        results: [
          ...next.results.filter((r) => r.communityId !== e.result.communityId),
          e.result,
        ],
      };
    case "investigation.started":
      return { ...next, phase: { kind: "analysing", stage: "investigating" } };
    case "evidence.found":
      return next;
    case "analysis.completed":
      return { ...next, phase: { kind: "failures-found" } };
    case "intervention.generated":
      return {
        ...next,
        candidates: [
          ...next.candidates.filter((v) => v.id !== e.intervention.id),
          e.intervention,
        ],
        phase: { kind: "intervention-candidates" },
      };
    case "simulation.updated":
      return {
        ...next,
        simulation: e.simulation,
        compare: "after",
        phase: { kind: "intervention-verified" },
      };
    case "stress_test.updated":
      return { ...next, simulation: e.simulation, phase: { kind: "degraded" } };
  }
}
export function isBusy(phase: Phase) {
  return [
    "objective-parsing",
    "analysing",
    "intervention-generation",
    "simulation-running",
    "stress-testing",
    "contingency-generation",
  ].includes(phase.kind);
}
export function phaseLabel(phase: Phase): string {
  switch (phase.kind) {
    case "idle":
      return "Ready to explore";
    case "objective-parsing":
      return "Understanding objective";
    case "analysing":
      return {
        evaluating: "Evaluating communities",
        finding: "Finding failures",
        investigating: "Investigating causes",
      }[phase.stage];
    case "intervention-generation":
      return "Generating interventions";
    case "simulation-running":
      return "Simulating intervention";
    case "stress-testing":
      return "Applying disruption";
    case "contingency-generation":
      return "Generating contingency";
    case "degraded":
      return "Network disrupted";
    case "intervention-verified":
      return "Simulation ready";
    default:
      return "Ready";
  }
}

import type { CivicEvent } from "@/frontend/domain/events";
import type {
  SimulationRequest,
  StressSimulationRequest,
} from "@/frontend/domain/models/simulation";
import type {
  AccessibilityResult,
  CivicObjective,
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
} from "@/frontend/domain/models";
export interface RequestContext {
  signal: AbortSignal;
  operationId: string;
}
export interface CivicDataProvider {
  getCommunities(context: RequestContext): Promise<Community[]>;
  getServices(context: RequestContext): Promise<ServiceLocation[]>;
  getTransit(
    context: RequestContext,
  ): Promise<{ routes: TransitRoute[]; stops: TransitStop[] }>;
  getSiteAudit(
    communityId: string,
    context: RequestContext,
  ): Promise<SiteAudit>;
}
export interface AccessibilityProvider {
  submitObjective(
    text: string,
    context: RequestContext,
  ): AsyncIterable<CivicEvent>;
  getCommunityAnalysis(
    communityId: string,
    context: RequestContext,
  ): Promise<AccessibilityResult>;
  getJourney(communityId: string, context: RequestContext): Promise<Journey>;
}
export interface InvestigationProvider {
  investigate(
    communityId: string,
    context: RequestContext,
  ): Promise<Investigation>;
}
export interface InterventionProvider {
  generateInterventions(
    communityId: string,
    objective: CivicObjective,
    context: RequestContext,
  ): Promise<Intervention[]>;
  generateContingency(
    intervention: Intervention,
    scenario: StressScenario,
    context: RequestContext,
  ): Promise<Intervention>;
}
export interface SimulationProvider {
  simulateIntervention(
    request: SimulationRequest,
    context: RequestContext,
  ): Promise<SimulationRun>;
  getStressScenarios(): StressScenario[];
  runStressScenario(
    request: StressSimulationRequest,
    context: RequestContext,
  ): Promise<SimulationRun>;
}
export interface SceneState {
  audit: SiteAudit;
  mode: "current" | "proposed";
  selectedAnnotationId?: string;
}
/** Renderer owns DOM/GPU resources. Domain coordinates are local metres, Y up. */
export interface SpatialSceneProvider {
  mount(
    container: HTMLElement,
    state: SceneState,
    onSelect: (id: string) => void,
  ): { update(state: SceneState): void; dispose(): void };
}
export interface FrontendProviders {
  data: CivicDataProvider;
  accessibility: AccessibilityProvider;
  investigation: InvestigationProvider;
  interventions: InterventionProvider;
  simulation: SimulationProvider;
  scene: SpatialSceneProvider;
}

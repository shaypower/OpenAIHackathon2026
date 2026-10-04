import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  FrontendProviders,
  RequestContext,
} from "@/frontend/domain/contracts/providers";
import type {
  Intervention,
  StressScenario,
  TransportSelection,
} from "@/frontend/domain/models";
import { buildSimulationRequest } from "@/frontend/features/simulation/buildSimulationRequest";
import {
  initialState,
  workspaceReducer,
  isBusy,
  type WorkspaceState,
} from "./state";
export function useWorkspace(providers: FrontendProviders) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const operation = useRef<AbortController | null>(null);
  const resource = useRef<AbortController | null>(null);
  const begin = () => {
    operation.current?.abort();
    resource.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    return { signal: controller.signal, operationId: crypto.randomUUID() };
  };
  const patch = (value: Partial<WorkspaceState>) =>
    dispatch({ type: "patch", patch: value });
  const perform = async (
    context: RequestContext,
    fn: () => Promise<void>,
    fallback: WorkspaceState["phase"],
  ) => {
    const timeout = setTimeout(
      () =>
        context.signal === operation.current?.signal &&
        operation.current.abort(
          new Error("Operation timed out. Please retry."),
        ),
      12000,
    );
    try {
      await fn();
    } catch (error) {
      if (operation.current?.signal === context.signal) {
        if (
          !context.signal.aborted ||
          (context.signal.reason instanceof Error &&
            context.signal.reason.name !== "AbortError")
        )
          patch({
            error: error instanceof Error ? error.message : "Operation failed",
            phase: fallback,
          });
      }
    } finally {
      clearTimeout(timeout);
    }
  };
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const ctx = { signal, operationId: "bootstrap" };
        const [communities, services, transit] = await Promise.all([
          providers.data.getCommunities(ctx),
          providers.data.getServices(ctx),
          providers.data.getTransit(ctx),
        ]);
        if (!signal.aborted)
          dispatch({
            type: "patch",
            patch: {
              communities,
              services,
              routes: transit.routes,
              stops: transit.stops,
              edges: transit.edges,
              transportSources: transit.sources,
              error: undefined,
            },
          });
      } catch (error) {
        if (!signal.aborted)
          dispatch({
            type: "patch",
            patch: {
              error:
                error instanceof Error
                  ? error.message
                  : "Could not load demo data",
            },
          });
      }
    },
    [providers],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
      operation.current?.abort();
      resource.current?.abort();
    };
  }, [load]);
  async function submit(text: string) {
    const ctx = begin();
    dispatch({ type: "reset" });
    patch({
      phase: { kind: "objective-parsing" },
      operationId: ctx.operationId,
    });
    await perform(
      ctx,
      async () => {
        for await (const event of providers.accessibility.submitObjective(
          text,
          ctx,
        )) {
          if (!ctx.signal.aborted) dispatch({ type: "stream", event });
        }
      },
      { kind: "idle" },
    );
  }
  function select(id: string) {
    if (isBusy(state.phase) || state.selectedId === id) return;
    begin();
    patch({
      selectedId: id,
      transportSelection: undefined,
      journey: undefined,
      investigation: undefined,
      candidates: [],
      intervention: undefined,
      simulation: undefined,
      simulationRequest: undefined,
      scenario: undefined,
      site: undefined,
      error: undefined,
      loadingResource: undefined,
      view: "overview",
      compare: "before",
      phase: { kind: state.results.length ? "community-selected" : "idle" },
    });
  }
  async function inspect(view: "journey" | "investigation" | "site") {
    if (!state.selectedId) return;
    resource.current?.abort();
    const controller = new AbortController();
    resource.current = controller;
    const ctx = { signal: controller.signal, operationId: crypto.randomUUID() };
    patch({ loadingResource: view, error: undefined });
    const timer = setTimeout(
      () => controller.abort(new Error("Inspection timed out. Try again.")),
      8000,
    );
    try {
      if (view === "journey") {
        const journey = await providers.accessibility.getJourney(
          state.selectedId,
          ctx,
        );
        if (!ctx.signal.aborted) patch({ journey, view });
      } else if (view === "investigation") {
        const investigation = await providers.investigation.investigate(
          state.selectedId,
          ctx,
        );
        if (!ctx.signal.aborted) patch({ investigation, view });
      } else {
        const site = await providers.data.getSiteAudit(state.selectedId, ctx);
        if (!ctx.signal.aborted) patch({ site });
      }
    } catch (error) {
      if (
        resource.current === controller &&
        (!ctx.signal.aborted ||
          (ctx.signal.reason instanceof Error &&
            ctx.signal.reason.name !== "AbortError"))
      )
        patch({
          error: error instanceof Error ? error.message : "Inspection failed",
        });
    } finally {
      clearTimeout(timer);
      if (resource.current === controller)
        patch({ loadingResource: undefined });
    }
  }
  async function generate() {
    if (!state.selectedId || !state.objective) return;
    const ctx = begin();
    patch({
      phase: { kind: "intervention-generation" },
      error: undefined,
      view: "overview",
      loadingResource: undefined,
    });
    await perform(
      ctx,
      async () => {
        const candidates = await providers.interventions.generateInterventions(
          state.selectedId!,
          state.objective!,
          ctx,
        );
        if (!ctx.signal.aborted)
          patch({ candidates, phase: { kind: "intervention-candidates" } });
      },
      { kind: "community-selected" },
    );
  }
  function preview(v: Intervention) {
    begin();
    patch({
      intervention: v,
      simulation: undefined,
      simulationRequest: undefined,
      scenario: undefined,
      compare: "after",
      phase: { kind: "intervention-selected" },
      error: undefined,
      loadingResource: undefined,
    });
  }
  async function apply() {
    if (!state.intervention) return;
    const ctx = begin();
    patch({ phase: { kind: "simulation-running" }, error: undefined });
    await perform(
      ctx,
      async () => {
        const simulationRequest = buildSimulationRequest(
          state,
          state.intervention!,
        );
        const simulation = await providers.simulation.simulateIntervention(
          simulationRequest,
          ctx,
        );
        if (!ctx.signal.aborted)
          patch({
            simulation,
            simulationRequest,
            compare: "after",
            phase: { kind: "intervention-verified" },
          });
      },
      { kind: "intervention-selected" },
    );
  }
  async function stress(scenario: StressScenario) {
    if (!state.intervention || !state.simulation) return;
    const ctx = begin();
    patch({
      scenario,
      compare: "after",
      phase: { kind: "stress-testing" },
      error: undefined,
    });
    await perform(
      ctx,
      async () => {
        const simulationRequest = {
          ...buildSimulationRequest(state, state.intervention!, scenario),
          scenario,
        };
        const simulation = await providers.simulation.runStressScenario(
          simulationRequest,
          ctx,
        );
        if (!ctx.signal.aborted)
          patch({ simulation, simulationRequest, phase: { kind: "degraded" } });
      },
      { kind: "intervention-verified" },
    );
  }
  async function contingency() {
    if (!state.intervention || !state.scenario) return;
    const ctx = begin();
    patch({ phase: { kind: "contingency-generation" }, error: undefined });
    await perform(
      ctx,
      async () => {
        const intervention = await providers.interventions.generateContingency(
          state.intervention!,
          state.scenario!,
          ctx,
        );
        const simulationRequest = buildSimulationRequest(
          state,
          intervention,
          state.scenario!,
        );
        const simulation = await providers.simulation.simulateIntervention(
          simulationRequest,
          ctx,
        );
        if (!ctx.signal.aborted)
          patch({
            intervention,
            simulation,
            simulationRequest,
            scenario: undefined,
            compare: "after",
            phase: { kind: "intervention-verified" },
          });
      },
      { kind: "degraded" },
    );
  }
  function reset() {
    begin();
    dispatch({ type: "reset" });
    if (!state.communities.length) void load(new AbortController().signal);
  }
  return {
    state,
    submit,
    select,
    inspect,
    generate,
    preview,
    apply,
    stress,
    contingency,
    reset,
    setCompare: (compare: WorkspaceState["compare"]) => patch({ compare }),
    setView: (view: WorkspaceState["view"]) => patch({ view }),
    selectTransport: (transportSelection: TransportSelection) => {
      if (isBusy(state.phase)) return;
      patch({ transportSelection, view: "network" });
    },
    closeTransport: () =>
      patch({ transportSelection: undefined, view: "overview" }),
    closeSite: () => patch({ site: undefined }),
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;

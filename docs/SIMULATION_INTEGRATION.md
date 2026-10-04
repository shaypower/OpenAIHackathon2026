# Simulation integration: implemented vs planned

## Endpoints and frontend integration now

C's application routes were inspected and exercised on 2026-10-04. The canonical wire contracts remain in [team/API_CONTRACTS.md](team/API_CONTRACTS.md).

| Endpoint | Backend behavior | Frontend connection |
| --- | --- | --- |
| `GET /api/` | Health | Available for server checks |
| `GET /api/status` | Degraded mode, capability/limit/store metadata | Connected backend inspector |
| `GET /api/sources` | Validated inventory; planned/context/fixture labels and unknown fields retained | Connected inventory inspector |
| `POST /api/objectives/validate` | Deterministic template parser; no model or evaluation | Connected **Backend validation** command mode |
| `POST /api/objectives/analyse` | Guard implemented; default production returns 503 `simulation_unavailable` | Not submitted: A/B's authoritative snapshot/config/departure inputs are not available |
| `GET /api/runs/{run_id}` | Pinned readback; unknown/expired/restarted run returns 404 | Connected run inspection and bounded polling; default server has no accepted runs |
| `GET /api/docs`, `GET /api/openapi.json` | Actual schema/docs | Available for developers |

Community/service/transport/GeoJSON, candidate/simulation/stress endpoints remain planned. No model calls, real routing or simulation execution have been activated. The synthetic vertical demo continues using `createMockProviders()` explicitly; backend errors never silently switch an operation into replay mode.

`domain/contracts/backend.ts` defines a separate `BackendProvider`, injected at `app/main.tsx`. `adapters/http/backendProvider.ts` owns same-origin `/api` fetch, eight-second request limits, cancellation and structured error normalization. `backendMapping.ts` validates versioned unknown responses and maps only inspection fields into `domain/models/backend.ts`; snake_case DTOs do not enter components. It rejects contradictory cohort percentages/lifecycle metrics and preserves null coverage/freshness/licence values. A compiled goal is not coerced into the demo's 90% coverage target or marked analytically verified.

`features/backend/useBackend.ts` probes status/sources independently, retains last-good metadata on partial refresh failure, and manages validation separately from the mock workspace. `watchRun.ts` polls active run snapshots every second, stops at a terminal state/error or 30-second observation deadline, and preserves the last snapshot on failure. Stop watching/reset abort browser observation only; no server cancellation is claimed. Full map-result/provenance/journey mapping awaits actual A/B payloads; run readback is an inspection projection, not a complete analytical snapshot validator.

Vite dev and preview proxy `/api` to `http://127.0.0.1:8000`; override the server-only target with `CIVIC_API_TARGET`. No backend CORS changes or browser credentials are needed locally. A deployed host must supply an equivalent same-origin reverse proxy. See [DEMO.md](DEMO.md) for the two-terminal start and interaction path.

The captured status/sources/validation fixtures under `src/frontend/mocks/backend/` came from C's running API. The run example is **C's test-only synthetic backend**, never registered by the production app. Adapter/polling tests and the browser intercepted fixture verify rendering/lifecycle behavior without claiming B has delivered a simulator.

## Models and ownership

Frontend presentation contracts: `src/frontend/domain/models/index.ts`; backend inspection models: `domain/models/backend.ts`. Provider contracts: `src/frontend/domain/contracts/providers.ts`. Agent/simulation input envelope: `src/frontend/domain/models/simulation.ts`.

| Group | Models / purpose |
| --- | --- |
| Goal and population | `CivicObjective`, `Community`, `PopulationProfile`: goal, geography and population summaries |
| Network and journey | `JourneyOutcome` identifies the provider-supplied failure/arrival location. `ServiceLocation`, `TransportNetwork`, `TransitRoute`, `TransitStop`, `TransitEdge`, `TransportSource`, `Journey`, `JourneyLeg`: services, display network and example trip |
| Findings | `AccessibilityResult`, `FailureReason`, `Investigation`: baseline failure and explanation |
| Credibility | `Evidence`, `DataSource`: source/dataset/freshness/confidence/verification and synthetic labeling |
| Planning | `Intervention`, `InterventionImpact`, `SpatialFeature`: proposed change, preview impacts and map geometry |
| Evaluation | `StressScenario`, `SimulationRun`: disruption and before/after result |
| Physical site | `InfrastructureObservation`, `SpatialAnnotation`, `SiteAudit`, `DigitalTwinAsset`: observations independent of rendering engine |
| Input snapshot | `SimulationContext`, `SimulationRequest`: goal + baseline + scoped data + provenance + candidate + optional disruption |

`backend/domain/models.py` defines separate Pydantic wire contracts under development. They use snake_case and stricter analytical semantics. They are not a running simulator. Preserve that distinction: a backend proposal has executable changes and no invented impact; backend metrics belong to the computed `SimulationRun`. Frontend candidate impact is optional; a missing impact renders as unscored. Existing fixture impact is only a synthetic preview. A real adapter must map these deliberately, not simply rename keys or copy predicted preview metrics into computed results.

Important current model limits:

- `PopulationProfile.aged65Plus` and `.withoutCar` are marginal display counts. They do **not** establish the joint target-cohort denominator. `affectedResidents` in the fixtures is illustrative and cannot be reconstructed from those marginals.
- Frontend journey clocks such as `07:18` are a storyboard, not dated GTFS service times. Real journeys need service date, timezone, departures, calendars and transfer constraints.
- Connected display topology now preserves stop order and edge paths from captured GTFS shapes. It is not a dated routing graph; service calendars, stop times, transfer rules and pedestrian links remain missing. Route geometry alone is not a routable graph. A displayed proposed line does not specify an executable timetable or vehicle operation.
- Frontend stress losses are preset fixture percentage points. Fixture flood/road scenarios now reference `blockedEdgeIds` on the display network, and the Borrisoleigh contingency uses a disjoint captured path. No engine computes these losses or checks road closure feasibility. Real stress changes must identify canonical graph edges/services/trips, then recompute accessibility.
- `mock: true` remains authoritative for the current replay, including a run whose frontend status is named `verified`. That status does not certify public data or real analytical validity.

## Context passed today

The application builds a new deep-copied request before simulation, stress and contingency evaluation. `RequestContext` still contains only `AbortSignal` and `operationId`; it is cancellation/tracing, **not the agent's reasoning context**.

```ts
interface SimulationRequest {
  context: {
    schemaVersion: 1;
    objective: CivicObjective;
    community: Community;
    baseline: AccessibilityResult;
    services: ServiceLocation[];
    transit: TransportNetwork; // routes, ordered stops, connected edges, geometry sources
    journey?: Journey;
    investigation?: Investigation;
    observations: InfrastructureObservation[];
    evidence: Evidence[];
    sources: DataSource[];
    missingInputs: string[];
    reproducibility: {
      snapshotId: string;
      engineVersion: string;
      seed: number;
      timezone: string;
    };
    mock: boolean;
  };
  intervention: Intervention;
  scenario?: StressScenario;
}
```

The builder is intentionally scoped to the synthetic workspace and rejects real/mixed analytical sources. Public geometry provenance lives separately in `transit.sources`; it never certifies synthetic clocks or impact. It deduplicates evidence and sources, excludes another community's journey/investigation/site, and rejects missing goal/community/baseline or cross-region objectives. It includes only already inspected optional details; inspection is not required to simulate the mock. A validated real snapshot adapter will replace this builder's fixture assumptions. Do not expand a browser payload into a whole national dataset.

After a successful simulation, **Export simulation context · JSON** downloads the actual request consumed by the provider. [The captured example](examples/simulation-context.mock.json) was exported from the production UI after inspecting the journey/evidence and applying the combined intervention. Reset/reselection clears it. A contingency retains its disruption in the exported request so future engines can retest the repair against the original failure.

Current engine behavior is explicitly a replay: baseline comes from the context, after-access copies candidate fixture impact; stress subtracts the scenario's fixture loss; contingency copies a 91% fixture. The envelope is usable now, but it does not create a real simulation engine or AI agent.

## Context a real agent needs

Construct authoritative context on the server from validated IDs. Do not trust client-supplied percentages, budgets or population counts as computed facts. Pin these inputs:

1. Parsed objective: service category, geography, structured population predicate, time bound and success threshold. Ask for clarification if ambiguous; today's mock always selects the same Tipperary objective.
2. Immutable dataset snapshot IDs/versions: joint cohort counts, road topology, dated transit trips/stop times/calendars, facilities and availability. Include evidence/licence/freshness and explicit missing-data policy.
3. Evaluation configuration: departure date/window, `Europe/Dublin` timezone, walking speed/accessibility constraints, minimum transfers, demand weights, resource/cost limits and ranking criteria. Unknown values remain unknown.
4. Baseline run ID, tool-computed journeys/failures/metrics and evidence. Retrieve focused summaries by community; leave large GTFS/graphs/GeoJSON in tool-accessible storage.
5. Candidate executable changes, optional scenario changes by validated edge/service/trip IDs, previous assessments, rejected changes and their reasons.
6. Tool catalogue and execution policy: supported intervention kinds, argument/output schemas, iteration/candidate/time caps, cancellation, engine version and seed. Store a trace of tool names, arguments, timings, outputs and errors; model explanations reference evidence IDs.

The typed frontend context shows the relevant categories, but all six missing-input entries must be supplied or explicitly constrained before claiming real accessibility results. Backend schemas must validate semantic invariants too: references, geometry, dated times, cohort counts, supported changes and units. Sharing TypeScript interfaces alone does not validate unknown JSON.

## Agent responsibility and tool loop

```mermaid
flowchart LR
  UI[Frontend provider] --> API[Run API + validation]
  API --> Agent[Agent orchestrator]
  Agent --> Tools[Dataset lookup / baseline / candidate evaluation / stress tools]
  Tools --> Engine[Deterministic routing + simulation]
  Engine --> Trace[Computed metrics + evidence + trace]
  Trace --> Agent
  Trace --> API
  API --> UI
```

The agent interprets the goal, investigates evidence, proposes supported changes, calls tools, compares their outputs and explains the result. The deterministic engine computes paths, travel times, resident denominators, accessibility, cost and ranking. A model-authored percentage is never a `SimulationRun` result.

Start with one missed-connection case and one timetable-change tool. Validate → compute baseline → propose bounded changes → evaluate each on the same snapshot → rank by explicit policy → apply one closure → recompute → propose and retest a contingency. Unsupported changes and missing data return typed failures. Bounded retries preserve the last successful baseline; no unbounded autonomous loop. An agent can be added behind `InvestigationProvider` / `InterventionProvider` after these tools work, without changing map components or the spatial renderer.

## Run and inspect

```sh
npm run dev
# Separate terminal, after installing backend/requirements.txt:
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

UI: http://127.0.0.1:5173. API health: http://127.0.0.1:8000/api/. API docs: http://127.0.0.1:8000/api/docs.

Run the default objective → choose Borrisoleigh → inspect Journey → inspect Evidence → return to Overview → Generate interventions → choose the 94% combined option → Apply → Export context. Stress test → Flood → Export context → Generate contingency → Export context → Enter site. Expected mock access: **57% → 94% → 68% → 91%**. The downloaded JSON is the integration artifact, not proof of real routing or AI execution.

Transport capture/provenance and adapter invariants: [fixture notes](../src/frontend/mocks/transport/README.md). Transport runtime validation and C metadata/validation/readback HTTP adapters, proxy and observation polling are implemented. Analytical map adapters and server-authoritative evaluation still await C/B/A inputs.

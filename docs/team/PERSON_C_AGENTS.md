# PERSON_C — agent + orchestration + API

## MISSION

Turn natural-language intent into a validated civic objective and a bounded, observable workflow around B's deterministic tools. Coordinate shared contracts and backend composition so all four streams can integrate without editing each other's logic.

## WHY THIS MATTERS

The current “analysis” is a preset browser event sequence. A useful agent chooses and investigates actions, then verifies their outputs; it cannot manufacture accessibility, costs or success. One orchestrator with deterministic tools is the initial architecture.

## FILES YOU OWN

Create `backend/agents/` (objective compiler/planner), `backend/orchestration/` (run lifecycle/tool execution), `backend/api/` (route modules) and `backend/tests/orchestration/` as needed. Own your STATUS/HANDOFFS sections and this file. Integrate coordinated changes to `backend/main.py`, `backend/requirements.txt`, `backend/domain/`, root README and shared team docs. Shared integration does not grant permission to overwrite others' changes.

## FILES YOU MAY READ

A's snapshots, inventory and provenance; B's simulation facade and tests; `src/frontend/domain/contracts/providers.ts`, `domain/events/index.ts`, `domain/models/index.ts`, workspace reducer/hook, and [API_CONTRACTS](API_CONTRACTS.md).

## FILES YOU SHOULD NOT EDIT

A's ingestion/data or B's routing/accessibility/optimization/simulation modules; `src/frontend/`, `DESIGN.md`, frontend manifests/configuration and legacy placeholders. Hand D field/event mapping changes. Keep routing maths and demand weights outside agents.

## STEP-BY-STEP TASKS

1. Preserve `GET /api/`. Add routers under `backend/api/`; `main.py` should only construct the app and include routers. The ten target endpoints are all PLANNED; change their status only after route/readback tests pass.
2. First expose `GET /api/status` and `GET /api/sources` over actual capability state/inventory. Readiness is not “real data ready.” Report mode and supported change kinds honestly; source planned/bundled/failed states must not become ingested through API mapping.
3. Implement a non-model objective parser for the exact documented fixture first if useful. Label its fixed scenario behaviour explicitly. For a model compiler, use official OpenAI documentation MCP and review structured-output/tool examples before integration; never add an unused model dependency or put keys in the browser.
4. Compile the user's text into `CivicObjective`. Preserve domain, service, geography, cohort and explicit maximum journey time. Resolve region IDs against available data. Return assumptions for defaults (date, timezone, maximum time if omitted) and a clarification/unsupported error if the requested cohort/geography cannot be evaluated; do not silently reduce every prompt to Tipperary/45 minutes.
5. Validate the objective structurally and semantically. An LLM result has no population, journey time, impact or ranking fields. Reject unknown extras and unavailable capabilities. Data-source text and tool outputs are untrusted observations, not instructions that change tool permissions.
6. Wrap B's facade with typed tools: `get_population`, `get_services`, `run_baseline`, `find_failures`, `inspect_failure`, `generate_candidate_interventions`, `simulate_candidate`, `stress_test_candidate`, `rank_candidates`. Only register tools that actually exist. Require dataset/config/date references; record action IDs, inputs, output references and evidence.
7. Implement analyse → baseline → failure diagnosis → candidate proposal → deterministic simulation → ranking → at most one refinement → final selection. Begin with a predictable workflow; allow model-driven tool choice only where it adds a tested capability. Do not create decorative specialist agents.
8. Bound initial execution: one active run per local session, maximum 12 tool actions, 20 candidate evaluations, one refinement and 30-second run deadline. A model call gets a 10-second deadline and at most one transient retry within the total deadline. Configure a per-run model token/cost ceiling before enabling paid calls; record it without logging credentials. Stop with a reason on exhaustion. B's candidate budget and C's executor budget must agree.
9. Store immutable input snapshot IDs and retrievable `SimulationRun` records. For the local MVP, an in-memory store is acceptable **only with documented restart loss, TTL and maximum run count**; do not call it durable/resumable. Proposed defaults: 100 runs, 1-hour TTL, single worker. Move to persistent storage only when needed. Idempotency binds `client_request_id` to method + payload; conflicting reuse is 409, not a new computation.
10. Expose planned run/polling, simulation, candidate and stress endpoints exactly as contracted. Keep errors machine-readable. Emit phases from actual tool execution; queued/running/succeeded/failed/cancelled are distinct. Initial polling is enough; add SSE only with a reconnect/snapshot contract. Do not emit fabricated “thinking” text.
11. Coordinate a local Vite `/api` proxy with D before browser integration; it does not exist now. Alternatively use a narrowly configured backend origin allowance. Runtime-validate provider responses, preserve synthetic/mixed labels and test actual UI readback with D. Cancel/reset must abort UI work; until server cancellation exists, explain that local abort only stops observing the server job.

## EXPECTED INPUTS

User text, supported geography/cohort, departure date/time, A's dataset manifest/provenance, B's deterministic tool facade and capability list. API/model credentials live only in the server environment; the current mock demo requires none.

## EXPECTED OUTPUTS

Validated objective with assumptions, run IDs and lifecycle, structured tool trace/evidence, stable API DTOs, retrievable deterministic baseline/candidate/stress results and explicit errors. Narrative claims cite run/result IDs. Counts and times are copied from tool outputs, never reconstructed by the LLM.

## API / CONTRACTS YOU MUST RESPECT

`backend/domain/models.py` is the shared DTO source. [API_CONTRACTS](API_CONTRACTS.md) defines planned wire shapes, job lifecycle, HTTP errors, idempotency and provider mappings. Create endpoint request/response models inside `backend/api/`, not agent runtime classes exposed to D. Keep `GET /api/` byte-compatible. An envelope schema/type pass is not proof of factual truth; verify cross-record semantics and referenced tool results.

## HOW TO TEST YOUR WORK

Run `python -m unittest discover -s backend/domain -p 'test_*.py'`; after creating your tests, `python -m unittest discover -s backend/tests/orchestration -p 'test_*.py'`. Confirm legacy health with `curl --fail http://127.0.0.1:8000/api/` and inspect actual `/api/openapi.json` before marking endpoints implemented.

Exercise valid and ambiguous objectives, non-Tipperary geography, different time bound, invalid model JSON/extra quantitative fields, B's unsupported change, no data, timeout, duplicate request ID, conflicting replay, cancelled/stale events and run expiry. Inject a model unavailable/missing-key response: return an explicit failure or labelled deterministic fallback; do not claim a model call happened. Check that an attractive LLM proposal receives no impact until B evaluates it. With D, verify browser → backend → run readback → map and one recoverable failure.

## DEFINITION OF DONE

One supported objective reaches a deterministic baseline and at least one evaluated candidate through typed tools. D can retrieve the run and GeoJSON; errors/caps/restart behaviour are documented and tested. Model-produced unsupported or fabricated fields cannot enter metrics. Endpoint status accurately reflects actual HTTP implementation and capability mode. No fake multi-agent theatre, no secrets or routing formulas in agents.

## WHAT TO COMMIT

Owned agent/tool/orchestration/API code, focused tests, reviewed shared-contract/router/dependency edits and owned status/handoff entries. No API keys, provider transcripts with sensitive data, unrelated frontend work or guessed environment defaults. Put exact shared-file changes and affected consumers in HANDOFFS before landing them.

## WHAT TO TELL THE NEXT PERSON

“D: endpoint `<path>` now `<IMPLEMENTED/MOCKED>`; request/response `<example>`; mode `<label>`; error `<example>`; lifecycle/poll interval `<limits>`; start `<command>`. B: facade calls `<imports>` and missing capability `<list>`. A: reader expects snapshot `<id/path>`. Shared changes `<files/fields>` and checks `<commands/results>`.”

## KNOWN BLOCKERS / FALLBACKS

No model runtime, orchestration, persistent store, civic API or deterministic backend tools exist yet. Build against stub fixtures with a MOCKED label while B progresses. Keep the current mock UI as fallback. Do not imply the new domain package itself implements an agent. Do not claim server cancellation or durable runs without implementing them.

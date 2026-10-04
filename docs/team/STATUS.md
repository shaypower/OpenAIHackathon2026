# Status — evidence, not plans disguised as completion

Baseline inspected 2026-10-04 (Europe/Dublin). Update only your block; C owns integration. Use `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `READY_FOR_HANDOFF`, `VERIFIED`. Include timestamp, exact paths/artifacts, check evidence and next task. An IMPLEMENTED HTTP route may still use synthetic data; MOCKED local behaviour is not a route.

## PERSON_A

- State: NOT_STARTED — public-data ingestion.
- Exists: `backend/data/.gitkeep`; new inventory accurately records planned sources plus existing frontend fixtures/context.
- Real civic datasets verified ingested: **0**. No CSO/NTA/Pobal/closure/flood/service extract is present.
- First task: validate one Tipperary CSO Small Areas snapshot and matching demographic vintage.
- Deliver to B/C: manifest + normalised community/provenance records + exact validation/loader example.
- Blocker: official release/URL/licence/geography vintage and joint age/no-car coverage not selected/verified.
- Last owner update: unclaimed; setup inspection only.

## PERSON_B

- State: NOT_STARTED — deterministic backend transport/optimisation.
- Exists: frontend fixture simulation and new shared DTO shapes. No Python routing graph, GTFS parser, simulator/CLI or solver exists.
- First task: dated synthetic missed-connection fixture → deterministic baseline → timetable-change simulation → graph-closure rerun.
- Deliver to C: callable facade, supported kinds, results/errors and transport test evidence.
- Blocker: real data pending A; independent synthetic fixture allows immediate work.
- Last owner update: unclaimed; setup inspection only.

## PERSON_C

- State: IN_PROGRESS — objective/run boundary READY_FOR_HANDOFF; integrated simulation remains pending B.
- Exists: `backend/agents/objectives.py` deterministic template parser; `backend/orchestration/` memory snapshots/replay, lifecycle, budgets and typed baseline adapter seam; objective/run route models in `backend/api/`. App factory/lifespan clean up cooperative work.
- Implemented: health/status/sources, additional `POST /api/objectives/validate`, analysis validation/dependency guard, `GET /api/runs/{run_id}`. Baseline computation is UNAVAILABLE in the default app; the other six target civic routes remain PLANNED. No model runtime, SSE or public cancellation exists.
- Observed: validation 200 for the documented template with explicit maximum time and age assumption; analysis 503 `simulation_unavailable` with no run created; unknown-run 404 `run_not_found`. Status remains degraded/synthetic with empty analytical region/change lists; memory store 100 runs/3600-second TTL and executor guards 1 active run/process, 12 actions, 20 candidate reservations, one refinement, 30-second cooperative deadline.
- Verification: 35 orchestration/API tests and nine shared DTO tests passed. Test-only MOCKED backend exercises actual HTTP 202 → running → terminal polling/replay and timeout/expiry. Live default HTTP verified health/status/OpenAPI/validation 200, analysis 503, unknown run 404; health bytes unchanged and six application paths present in OpenAPI. Temporary server stopped.
- Limits: memory/replay records lost on restart/expiry/eviction; one worker; blocking CPU work needs B's bounded/isolation strategy. Candidate execution still unavailable despite reservation guards. Frontend remains on its existing mock providers.
- Deliver to D/A/B: new validate/readback/error shapes, additive `tool_trace`, adapter interface and exact shared changes in HANDOFFS/API_CONTRACTS; no consumer acceptance implied.
- Next: B/C agree and connect a tested snapshot/cohort/date-aware baseline adapter, then D/C coordinate dev proxy and provider mapping. Objective parser remains restricted to the documented template.
- Last owner update: 2026-10-04 14:20 Europe/Dublin.

## PERSON_D

- State: existing mock workflow IMPLEMENTED / MOCKED providers; connected civic backend work NOT_STARTED.
- Exists: React 19/strict TS/Vite, six provider contracts, mock iterable analysis, workspace reducer/hook, MapLibre layers/offline context, cancellation/recovery, schematic site viewer and eight current tests. Concurrent frontend work added a typed synthetic simulation request context/builder/export; see `docs/SIMULATION_INTEGRATION.md`.
- Fixture baseline: Borrisoleigh 57%; candidate C 94%; flood 68%; contingency 91%. All synthetic; no real routing calculation.
- First task: validated HTTP wire adapter and snapshot/lifecycle mapping without losing mock mode; preserve DESIGN.md.
- Gaps: real Small Area MultiPolygon and unknown-value mapping, unscored candidate states, runtime HTTP validation, backend connection, app dark mode. Current visual theme is light.
- Prior browser evidence: `docs/design/VERIFICATION.md`; current task's checks are recorded below, not inferred from that older document.
- Last owner update: unclaimed; setup inspection only.

## INTEGRATION — C coordinates

- Setup: four owner files, ownership matrix, target API/tool/data contracts, integration gates, handoff/decision/demo docs, shared DTOs and honest source inventory added.
- Preserved: existing frontend/mock workflow and backend route composition; README updated by append only; direct Pydantic dependency added for shared DTOs. No user work staged, committed or moved.
- Initial working tree: HEAD `f6cddbe`; README modified; substantial frontend/config/docs untracked. Do not claim a clean baseline or assume fresh worktrees contain the UI.
- Verification this setup: nine Python contract checks passed on Python 3.14.8/Pydantic 2.13.5; frontend typecheck, lint, eight tests and production build passed. Inventory paths/counts and all team Markdown links validated. Live `/api/` returned `{"status":"ok"}` and OpenAPI still lists only `/api/`; TestClient also verified docs and absent planned GET routes. Safari exercised objective → Borrisoleigh/journey → candidate C → 94% → flood 68% → contingency 91%; provider failure/recovery final readback is recorded in DEMO_CHECKLIST. Build retains the existing MapLibre large-chunk warning.
- Concurrent frontend edits, including the typed simulation-context builder/export and integration docs, were inspected and preserved. This setup's code changes are limited to new backend DTO/tests/inventory and the explicit requirements line; no frontend/config source was edited by this task.
- Integrated real-data/agent/simulation slice: NOT_STARTED. Documentation and DTOs are not proof of those capabilities.
- Next gate: C coordinates contract changes; owners claim their first bounded task and exchange concrete artifacts in HANDOFFS.

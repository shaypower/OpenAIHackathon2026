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
- Agent follow-up: optional OpenAI structured compiler/config/provider, bounded candidate generation/evaluation/ranking/one-refinement library, and evidence-linked tool summaries now exist under `backend/agents/`. Model generation requires explicit server key/model/prices/cost ceiling; default mode stays template. B's candidate adapter seam is proposed, not a delivered simulator.
- D compatibility: parser accepts the actual frontend default (“elderly residents”) as well as “elderly people”; explicit bounds and cohort/region restrictions remain. Proposed `backend/api/transport_models.py` now includes display edges and geometry sources, validated against D's 4-route/26-stop/25-edge capture. `/api/transport` remains PLANNED; no snapshot reader or HTTP adapter is connected.
- Implemented: health/status/sources, objective validation through the configured compiler, analysis validation/dependency guard, run readback with nullable `agent_summary`/`model_usage`. Baseline is UNAVAILABLE in the default app; the other six target civic routes remain PLANNED. OpenAI mode is available but not live-verified; no SSE or public cancellation exists.
- Observed: validation 200 for the documented template with explicit maximum time and age assumption; analysis 503 `simulation_unavailable` with no run created; unknown-run 404 `run_not_found`. Status remains degraded/synthetic with empty analytical region/change lists; memory store 100 runs/3600-second TTL and executor guards 1 active run/process, 12 actions, 20 candidate reservations, one refinement, 30-second cooperative deadline.
- Verification: 74 orchestration/API/agent/transport checks and nine domain checks pass. Model/SDK requests use injected responses/HTTP mock transport; no paid call. Agent tests reject fabricated quantitative fields, invalid scope/counts/evidence/ranking, preserve B's ordering, bound refinement/candidates/actions, cancel on deadline and protect compile/run replay. Default live HTTP health/validation/OpenAPI checked; health bytes and six application paths remain. Model provider availability and browser integration are unverified.
- Limits: memory/run/pre-acceptance compilation replay records lost on restart/expiry/eviction; one worker; blocking CPU work needs B's bounds/isolation. Candidate library needs B's production tools and HTTP composition. Model interpretation needs review; configured prices determine local cost estimates. Frontend remains on its mock providers.
- Deliver to D/A/B: configured parser modes, nullable model budget receipts/run summaries, compiler errors, typed candidate adapter/artifacts and proposed transport mapping in HANDOFFS/API_CONTRACTS/AGENT_IMPLEMENTATION. C reviewed D's spatial handoff; B/D acceptance of the new proposals remains pending.
- Next: B/C agree and connect baseline/candidate adapters, D/C map the added wire fields/proxy, then verify live model use with an explicitly configured key/model/prices. Stress execution and graph-level failure inspection remain pending.
- Last owner update: 2026-10-04 15:06 Europe/Dublin.

## PERSON_D

- State: **READY_FOR_HANDOFF** — frontend spatial interaction slice verified; connected real-backend definition of done remains pending B/C.
- Owner update: 2026-10-04 (Europe/Dublin), Person D. Owned paths: `src/frontend/`, DESIGN, D-owned architecture/demo/design/example docs and own status/handoff sections.
- Delivered: validated display topology (4 paths / 26 nodes / 25 segments), selected static NTA GTFS shapes, road-conforming synthetic feeder/contingency, map and keyboard route/stop inspector with geometry provenance; play/pause/seek journey replay; restrained transitions; light/dark and offline spatial styles; unscored proposals; completed-result-only served styling; Polygon/MultiPolygon camera bounds.
- Data mode: all population, journey clocks, interventions and impact remain synthetic. Public route geometry is separate geographic context, not real accessibility/routing/optimisation. Full mock sequence remains 57→94→68→91.
- Checks: typecheck, lint, 18 tests, production build pass. Chromium production UI exercised desktop 1536×1024, tablet 1024×768 and mobile 390×844, replay/seek, reduced motion/manual seek, network/stop selection, export, site/focus, offline, bootstrap failure/retry and reset without late results. Evidence: `docs/design/VERIFICATION.md`, captured context, transport fixture README. Existing MapLibre bundle-size warning remains.
- Backend boundary: civic HTTP routes, HTTP mapping/proxy, dated routing/calendars, analytical cohort semantics and server-authoritative run context are pending. No backend or other owners' files changed. Native transport runtime validation is implemented; it is not a civic HTTP adapter.
- Next task: integrate B/C's canonical computed run/DTO samples behind providers, preserving synthetic fallback and accurate missing-value/data-mode labels. See own HANDOFFS section for exact contracts and acknowledgement pending.

## INTEGRATION — C coordinates

- Setup: four owner files, ownership matrix, target API/tool/data contracts, integration gates, handoff/decision/demo docs, shared DTOs and honest source inventory added.
- Preserved: existing frontend/mock workflow and backend route composition; README updated by append only; direct Pydantic dependency added for shared DTOs. No user work staged, committed or moved.
- Initial working tree: HEAD `f6cddbe`; README modified; substantial frontend/config/docs untracked. Do not claim a clean baseline or assume fresh worktrees contain the UI.
- Verification this setup: nine Python contract checks passed on Python 3.14.8/Pydantic 2.13.5; frontend typecheck, lint, eight tests and production build passed. Inventory paths/counts and all team Markdown links validated. Live `/api/` returned `{"status":"ok"}` and OpenAPI still lists only `/api/`; TestClient also verified docs and absent planned GET routes. Safari exercised objective → Borrisoleigh/journey → candidate C → 94% → flood 68% → contingency 91%; provider failure/recovery final readback is recorded in DEMO_CHECKLIST. Build retains the existing MapLibre large-chunk warning.
- Concurrent frontend edits, including the typed simulation-context builder/export and integration docs, were inspected and preserved. This setup's code changes are limited to new backend DTO/tests/inventory and the explicit requirements line; no frontend/config source was edited by this task.
- Integrated real-data/agent/simulation slice: NOT_STARTED. Documentation and DTOs are not proof of those capabilities.
- Next gate: C coordinates contract changes; owners claim their first bounded task and exchange concrete artifacts in HANDOFFS.
- Current follow-up (2026-10-04 14:42 Europe/Dublin): historical setup evidence above predates commits `75e76f5`/`f5a6f2c`. C's HTTP/run boundary and D's spatial slice are now available; 54 backend checks pass after compatibility updates. Gate 4 remains incomplete because production baseline, transport snapshot reader and D's HTTP provider/proxy are pending. Proposed transport fields are ready for B/D review; no new consumer acceptance implied.

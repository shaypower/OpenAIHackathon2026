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

- State: NOT_STARTED — objective/model/tool orchestration and civic HTTP routes.
- Exists: `GET /api/` health and FastAPI docs; importable v1 shared DTO layer and ownership/target contracts from this setup.
- All ten requested civic endpoints: PLANNED. No model runtime, run store, SSE, server cancellation or deterministic tool facade exists.
- First task: status/source readers and a validated objective → bounded baseline run boundary, preserving health.
- Deliver to D: actual OpenAPI/readback samples, errors, run lifecycle, capability/data-mode labels; coordinate development proxy.
- Blocker: B's real tools pending; use explicit test stubs without pretending they are completed integrations.
- Last owner update: unclaimed; setup inspection only.

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

# Handoffs — exact interfaces and shared-file changes

Edit only your own block. C owns the integration block and lands shared-file edits. Include a new entry rather than rewriting another person's request. Acknowledgement/acceptance must be recorded by the actual consumer, not inferred from elapsed time.

Every handoff needs: date/time (Europe/Dublin), producer → consumer, status (PROPOSED/READY/ACCEPTED/BLOCKED), paths/commit, exact input/output example, data mode, validation command/result, affected shared files/fields, compatibility and next action. Plans must not get invented commit IDs or acceptance.

## PERSON_A → B/C

No deliverable yet. Next: snapshot ID/path/checksum, counts, CRS/vintage, provenance, unknown cohort fields, reader output and actual validation command. If requesting a schema/dependency change, name old/new shape and both consumers before editing shared files.

## PERSON_B → A/C/D

No deliverable yet. Next: simulation facade imports/signatures, dated fixture, supported change kinds, candidate limits, exact deterministic result/error and checks. Route/math changes stay in B's zone; C mounts tools/API and D maps rendering.

## PERSON_C → A/B/D

### Status/source API — 2026-10-04, 14:00 Europe/Dublin

- Producer → consumers: C → A/B/D; status: READY, bootstrap HTTP slice verified; no commit created.
- Paths: `backend/api/` (health, status, sources, HTTP models/errors), `backend/tests/orchestration/test_bootstrap_api.py`, `backend/requirements-dev.txt` (`httpx>=0.28,<1`, includes production requirements).
- Shared changes: `backend/main.py` composes routers/error handling, preserving `GET /api/` exactly; README documents virtualenv/start/test commands and current capability limits; API_CONTRACTS promotes only status/sources and records their wire shapes. C's STATUS/HANDOFFS blocks updated. No shared domain field or production dependency change.
- Input examples: `GET /api/status`, `GET /api/sources` (no parameters); both use `{"schema_version":1,"data":...}`. Verified status data has `status="degraded"`, `data_mode="synthetic"`, only status/sources capabilities IMPLEMENTED, empty supported-region/change lists, null limits and `run_store.storage="unavailable"`. Full fields are in API_CONTRACTS/models/OpenAPI.
- Source readback: data exactly matches `backend/data/source_inventory.json` (11 entries; `real_civic_datasets_ingested=0`; PLANNED/BUNDLED/REMOTE_CONTEXT preserved). Updates are read per request. Real context/source labels do not activate backend analysis.
- Error readback verified in HTTP tests: missing inventory → 503 `{"schema_version":1,"error":{"code":"sources_unavailable","message":"Source inventory is unavailable.","request_id":"<generated UUID>","retryable":true,"details":{}}}`. Invalid inventory → 503 `invalid_source_inventory`, nonretryable. No filesystem paths/exception values returned.
- A: reader expects the current inventory fields; acquisition timestamp/public URL required for INGESTED, unique IDs and consistent ingestion count. Additional error/acquisition fields need a paired DTO update. B: no facade imported yet. D: readers use snake_case, are independent of the mock analysis provider, and must retain degraded/synthetic labels; frontend proxy/HTTP adapter is still pending.
- Checks: `.venv/bin/python -m unittest discover -s backend/tests/orchestration -p 'test_*.py' -v` → 12 passed; matching domain discovery → nine passed. Live `curl --fail --silent --show-error` against `/api/`, `/api/status`, `/api/sources`, `/api/openapi.json` on port 8765 → all 200; health bytes and inventory exact-match assertions passed; schema paths exactly those three application routes. Verification used Python 3.14, FastAPI 0.142.2, Pydantic 2.13.5, httpx 0.28.1; test client emitted an upstream httpx deprecation warning, with no failed checks.
- Start: activate project environment, install `backend/requirements.txt`, then `python -m uvicorn backend.main:app --reload`. For test dependencies use `backend/requirements-dev.txt`. Temporary live verification server was stopped. No job lifecycle/polling/cancellation exists in this slice.
- Consumer acknowledgement: pending; no acceptance implied.
- Next: objective compiler + bounded run boundary; B/C agree exact facade inputs, D/C agree local proxy and bootstrap adapter.

### Objective compilation + run boundary — 2026-10-04, 14:20 Europe/Dublin

- Producer → consumers: C → A/B/D; status: READY for review; no commit created or consumer acceptance implied.
- Owned paths: `backend/agents/objectives.py`, `backend/orchestration/{errors,execution,service,store}.py`, new objective/run/dependency/router modules and HTTP models in `backend/api/`; focused API/run tests in `backend/tests/orchestration/`. The MOCKED backend exists only in test fixtures.
- Shared changes: `backend/main.py` now has an app factory and lifespan shutdown; shared DTOs and production requirements unchanged. Existing health bytes preserved. API_CONTRACTS/README and C owner/status/handoff docs updated. Existing user changes to `package-lock.json` were preserved.
- Added HTTP validation input: `POST /api/objectives/validate {"text":"Make primary healthcare reachable within 30 minutes for elderly people without cars in rural Tipperary."}`. Output envelope contains a `CivicObjective` with `maximum_journey_minutes=30`, age 65/no-car cohort, `parser_mode="deterministic_template"`, `evaluable=false`, assumptions and limitations. This is fixed grammar, not an OpenAI/model integration. Missing bound is disclosed as default 45; unsupported intent/geography/cohort rejected.
- Verified default analysis request: contracted text/departure/timezone/dataset/config/request-ID fields → 503 `simulation_unavailable`, retryable, `details={"objective_validated":true,"parser_mode":"deterministic_template"}`; no run/replay entry. Unknown/expired/evicted/restarted run → 404 `run_not_found`. Request/HTTP errors now use schema-versioned envelopes; 422 details contain safe locations/codes, without raw submitted values.
- Conditional acceptance: with a registered adapter, `POST /api/objectives/analyse` returns contracted 202 body; request fingerprint binds method + normalised payload in the single local process. Exact replay returns original acceptance, including queued status; different payload/method gives 409. Rejected requests do not bind keys. One active run/process gives 429; duplicates still replay. Replay retention follows run retention.
- Readback shape change for D: `GET /api/runs/{id}` data includes `run`, `assumptions`, `limitations`, empty `ranking`, and additive `tool_trace` actions (`action_id/tool/status/input_refs/output_ref/started_at/ended_at/error_code`). Running traces represent actual execution; counts/times/evidence come only from validated tool results. Baseline has calculated `before` and null `after`; failed/cancelled results have no successful metrics. Frontend adapter/proxy remains D's work; preserve its mock workflow until this is connected.
- B integration seam (proposed adapter interface, not claimed B facade): `backend.orchestration.service.BaselineBackend` exposes `capabilities: BackendCapabilities`, pure/bounded `validate_inputs(BaselineInputs) -> None`, and cooperative `async run_baseline(BaselineInputs, ExecutionContext) -> BaselineResult`. Inputs pin objective JSON, dataset IDs, demand config, dated departure and timezone; capabilities pin mode/engine/version and known registries. B must resolve real immutable snapshot IDs, validate joint cohort/date/config compatibility before acceptance and return calculated metrics/accessibility/journeys/evidence/provenance/limitations. No B code was edited/imported. Register an adapter only after producer/consumer checks; production currently sets backend=None.
- Bounds/restart: 1 active run/process, 12 tool actions, 20 candidate reservations, one refinement, 30-second cooperative deadline; candidate workflows are not implemented. Store 100 records/1-hour TTL from acceptance; active records kept until terminal, oldest completed evicted at capacity. All run/replay records lost on restart/expiry/eviction; single worker. Async timeouts cannot preempt blocking routing, so B must bound/isolate it. No public cancellation; browser abort stops observation only. Shutdown cancels pending cooperative jobs.
- Checks: `.venv/bin/python -m unittest discover -s backend/tests/orchestration -p 'test_*.py' -v` → 35 passed; shared domain discovery → nine passed. Tests cover explicit/default bound, non-Tipperary/cohort/instruction rejection, timezone/extra-field validation, 503 with no data/backend, queued/running/success/failed/cancelled states, actual HTTP readback, immutable snapshots, duplicate/conflicting replay, capacity, deadline, candidate/refinement counters, expiry/eviction/restart and invalid tool outputs. Live HTTP on port 8765 verified 200 health/status/schema/validation, 503 analysis, 404 run; typed body assertions and exact health bytes passed. Six application paths in OpenAPI; verification server stopped. Upstream TestClient httpx deprecation warning persists without failures.
- Implementation references: Context7 tools were unavailable; matching primary [Python 3.14 asyncio task/cancellation docs](https://docs.python.org/3/library/asyncio-task.html) and [Pydantic validator docs](https://docs.pydantic.dev/latest/concepts/validators/) were reviewed. No new dependency or paid model call added.
- Next: B supplies a validated deterministic adapter/fixture; D maps new response/error fields and aligns proxy/polling deadlines. A's inventory/snapshots remain unchanged. No acknowledgement from another owner has been inferred.

## PERSON_D → A/B/C

Existing frontend boundary: `src/frontend/domain/contracts/providers.ts`; composition: `src/frontend/app/main.tsx`; mock vertical slice: `adapters/mock/providers.ts`; state/events: workspace reducer + `domain/events/index.ts`. These are existing user work, not newly completed by this handoff.

Concurrent changes add `domain/models/simulation.ts`, the workspace context builder and JSON export, `docs/SIMULATION_INTEGRATION.md` and a synthetic exported example. Simulation providers now accept a serialisable simulation-context request separately from tracing/cancellation. These edits were preserved; team API docs remain the planned wire source and explain the mapping to server-authoritative IDs/context. Do not replace the frontend envelope from another stream.

Backend gaps to agree: services/transport/stress bootstrap endpoints; pinned run inspection; Polygon/MultiPolygon; nullable demographics; no-car household units; optional confidence; unscored candidates; lifecycle versus mock verified/degraded/repaired status; snake_case mapping; dev proxy and longer job deadline. D owns frontend changes; do not edit TS models from three workstreams.

## INTEGRATION — setup record, 2026-10-04

- Status: READY for team review; no team acceptance implied.
- Producer → consumers: handoff setup → A/B/C/D.
- New paths: `docs/team/` requested documents; `backend/domain/__init__.py`, `models.py`, `test_contracts.py`; `backend/data/source_inventory.json`.
- Shared files changed: root `README.md` (append team entrypoint only), `backend/requirements.txt` (direct `pydantic>=2.9,<3`). `backend/main.py`, frontend code/config/dependencies, DESIGN and existing architecture/demo files remain untouched by this task.
- Reason: Python DTO consumers need an explicit Pydantic v2 boundary; FastAPI already depends on Pydantic. No solver/model/UI package added.
- Compatibility: legacy health unchanged. New DTOs are not yet wired to routes/frontend. Snake_case wire DTOs intentionally require a D-owned adapter; do not substitute them directly for current TS models. Schemas reject extra fields; coordinated additive updates may require paired consumer changes.
- Source evidence: no real civic ingestion verified. Existing fixtures/context listed separately; no government records or baseline simulations manufactured.
- Checks: nine shared Python contract tests pass; frontend typecheck/lint/eight tests/build pass; live health/OpenAPI and TestClient confirm existing route behaviour and absent planned GET routes. Team file count, required owner sections, Markdown links, inventory counts/paths, Python syntax and diff whitespace checks pass. Safari's mock baseline/intervention/flood/contingency path was observed; recovery details are in DEMO_CHECKLIST. Current package-range install succeeds on Python 3.14.8 with Pydantic 2.13.5; an old pinned 2.9.2 verification attempt could not build on that interpreter and is not the project pin.
- Next action: each owner claims the first task in their file; C coordinates any contract amendment with actual producer/consumer acknowledgements and lands shared patches once.

## Shared change request template

Copy into **your** block and fill actual values:

```text
Timestamp:
Producer → consumer:
Status:
Paths / commit:
Input example:
Output / error example:
Data mode and provenance:
Validation command + observed result:
Shared file / exact field change:
Compatibility / migration:
Consumer acknowledgement:
Next action / blocker:
```

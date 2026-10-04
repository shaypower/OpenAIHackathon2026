# Handoffs — exact interfaces and shared-file changes

Edit only your own block. C owns the integration block and lands shared-file edits. Include a new entry rather than rewriting another person's request. Acknowledgement/acceptance must be recorded by the actual consumer, not inferred from elapsed time.

Every handoff needs: date/time (Europe/Dublin), producer → consumer, status (PROPOSED/READY/ACCEPTED/BLOCKED), paths/commit, exact input/output example, data mode, validation command/result, affected shared files/fields, compatibility and next action. Plans must not get invented commit IDs or acceptance.

## PERSON_A → B/C

No deliverable yet. Next: snapshot ID/path/checksum, counts, CRS/vintage, provenance, unknown cohort fields, reader output and actual validation command. If requesting a schema/dependency change, name old/new shape and both consumers before editing shared files.

## PERSON_B → A/C/D

No deliverable yet. Next: simulation facade imports/signatures, dated fixture, supported change kinds, candidate limits, exact deterministic result/error and checks. Route/math changes stay in B's zone; C mounts tools/API and D maps rendering.

## PERSON_C → A/B/D

No civic API deliverable yet. Next: HTTP request/response/error readbacks, actual OpenAPI paths, run lifecycle/restart/deadline behaviour, mapping needs and shared-file patch. Existing `GET /api/` remains the only application route.

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

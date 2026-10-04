# Handoffs — exact interfaces and shared-file changes

Edit only your own block. C owns the integration block and lands shared-file edits. Include a new entry rather than rewriting another person's request. Acknowledgement/acceptance must be recorded by the actual consumer, not inferred from elapsed time.

Every handoff needs: date/time (Europe/Dublin), producer → consumer, status (PROPOSED/READY/ACCEPTED/BLOCKED), paths/commit, exact input/output example, data mode, validation command/result, affected shared files/fields, compatibility and next action. Plans must not get invented commit IDs or acceptance.

## PERSON_A → B/C

Timestamp: 2026-10-04 Europe/Dublin.
Producer → consumer: Person A → B for data semantics/loader use; Person A → C for source inventory and future reader.
Status: READY; acceptance pending from B/C.
Paths: `backend/data/processed/tipperary-cso-2022-v1/{manifest.json,communities.json,provenance.json}`; acquisition manifest `backend/data/processed/source_manifest.json`; reproducible command `python -m backend.ingest_tipperary --download` (Tipperary boundary query; 60-second timeout, 512 MiB maximum per file, at most two retries); validation command `python -m backend.ingest_tipperary --process-only`.
Dataset ID: `tipperary-cso-2022-v1`; 640 communities; Census 2022 Small Area vintage; EPSG:4326; 0 rejected records. `communities.json` SHA-256: `af23f28df32e351cebb348344bb989a9eae4f35666e9a660a4a3ba7a2c28f4a7`.
Sample loader: `from pathlib import Path; from backend.ingest_tipperary import load_snapshot; manifest, communities, provenance = load_snapshot(Path("backend/data/processed/tipperary-cso-2022-v1"))`. Returns 640 validated `Community` DTOs and 2 resolving `Provenance` DTOs.
Population fields remain distinct: 167,895 residents, 29,356 people aged 65+, 6,921 households without a car. For every Small Area, `target_cohort_residents=null` and `cohort_method="unknown"`; services and scheduled journeys are absent. Source update dates are null where official metadata did not establish them. The separate exploratory county screen includes an explicitly labelled ecological proxy and is not the snapshot demand cohort or a validated accessibility result.
Checks run: 9 domain contract checks pass; 4 snapshot tests pass. Loader verifies checksums, Pydantic DTOs, provenance references, closed WGS84 polygon rings, finite/bounded coordinates and polygon validity. Pinned inputs and hashes are in `source_manifest.json`.
Compatibility: no shared model, dependency, frontend or API schema changes. `Community` and `PopulationProfile` output follows the agreed v1 model. GTFS ZIP SHA-256 `e3915c7dd1ecce224a6cc177e7005698aa51785c358e5aa50249eb5446fe1430`; its six required tables were streamed and checked for columns, unique primary IDs, stop/trip/route/service references, coordinate ranges, date/time syntax and service date bounds. Counts: 14,155 stops, 805 routes, 267,335 trips, 8,438,017 stop_times, 289 calendar rows, 1,927 calendar_dates; no errors detected; 2026-10-02 through 2027-10-03. Structural checks do not verify chronological or transfer feasibility and do not calculate journeys.
Next: B interprets service calendars/timezone and builds/tests the time-aware graph; B confirms whether any explicit demand estimate is acceptable and defines its policy. Until then, use only the published cohort as null/unknown. B/C should acknowledge snapshot loading. Healthcare facilities/hours remain unavailable.

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

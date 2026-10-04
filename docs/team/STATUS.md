# Status — evidence, not plans disguised as completion

Baseline inspected 2026-10-04 (Europe/Dublin). Update only your block; C owns integration. Use `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `READY_FOR_HANDOFF`, `VERIFIED`. Include timestamp, exact paths/artifacts, check evidence and next task. An IMPLEMENTED HTTP route may still use synthetic data; MOCKED local behaviour is not a route.

## PERSON_A

- State: READY_FOR_HANDOFF — first County Tipperary public-data snapshot.
- Exists: `backend/ingest_tipperary.py`; reproducible raw source manifest/checksums; 640-area snapshot in `backend/data/processed/tipperary-cso-2022-v1/`; full exploratory layers and QA report in `backend/data/processed/`.
- Real civic sources acquired and processed: **6** (CSO SAPS 2022, Tailte Small Area boundaries 2022, CSO MDSI01 2026, Pobal HP 2022, NTA GTFS snapshot, NTA NaPTAN). Source inventory records exact paths and acquisition times; update dates remain null when not known.
- Snapshot: 640 `Community` records, 2 shared `Provenance` records, 0 rejected; WGS84; age counts are persons, no-car counts are households. All 640 have `cohort_method=unknown` and `target_cohort_residents=null` because the joint age/no-car person count is not identified.
- Checks: `python -m unittest discover -s backend/domain -p 'test_*.py'` — 9 passed; `python -m unittest discover -s backend/tests/data -p 'test_*.py'` — 4 passed. Snapshot loader verified every model, file checksum and provenance reference.
- GTFS required tables structurally validated: 14,155 stops, 805 routes, 267,335 trips, 8,438,017 stop_times, 289 calendar rows, 1,927 calendar_dates; no detected key/format errors; calendar coverage bounds 2026-10-02 to 2027-10-03. This is not journey/transfer validation; B still needs to build and verify the time-aware graph. No healthcare location/service hours, OSM routing graph, road alerts, flood layer, LiDAR or Mapillary have been ingested.
- Last owner update: 2026-10-04; B/C consumer acknowledgement pending in HANDOFFS.

## PERSON_B

- State: READY_FOR_HANDOFF — deterministic synthetic transport slice.
- Exists: `backend/routing/gtfs.py`; `backend/simulation/service.py`; cohort weighting at `backend/accessibility/demand.py`; bounded search/ranking at `backend/optimization/`; transport tests and synthetic fixture at `backend/tests/transport/`.
- Supported: `TimetableChange` only, one per intervention, bounded ±30-minute shift. Candidate evaluation cap is 20; ranking uses weighted access gain, change count, then stable ID while operational/cost fields are null and flagged.
- Demonstration: 2026-10-05 07:25 Europe/Dublin baseline has 30/130 target-cohort residents reachable; +20 minutes recomputation yields 130/130; closing `ride:connection-trip:1` reruns to 10/130.
- Checks: 12 transport tests, 9 shared DTO tests, and Python compile check passed on Python 3.14 with Pydantic and `tzdata`. Measured the three-community fixture: 12 candidate shifts generated/evaluated in 7.1 ms; 11 passed the no-loss guard and one was rejected.
- Limits: synthetic only; no verified real feeds/population, vehicle blocks, capacity, costs, road routing, or polygon-to-edge intersection. C must add `tzdata` to backend requirements for Windows/IANA timezone support.
- Last owner update: 2026-10-04 14:35 Europe/Dublin.

## PERSON_C

- State: IN_PROGRESS — synthetic baseline and agent/tool integration VERIFIED; candidate HTTP and real-data analysis pending.
- Composition: retained A's GIS map/data/illustrative API in `backend/api/legacy.py`; app factory composes those routes with C's canonical health/source envelopes, without duplicate paths. Nine OpenAPI application paths.
- B integration: `SyntheticTransportAdapter` wraps B's actual synthetic facade in cancellable subprocesses. Fixes demand-config mapping without changing B's algorithms; default analysis stays 503, `CIVIC_ENABLE_SYNTHETIC_BASELINE=1` enables baseline 202/polling/readback. Mode stays synthetic and status degraded.
- Agent: optional structured compiler, controlled proposal/evaluation/ranking/refinement library and evidence-linked summaries. B's actual tools now produce a +20-minute winning change for the 90-minute fixture objective: 30/130 baseline → 130/130, 100 newly gaining access. Unknown costs remain null and the ranking limitation is preserved. Candidate library results are not HTTP child runs.
- D integration: pulled backend panel/provider/proxy retained; minimal paired mapping accepts both compiler modes, labels the configured compiler, and allows 12 seconds for the server's 10-second compilation deadline. Status/run HTTP requests retain 8-second timeouts. Map outcomes remain separately mocked.
- A readback: validated inventory reports six ingested civic sources. Four A snapshot tests pass. Marginal age/person and no-car/household counts still do not identify a joint cohort; real services/hours/walking/bounded feed are missing.
- Verification: 78 C orchestration/API/agent/transport integration tests, nine DTO tests, 12 B transport tests, four A data tests — 103 backend tests total. Frontend typecheck/lint/29 tests/build pass. Live opt-in HTTP: health exact, analysis 202 → succeeded 30/130 synthetic, sources six, OpenAPI nine paths. No paid model calls. Temporary server stopped.
- Limits: one worker; one active run/process; 12 actions/20 candidates/one refinement/30 seconds; memory 100 runs/one-hour TTL with restart/expiry/eviction loss. No public cancellation, candidate/stress/GeoJSON HTTP operations or server-authoritative map workflow yet. Model use needs explicit server key/model/rates/cost cap.
- Next: compose candidate child-run operations and GeoJSON from B's outputs, then D's analysis/map adapter. Keep real-data runs disabled until A/B validate the missing inputs.
- Git integration: Person C agent slice committed as `40810f6`; team work pulled through `70dc391`. User lockfile edit preserved separately.
- Last owner update: 2026-10-04 15:20 Europe/Dublin.

## PERSON_D

- State: **READY_FOR_HANDOFF** — C's available HTTP surface is connected and verified; complete analytical/map integration awaits A/B.
- Owner update: 2026-10-04 (Europe/Dublin), Person D. Owned paths: `src/frontend/`, frontend Vite proxy and D-owned architecture/demo/design docs and status/handoff sections.
- Delivered: existing connected transport/replay slice plus separate validated `BackendProvider`, status/source inspection, explicit backend objective-validation mode, nullable run readback and bounded snapshot polling. Failed fixture journeys now name and pin their last confirmed stop and offer a jump to that leg.
- Data mode: synthetic demo remains explicitly selected; public captured route geometry is geographic context. Backend validation does not analyse or replace synthetic map results. Live C reports degraded/synthetic and baseline PLANNED; no analytical datasets or simulation engine were invented.
- Checks: frontend typecheck, lint, **28 tests / eight files**, production build; C's **35 orchestration + nine domain tests** pass. Playwright Chromium production preview on 4174 exercised real status/sources/template validation, unsupported geography, unknown-run errors, network loss/recovery, desktop/tablet/mobile and the complete 57→94→68→91 demo. Run lifecycle UI was separately exercised with C's explicitly synthetic test fixture. Normal production walkthrough console: zero errors/warnings. Existing MapLibre chunk warning remains.
- Backend boundary: same-origin `/api` dev/preview proxy is implemented. HTTP unknown JSON is normalized outside UI; null metrics remain unknown, no error falls back to fixture success. No analysis POST until authoritative datasets, dated demand and B's engine exist. No backend or other owners' sections changed.
- Next task: consume A/B's validated analytical snapshots and computed runs, then map result communities/journeys/evidence/geometry behind existing providers. C's metadata/compiler/readback boundary acknowledged in D's HANDOFFS section; broader agent/simulation integration remains open.

## INTEGRATION — C coordinates

- Setup: four owner files, ownership matrix, target API/tool/data contracts, integration gates, handoff/decision/demo docs, shared DTOs and honest source inventory added.
- Preserved: existing frontend/mock workflow and backend route composition; README updated by append only; direct Pydantic dependency added for shared DTOs. No user work staged, committed or moved.
- Initial working tree: HEAD `f6cddbe`; README modified; substantial frontend/config/docs untracked. Do not claim a clean baseline or assume fresh worktrees contain the UI.
- Verification this setup: nine Python contract checks passed on Python 3.14.8/Pydantic 2.13.5; frontend typecheck, lint, eight tests and production build passed. Inventory paths/counts and all team Markdown links validated. Live `/api/` returned `{"status":"ok"}` and OpenAPI still lists only `/api/`; TestClient also verified docs and absent planned GET routes. Safari exercised objective → Borrisoleigh/journey → candidate C → 94% → flood 68% → contingency 91%; provider failure/recovery final readback is recorded in DEMO_CHECKLIST. Build retains the existing MapLibre large-chunk warning.
- Concurrent frontend edits, including the typed simulation-context builder/export and integration docs, were inspected and preserved. This setup's code changes are limited to new backend DTO/tests/inventory and the explicit requirements line; no frontend/config source was edited by this task.
- Integrated real-data/agent/simulation slice: NOT_STARTED. Documentation and DTOs are not proof of those capabilities.
- Next gate: C coordinates contract changes; owners claim their first bounded task and exchange concrete artifacts in HANDOFFS.
- Current follow-up (2026-10-04 14:42 Europe/Dublin): historical setup evidence above predates commits `75e76f5`/`f5a6f2c`. C's HTTP/run boundary and D's spatial slice are now available; 54 backend checks pass after compatibility updates. Gate 4 remains incomplete because production baseline, transport snapshot reader and D's HTTP provider/proxy are pending. Proposed transport fields are ready for B/D review; no new consumer acceptance implied.

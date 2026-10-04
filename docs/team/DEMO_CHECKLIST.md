# Demo checks — prove the mode being shown

Use [docs/DEMO.md](../DEMO.md) for the existing 90-second path. This checklist adds backend/integration truth and failure gates. “Passed” requires an observed command/client result; leave future capabilities unchecked. Existing UI and new ownership docs must not imply the absent 48/110 simulator was recovered.

## Start/reset

From repository root, `npm ci` then `npm run dev`; open http://127.0.0.1:5173. No model keys/database/backend required for mock mode. Backend separately: install `backend/requirements.txt` in your environment, `uvicorn backend.main:app --reload`; health is http://127.0.0.1:8000/api/. Port 8000 `/` is not the frontend.

Choose **Reset demo** before each rehearsal. It aborts client operations, clears results/selection and resets camera; offline preference remains. Reload to reset the one-shot `/?fail=once` fault. Reset twice and confirm old events don't reappear.

## Existing synthetic UI

- [x] Header/footer and workflow clearly identify synthetic analytics; basemap context isn't described as analytical proof. Evidence source labels also checked in fixture code; evidence panel not reopened in this rehearsal.
- [x] Analyse supplied objective; select Borrisoleigh; baseline **57%**, 45-minute objective/90% illustrative target.
- [x] Inspect journey: 08:17 arrival misses 07:53 connection by 24 minutes; UI calls it illustrative, not routing output.
- [x] Generate interventions, select **C / Feeder + mobile clinic**, apply/simulate, before **57%** / after **94%**.
- [x] Stress test **Flood event**: **68%**, **1,421 synthetic network residents**; do not frame this as Borrisoleigh's cohort.
- [x] Generate contingency: **91%**; explain preset mock result, not recomputed routing or a real model decision.
- [ ] Optional 3D site/Enter site: online basemap buildings versus separate **schematic** site; no survey/CV/splat claim.
- [ ] Repeat from Reset demo; cancel during analysis and confirm no late success.
- [ ] Offline map retains local synthetic workflow; missing road/building detail explained. Keyboard community controls work if WebGL fails.
- [x] `/?fail=once` displays bootstrap failure; Reset & retry restores all three communities and a new analysis completes. Invalid short-goal handling was checked in code/unit tests, not re-entered in this Safari rehearsal.
- [ ] Desktop and ~390px mobile: no horizontal overflow; keyboard selection/focus restoration; reduced motion; console/failed requests checked.

## New shared boundary

- [x] `python -m unittest discover -s backend/domain -p 'test_*.py'`: nine structural DTO guardrails pass.
- [x] `source_inventory.json` parses, every bundled local path exists, no planned source has been marked ingested, real civic count remains zero.
- [x] Legacy `/api/` readback returns `{"status":"ok"}`; OpenAPI application paths accurately reflect implemented routes.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass; unrelated user work is preserved.

## Integrated deterministic/agent slice — future gates

- [ ] A's snapshot/provenance/vintage/joint cohort verified; missing fields remain unknown and licences are explicit.
- [ ] B's dated connection case recalculates exact baseline/candidate impact; closure removes actual paths and rerun degrades access.
- [ ] C compiles an objective, invokes bounded actual tools, stores truthful phases/result/evidence; model cannot write metric fields.
- [ ] D browser sends actual HTTP, validates payload, uses same snapshot/run for map and metric/inspection, distinguishes preview from verified outcome.
- [ ] One different supported objective/time bound works; unsupported geography/cohort is visible, not silently converted to fixed demo.
- [ ] Model/backend timeout or missing key gives explicit failure/labelled fallback; no fixture result presented as successful live execution.
- [ ] Duplicate/conflicting mutation IDs, stale run/snapshot, cancellation/expiry and malformed output are exercised.
- [ ] Source/API statuses updated only after actual readback. No claim of all intervention types, persistent runs, live alerts or real demographic optimisation without evidence.
- [ ] Two clean rehearsals from reset, with reproducible input/date/data IDs and last verified artifact retained.

## Verification record for this setup

Date: 2026-10-04, Europe/Dublin. This section is populated only after actual checks. Prior UI evidence lives in `docs/design/VERIFICATION.md`; it is not a substitute for current verification.

- Commands/API readback: Python 3.14.8, Pydantic 2.13.5, FastAPI 0.142.2 in a temporary verification environment; nine contract tests passed. Frontend typecheck/lint/eight Vitest tests/build passed. Live health/OpenAPI readback confirmed only `/api/` as application operation; isolated TestClient confirmed docs and planned GET routes still 404. Links/owner sections/inventory paths/counts/diff whitespace verified. Current dependency range installed successfully; old Pydantic 2.9.2 could not build on Python 3.14. Existing large MapLibre chunk warning remains.
- Browser/runtime/path/failure: native Safari via computer use at the existing port-5173 dev server. Observed objective → Borrisoleigh 57% → illustrative journey → candidate C → simulated 94% → flood 68%/1,421 network residents → contingency 91%. `/?fail=once` visibly produced the provider error; Reset & retry restored three communities, a new analysis completed, and Reset demo returned to the initial ready state. An attempted cancel hit an expired native control after the brief analysis had completed; no successful browser cancellation is claimed. Cancellation remains covered by existing frontend unit tests and prior QA evidence, with live cancellation unchecked above.
- Rehearsal scope: desktop native UI only. This documentation/DTO task did not redo mobile, reduced-motion, console/network inspection, site modal or two full rehearsals. Those remain unchecked above; prior frontend evidence is documented separately. No integrated deterministic/model/API workflow was claimed.
- Current capability limit: all civic backend workflows remain planned; UI outcomes remain synthetic fixture values.

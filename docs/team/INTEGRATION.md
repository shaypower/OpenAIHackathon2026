# Integration without broad shared-file edits

## Dependency order

```text
A: versioned normalised snapshot + provenance ──→ B: deterministic simulation facade
                                                       │
                                                       ↓
                        C: typed tools + run lifecycle + HTTP DTOs
                                                       │
                                                       ↓
                        D: validating provider adapter → existing workspace/map
```

All four owners can begin now. B uses tiny synthetic fixtures; C uses a labelled facade stub; D uses labelled wire fixtures and the existing mock provider. A's data does not have to be complete for the other three to start. Stubs become real only when their dependency passes a gate.

## Gate 0 — preserve the current checkout

At setup, HEAD is `f6cddbe` (initial structure). README is modified and most frontend/config/docs files are untracked. No user work has been staged or committed by this task. Independent worktrees created now would miss the uncommitted prototype. The owner must explicitly share/commit that work before others rely on a worktree. Check current state again; this snapshot is not a live Git lock.

Use one clone/worktree per person. Single-writer zones apply even when paths are disjoint. Do not change another checkout's branch, stash, delete files or bulk-stage user work. Preserve package-lock and npm. Leave `frontend/` / `ai/` placeholders alone. Record test failures that predate your changes instead of quietly overwriting files.

## Gate 1 — shared contracts (available now)

`backend/domain/models.py` is a dependency-light Pydantic v2 DTO layer. It imports no routing, agent, HTTP or persistence modules. `python -m unittest discover -s backend/domain -p 'test_*.py'` checks structural boundaries. [API_CONTRACTS](API_CONTRACTS.md) gives semantic invariants, request/response shapes and mappings; planned requests/HTTP wrappers are not implemented models/routes yet.

Current follow-up: objective/run HTTP wrappers are implemented in `backend/api/models.py`; proposed connected transport wrappers are implemented in `backend/api/transport_models.py` while their route is still planned. The transport proposal adds `edges`/geometry `sources`, matches D's capture after projection and awaits B/D agreement. Keep display IDs separate from B's canonical graph IDs.

Before a shared edit, producer and consumer post exact fields/examples to HANDOFFS. C integrates schema first; D updates mapping/types in a separate commit. Field addition is not automatically wire-compatible: models reject extras. Required/type/meaning changes need a schema version or an agreed paired update. Never resolve a conflict by deleting a colleague's field or weakening validation with arbitrary dictionaries/casts.

## Gate 2 — A → B: real input

Acceptance: one snapshot manifest with dataset ID, geography vintage, acquisition time, checksum, file paths, counts, CRS, data mode and missingness; records validate; provenance IDs resolve; age/no-car intersection method is stated. B's loader test consumes that exact snapshot. A updates inventory only after readback. Public source discovery and a download archive alone fail this gate.

If blocked: a separately named synthetic snapshot passes the format gate with synthetic labels. It does not pass real-data readiness. Keep real and synthetic snapshots separate; do not mutate a baseline under an active run.

## Gate 3 — B → C: deterministic facade

Acceptance: agreed facade functions in `backend/simulation/service.py`, supported-change list, deterministic baseline/candidate/stress outputs and errors. Exact dated missed-connection fixture passes before/after plus closure tests. Same inputs produce same counts/legs/rank. Calls have candidate/runtime bounds. C owns run envelopes/lifecycle, B owns calculations.

If blocked: C may use an explicitly MOCKED facade in its own tests, not invented successful metrics in production. No new simulator is claimed merely because DTOs import.

## Gate 4 — C → D: HTTP and browser boundary

Acceptance: actual routes appear in `/api/openapi.json`; contract examples match HTTP responses; legacy `/api/` still works; queued → running → terminal state and error readback work; source/capability labels are accurate. D validates response JSON and adapts snake_case. Polling/deadline/expiry/idempotency are tested. Development proxy or origin configuration is coordinated; current app has neither.

Current evidence: six application paths, objective compilation (including D's default wording), truthful 503 dependency guard, run polling/replay/bounds tested with a MOCKED test-only backend. The default app registers no baseline adapter. D's native transport parser is implemented but does not parse HTTP envelopes. The gate remains incomplete until B's adapter and D's provider/proxy mapping work together.

Agent follow-up adds configurable structured model compilation, nullable model-use
receipts/tool summaries on readback, and a tested C candidate workflow library.
Exact B adapter/D mapping changes are in AGENT_IMPLEMENTATION/HANDOFFS. No live
model call, candidate HTTP operation or completed integration gate is implied.

If blocked: D keeps the existing mock provider. A backend failure must remain a failure; fallback is a user-visible separate mock mode, not a real run completed with fixture values.

## Gate 5 — end-to-end and demo freeze

Acceptance: one real-client objective → backend run → tool-calculated baseline → evaluated change → before/after → stress run → map/evidence result, plus recoverable backend/provider failure and reset. “Real client” describes the browser, not the data mode; a synthetic deterministic run stays synthetic. Rehearse the proven story twice using [DEMO_CHECKLIST](DEMO_CHECKLIST.md). Only then mark that integrated slice ready.

Freeze expansion after the verified slice. Add AdditionalDeparture, RouteExtension, NewStop, FacilityPlacement, broader data or specialist agents only when the core path is reliable and the team has actual time. No deadline was supplied, so these gates do not invent one.

## Shared-file mechanics

| File | Integrator | How to land a change |
| --- | --- | --- |
| `backend/main.py` | C | Owner supplies router import/include patch; no business logic |
| `backend/requirements.txt` | C | Explain actual need/version compatibility; consult official docs; install/test once |
| `backend/domain/*` | C after A/B/D input | Field example + invariants + affected mapping + compatibility/checks |
| Root README | C | Confirm command in clean environment; append accurate limits |
| Frontend manifests/configuration | D | Preserve npm/lockfile; justify proxy/library change; browser-test |
| API/team shared docs | C | Merge agreed entries once; owners edit only their status/handoff blocks |

Prefer owner-local route/test modules over everyone growing `main.py`. Stage precise paths, share commit IDs and validation evidence. Do not create new empty directory trees as “completed architecture.”

## Local run/check policy

Python dependencies belong in a per-checkout environment; keep virtualenv/cache out of commits. Install `backend/requirements.txt`, launch `python -m uvicorn backend.main:app --reload`, then inspect `/api/` and `/api/openapi.json`. The UI remains `npm ci` → `npm run dev` on port 5173. No frontend-serving route on FastAPI `/` exists.

Run owner tests, shared contract checks and frontend typecheck/lint/test/build for integrated changes. Browser QA must verify a consequential workflow and failure; do not rerun unrelated exhaustive checks after already passing without new evidence. Check source/provenance and final diff for accidental fixture/real mixing, credentials and unrelated work.

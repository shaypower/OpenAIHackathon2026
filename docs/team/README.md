# Start here: four async workstreams

Read your owner file, then [API contracts](API_CONTRACTS.md) and [integration order](INTEGRATION.md). Names are placeholders because no actual team roster is documented in this checkout. Rename them together; do not infer people from Git authors or a reference repository.

| Workstream | Start file | First independently useful deliverable |
| --- | --- | --- |
| PERSON_A — data + provenance | [PERSON_A_DATA.md](PERSON_A_DATA.md) | A validated, versioned Small Areas extract and honest source inventory |
| PERSON_B — transport + optimisation | [PERSON_B_TRANSPORT.md](PERSON_B_TRANSPORT.md) | A deterministic missed-connection fixture with before/after and closure tests |
| PERSON_C — agents + orchestration | [PERSON_C_AGENTS.md](PERSON_C_AGENTS.md) | Validated objective → deterministic baseline → retrievable run |
| PERSON_D — frontend + spatial UX | [PERSON_D_FRONTEND.md](PERSON_D_FRONTEND.md) | A runtime-validating HTTP provider behind the existing mock/real boundary |

## What is actually here

Inspection update: 2026-10-04 15:20 Europe/Dublin, after pulling A/B/D through `70dc391`.

- `backend/main.py` composes nine application paths, docs/OpenAPI, A's GIS root page and static assets. Health stays `{"status":"ok"}`; C's source reader uses the canonical envelope and reports six ingested sources.
- A's countywide processed data and validated 640-community snapshot are committed. The joint elderly/no-car cohort remains unknown; public geography/demographics are not a scheduled accessibility finding.
- B's deterministic synthetic fixture and timetable/closure tests are implemented. C's opt-in `CIVIC_ENABLE_SYNTHETIC_BASELINE=1` connects its baseline to accepted/polled runs through killable subprocesses; default analysis returns 503.
- C's optional OpenAI compiler, candidate workflow and B tool adapter exist. Actual synthetic candidate-library tests recompute 30/130 → 130/130 for the 90-minute fixture. Candidate HTTP/stress/GeoJSON composition and real-data runs remain pending. No paid model call has been made.
- D's React/Vite UI in `src/frontend/` now has a backend inspection panel, validated HTTP provider, run polling and `/api` proxy. It validates objectives and inspects supplied run IDs. The map analysis still uses its separate mock fixture story: 57% → 94% → flood 68% → contingency 91%.
- A's `frontend/index.html`, CLI and illustrative graph are retained as a separate GIS demo. They do not replace D's React workflow or B's dated solver.
- Connected display transport DTOs remain proposed; `/api/transport` is not mounted. Display graph IDs remain distinct from B's canonical engine IDs.
- Checks: 103 backend tests, frontend typecheck/lint/29 tests/build, live synthetic analysis acceptance/readback. See C STATUS/HANDOFFS and [agent setup](AGENT_IMPLEMENTATION.md) for configuration and remaining work.

## Editing zones

`(new)` paths are reserved destinations to create only as needed, not functioning modules. A file owner writes; other people read and hand off proposals. Tests belong to the same owner as the code they exercise.

| Zone | Owner | Others |
| --- | --- | --- |
| `backend/data/`, `backend/ingestion/` (new), `backend/sources/` (new) | A | Read; do not rewrite inventory or data |
| `backend/tests/data/` (new) | A | Read |
| `backend/routing/`, `backend/accessibility/`, `backend/optimization/`, `backend/simulation/` (all new) | B | Read; C calls public functions |
| `backend/tests/transport/` (new) | B | Read |
| `backend/agents/`, `backend/orchestration/`, `backend/api/` | C | Read; D requests adapter needs |
| `backend/tests/orchestration/` | C | Read |
| `src/frontend/`, including local mocks, models, adapters and tests | D | Read; propose changes through D |
| `backend/domain/`, including contract checks | Shared, C integrates | A/B/D propose additive contract changes; coordinate before editing |
| `backend/main.py`, `backend/requirements.txt` | Shared, C integrates | One writer; owner supplies a small patch in HANDOFFS |
| `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.js` | Shared, D integrates | One writer; preserve package manager/lockfile |
| Root `README.md` | Shared, C integrates | Submit command/limitation updates via handoff |
| `DESIGN.md`, `docs/design/`, `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/SIMULATION_INTEGRATION.md`, `docs/examples/` | D | Read; coordinate backend-related text |
| `docs/team/PERSON_*` | Named owner | Read |
| `docs/team/API_CONTRACTS.md`, `INTEGRATION.md`, `DECISIONS.md`, `DEMO_CHECKLIST.md`, this file | Shared, C integrates | Propose changes; no simultaneous broad rewrites |
| `docs/team/STATUS.md`, `HANDOFFS.md` | Everyone | Edit only your named section; C owns integration section |
| Legacy `frontend/`, `ai/` placeholders | Unassigned | Leave alone; do not start a duplicate application |

C's integration role is file coordination, not authority to change B's maths or A's data. D alone maps backend wire DTOs to frontend models.

## Working without a meeting

1. Inspect `git status --short` and read [STATUS](STATUS.md). Claim one task in your own section with a Dublin timestamp, paths, next output and blocker. A plan is not progress evidence.
2. Use your own clone or worktree/branch, e.g. `person-a/data`, `person-b/transport`, `person-c/orchestration`, `person-d/frontend`. Inspect the current working tree before branching; new worktrees inherit commits only. The backend and D's frontend are now committed through `75e76f5` and `f5a6f2c`; this C compatibility follow-up is uncommitted. Preserve existing user changes (including the npm lockfile); do not bulk-stage or stash someone else's work.
3. Keep one task per small commit. Stage explicit owned paths. Never run `git add .`, `git reset --hard`, `git clean`, or switch branches in another person's active checkout.
4. A shared contract change needs a handoff entry naming producer, consumer, fields, compatibility, example and checks. C lands the agreed contract first, then implementations. Required-field changes need A/B/D coordination; version-one consumers reject unknown fields.
5. Merge or cherry-pick one reviewed commit at a time; use [INTEGRATION](INTEGRATION.md) gates. Update only your STATUS/HANDOFFS blocks. Supply the next person an exact input artifact or function, not “backend done.”

All owners can begin immediately using explicitly synthetic fixtures. A feeds B's data boundary; B feeds C's tool boundary; C feeds D's provider adapter. The current browser demo remains available throughout.

## Commands from this repository root

```sh
npm ci
npm run dev
```

UI: http://127.0.0.1:5173. Install Python dependencies in your own environment, then:

```sh
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s backend/domain -p 'test_*.py'
python -m unittest discover -s backend/tests/orchestration -p 'test_*.py'
```

Backend: http://127.0.0.1:8000/api/. **Port 8000 `/` does not serve the UI.** Full frontend checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. No API key is needed for the current demo.

## Non-negotiable result boundary

Models interpret, propose and explain. B's deterministic engine computes feasibility, travel times, cohort counts, access, impact and ranking. C records tool outputs and D displays them. Synthetic and mixed inputs remain visible in records, run results and UI. Public basemap geography does not turn fixture analytics into real findings.

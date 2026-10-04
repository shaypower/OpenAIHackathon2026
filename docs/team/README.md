# Start here: four async workstreams

Read your owner file, then [API contracts](API_CONTRACTS.md) and [integration order](INTEGRATION.md). Names are placeholders because no actual team roster is documented in this checkout. Rename them together; do not infer people from Git authors or a reference repository.

| Workstream | Start file | First independently useful deliverable |
| --- | --- | --- |
| PERSON_A — data + provenance | [PERSON_A_DATA.md](PERSON_A_DATA.md) | A validated, versioned Small Areas extract and honest source inventory |
| PERSON_B — transport + optimisation | [PERSON_B_TRANSPORT.md](PERSON_B_TRANSPORT.md) | A deterministic missed-connection fixture with before/after and closure tests |
| PERSON_C — agents + orchestration | [PERSON_C_AGENTS.md](PERSON_C_AGENTS.md) | Validated objective → deterministic baseline → retrievable run |
| PERSON_D — frontend + spatial UX | [PERSON_D_FRONTEND.md](PERSON_D_FRONTEND.md) | A runtime-validating HTTP provider behind the existing mock/real boundary |

## What is actually here

Inspection date: 2026-10-04. The repository root is `OpenAIHackathon2026/`, not its parent directory.

- `backend/main.py` is a 14-line FastAPI composition root with **only `GET /api/`** (`{"status":"ok"}`). Docs: `/api/docs`; OpenAPI: `/api/openapi.json`.
- The working UI is React/TypeScript/Vite in **`src/frontend/`**. `frontend/` and `ai/` contain only `.gitkeep`. Preserve the map and provider interfaces already in place.
- UI data, objective parsing, interventions, simulations and stress effects are **MOCKED in the browser**. They make no civic backend calls. The objective text does not change the preset scenario.
- Existing fixture story: Borrisoleigh/Roscrea/Newport, Borrisoleigh **57% → 94% → flood 68% → contingency 91%**. These are illustrative values, not public findings or deterministic transport calculations.
- The pasted description's `frontend/index.html`, `backend/simulate_demo.py`, `north_tipperary_demo.json`, `demo_simulation_result.geojson` and old 29-feature/48-of-110 story are **absent**. Do not claim to have run that CLI, import nonexistent files, or mix those figures into this UI's demo.
- `backend/domain/models.py` now defines shared DTOs, not a simulator. `backend/data/source_inventory.json` records planned sources and existing context/fixtures; no real civic ingestion has been verified.

## Editing zones

`(new)` paths are reserved destinations to create only as needed, not functioning modules. A file owner writes; other people read and hand off proposals. Tests belong to the same owner as the code they exercise.

| Zone | Owner | Others |
| --- | --- | --- |
| `backend/data/`, `backend/ingestion/` (new), `backend/sources/` (new) | A | Read; do not rewrite inventory or data |
| `backend/tests/data/` (new) | A | Read |
| `backend/routing/`, `backend/accessibility/`, `backend/optimization/`, `backend/simulation/` (all new) | B | Read; C calls public functions |
| `backend/tests/transport/` (new) | B | Read |
| `backend/agents/`, `backend/orchestration/`, `backend/api/` (all new) | C | Read; D requests adapter needs |
| `backend/tests/orchestration/` (new) | C | Read |
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
2. Use your own clone or worktree/branch, e.g. `person-a/data`, `person-b/transport`, `person-c/orchestration`, `person-d/frontend`. **This checkout already has a modified README and substantial untracked frontend work.** New worktrees inherit commits only. Have the owner commit/share those existing files explicitly before branching from them; do not bulk-stage or stash someone else's work.
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
uvicorn backend.main:app --reload
python -m unittest discover -s backend/domain -p 'test_*.py'
```

Backend: http://127.0.0.1:8000/api/. **Port 8000 `/` does not serve the UI.** Full frontend checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. No API key is needed for the current demo.

## Non-negotiable result boundary

Models interpret, propose and explain. B's deterministic engine computes feasibility, travel times, cohort counts, access, impact and ranking. C records tool outputs and D displays them. Synthetic and mixed inputs remain visible in records, run results and UI. Public basemap geography does not turn fixture analytics into real findings.

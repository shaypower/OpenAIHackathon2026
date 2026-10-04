# Hackathon API

The FastAPI service lives in `backend/main.py`. Start it from the repository
root with:

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload
```

The health endpoint is `GET /api/`; interactive API docs are at `/api/docs`.

`GET /api/status` reports current backend capabilities. It currently returns
`degraded` in synthetic demo mode: no analysis dataset or simulation engine is
connected. A local memory run store and bounded executor are implemented.
`GET /api/sources` reads the source inventory without promoting planned or bundled
sources to ingested data. Both use `{"schema_version":1,"data":...}` envelopes;
an unavailable or invalid source inventory returns a structured HTTP 503 error.

Try `POST /api/objectives/validate` in `/api/docs` with:

```json
{
  "text": "Make primary healthcare reachable within 30 minutes for elderly people without cars in rural Tipperary."
}
```

The deterministic template parser preserves the requested time bound, discloses
its age/default assumptions and rejects unsupported intent/geography/cohorts.
It supports primary healthcare for elderly people without cars in Tipperary only;
it does not establish dataset availability or calculate impact.

`POST /api/objectives/analyse` validates its request but currently returns
`503 simulation_unavailable`: B's backend is not registered, so no run is created.
`GET /api/runs/{run_id}` reads accepted runs when that backend is connected;
unknown, expired, evicted or restarted runs return `404 run_not_found`.
Lifecycle acceptance/polling is tested with an explicitly MOCKED backend in tests
only; the production app never registers that fixture.

Local limits: one active run for the entire server, 12 tool actions, 20 candidate
evaluations, one refinement and a 30-second execution deadline. Candidate APIs
are still planned. Adapters must cooperate with async cancellation; B must bound
or isolate CPU-intensive routing. Use one Uvicorn worker. The store retains up to
100 runs, expiring completed records one hour after acceptance; active records
remain until terminal. At capacity, the oldest completed run is evicted. Runs and
duplicate-request records are lost on restart/expiry/eviction. Exact accepted
request replay returns the original acceptance; conflicting reuse returns 409.
No server cancellation route exists; stopping browser polling does not cancel work.

To run the backend checks:

```sh
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s backend/domain -p 'test_*.py'
python -m unittest discover -s backend/tests/orchestration -p 'test_*.py'
```

## CIVIC frontend skeleton

All frontend source is in `src/frontend/`. From this repository root:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The frontend runs independently of the API, with no keys required. All civic figures are labeled synthetic. OpenFreeMap provides geographic context, with a local offline-map fallback.

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` validate the frontend. See [frontend architecture](docs/ARCHITECTURE.md), [90-second demo](docs/DEMO.md), and [design contract](DESIGN.md).

## Async team ownership

Start with [docs/team/README.md](docs/team/README.md) for four workstreams,
editing zones, first tasks, [API contracts](docs/team/API_CONTRACTS.md),
[integration gates](docs/team/INTEGRATION.md), status and handoffs.

The current UI uses synthetic fixtures. The backend implements health, status,
sources, objective validation, analysis validation/dependency guards and run
readback. Actual simulation remains unavailable.
Shared Python DTOs are in `backend/domain/models.py`; planned public-data,
deterministic simulation and agent/API capabilities are explicitly marked.
No real civic dataset ingestion has been verified in this checkout. Run the
shared contract checks with `python -m unittest discover -s backend/domain -p 'test_*.py'`.

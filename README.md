# Hackathon API

The FastAPI service lives in `backend/main.py`. Start it from the repository
root with:

```sh
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

The health endpoint is `GET /api/`; interactive API docs are at `/api/docs`.

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

The current UI uses synthetic fixtures; the backend implements only `GET /api/`.
Shared Python DTOs are in `backend/domain/models.py`; planned public-data,
deterministic simulation and agent/API capabilities are explicitly marked.
No real civic dataset ingestion has been verified in this checkout. Run the
shared contract checks with `python -m unittest discover -s backend/domain -p 'test_*.py'`.

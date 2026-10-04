# Civic Access Lab — Data / GIS prototype

## Hospital demo — start here

```sh
bash scripts/demo.sh
```

Open **http://127.0.0.1:5173**. Choose **Nenagh · Tyone → Find a clear hospital site → Show nearby benefits on map**.
The launcher starts FastAPI on 8765 and the React app on 5173. If 5173 is occupied,
use `CIVIC_DEMO_WEB_PORT=5174 bash scripts/demo.sh`.

All three hospital options have captured OpenStreetMap buildings, roads, water and
green-space obstacles. The complete 4 ha envelope is rechecked before placement,
including 8 m building clearance and 15 m transport clearance. The API independently
checks the same geometry; the captured context also works offline. The 3D buildings
are proposed massing, and nearby existing building heights are illustrative.

The benefits view shows 1 km / 3 km distance zones and real Census 2022 Small Areas.
For the Nenagh proposal, nearby areas contain **10,578 residents**, including
**1,563 aged 65+**, and **735 households without a car**. These are whole-area counts
selected by area centre, not a prediction of patients, access gains or journey savings.
Planned bed capacity, diagnostics and the capital allowance update with 40/60/80 beds.
Export includes placement evidence and nearby population. Map clearance does not
establish land ownership, planning consent or a clinical business case.

The captured file is `src/frontend/public/data/hospital-context.json`, with source
URL, capture time, checksums and attribution. Hospital API: `GET /api/hospitals/context`
and `POST /api/hospitals/preview`. No API key is needed for this demo.

A small, map-first proof of concept for the hackathon question: **which rural communities are outside a chosen healthcare travel-time target, and how might an intervention change that?**

The repository has two distinct views. A countywide evidence map uses Census 2022 Small Areas and demographics, CSO published GP distance statistics, Pobal Electoral Division context, and TFI stop locations for all of County Tipperary. A separate pilot models a 45-minute journey for older residents without a car in a synthetic North Tipperary scenario and compares four network states:

- Baseline generalized journey times.
- Candidate rural feeder links.
- Baseline under hypothetical flood-related link closures.
- Candidate links under those same closures.

The journey simulation is intentionally labelled **synthetic and illustrative**. The real countywide layers provide geographic and demographic context, but do not calculate scheduled door-to-door journeys. The downloaded GTFS archive has not yet been validated as a route graph; healthcare opening hours, capacity, OSM walking routes, OPW flood scenarios, LiDAR, Mapillary and local authority layers are not integrated. Exploratory screening candidates use an explicitly labelled ecological proxy and are not validated demand or accessibility findings. Do not use the simulation or screening list to select a real site or set a public timetable.

## Run the map

From the repository root:

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload
```

Open <http://127.0.0.1:8000/> for the interactive map or <http://127.0.0.1:8000/api/docs> for the API. Choose a baseline, candidate-link or flood scenario and adjust the access threshold. Click a locality to compare its four assumed travel times.

## Run and export the simulation

```sh
python -m backend.simulate_demo --mode intervention --target 45
```

This runs the graph calculation and writes map-ready GeoJSON to `backend/data/demo_simulation_result.geojson`. Other modes are `baseline`, `flood_baseline` and `flood_intervention`. The API also accepts:

```sh
curl -X POST http://127.0.0.1:8000/api/simulations/accessibility \
  -H 'Content-Type: application/json' \
  -d '{"mode":"intervention","target_minutes":45}'
```

`GET /api/sources` returns the dataset inventory and standardization plan.

## Calculation

Each locality is a demand node with an illustrative count of older residents without a car. Walking links connect it to an illustrative stop; precomputed journey-time links connect stops to placeholder healthcare hubs. Dijkstra's shortest-path calculation returns generalized minutes to the nearest hub. The intervention adds alternative feeder links. The flood mode removes the designated baseline edges before recalculating. Coverage is the sum of target-group residents in localities at or below the selected threshold.

The demo graph uses fixed journey costs. It does not model GTFS departures, date-specific calendars, changing wait time, repeated services, hospital appointment windows, walking accessibility for individuals, capacity, costs, road network geometry, uncertainty or competition for service. A real analysis should calculate departure-specific door-to-door paths from validated datasets and report a range of scenarios.

## Data inventory and next ingestion steps

See [`backend/data/source_inventory.json`](backend/data/source_inventory.json) for source URLs, acquisition state, licenses, paths and known limitations. The validated Person A snapshot is `backend/data/processed/tipperary-cso-2022-v1/`; acquisition checksums and timestamps are in `backend/data/processed/source_manifest.json`.

Suggested order for a defensible first Tipperary run:

1. Agree with Person B whether an explicit estimated target cohort is acceptable; the current shared snapshot leaves the age-65+/no-car intersection null because separate person and household totals do not identify it.
2. Validate all GTFS tables and service validity with Person B, then calculate time-dependent journeys for a dated departure and appointment arrival window.
3. Add verified GP/pharmacy/primary-care locations with source, service type, opening/access details and date; compare straight-line results with the CSO distance-to-services baseline.
4. Add OSM walking/road connectivity, then evaluate OPW flood scenarios against affected links once license and scenario metadata permit. Add Tipperary Council layers when their metadata and refresh cadence are recorded.
5. Use LiDAR and Mapillary for a selected-site audit only when coverage, resolution, capture date and terms are appropriate.

Keep native files immutable, record retrieval time, licence/terms and checksum, retain raw source IDs, and produce standardized GeoJSON (WGS84) for map exchange plus a projected metric layer for distance/area work. Never silently mix geography vintages or substitute distance for scheduled travel time.

## API routes

- `GET /api/` — health.
- `GET /api/sources` — source and standardization inventory.
- `GET /api/simulations/accessibility/demo` — default 45-minute intervention GeoJSON.
- `POST /api/simulations/accessibility` — GeoJSON and outcome comparison for a selected scenario.

The health endpoint is `GET /api/`; interactive API docs are at `/api/docs`.

`GET /api/status` reports current backend capabilities. It currently returns
`degraded` in synthetic demo mode. The default does not enable analysis; an
explicit opt-in connects B's deterministic miniature fixture. A local memory run
store and bounded executor are implemented.
`GET /api/sources` reads the source inventory without promoting planned or bundled
sources to ingested data. Both use `{"schema_version":1,"data":...}` envelopes;
an unavailable or invalid source inventory returns a structured HTTP 503 error.

Try `POST /api/objectives/validate` in `/api/docs` with:

```json
{
  "text": "Make primary healthcare reachable within 30 minutes for elderly residents without cars in rural Tipperary."
}
```

The deterministic template parser preserves the requested time bound, discloses
its age/default assumptions and rejects unsupported intent/geography/cohorts.
It accepts “elderly people” or “elderly residents” without cars in Tipperary;
it does not establish dataset availability or calculate impact.

`POST /api/objectives/analyse` returns `503 simulation_unavailable` by default.
To enable B's **synthetic deterministic** baseline, start:

```sh
CIVIC_ENABLE_SYNTHETIC_BASELINE=1 python -m uvicorn backend.main:app --reload
```

Submit this example in `/api/docs`:

```json
{
  "text": "Make primary healthcare reachable within 90 minutes for elderly residents without cars in rural Tipperary.",
  "departure_at": "2026-10-05T07:25:00+01:00",
  "timezone": "Europe/Dublin",
  "dataset_ids": ["synthetic-small-areas-v1", "synthetic-transit-v1"],
  "demand_config_id": "synthetic-demand-v1",
  "client_request_id": "demo-baseline-1"
}
```

Poll the returned `poll_url`: the completed synthetic baseline has 30 of 130
cohort residents reachable. A 45-minute objective gives 10 of 130. The two input
IDs name the miniature fixture's inputs, not A's real data. Each calculation runs
in a cancellable subprocess. Unknown, expired, evicted or restarted runs return
`404 run_not_found`.

## Person C agent work

An optional OpenAI objective compiler supports paraphrases within the same
primary-healthcare/age-65+/no-car/Tipperary scope. Default mode remains the template
parser. Model mode requires a server-side key, model ID, price rates and cost
ceiling; install `backend/requirements-agent.txt`. See
[agent setup and limits](docs/team/AGENT_IMPLEMENTATION.md) before enabling it.
Live model use is unverified; model/SDK checks use injected responses without
paid calls.

The controlled candidate workflow generates proposals, calls an injected
simulator, preserves its ranking and allows one refinement within shared budgets.
It now calls B's actual synthetic proposal/simulation/ranking tools through
`backend/orchestration/transport_adapter.py`; candidate HTTP endpoints remain
planned. Successful run readback includes a tool-based `agent_summary` and optional
compilation `model_usage` receipt. D's backend panel reads status, sources,
objective validation and supplied run IDs through its Vite proxy. The map's
57/94/68/91 workflow still uses D's separately labelled mock providers.

Local limits: one active run for the entire server, 12 tool actions, 20 candidate
evaluations, one refinement and a 30-second execution deadline. Candidate APIs
are still planned. The opt-in B/C transport adapter kills and reaps its worker
on cancellation/deadline. Use one Uvicorn worker. The store retains up to
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

The current React UI uses synthetic fixtures while the FastAPI map exposes the countywide data layers.
The backend also implements health, status,
sources, objective validation, analysis validation/dependency guards and run
readback. Synthetic baseline execution is available with the explicit opt-in;
real-data analysis remains unavailable.
Shared Python DTOs are in `backend/domain/models.py`; planned public-data,
deterministic simulation and agent/API capabilities are explicitly marked.
Proposed connected transport DTOs are in `backend/api/transport_models.py`, matching
D's display network through snake_case mapping. `/api/transport` is not mounted.
Real source ingestion is verified for the listed Person A layers; a time-aware
civic accessibility service over those layers is not. Run the shared contract
checks with `python -m unittest discover -s backend/domain -p 'test_*.py'`.

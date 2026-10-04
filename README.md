# Civic Access Lab — Data / GIS prototype

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
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
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
Shared Python DTOs are in `backend/domain/models.py`; planned public-data,
deterministic simulation and agent/API capabilities are explicitly marked.
Real source ingestion is verified for the listed Person A layers; a time-aware
civic accessibility service is not. Run the shared contract checks with
`python -m unittest discover -s backend/domain -p 'test_*.py'`.

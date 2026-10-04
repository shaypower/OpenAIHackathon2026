# Civic Access Lab — Data / GIS prototype

A small, map-first proof of concept for the hackathon question: **which rural communities are outside a chosen healthcare travel-time target, and how might an intervention change that?**

The runnable pilot models a 45-minute journey for older residents without a car in North Tipperary. It compares four network states:

- Baseline generalized journey times.
- Candidate rural feeder links.
- Baseline under hypothetical flood-related link closures.
- Candidate links under those same closures.

The demo is intentionally labelled **synthetic and illustrative**. This repository does not yet contain or ingest CSO, NTA GTFS/NaPTAN, Pobal, OSM road-network, OPW, LiDAR, Mapillary or Tipperary Council datasets. Community counts, placeholder healthcare hubs, transit journey minutes and flood closures are scenario inputs, not observations or official statistics. The map uses town-area points instead of Census Small Area polygons; candidate paths are straight-line schematics. Do not use the results to select a real site or set a public timetable.

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

See [`backend/data/source_inventory.json`](backend/data/source_inventory.json) for source URLs, intended use, input format, ingestion state and layer-specific cleaning rules. The inventory currently records every listed source as `not_ingested`.

Suggested order for a defensible first Tipperary run:

1. Download CSO Census 2022 SAPS tables and matching Small Area boundaries; select documented older-age and motor-car-availability variables, then validate the geography join and table denominators.
2. Obtain current GTFS and NaPTAN snapshots, validate feeds and stop identifiers, and calculate time-dependent journeys for an explicit weekday and appointment arrival window.
3. Add verified GP/pharmacy/primary-care locations with source, service type, opening/access details and date; compare straight-line results with the CSO distance-to-services baseline.
4. Join Pobal deprivation scores at the supported geography and publish the raw measure separately from any equity weighting.
5. Add OSM walking/road connectivity, then intersect relevant OPW flood scenarios with affected road links. Add Tipperary Council datasets once each layer's metadata and refresh cadence are recorded.
6. Use LiDAR and Mapillary only for a selected-site audit when coverage, resolution, capture date and terms are appropriate.

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
No real civic dataset ingestion has been verified in this checkout. Run the
shared contract checks with `python -m unittest discover -s backend/domain -p 'test_*.py'`.

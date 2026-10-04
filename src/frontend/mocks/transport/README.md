# Captured geography, synthetic civic outcomes

`network.json` is committed local display data: four ordered paths, 26 stop/waypoint nodes and 25 connected segments. No online routing call is made by the app. Population, catchments, journey clocks, accessibility and intervention impacts stay synthetic.

## Sources

- NTA [Local Link GTFS](https://www.transportforireland.ie/transitData/Data/GTFS_Local_Link.zip), [source/licence page](https://www.transportforireland.ie/transitData/PT_Data.html): CC BY 4.0, National Transport Authority. Captured 2026-10-04; feed version `892A3408-F422-4978-8896-7420CF625122`, stated range 20261003–20271003. Selected patterns: 391 Limerick Arthurs Quay → Thurles Station (shape 5959_6), 854 Roscrea South → Silvermines (shape 5959_8). This is a small geometry extract, not all directions/trips or evidence of service operating at the fixture times.
- Synthetic Borrisoleigh feeder and via-Templemore contingency: captured OSRM driving geometry, [OpenStreetMap contributors / ODbL 1.0](https://www.openstreetmap.org/copyright). [OSRM API](https://project-osrm.org/docs/v5.24.0/api/#route-service). These are proposed demo services, not published bus routes. No bus access permission, pedestrian link, dated timetable, demand, capacity or closure evaluation is implemented.

Source records retain acquisition time, version, checksum, licence and limitations. The road checksum covers the two raw response files concatenated; the NTA checksum covers the downloaded ZIP. The inspector distinguishes public shape context from synthetic service context. Geometry provenance is separate from analytical `mock: true` / Evidence.

## Reproduce

Download/capture outside the repository; do not commit full feeds or dependency caches:

```sh
curl -L 'https://www.transportforireland.ie/transitData/Data/GTFS_Local_Link.zip' -o /tmp/civic-local-link.zip
curl -L 'https://router.project-osrm.org/route/v1/driving/-7.953,52.752;-7.8216,52.67685?overview=full&geometries=geojson&steps=true' -o /tmp/civic-feeder-road.json
curl -L 'https://router.project-osrm.org/route/v1/driving/-7.953,52.752;-7.8115,52.792;-7.8216,52.67685?overview=full&geometries=geojson&steps=true' -o /tmp/civic-contingency-road.json
python3 src/frontend/mocks/transport/extract.py /tmp/civic-local-link.zip /tmp/civic-feeder-road.json /tmp/civic-contingency-road.json
npm test
```

`extract.py` uses Python standard libraries only. Ordered stop sequences project monotonically onto the selected GTFS shape, then connect observed stop coordinates to nearby shape vertices. Captured maximum connectors: 391 15m, 854 14m; extraction rejects offsets above 150m. Road paths use snapped pickup/waypoint positions; the target is the captured Thurles station stop. Synthetic midpoint/Templemore nodes are labelled waypoints, not asserted public bus stops. Edge endpoints meet exactly and route geometry equals the concatenated chain; runtime parsing and tests enforce this. Distances are polyline metres, not scheduled travel time.

A newer feed may change IDs/patterns/checksums; review the extracted shapes, counts and provenance before replacing this snapshot. Capture provenance changes on regeneration; byte-identical output requires the original inputs and timestamp. A static path does not establish reachability or resilience. B/C should replace IDs and paths through `TransportNetwork`, with dated routing results behind providers.

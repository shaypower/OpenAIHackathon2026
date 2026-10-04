# Frontend integration shell

All frontend source and fixtures live under `src/frontend/`. React 19 + strict TypeScript, Vite, Tailwind 4, selected shadcn/Radix controls, Lucide, and MapLibre GL JS 6.12. No backend is needed. Existing backend files are independent and untouched.

## Layers

`app/main.tsx` is the composition root: construct the six mock civic providers plus the separate HTTP `BackendProvider` and pass them to `App`. `features/workspace/useWorkspace.ts` orchestrates requests; presentation components receive domain data and semantic actions. `domain/models` contains stable IDs, WGS84 GeoJSON, explicit units, evidence, journey legs, interventions, simulations, and site observations. `domain/contracts/providers.ts` defines six small capabilities. `adapters/mock` implements them with deterministic, cancellable local delays. `mocks` contains scenario fixtures, never component-inline data.

The layers are deliberately small: no Redux, fake server, persistence framework or transport-specific DTOs. A single feature hook coordinates the vertical demo; local view/layer state stays local. The phase is a discriminated union. Completed results remain visible during operations; an error never changes to success. Reset and selection abort prior operations. Requests have operation IDs, abort signals and bounded deadlines.

## Plug in real integrations

Implement one or more interfaces in `adapters/<integration>/` and change the provider construction in `app/main.tsx`. Interfaces cover civic data, accessibility/journeys, investigations, intervention generation, simulation/stress tests, and spatial scenes. Adapters own REST/GraphQL/database-service response mapping, runtime schema validation, request authentication and error normalization. React components must not fetch endpoints. MongoDB stays behind your backend service; database credentials must never be sent to the browser.

Data adapters should normalize GTFS/routing into generic `JourneyLeg` objects; arbitrary walk/bus/transfer/wait/service legs are supported. Optimisation output becomes `Intervention` with optional preview impact and generic route/stop/facility/infrastructure features. Unscored proposals show “Not evaluated”; only a completed qualifying simulation marks a catchment served. Unknown journey modes keep their own labels with a generic icon. Communities accept Polygon/MultiPolygon. Public data needs real source URLs, freshness, confidence and verification state in `Evidence`; keep synthetic and verified sources separate. CV output becomes `InfrastructureObservation` linked to `SpatialAnnotation`, including source/model provenance. Current data is visibly marked synthetic and is not an analytical result.

## Geographic renderer

`adapters/spatial/mapFeatures.ts` transforms frontend contracts into GeoJSON collections. `mapRenderer.ts` alone owns MapLibre objects, cameras, hover feature state, layers, popups and disposal; these objects never leak into application state. Layer order is vulnerability → catchment → network → journey → proposed patch → disruption → locations. Before/after changes coverage styling and proposed features. Map cameras stop obsolete travel and respect reduced motion. Keyboard community controls duplicate spatial selection.

Online map context uses OpenFreeMap's Liberty (light) and Dark styles. Semantic theme tokens are recorded in DESIGN.md; local preference survives reset. Captured route selection and completed workflow survive style reloads. Street view uses its `building-3d` layer (verified source `openmaptiles/building`, `render_height` and `render_min_height`). These are basemap heights, not surveyed digital-twin measurements. Road shields/minor POIs are omitted for clarity and to avoid incomplete sprite/filter issues. OpenFreeMap/OSM attribution stays visible.

A bounded basemap load falls back to local public-domain Natural Earth outlines; the Offline map control selects this explicitly. Local catchments, captured route paths, stops, services and the whole mock workflow remain available. Offline basemap has no road/building details; the app still needs to have been loaded or served locally. It is not a service-worker offline installation. Natural Earth source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_0_countries.geojson (Ireland and UK extracts, public domain).

## Realtime

`domain/events` defines an operation-scoped, schema-versioned event envelope, sequence and timestamp. The reducer accepts typed parsed-objective, community, evidence, intervention, simulation and stress events; stale operation IDs and duplicate sequences are ignored. A future SSE/WebSocket adapter should validate unknown wire messages, convert them to `CivicEvent`, and feed the same reducer. For reconnect gaps request a snapshot before resuming; the skeleton does not implement network reconnection. Current mock analysis uses an async iterable with the same event contract.

## Gaussian splats / digital twin

`SiteTwinViewer` consumes only `SiteAudit` and a `SpatialSceneProvider`. The provider mounts into its isolated container, returns `update(SceneState)` and `dispose()`, and reports annotation selection through a callback. Current renderer is a labeled local isometric SVG schematic, not a reconstructed scene. Assets carry format (`splat`, `3d-tiles`, `glb` or `schematic`), URL, local-metre origin, camera and target. Local coordinates are X/Z ground, Y up.

Implement a renderer provider using your chosen splat/3D engine, load `audit.asset.url`, normalize coordinate transforms, render annotations/proposed overlays, update selected annotation/current-proposed mode, and release GPU/listener resources on dispose. Pass that implementation at composition root. The map, evidence panel, application workflow and scene UI need no engine-specific changes. Add asset validation, progress, cancellation, signed-URL refresh and GPU/context failure recovery when implementing the real viewer.

## Simulation request context

Simulation providers now consume a serializable `SimulationRequest` separately from cancellation/tracing `RequestContext`. The application snapshots objective, selected community, baseline, network/service display data, optional inspected journey/investigation/site observations, deduplicated provenance, candidate, scenario and explicit missing inputs. The current builder accepts synthetic analytical sources only; separately attributed public geometry in `transit.sources` does not make its population, clocks or impacts verified. A successful request can be exported from the inspector as JSON. See [simulation integration](SIMULATION_INTEGRATION.md) for the actual endpoint inventory, proposed transport mapping, model limitations and future agent/tool boundary.

## Connected display transport and replay

`domain/models/transport.ts` defines `TransportNetwork`: ordered `TransitRoute.stopIds` / `.edgeIds`, shared `TransitStop` nodes, `TransitEdge` paths with explicit metre distances and `TransportSource` provenance. `JourneyLeg` can reference route/edge/from-stop/to-stop IDs and carry a resolved display path. `StressScenario.blockedEdgeIds` references the same display topology. These IDs are frontend fixture IDs until a backend adapter supplies canonical ones.

`adapters/data/transportNetwork.ts` validates unknown normalized input before use: bounded collections, WGS84 coordinates, finite units, enums, IDs/references, ordered connected endpoints, route/path consistency and safe source URLs. It is the current transport boundary, not an HTTP adapter. `features/transport/topology.ts` resolves a contiguous ordered subpath; reversed/unknown/disconnected requests fail rather than drawing a chord. It does not calculate transfers, dated service eligibility or shortest paths.

The committed [geometry fixture and capture instructions](../src/frontend/mocks/transport/README.md) contain selected NTA GTFS patterns 391/854 plus road-conforming synthetic feeder/contingency paths. Analytics remain synthetic. Provider `data.getTransit()` returns the normalized network; React never parses GTFS, performs routing or owns MapLibre objects. To integrate B/C: map their canonical IDs, geometries and geometry sources to this contract, validate, then swap provider construction. A real street graph/calendar engine stays behind the provider. Other civic wire DTOs still require their own validators and adapters.

`features/journeys/playback.ts` creates a seekable elapsed-time clock and samples distance along each leg's polyline. Legs without validated geometry stay at an adjacent known location; no invented walk line is drawn. `useJourneyPlayback` manages play/pause/seek and a low-frequency timeline refresh. `adapters/spatial/journeyRenderer.ts` owns one capped RAF loop, updating only the traveller source/active leg. Replay is user initiated, synthetic, paused on navigation/hidden tabs and disabled in reduced motion; manual seek remains available. Reset clears the clock. Completed interventions frame their geographic extent, while before/after use the same camera.

## C integration without coupling the demo to unfinished tools

`domain/contracts/backend.ts` is the capability/source/validation/run-inspection boundary. `adapters/http` owns `/api` transport, versioned JSON checks, camelCase projection, abort/error handling and eight-second limits. `features/backend` owns independent status/source probes, validation and one-second/30-second run observation. `BackendPanel` renders domain inspection models; components never fetch. Backend lifecycle and `dataMode` remain separate from the demo's fixture `SimulationRun.status`.

The command bar explicitly selects **Synthetic demo** or **Backend validation**. Changing modes resets/cancels obsolete work and clears mock metrics. The latter uses C's real template endpoint, displays its parsed bound, null coverage, assumptions and non-evaluable status, and never starts synthetic analysis on a backend error. A validated goal stays distinct from an evaluated civic objective. Source inventory reads do not certify dataset acquisition or analytical readiness. Live analysis is deliberately not submitted with invented dataset/config IDs; future A/B inputs and authoritative computed/map adapters plug in at the provider boundary.

`Journey.outcome` carries provider-supplied status, leg/time/summary and optional last-confirmed location (label/WGS84/stop ID). The journey panel shows this location and seeks to the identified leg; the map renderer pins the same coordinate, with its icon anchored at that position. Unknown location stays unknown; the frontend does not infer a destination from a straight line or an unavailable leg. Current mock failure is the missed connection at the captured arrival station; later legs remain unavailable.

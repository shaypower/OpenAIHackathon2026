# CIVIC design contract

A spatial planning instrument: the map is the workspace, with one context inspector and a bottom objective command bar. Synthetic impact is visible at all times.

## References and concept

- `docs/design/workspace-concept.png`: generated primary-screen reference. White inspector, gray-green cartography, ink-green header, amber failure regions, teal interventions. Keep the composition and palette; replace invented map geography with actual map context and explicitly synthetic catchments.
- User reference: https://github.com/TadhaKM/Mongo-Hack. Inspected map core/config/building source: pitched cameras, vector basemap, street-level extrusion and selection. Source inspection proves capabilities; it is not a visual/motion inspection of that app. Borrow spatial depth and camera choreography, not its brand, layout or code.
- Official MapLibre building example: https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/.

## Tokens

Background #f4f6f3, white surfaces, ink #163832, body #18342f, muted #687873, border #dce4df, success/intervention #087f74, failure #b77620, disruption #b4483e. Amber and teal carry meaning, with text and line-style alternatives. No gradients or glass. Space 4/8/12/16/24/32px; 6px control radii; one light overlay shadow. Sans system stack, 14px body, 12px controls/metadata, 28px inspector title, 54px impact. Mono timestamps and small technical labels.

## Composition and choreography

64px header; full-height map; compact left layers/communities; 340px right inspector; bottom command bar. Explore Ireland → analyse and frame Tipperary → select catchment → inspect journey/evidence → preview candidate → simulate → before/after → disrupt → contingency → enter site. Keep map interactive through all states. Stop previous camera travel on selection; reduced motion jumps to destination. Street-level map uses actual basemap buildings where available, not fabricated measured reconstruction.

## Functional copy and intentional deviations

Header CIVIC, Ireland / Tipperary, Synthetic demo, Reset demo. Objective, Analyse objective. Layers: Healthcare access, Vulnerability, Transport, Civic failures. Inspector community names, access percentage, target, primary cause, residents, Inspect journey, Investigation, Generate interventions. Before/After and Stress test appear only when results exist. Downstream requested workflow copy extends concept intentionally. Remove concept's sparkle, arbitrary investigation links, and misleading total-population framing. Local/system fonts ensure offline typography. Digital Twin is a labeled schematic with replaceable renderer, not a splat claim.

## Responsive and accessibility

Desktop map dominates; tablet narrower inspector; mobile map remains at least 380px then panels flow below. Native form/checkbox semantics and keyboard equivalents to map selection; Radix modal focus trap and restoration. Clear focus rings and 40px targets. No horizontal page overflow. All async actions cancellable/resettable and errors recoverable.

## Person D transport interaction pass — 2026-10-04

Preserve the existing composition. Add a compact Network inspector alongside community inspection, not a second dashboard. Published route shapes and ordered stops are geographic context; timetable/vehicle/accessibility playback remains prominently synthetic. Selecting a line or keyboard route item highlights its connected path and fits the camera; selecting a stop exposes adjacent segments and its source. Route provenance is visible independently of impact provenance.

Journey interaction uses one seekable elapsed-time clock for timeline and map position. Play is user initiated, pauses on inspection/navigation/reset and hidden tabs, and never loops automatically. Reduced motion disables automatic replay; manual step/seek still works. Use CSS entrance transitions (180–240ms), candidate staggering capped at 160ms, fill/line transitions (450ms), camera moves (700–1100ms) and a single requestAnimationFrame loop inside the renderer for map movement. No permanent traffic animation or implied realtime feed.

Dark tokens: background #101e1c, surface #172a26, body #e3eee8, muted #a5b8ae, border #345048, teal #51c7b2, amber #efb86a, danger #f09283. Keep the header ink green. Use a matching dark geographic style; offline land/network remain readable. Theme switches preserve selected community, route, camera, completed results and provenance. Initial theme is light unless a saved preference exists.

Before a completed qualifying simulation, a candidate is a **proposal preview**: proposed route visible, catchment remains failing, no “served” label. A completed access score must meet the objective's coverage threshold before showing served. Unknown counts/times/confidence must stay unknown when real adapters arrive. The backend's existing wire vocabulary remains separate from frontend display topology; no routing/optimisation calculations belong in React.

Network/replay screenshots: `docs/design/transport-network-light.png`, `journey-dark.png`, `transport-contingency-dark.png`. Completed interventions frame their route/facility extent; before/after share that framing. Light site-schematic paper intentionally remains a drawing surface inside dark chrome. An unscored proposal displays unknown cost/impact rather than inheriting fixture metrics.

C integration pass: one backend inspector shares the existing right pane; a compact command-bar mode selector distinguishes fixture replay from backend template validation. Capability/source metadata stays separate from synthetic map analysis. Validation scrolls its result into view; missing coverage/freshness remain unknown. Journey failure is a visible named last-confirmed stop with a precise X pin and seek action. Evidence: `docs/design/backend-validation.png` and `journey-failure-endpoint.png`.

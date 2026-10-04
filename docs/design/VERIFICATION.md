# Design and workflow verification

Primary concept: `workspace-concept.png`. Browser: Playwright MCP Chromium, because this session's native in-app browser reported `Browser is not available: iab`. Screenshots captured with Playwright and inspected with `view_image`; desktop matches the concept's native 1536×1024 viewport. Also exercised 1024×768 and 390×844.

## Fidelity ledger

| Comparison | Concept | Render / decision |
| --- | --- | --- |
| Composition | Dominant map, right inspector, compact layers, bottom objective | Preserved in `production-desktop.png`. Map height CSS conflict fixed; canvas now fills available height. |
| Palette | Ink-green chrome, pale map, amber failures, teal interventions | Preserved semantic colors; real Liberty basemap has warmer land/road colors than generated cartography. Intentional geographic-context variation. Before/after changes actual GeoJSON styling. |
| Typography | Swiss sans, large community title and access result | System sans preserves offline reliability; 28px title and 58px access result. Compact controls use explicit sizes. Concept's ring replaced by number + target bar for clear comparison. |
| Containers | White inspector, compact overlays, restrained borders | Preserved. Candidates collapse after simulation so result remains prominent; automatic inspector scroll to top verified. |
| Copy and provenance | CIVIC, Tipperary, objective, Borrisoleigh, 57%, target, journey, intervention | Workflow copy preserved. Synthetic labels strengthened; arbitrary concept links removed. Baseline failures distinguish original analysis from simulated coverage. No decorative sparkle or fake live status. |
| Spatial content | Catchments, route lines, service dots | Actual WGS84 basemap context replaces generated geography. Explicit synthetic catchments/routes. Street buildings use basemap extrusion (`street-desktop.png`), not a reconstruction claim. |
| Site preview | Requested local Digital Twin placeholder | Isolated SVG schematic, selectable annotations and proposed overlays (`site-desktop.png`). Portal initialization bug fixed and keyboard focus restoration verified. |
| Responsive | Desktop primary, mobile continuation | 390px layout keeps 520px map then flowing inspector; no page or modal overflow. Tablet map retains 591px canvas height. |

Above-the-fold copy reviewed against DESIGN.md: intentional extensions are the requested failure journey, evidence metadata, intervention preview/result, stress scenarios, contingency and site annotations. Marketing concept copy only appears in the initial contextual guidance; no landing-page sections. Street-level/online details and lower inspector content naturally vary with camera/scroll.

## Exercised workflows

- Desktop: objective → streamed analysis → Borrisoleigh → failed journey → evidence → three interventions → C → simulate → before 57 / after 94 → flood 68 / 1,421 affected → contingency 91 → pitched map → Digital Twin → current/proposed → close.
- Mobile: Roscrea journey, evidence, site, intervention, road closure and contingency; full-page render inspected.
- Keyboard: community selection via Enter, modal Tab focus trap, Escape and return to Enter site button. Reduced-motion preference exercised.
- Map: zoom/pan change marker position; community/polygon interaction, clinic/route picking, layer toggles and offline context. MapLibre references remain inside renderer adapter.
- Recovery: invalid short objective, cancel during analysis with no late completion, repeated reset, one-shot mock bootstrap failure and reset/retry. Offline mode retains synthetic network and mock workflow.
- Production preview: built JS/CSS/worker assets load and core simulation reaches 94%; console checked for runtime errors.

Material fixes: map height/stylesheet ordering, false basemap timeout fallback, delayed portal scene mounting, modal focus restoration, inspector density/result visibility, noisy basemap shield/POI filters, and overlapping polygon/route picking. Remaining intentional limitations: fixture analytics, local schematic site scene, offline land without roads/buildings, and MapLibre's substantial separately loaded WebGL bundle. No backend, model, optimisation or splat capability is implied.

Final production recheck after the inspector split: failed journey, candidate selection, 94% result, proposed-feeder popup without losing the simulation, site schematic/current-proposed mode, focus restoration and reset all passed. Final console: zero errors and warnings. Type checking, lint, six tests and production build passed. Vite reports the expected large MapLibre WebGL chunk; the map is loaded separately from the application shell. Design was verified against the concept with the intentional changes above; no remaining functional or layout mismatch was observed in the tested viewports.

## Simulation-context follow-up

The production UI on port 4173 was exercised through objective → Borrisoleigh → Journey → Evidence → candidates → apply (94%) → flood (68%, 1,421 synthetic network residents) → contingency (91%) → Digital Twin. Context JSON downloads were exercised after apply, stress and repair; the repair payload retained the flood scenario. A captured request lives in `docs/examples/simulation-context.mock.json`. Export also worked at 390×844 with document width 390px; desktop was 1536×1024. Production console: zero errors/warnings. Typecheck/lint, eight tests and build passed. Existing MapLibre bundle-size warning remains. Actual FastAPI health returned 200 and OpenAPI listed only `/api/` as an application route.

## Person D connected transport / replay pass — 2026-10-04

Production preview (4173), Playwright Chromium. Screenshots inspected: `transport-network-light.png` (selected 391 pattern and ordered-stop inspector), `journey-dark.png` (seeked marker on captured feeder), `transport-contingency-dark.png` (completed repair and road path). Existing composition stays map-led. Light uses Liberty, dark uses Dark with readable road/place treatment; missing pattern/place sprites were removed while retaining place labels. Site schematic intentionally keeps its paper surface.

Observed checks: select 391/854 and ordered stops; map stop click at Kilcommon Cross opens its adjacent segments; selection persists through theme changes. Journey play advances the elapsed slider, pause freezes it, seek to 45 min shows 08:03; point interpolation is checked against connected polyline vertices. Reduced motion disables play but permits seeking. Workflow completes 57→94→68→91, with no served legend during a proposal preview. Apply and contingency context exports contain connected edges and geometry source records; repaired export retains the flood scenario. Reset clears exported/current results. Theme survives reset. Digital Twin current/proposed works and focus returns after its close transition.

Desktop 1536×1024; tablet 1024×768 keeps 591px map; mobile 390×844 keeps 520px map and flowing inspector. No horizontal page/modal overflow. Keyboard Enter selects a community. Offline map retains captured geometry and completes Roscrea's simulation. `/?fail=once` displays a recoverable error; Reset & retry reloads. Reset during analysis stays Ready to explore after 3.5 seconds with no late failure result. Native parser tests reject malformed/disconnected paths; this is not a mounted HTTP error test.

Final checks: typecheck, lint, **18 tests / six files**, production build. The existing large MapLibre chunk warning remains; app/map worker bundles are separately served. Public geographic context is not analytical backend ingestion: dated timetables, walking accessibility, bus permissions, cohort denominators, real simulation/agents and civic endpoints remain pending. All displayed civic outcomes and replay timing are synthetic.

Final viewport fix: resize now reframes the current geographic selection after MapLibre resize; mobile layers start collapsed and can be expanded. The network inspector correctly labels its map perspective Region even if a street view was previously selected. Final production console: zero errors and warnings.

Rapid startup/theme switching exposed a style-loading race during the resize recheck. Renderer updates now stop at the actual style swap, including when the initial local style completed during the remote fetch. The regression is rechecked in the production browser rather than inferred from compilation.

Post-fix production readback: four rapid light/dark switches during startup, 854 selection and desktop→390px resize pass; layers collapse/expand, Region state and no overflow are verified. The complete desktop 57→94→68→91 + replay + site/focus path passes again. Console: zero errors/warnings. The preview was restarted after the interrupted session and remains available at http://127.0.0.1:4173/.

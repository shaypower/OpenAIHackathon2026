# Hospital placement demo — quick walkthrough

Start: `npm run demo` → http://127.0.0.1:8000. If occupied, use `CIVIC_DEMO_PORT=8001 npm run demo`. The compiled app, local context and API share one server; Ctrl+C stops it.

1. Choose **Nenagh · Tyone**.
2. Click **Find a clear hospital site**. The full 4 ha site is checked against 2,088 captured building footprints and mapped roads/water/green spaces. View the three proposed hospital blocks in 3D.
3. Click **Show nearby benefits on map**. Teal marks the inner 1 km, violet the 3 km zone and nearby Census areas. Nenagh's selected areas contain 10,578 residents, 1,563 aged 65+, and 735 households without a car.
4. Change capacity to 40, 60 or 80 beds; the programme, massing and cost allowance update. Placement is checked again.
5. Switch to **Offline** to show that captured building context and population highlights remain available.
6. Export the hospital plan, or compare Thurles and Roscrea. Healthcare access remains a separate synthetic scenario.

Describe the result as **clear of mapped obstacles**, with proposed care capacity and measured nearby population context. Land ownership, zoning/flood approval, clinical need, patient uptake and travel-time improvements have not been established. Counts are whole Census areas selected by their centres within 3 km.

Verification (2026-10-04): all three sites independently pass the backend geometry check; 38 frontend tests and 82 backend/API tests, typecheck/lint/build pass. Chromium against the single-server production build confirms all three sites, benefit overlays, an 80-bed export with three blocks and 10,578 nearby residents, dark mode, offline placement and mobile layout. Failed context loading recovers through Retry map context; a contradictory API confirmation blocks placement. No uncaught page errors or horizontal overflow.

---

# 90-second synthetic demo

From the running hospital app, choose **Healthcare access** in the top navigation. For standalone development, run `npm run dev` and open http://127.0.0.1:5173. No keys, database, agent service or Python server needed. Use a 1440px or wider projector viewport where possible.

1. **0–10s:** Show Ireland. Keep the supplied healthcare objective and choose **Analyse objective**. Explain that all population, journey clocks and impact are synthetic; basemap and selected route shapes are geographic context.
2. **10–20s:** The map frames Tipperary while objective parsing, community evaluation, failures and investigation events run. Choose **Borrisoleigh**. Access is **57%**, against a **90%** coverage target and **45-minute** journey objective.
3. **20–35s:** Choose **Inspect journey**. Choose **Play journey replay** briefly or select a leg/seek time; the marker follows the captured path. Show the 08:17 interchange and a connection missed by 24 minutes. Choose **Evidence** to show source, dataset, timestamp and confidence; these are explicitly fixture sources.
4. **35–50s:** Return to **Overview**, choose **Generate interventions**, select **C / Feeder + mobile clinic**, then **Apply & simulate**.
5. **50–60s:** Toggle **Before / After**. Access changes **57% → 94%**; the catchment changes amber to teal and a route/clinic appear. Allow map updates to settle before highlighting the result.
6. **60–75s:** Choose **Stress test → Flood event**. The network disruption is red; access falls to **68%**, with **1,421** synthetic residents affected. Choose **Generate contingency**: access returns to **91%** with a rerouted feeder and backup clinic.
7. **75–90s:** Choose **3D site** for a pitched street-level map with buildings (online basemap required for detail). **Enter site** opens the separate Digital Twin schematic. Select an infrastructure observation, toggle **Current / Proposed**, then Escape to return.

**Reset demo** clears the workflow, selection and results, cancels pending work and returns the regional camera. It leaves the selected theme and online/offline map setting intact. Run twice before presenting. Analyse and service actions take a few seconds maximum; never describe a fixture run as a real optimisation or agent computation.

## Inspect the integration context

After applying a patch, choose **Export simulation context · JSON** in the inspector. It downloads the actual typed request used by the mock provider. Repeat after a flood or contingency to inspect the candidate and disruption together. See [simulation integration](SIMULATION_INTEGRATION.md) and the [captured production example](examples/simulation-context.mock.json). These are synthetic inputs with explicit missing data, not a real routing or agent result.

## Recovery

- Venue network: select **Offline map**. Local land, demo locations, layers, routes and every mock action still work. Street-level buildings will be unavailable. Re-enable to retry online context.
- WebGL unavailable: an explicit fallback message is shown; the keyboard-accessible community list and full mock workflow remain usable.
- Provider failure rehearsal: open `/?fail=once`. The first bootstrap request fails once. Choose **Reset & retry** to recover, then run the objective. This flag is local demo fault injection only.
- Cancel/reset during analysis or simulation: previous operation is aborted; late events do not restore old results. Resubmit to restart.
- Real GIS, routing, optimisation, agents, CV, splats and persistent civic patches are integration points, not implemented capabilities.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Build output is `dist/`; `npx vite preview` serves it locally.

## Optional spatial inspection (before the timed run)

Choose **Transport network**. Select **391** or **854** to fit the captured NTA path; pick an ordered stop or click a map stop/line to inspect connected segments, source, capture date and licence. **DEMO** feeder and via-Templemore contingency are synthetic services using captured road geometry. Walking accessibility and bus permissions have not been evaluated. Return with **Workspace** / **Community**.

Use the header moon/sun control for light/dark mode. In Journey, **Play / Pause**, **Restart**, the elapsed slider and leg buttons share one clock; the UI runs at 12 simulated minutes per real second. Hidden tabs/navigation pause it. Reduced-motion mode disables automatic replay but permits manual seek. A candidate shows **Proposal preview · not simulated** and never marks the catchment served before simulation.

Current verification (2026-10-04): production Chromium walkthrough includes connected network inspection, replay, 57→94→68→91, exports, site current/proposed, focus restoration, light/dark, offline, reset and reduced motion. Desktop 1536×1024, tablet 1024×768, mobile 390×844. See [design verification](design/VERIFICATION.md). Real HTTP integration remains pending; the optional backend health server is not needed by this demo.

## C's connected frontend slice

The synthetic demo still runs without Python/API keys. To inspect C's actual service, use two terminals from repository root:

```sh
# Existing backend environment; use the project's documented setup if needed.
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
# Second terminal
npm run dev
```

Vite proxies `/api` at the frontend origin in both dev and preview. If the API uses another port, start Vite with `CIVIC_API_TARGET=http://127.0.0.1:8765 npm run dev`. For deployment configure the same-origin reverse proxy; Vite's development proxy is not a hosted backend. Port conflicts cause Vite to advertise another frontend port; use the printed URL.

1. Choose the header **API** control. Inspect degraded/synthetic mode, capability states and the source inventory. Null freshness is Unknown; PLANNED public datasets are not ingested.
2. Select **Backend validation**, enter `Make primary healthcare reachable within 30 minutes for elderly people without cars in rural Tipperary.`, then **Validate objective**. Expect **30 min**, coverage **Not specified**, assumptions and **Validated · not evaluated**. No run or mock map score is produced.
3. Change Tipperary to Dublin. Expect the real server's unsupported-geography error. Disconnect/fail the API: expect a recoverable request error, never fixture analysis. Retry after recovery. **Use supported example** restores the supported grammar.
4. Enter an existing ID in **Run ID → Inspect run**. The default server has none: expect `Run is unknown, expired, evicted or lost after restart.` Once B is registered, active readbacks poll every second, for at most 30 seconds. **Stop watching** stops observation, not server execution. Readback metrics do not replace synthetic map results.
5. Choose **Synthetic demo** to restore the fixed example and the existing demo workflow. **Inspect journey → Jump to failure location** selects the 08:17 missed-connection leg and pins **Thurles Station**; Roscrea's last confirmed station is **Nenagh Station**. Unavailable healthcare legs never imply arrival at a clinic.

Current checks: 28 frontend tests, typecheck/lint/build; C's 35 orchestration and nine domain tests. Chromium production preview at 4174 exercised validation, unsupported/unknown-run errors, partial API loss/retry, test-only run polling, desktop/tablet/mobile, explicit mode/reset and the complete mock demo. Expected 422/404/injected connection-failure request messages are distinguished from uncaught runtime errors. Normal production console has zero errors/warnings. MapLibre's existing build-size warning remains.

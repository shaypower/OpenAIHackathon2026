# 90-second synthetic demo

Start from repository root: `npm install` then `npm run dev`. Open http://127.0.0.1:5173. No keys, database, agent service or Python server needed. Use a 1440px or wider projector viewport where possible.

1. **0–10s:** Show Ireland. Keep the supplied healthcare objective and choose **Analyse objective**. Explain that all civic data and impact are synthetic; basemap context is real.
2. **10–20s:** The map frames Tipperary while objective parsing, community evaluation, failures and investigation events run. Choose **Borrisoleigh**. Access is **57%**, against a **90%** coverage target and **45-minute** journey objective.
3. **20–35s:** Choose **Inspect journey**. Show the 08:17 interchange and a connection missed by 24 minutes. Choose **Evidence** to show source, dataset, timestamp and confidence; these are explicitly fixture sources.
4. **35–50s:** Return to **Overview**, choose **Generate interventions**, select **C / Feeder + mobile clinic**, then **Apply & simulate**.
5. **50–60s:** Toggle **Before / After**. Access changes **57% → 94%**; the catchment changes amber to teal and a route/clinic appear. Allow map updates to settle before highlighting the result.
6. **60–75s:** Choose **Stress test → Flood event**. The network disruption is red; access falls to **68%**, with **1,421** synthetic residents affected. Choose **Generate contingency**: access returns to **91%** with a rerouted feeder and backup clinic.
7. **75–90s:** Choose **3D site** for a pitched street-level map with buildings (online basemap required for detail). **Enter site** opens the separate Digital Twin schematic. Select an infrastructure observation, toggle **Current / Proposed**, then Escape to return.

**Reset demo** clears the workflow, selection and results, cancels pending work and returns the regional camera. It leaves the selected online/offline map setting intact. Run twice before presenting. Analyse and service actions take a few seconds maximum; never describe a fixture run as a real optimisation or agent computation.

## Inspect the integration context

After applying a patch, choose **Export simulation context · JSON** in the inspector. It downloads the actual typed request used by the mock provider. Repeat after a flood or contingency to inspect the candidate and disruption together. See [simulation integration](SIMULATION_INTEGRATION.md) and the [captured production example](examples/simulation-context.mock.json). These are synthetic inputs with explicit missing data, not a real routing or agent result.

## Recovery

- Venue network: select **Offline map**. Local land, demo locations, layers, routes and every mock action still work. Street-level buildings will be unavailable. Re-enable to retry online context.
- WebGL unavailable: an explicit fallback message is shown; the keyboard-accessible community list and full mock workflow remain usable.
- Provider failure rehearsal: open `/?fail=once`. The first bootstrap request fails once. Choose **Reset & retry** to recover, then run the objective. This flag is local demo fault injection only.
- Cancel/reset during analysis or simulation: previous operation is aborted; late events do not restore old results. Resubmit to restart.
- Real GIS, routing, optimisation, agents, CV, splats and persistent civic patches are integration points, not implemented capabilities.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Build output is `dist/`; `npx vite preview` serves it locally.

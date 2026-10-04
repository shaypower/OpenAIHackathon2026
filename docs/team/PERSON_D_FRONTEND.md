# PERSON_D — frontend + spatial UX

## MISSION

Connect the existing map-led workspace to real backend providers without losing the tested synthetic demo. Expose observable phases, inspectable failures, simulated alternatives and before/after/stress outcomes with accurate labels.

## WHY THIS MATTERS

The current frontend already provides the full interactive demo. Rebuilding it creates avoidable conflicts. Your integration should make computed civic results selectable and understandable while distinguishing unscored proposals, synthetic fixtures and real-source results.

## FILES YOU OWN

**`src/frontend/`**, including frontend models, contracts, events, mock/HTTP/spatial adapters, workspace state, components, styles and tests. Own `DESIGN.md`, `docs/design/`, `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/SIMULATION_INTEGRATION.md`, `docs/examples/`, your STATUS/HANDOFFS sections and this file. Coordinate changes to frontend manifests/lockfile, Vite/TS/shadcn/ESLint configuration as their single writer.

## FILES YOU MAY READ

All backend DTOs and API docs, A's source inventory/provenance, B's result fixtures, C's route/OpenAPI/runtime state. Start with `src/frontend/app/main.tsx`, `domain/contracts/providers.ts`, `features/workspace/useWorkspace.ts`, `adapters/mock/providers.ts`, `adapters/spatial/mapFeatures.ts` and [API_CONTRACTS](API_CONTRACTS.md).

## FILES YOU SHOULD NOT EDIT

Backend data/ingestion/routing/accessibility/optimization/simulation/agents/orchestration/API. C coordinates backend models, requirements, composition and root README. `frontend/` is a legacy empty placeholder; do not start a second frontend there.

## STEP-BY-STEP TASKS

1. Run `npm ci`, `npm run dev` and the [existing 90-second demo](../DEMO.md). Read `DESIGN.md` and `docs/design/VERIFICATION.md` before visual changes. Preserve dominant map, compact layer controls, one inspector, bottom objective bar, meaningful amber/teal/red and existing keyboard/offline alternatives.
2. Keep six provider capabilities and domain/presentation separation. Add `adapters/http/` with runtime validation, deadlines, abort signals, error normalisation and snake_case → current camelCase mapping. Components must not fetch directly. Change provider construction in `app/main.tsx`; no database/government API calls or secrets in browser code. Public basemap tile requests remain geographic context.
   Existing concurrent work added typed `SimulationRequest` / `StressSimulationRequest` and a synthetic context builder/export. Read `docs/SIMULATION_INTEGRATION.md` and retain that local boundary; adapt candidate/scenario to authoritative server IDs instead of treating client fixture counts as truth. `RequestContext` remains only cancellation/tracing.
3. Work independently with local labelled wire fixtures matching API_CONTRACTS until C supplies HTTP. Do not mark endpoint implementation from a local mock. Ask C for canonical response/error samples via your handoff section, not a change to B's engine.
4. Coordinate `/api` development proxy in `vite.config.ts` with C or use an agreed backend base URL. Current Vite has **no proxy** and the backend has **no CORS configuration**. Verify real browser requests at both origins; successful Python tests cannot prove browser integration.
5. Submit arbitrary supported user objectives and display backend-confirmed cohort/geography/time. Current `CommunitySummary.tsx`, `MapOverlays.tsx`, `JourneyPanel.tsx` and mock provider assume 45 minutes/healthcare; remove those display assumptions when wiring actual objectives. Unsupported geography/cohort should show a recoverable error or request clarification, not replay the fixture silently.
6. Show actual phases: understanding objective, loading population, testing accessibility, finding failures, generating candidates, simulating alternatives, stress testing, selecting result. Map lifecycle events to `CivicEvent` / workspace phases. Filter stale operation IDs/sequences and preserve usable completed results on failure. Do not stream invented LLM thinking or fixed fake progress.
7. Map `Community`, service, transport, journey, intervention and disruption features. Support Polygon/MultiPolygon for actual Small Areas; the frontend now accepts both types and computes bounds across disjoint parts; validate the actual wire geometry before mapping. Keep WGS84 IDs/layers/evidence separate from MapLibre objects. Selection must survive snapshot/style changes; retain keyboard community selection and attribution.
8. Inspect a selected community's cohort denominator, actual journey legs, failure reason and provenance from the **same run**. `withoutCar` currently looks like a resident count; backend `no_car_households` is household data and must receive its own label. Null values are unknown, never zero. Zero-demand access is “not applicable,” not 100%.
9. Separate candidate preview from verified simulation. The current mock requires `Intervention.impact` before execution; real `Intervention` intentionally has no impact. Either show an unscored proposal or join a succeeded evaluation run by candidate ID. Do not copy fixture 94%, cost, equity or resilience into real proposals. Change colouring to “served” only from a completed qualifying result.
10. Run before/after against the same baseline/snapshot/cohort; stress output comes from recomputation. Mock `SimulationRun.status="verified"` means fixture workflow complete, not verified public evidence. Map backend lifecycle status and outcome separately. Keep synthetic/mixed labels through selection, result, evidence and export.
11. Maintain the implemented light/dark semantic tokens and compatible basemap/overlay treatment while integrating real providers. Update DESIGN.md to record tokens. Keep map dominance and restrained composition; do not make a card-heavy admin dashboard. Primitive dark classes alone are insufficient; verify app, inspector, modal and map contrast together.
12. Test integrated workflow, missing backend/model/data, malformed responses, cancellation/reset and offline basemap. The existing schematic site viewer is optional; keep its explicit “not surveyed” label. No real splat/CV or measurements are present.

## EXPECTED INPUTS

Stable API samples and errors from C; computed journeys/metrics from B through C; provenance from A; current frontend models/providers and DESIGN.md. Until integration is ready, retain D-owned synthetic fixtures and their source labels.

## EXPECTED OUTPUTS

One working HTTP adapter, observable state transitions, selectable GeoJSON, evidence and journey inspection, unambiguous preview/completed-result distinction, responsive light/dark UI and a rehearsable mock fallback. D owns frontend mappings; avoid asking all owners to edit the TypeScript models.

## API / CONTRACTS YOU MUST RESPECT

Keep backend snake_case DTOs behind `FrontendProviders`; [API_CONTRACTS](API_CONTRACTS.md) contains the mapping table and missing endpoint list. Honour `RequestContext.signal`/`operationId`. Validate unknown network JSON before reducer entry. Backend polling returns snapshots; it is not automatically a stream. C/D must agree any future event payload/reconnect changes before editing shared docs. HTTP request abort does not prove the server run was cancelled.

## HOW TO TEST YOUR WORK

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Then use the real browser at desktop and ~390px mobile widths: objective → failure → journey → evidence → candidate → simulate → before/after → stress → contingency → reset. Check keyboard community selection, focus restoration, long objective/error text, unknown fields, reduced motion, stale responses, selection after updates and no horizontal overflow. Inspect console and failed requests. Repeat with Offline map and `/?fail=once` (existing mock fault injection), then with the backend stopped and malformed HTTP JSON. Rehearse twice from Reset demo; do not infer workflow success from compilation.

## DEFINITION OF DONE

The existing mock demo still works and remains labelled synthetic. One connected backend run drives metrics and map from the same run IDs; no fixture quantitative values leak into it. Unsupported/error/loading/null states work, reset ignores late results and the UI is usable by keyboard/mobile. Dark mode is complete only after actual app/theme/basemap contrast checks. Record tested browser, path and limitations.

## WHAT TO COMMIT

Only frontend files, relevant frontend config/lockfile changes, design/demo evidence and owned status/handoff sections. Preserve all existing untracked user work; stage explicit task paths, not the whole directory. Coordinate root README and any backend schema need through C. No keys or generated dependency/build folders.

## WHAT TO TELL THE NEXT PERSON

“C: adapter calls `<endpoints>` with payload `<sample>`; unsupported/missing fields `<list>`; browser error `<repro>`. B: computed result ambiguity `<run/id/field>`. A: provenance or missingness `<record>`. Demo: start `<command>`, browser `<runtime>`, tested steps `<list>`, fallback `<mode>`, remaining limitations `<list>`.”

## KNOWN BLOCKERS / FALLBACKS

Civic HTTP endpoints, runtime schemas/adapters, real Small Areas, routing and agents are not implemented. Continue the local mock demo; do not silently fall back during a failed real run and imply success. Online buildings need basemap connectivity; offline land has no roads/buildings. Light/dark modes and connected captured transport display context are now implemented; the site viewer remains schematic and all impact is fixture-based. Fix known gaps within your zone instead of replacing the app.

## Owner implementation record — 2026-10-04

This pass delivers the frontend-only spatial interaction slice: ordered public shape context, captured road demo paths, route/stop inspector, replay/seek, theme persistence, responsive motion treatment, MultiPolygon framing and optional/unscored candidate impact. Native transport JSON is validated before use. Main/team API models remain distinct. See D's STATUS/HANDOFFS sections for actual check evidence and contract changes.

The broader connected-backend definition of done above remains open. No HTTP adapter, `/api` proxy, canonical polling/event mapping, nullable analytical cohort mapping or real agent/simulation has been claimed. Those follow actual B/C samples and mounted routes. This pass does not silently replay fixtures on a failed real run.

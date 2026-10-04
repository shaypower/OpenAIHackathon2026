# PERSON_B — deterministic transport + optimisation

## MISSION

Build the simulator as the source of truth: objective + versioned data + departure time → feasible journeys → accessibility → simulated candidates → ranked result. Start with a tiny missed-connection case and closure rerun.

## WHY THIS MATTERS

The browser currently displays preset impact, not routing output. A drawn feeder or confident agent explanation cannot establish access. Fixing a timetable connection may outperform creating a route; the engine needs to test that possibility.

## FILES YOU OWN

Create `backend/routing/`, `backend/accessibility/`, `backend/optimization/`, `backend/simulation/` only as the slice needs them. Own `backend/tests/transport/`, including tiny synthetic transit fixtures. There is no existing Python simulator to move or refactor. Own your STATUS/HANDOFFS sections and this file.

## FILES YOU MAY READ

`backend/data/`, `backend/ingestion/`, `backend/domain/models.py`, C's tool/API adapters, `src/frontend/domain/models/index.ts`, `src/frontend/mocks/fixtures.ts`, [API_CONTRACTS](API_CONTRACTS.md) and [INTEGRATION](INTEGRATION.md).

## FILES YOU SHOULD NOT EDIT

A's data/inventory/ingestion files, C's agents/orchestration/API, all `src/frontend/` and legacy `frontend/`. C lands shared model, `main.py` and requirement changes after handoff. Do not put algorithms in domain models or HTTP handlers.

## STEP-BY-STEP TASKS

1. Read the shared DTOs. Create an independent tiny fixture with dated stops, a feeder arriving after a connecting departure, walk/transfer constraints and one service. Label it synthetic. A owns real feed acquisition; you own fixture timetables and graph interpretation.
2. Implement the [B → C function boundary](API_CONTRACTS.md). The first supported change should be `TimetableChange`. Use a simple bounded deterministic candidate search; inspect dependencies before adding OR-Tools or a graph package. Existing requirements contain FastAPI, Uvicorn and Pydantic, no routing/solver library.
3. Parse GTFS `stops`, `routes`, `trips`, `stop_times`, `calendar`, `calendar_dates`. Validate foreign keys and active service on the chosen date; exceptions override normal calendars. Preserve agency timezone and service-date context; times beyond 24:00 belong to the service day. Never treat an HH:MM string as a dated journey.
4. Calculate walking access, boarding, wait, minimum transfer, in-vehicle and final walking/service legs. A transfer is feasible only when arrival + minimum transfer time ≤ connecting departure. If distance is approximate, record method; straight-line distance is not a walkable road route. Unknown service hours must remain unknown or an explicit assumption.
5. Compute baseline accessibility against the objective's time bound. Keep the target-cohort denominator separate from all residents and households. For no feasible path return `feasible=false`, `total_minutes=null` and a typed failure; no invented large duration. For zero cohort return null access percentage, not 100%.
6. Put weighting configuration at `DemandConfig` / accessibility boundary. Compute demand from a validated cohort and explicit weights; do not multiply marginal age and no-car totals as if their intersection were observed. Reject missing data by default; any estimate has a stated method/evidence and keeps the run labelled accordingly.
7. Enumerate timetable shifts within an explicit allowed window and service constraints. Simulate each against the same baseline snapshot/date/config; retain exact change and tool-calculated impact. Re-evaluate affected connections, not only the selected journey. For the first slice reject changes that make previously reachable target-cohort residents lose access; a later trade-off policy must explicitly report losses/net gain. Reject violations, including negative time, broken transfers and capacity/service assumptions you cannot support.
8. Rank deterministically using the agreed initial ordering below; provide score components and stable tie-break ID. Do not permit C/LLM to assign a winner by prose. Expand to `FeederService` / `MobileService` only when their travel/service and cost assumptions are implemented and tested.
9. Apply one closure to graph edges or service/trip availability and **rerun** accessibility. Validate referenced IDs. A polygon is display evidence; converting it to affected edges requires deterministic spatial intersection, not an LLM judgment. Generate and retest a contingency.
10. Hand C supported kinds, exact function signatures, result artifact and failure cases. Give D GeoJSON through C's API. Remove hardcoded bus assumptions from service/goal/ranking logic; transport legs may be walk, rail, bus, wait or transfer.

Initial ranking: highest weighted population newly gaining access, then lowest additional vehicle minutes, distance, number of changes, and indicative weekly EUR cost, then stable intervention ID. Compare within the same objective/snapshot. Missing operational/cost components remain null and are flagged; unknown cost cannot win as “free.” Until comparable costs exist, rank by verified gain and number of changes with an explicit incomplete-cost limitation. No solver is needed for a small candidate set.

## EXPECTED INPUTS

A's snapshot/manifest/provenance, a validated `CivicObjective`, dated departure, `DemandConfig`, service opening availability, and a candidate or stress scenario. Until A delivers, use your own explicit synthetic mini-GTFS fixture.

## EXPECTED OUTPUTS

Deterministic `Journey`, `AccessibilityResult`, `SimulationMetrics`, `MapFeature` and failure records; stable engine version; candidate assessments and ranking; closure result with exact removed IDs; execution time and input dataset IDs. Population, times, percentages and intervention effects come from this engine.

## API / CONTRACTS YOU MUST RESPECT

Use `backend.domain.models` and [API_CONTRACTS](API_CONTRACTS.md). B's public facade is `backend/simulation/service.py`; it accepts validated values and returns domain DTOs. C assigns run IDs, owns lifecycle/persistence and invokes it. No FastAPI, LLM SDK or React imports in routing/optimisation code. Schema-valid change types are **not** evidence of engine support; unsupported kinds fail explicitly.

| Intervention | Contract / execution at handoff setup |
| --- | --- |
| TimetableChange | Schema exists; deterministic support implemented for bounded single-trip shifts |
| FeederService | Schema exists; deterministic support PLANNED |
| MobileService | Schema exists; deterministic support PLANNED |
| AdditionalDeparture | Schema and execution PLANNED |
| RouteExtension | Schema and execution PLANNED |
| NewStop | Schema and execution PLANNED |
| FacilityPlacement | Schema and execution PLANNED |

## HOW TO TEST YOUR WORK

Run shared checks with `python -m unittest discover -s backend/domain -p 'test_*.py'`. Once created, run `python -m unittest discover -s backend/tests/transport -p 'test_*.py'`.

Use dated representative cases: missed connection; valid shift; shift that still misses; minimum transfer equality; no active service; exception holiday; after-midnight service; walk constraint; closed facility; zero cohort; graph closure; malformed feed/reference; unsupported change. Assert exact legs and minutes, denominator/count conservation and repeatable ranking. A shortcut must not turn a disconnected journey into success. Prove removing an edge affects actual graph feasibility rather than subtracting a canned percentage. Measure the candidate cap and runtime on the intended demo fixture.

## DEFINITION OF DONE

C can call the facade with no routing mathematics in the agent. One dated baseline fails for an observable connection reason; one supported change improves access by recomputation; a closure degrades it by recomputation. Outputs trace to dataset/version/config and include a tested unsupported-kind error. No claim of full GTFS, all intervention types, network capacity or real population support beyond what tests/data establish.

## WHAT TO COMMIT

Only your modules, tiny labelled fixtures, transport tests and owned status/handoff edits. Coordinate dependencies/schema additions through C. Do not copy D's preset 57/94 impact into solver results or commit generated real-source archives.

## WHAT TO TELL THE NEXT PERSON

“C: import `<function>` from `<module>`; input `<snapshot/objective/date example>`; output `<result example>`; supported changes `<list>`; bounds `<candidate/runtime caps>`; errors `<codes>`; test `<command>`. A: missing fields `<list>`. D: result layer IDs and before/after scope `<list>`.”

## KNOWN BLOCKERS / FALLBACKS

No real GTFS, joint demand, or civic opening-hours data exists here. The dated test fixture carries explicit synthetic hours and walking links; every resulting run is synthetic. Unknown cost and capacity limit the claim. Keep candidate search small (cap 20) and preserve baseline snapshots. Windows requires the `tzdata` package for IANA `ZoneInfo` support; request C to add it to backend requirements. The pasted 29-feature CLI is not available; do not claim it passes.

## IMPLEMENTATION UPDATE — 2026-10-04

- State: READY_FOR_HANDOFF for the synthetic deterministic transport slice.
- Added GTFS reader, validated snapshot builder/loader, cohort demand, time-dependent walk/transit routing, bounded timetable candidate search, candidate preservation checks, deterministic ranking, and explicit-edge/service closure reruns.
- Supported change: one `TimetableChange` per intervention, ±30 minutes. `FeederService` and `MobileService` remain unsupported and return an explicit error.
- Transport fixture: synthetic Tipperary mini-network, service date 2026-10-05, feeder arrives at interchange 08:10, connecting train departs 07:55, minimum transfer 5 minutes. Shift +20 reaches the equality boundary and recomputes 100 additional cohort residents into access. Closing `ride:connection-trip:1` reruns the graph and reduces reachability from 130 to 10 residents.
- Checks observed: 12 transport tests and 9 shared DTO tests pass; Python compile check passes. The tests ran with Python 3.14, Pydantic, and `tzdata`.
- Limits: synthetic data only; no vehicle block/interlining, capacity, operational cost, real road network, GTFS shapes, or polygon-to-edge spatial intersection. Missing costs and added vehicle minutes remain null. The processed-snapshot loader verifies manifest file hashes; A must supply validated cohort and service-hour fields.
- Next: C mounts the facade and adds `tzdata` to `backend/requirements.txt`; A supplies a versioned snapshot and explicit walk/service operating data; D maps the returned layers through C's API.

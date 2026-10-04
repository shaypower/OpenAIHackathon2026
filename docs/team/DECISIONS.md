# Decisions that affect more than one owner

Setup decisions dated 2026-10-04. C integrates changes after producer/consumer acknowledgement. These record local defaults, not an invented team vote. Keep entries short: decision, reason, consequence, reconsideration trigger.

| ID | Decision | Reason / consequence | Reconsider when |
| --- | --- | --- | --- |
| D01 | Preserve existing React/Vite UI in `src/frontend/` and FastAPI backend | Current user work supplies the mock vertical slice; legacy `frontend/` and `ai/` are empty | A proven requirement cannot fit existing boundaries |
| D02 | Four default owners A/B/C/D; no inferred roster | No actual team names documented; independent zones reduce conflicts | Team renames placeholders together |
| D03 | C coordinates shared backend contracts/composition; D coordinates frontend config/models | One writer per unavoidable shared file; owners keep their calculations/data/UI | A named integration owner takes over with a written handoff |
| D04 | Small Pydantic v2 DTO package at `backend/domain/`; snake_case wire | Existing FastAPI dependency fits Python validation/JSON schemas; no implementation logic in DTOs | Consumers prove incompatibility or a versioned change is needed |
| D05 | Keep current frontend TS models behind adapters | Preserve working mock UX; don't force a framework/model rewrite | D deliberately migrates after runtime mapping tests |
| D06 | Promote endpoint status only after mounted route/readback checks; preserve `/api/` | Current: health/status/sources/objective validation/run readback implemented, analyse guard implemented with baseline unavailable; remaining targets planned | Actual route/readback and advertised capability checks pass |
| D07 | Real/synthetic/mixed mode distinct from evidence verification and lifecycle | Real basemap or successful fixture workflow doesn't establish real civic findings | Never; extend labels if actual source semantics require it |
| D08 | Demand/config and deterministic maths belong to B | Models interpret/propose/explain; simulator computes impact and ranking | New domain requires an explicit deterministic engine boundary |
| D09 | Don't infer age/no-car intersection from marginal person/household totals | Units and overlapping cohorts matter; unknown joint demand remains null | A produces joint observed data or a reviewed explicit estimation method |
| D10 | One orchestrating agent/state machine initially, typed deterministic tools | Dynamic planning can be bounded/verified without decorative specialist agents | Independent specialised work is measured to justify orchestration overhead |
| D11 | Simple deterministic candidate enumeration first; timetable shift first | A small tested search proves meaningful optimisation; no solver dependency now | Candidate count/constraints exceed tested approach and OR-Tools earns its integration cost |
| D12 | Three change schemas initially, no claim of engine support | Timetable/feeder/mobile shapes cover first slice; all execution is still planned | B implements/tests another kind and C/D agree fields |
| D13 | Poll run snapshots before adding SSE/WebSocket | Small local workflow needs observable lifecycle, not streaming infrastructure | Latency/progress requirements justify reconnect/sequence/snapshot handling |
| D14 | Memory run store is a local-only fallback, not durability | C implemented 100-run/one-hour bounds, replay and restart loss; use one worker | Resume, multiple workers or user isolation requires persistent truth |
| D15 | A ingests boundaries → demographics → GTFS → services, then Pobal/alerts/flooding | Complete one useful data slice before source expansion | First slice passes integration and actual hackathon time permits expansion |
| D16 | Preserve DESIGN map-led premium spatial workspace and D's light/dark themes | D delivered theme tokens and offline spatial styles in `f5a6f2c`; C's review records delivery, without changing frontend ownership | D evolves the design or connected data needs new presentation states |
| D17 | No synthetic health findings attributed to real communities | Both pasted historic and current UI figures are illustrative; missing historic simulator cannot be claimed | Only source-backed, validated, appropriately qualified analysis changes a result's status |

Current-state annotations updated by C on 2026-10-04 after reviewing D's frontend delivery; no new team vote or consumer acceptance is implied. Implemented orchestration guards: 20 candidate reservations, 12 tool actions, one refinement reservation, 30-second cooperative run deadline, one active run for the entire local server. Candidate execution and user/session isolation remain unavailable; model calls need configured token/cost budget before enabling them. Memory fallback: 100 runs/one-hour TTL/single worker with restart loss. C/B may amend these together after measuring the demo path; D adapts its current shorter mock deadlines.

Version-sensitive implementation rule: consult Context7 plus matching official/version docs before new library/API code. OpenAI calls use official OpenAI documentation MCP; if unavailable, browse official sources and record the fallback. Shared DTO setup used Context7's Pydantic v2.9.2 documentation; no model SDK, solver or persistence service was introduced.

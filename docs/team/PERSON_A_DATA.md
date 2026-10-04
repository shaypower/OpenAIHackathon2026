# PERSON_A — data + provenance

## MISSION

Deliver small, reproducible public-data extracts that B can consume without reading government formats. Start with CSO Small Areas and demographics; retain provenance and explicit missing values.

## WHY THIS MATTERS

Optimisation cannot rank community need from fabricated population or overlapping demographic totals. Real basemap context is already available; analytical civic data is not. Your first useful result is reliable input, not a screenshot or a list of data portals.

## FILES YOU OWN

- `backend/data/`, including `source_inventory.json` and future `raw/` / `processed/` extracts.
- Create `backend/ingestion/` for fetch/validate/normalise commands and `backend/sources/` for source configuration when needed.
- Create `backend/tests/data/` for malformed-input, provenance and reproducibility checks.
- Your sections in `STATUS.md`, `HANDOFFS.md` and this file.

## FILES YOU MAY READ

`backend/domain/models.py`, B's future input readers, `src/frontend/domain/models/index.ts`, `src/frontend/mocks/fixtures.ts`, `docs/ARCHITECTURE.md`, [API_CONTRACTS](API_CONTRACTS.md), [INTEGRATION](INTEGRATION.md). Existing frontend figures are shape examples only.

## FILES YOU SHOULD NOT EDIT

`src/frontend/`, legacy `frontend/`, `backend/agents/`, `backend/orchestration/`, `backend/api/`, B's routing/accessibility/optimization/simulation zones. C coordinates `main.py`, requirements and shared models; submit a handoff rather than editing them concurrently.

## STEP-BY-STEP TASKS

1. Open `source_inventory.json`. No CSO/NTA/service ingestion is currently verified. Find the official Small Areas release, record its exact dataset URL, geography vintage, licence and known source-update date. Leave unknown dates null. Do not substitute a page discovery date for a data update.
2. Timebox a single Tipperary Small Areas extract. Store a reproducible download command, source version/checksum and input location. Use bounded network timeout, maximum download size and at most two transient retries. Respect redistribution terms; keep large raw archives out of Git through a coordinated ignore change.
3. Validate stable Small Area codes, duplicate IDs, CRS, finite coordinates, closed rings and valid polygon topology. Reproject to WGS84 longitude/latitude. Do not join by village names alone. Keep original geographic IDs and release vintage.
4. Fetch matching CSO demographics. Join by code and vintage; report unmatched areas. Keep person counts distinct from household counts. Normalise into `Community` / `PopulationProfile`; retain unknown age/no-car/intersection fields as null.
5. Prove whether the **joint** age-65+/no-car cohort is available. Separate age counts and no-car household counts do not identify the intersection. If unavailable, set `cohort_method="unknown"` and `target_cohort_residents=null`; agree an explicitly estimated method with B before calculating demand.
6. Emit a versioned processed snapshot: `manifest.json`, `communities.json`, `provenance.json`. Manifest fields are in API_CONTRACTS. Validate records with shared models. Keep source record IDs, acquisition time and licence in `Provenance`. Synthetic records use fixture provenance, never a government citation.
7. Hand B one tiny snapshot with an exact loader example, count, missingness summary and checksum. Update inventory to ingested **only after** files, validation and provenance exist; include paths and checks. Do not change frontend mocks to imply this is live.
8. Acquire **NTA GTFS** and structurally validate/archive `stops`, `routes`, `trips`, `stop_times`, `calendar`, `calendar_dates`; preserve feed IDs and service validity. A has acquired and structurally checked the current feed; B interprets calendars/timezone and builds the time-aware graph. Check official/version docs before new library/API usage.
9. Add one healthcare/service extract using an identified public source/OSM query. Record coordinates, service category, provenance and opening-hours availability; a mapped clinic is not proof of appointment availability. Then consider Pobal, road alerts and flood inputs in that order.

| Priority | Source | First acceptance evidence | Fallback |
| --- | --- | --- | --- |
| 1 | CSO Small Areas | Valid Tipperary boundaries + stable codes + vintage | Clearly synthetic mini-polygons for B's tests |
| 2 | CSO demographics | Matching-code join + units + missingness | Null unavailable values; synthetic cohort fixture |
| 3 | NTA GTFS | Dated feed + required tables + coverage/validity report | Tiny synthetic dated GTFS fixture owned by B |
| 4 | Healthcare/services, OSM where appropriate | At least one source-backed location; hours explicitly known/unknown | Existing D-owned synthetic service fixtures |
| 5 | Pobal deprivation | Geography/vintage match and permitted reuse | Unknown vulnerability, explicit policy |
| 6 | Tipperary road alerts | Dated closure identity/extent and validity | Synthetic closure scenario from B |
| 7 | OPW flooding | Distinguish hazard extent from observed/live event | Explicit synthetic stress polygon |
| Optional | NaPTAN | First establish applicable geographic coverage | Use the authoritative Irish feed's stop IDs |

The first CSO Small Areas + demographics slice is now implemented. Do not treat downloaded GTFS stops, the separate ecological screening proxy, or CSO distance-to-GP values as a validated journey-time demand model. Inventory entries are marked `INGESTED` only where the raw source, processed output, provenance/checksums, and coverage check are recorded; source-update dates remain null when not verified.

## EXPECTED INPUTS

Official source releases, geography boundary, acquisition configuration and the shared `Community`, `PopulationProfile`, `ServiceLocation`, `Provenance` schemas. B supplies required feed region/date and any loader field constraints.

## EXPECTED OUTPUTS

Small versioned snapshots with manifest, normalised records and provenance; accurate inventory; runnable acquisition/normalisation commands; explicit rejected-record and missing-field counts. No silently guessed totals or overwriting synthetic files with mixed real data.

## API / CONTRACTS YOU MUST RESPECT

Import from `backend.domain.models`. Follow [snapshot format and provenance rules](API_CONTRACTS.md). JSON uses snake_case, IDs are stable strings, points are `[longitude, latitude]`, distances use km, journey time uses minutes. Every input record resolves its `provenance_ids`. A owns acquisition, not HTTP endpoints; C implements `/api/sources` and community/service readers over your snapshot.

## HOW TO TEST YOUR WORK

Run `python -m backend.ingest_tipperary --download` to acquire missing Tipperary inputs (60-second per-request timeout, 512 MiB per-file maximum, at most two transient retries), or `python -m backend.ingest_tipperary --process-only` to reuse local raw files. `--force-download` refreshes raw files. Run `python -m unittest discover -s backend/domain -p 'test_*.py'` and `python -m unittest discover -s backend/tests/data -p 'test_*.py'` for the shared model and snapshot loader checks.

Check duplicate/missing codes, invalid ring/CRS, household-vs-person units, missing source URL/licence, invalid timestamps and mismatched vintage. Run normalisation twice on the same input: same records/IDs/checksum, apart from the snapshot acquisition timestamp. Snapshot tests cover checksum, provenance-reference and ring-closure failures. Source timeout/retry behavior and malformed network payloads have not been exercised against a live server yet. Manually inspect a sample polygon against its source.

## DEFINITION OF DONE

B can load one validated snapshot with zero government-format knowledge. Provenance resolves, gaps are visible, the inventory matches actual files and the record count/rejection count is stated. A real dataset label requires evidence of source-backed records; it does not certify accessibility findings.

## WHAT TO COMMIT

Only your normaliser, source configuration, small permitted fixture/extract, manifest/provenance, tests and owned status/handoff entries. No archives, secrets, virtualenv, node_modules or unrelated frontend work. List exact paths before staging; request dependency changes from C.

## WHAT TO TELL THE NEXT PERSON

“B: load `<snapshot path>` at dataset ID `<id>`; `<n>` communities; geographic vintage `<release>`; cohort method `<method>`; unknown fields `<list>`; run `<validation command>`; checksum `<hash>`. C: inventory fields/path and source reader output are `<example>`.” Fill actual values only after producing them.

## KNOWN BLOCKERS / FALLBACKS

The first real data snapshot is ready for B/C review; a joint age-65+/no-car person count and service hours are unavailable. GTFS has been acquired but its full schedule tables still need validation with B. If future acquisition fails, retain an explicit planned/failed inventory state and give B a synthetic fixture with fixture provenance. County NaPTAN coverage is confirmed from the official Irish TFI feed. Do not merge the absent 48/110 scenario into this checkout's UI story.

## COMPLETED FIRST SLICE — 2026-10-04

- Snapshot: `backend/data/processed/tipperary-cso-2022-v1/`; dataset ID `tipperary-cso-2022-v1`; 640 Census 2022 Small Areas; EPSG:4326; all normalized records use `data_mode="real"`.
- Files: `manifest.json`, `communities.json`, `provenance.json`. Community file SHA-256: `af23f28df32e351cebb348344bb989a9eae4f35666e9a660a4a3ba7a2c28f4a7`. The manifest records per-file checksums and 0 rejected records.
- Population totals in the joined Tipperary extract: 167,895 residents; 29,356 aged 65+; 6,921 no-car households out of 62,056 households with a car-availability response. Person and household units stay separate.
- Unknowns: age-65+/no-car person intersection not identifiable from these marginal tables, so all 640 `target_cohort_residents` are null and `cohort_method="unknown"`; no services or scheduled journeys included.
- Provenance: Census 2022 SAPS and Tailte Éireann 2022 boundaries; acquisition timestamps, exact input URLs, byte counts and SHA-256 hashes are recorded. Source update date is null where not established. The inventory lists licenses, versions, validation notes and local outputs.
- Loader: `from pathlib import Path; from backend.ingest_tipperary import load_snapshot; manifest, communities, provenance = load_snapshot(Path("backend/data/processed/tipperary-cso-2022-v1"))`.
- Validation: `python -m backend.ingest_tipperary --process-only`; `python -m unittest discover -s backend/domain -p 'test_*.py'` (9 passed); `python -m unittest discover -s backend/tests/data -p 'test_*.py'` (4 passed).
- Exploratory layers additionally include CSO 2026 GP distances, Pobal ED context, 374 active county NaPTAN stops and 286 GTFS stops. The acquired GTFS feed passed structural checks for all six tables with 0 detected key/format errors; service coverage is 2026-10-02 to 2027-10-03. These checks do not make a time-dependent accessibility result. Calendar/timezone interpretation, journey graph construction and journey/transfer validation remain with B.

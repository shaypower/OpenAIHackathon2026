# C adapter fixtures

`status.json`, `sources.json` and `validation.json` were captured on 2026-10-04 from C's actual local API on port 8000. They are API metadata/template readbacks, not analytic public-data ingestion or a real simulation. Preserve nulls, planned/degraded labels and schema versions.

`run.synthetic-test.json` was generated only with `MockBaselineBackend` from `backend/tests/orchestration/fixtures.py` and C's in-process Orchestrator/RunReadbackResponse. It explicitly says `test-stub-v1`, synthetic, and no transport calculation. It was never registered in the live API. Browser QA intercepts this fixture to test running→succeeded inspection; the actual production API still returns 404 for unknown IDs and cannot accept baseline analysis without B.

These files are used by adapter/polling tests only. The application composition always uses the real HTTP BackendProvider and explicitly separate local civic mocks; these readbacks are not automatic API fallbacks. No credentials or model calls are included.

"""MOCKED backend for lifecycle tests only; never registered by the production app."""

import asyncio
from datetime import timedelta

from backend.agents.objectives import EXAMPLE
from backend.api.models import AnalyseObjectiveRequest
from backend.orchestration.service import BackendCapabilities, BaselineResult
from backend.orchestration.errors import WorkflowError


def analysis_request(**overrides):
    payload = {
        "text": EXAMPLE, "departure_at": "2026-10-05T07:00:00+01:00", "timezone": "Europe/Dublin",
        "dataset_ids": ["synthetic-small-areas-v1", "synthetic-transit-v1"],
        "demand_config_id": "synthetic-demand-v1", "client_request_id": "test-request-1",
    }
    payload.update(overrides)
    return AnalyseObjectiveRequest.model_validate(payload)


class MockBaselineBackend:
    capabilities = BackendCapabilities(
        region_ids=("tipperary",), dataset_ids=("synthetic-small-areas-v1", "synthetic-transit-v1"),
        demand_config_ids=("synthetic-demand-v1",), data_mode="synthetic", engine_version="test-stub-v1",
        implementation_status="MOCKED",
    )

    def __init__(self, behavior="success"):
        self.behavior = behavior
        self.calls = 0
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.cancelled = False

    def validate_inputs(self, inputs):
        if set(inputs.dataset_ids) != set(self.capabilities.dataset_ids):
            raise WorkflowError(503, "missing_data", "The mocked test requires both fixture datasets.")

    async def run_baseline(self, inputs, context):
        self.calls += 1
        self.started.set()
        try:
            if self.behavior == "wait":
                await self.release.wait()
            elif self.behavior == "fail":
                raise RuntimeError("private provider credential must not be returned")
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        result = {
            "metrics": {
                "cohort_residents": 10, "reachable_residents": 4, "access_percent": 40.0,
                "weighted_population_gaining_access": 0.0, "additional_vehicle_minutes": None,
                "additional_distance_km": None, "number_of_changes": 0, "indicative_cost_eur_week": None,
            },
            "accessibility": [{
                "community_id": "test-community", "cohort_residents": 10, "reachable_residents": 4,
                "access_percent": 40.0, "weighted_demand": 10.0, "journey_ids": ["test-journey"],
                "failures": [], "data_mode": "synthetic",
            }],
            "journeys": [{
                "id": "test-journey", "community_id": "test-community", "service_id": "test-clinic",
                "departure_at": inputs.departure_at, "timezone": inputs.timezone,
                "legs": [{
                    "id": "test-leg", "mode": "walk", "label": "MOCKED test journey",
                    "start_at": inputs.departure_at, "end_at": inputs.departure_at + timedelta(minutes=20),
                    "duration_minutes": 20.0, "status": "feasible", "evidence_ids": ["test-evidence"],
                }],
                "total_minutes": 20.0, "feasible": True, "data_mode": "synthetic",
            }],
            "provenance": [{
                "id": "test-provenance", "source": "Authored orchestration test fixture", "dataset": inputs.dataset_ids[0],
                "source_url": "https://example.org/test-fixture", "source_updated_at": None,
                "ingested_at": "2026-10-04T12:00:00Z", "licence": "Authored synthetic test fixture", "data_mode": "synthetic",
            }],
            "evidence": [{
                "id": "test-evidence", "claim": "MOCKED result for lifecycle tests; no routing was calculated.",
                "provenance_ids": ["test-provenance"], "verification": "synthetic",
            }],
            "limitations": ["MOCKED test backend; no transport calculation."],
        }
        if self.behavior == "invalid":
            result["metrics"]["access_percent"] = 99.0
            return result
        if self.behavior == "extra":
            result["model_generated_population"] = 999
            return result
        return BaselineResult.model_validate(result)

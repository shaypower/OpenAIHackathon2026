"""Adapter connecting B's explicitly synthetic fixture to C's baseline seam."""
from dataclasses import replace
from zoneinfo import ZoneInfo

from backend.orchestration.errors import WorkflowError
from backend.orchestration.service import BackendCapabilities, BaselineResult
from backend.simulation.service import run_baseline
from backend.simulation.synthetic import fixture


class SyntheticBaselineBackend:
    capabilities = BackendCapabilities(
        region_ids=("tipperary",),
        dataset_ids=("synthetic-small-areas-v1", "synthetic-transit-v1"),
        demand_config_ids=("synthetic-demand-v1",), data_mode="synthetic",
        engine_version="civic-transport-0.1.0", implementation_status="IMPLEMENTED",
    )

    def __init__(self):
        self.snapshot, _, self.demand = fixture()

    def validate_inputs(self, inputs):
        if set(inputs.dataset_ids) != set(self.capabilities.dataset_ids):
            raise WorkflowError(503, "missing_data", "Both synthetic fixture datasets are required.")
        if inputs.timezone != self.snapshot.feed.timezone:
            raise WorkflowError(422, "invalid_timezone", "The synthetic fixture supports Europe/Dublin time.")
        if inputs.departure_at.tzinfo is None or inputs.departure_at.utcoffset() is None:
            raise WorkflowError(422, "invalid_departure", "A timezone-aware departure is required.")
        objective = inputs.objective
        if objective.region_id != "tipperary" or objective.target_service != "primary_care":
            raise WorkflowError(422, "unsupported_objective", "The synthetic fixture supports Tipperary primary care only.")
        try:
            ZoneInfo(inputs.timezone)
        except Exception as exc:
            raise WorkflowError(422, "invalid_timezone", "Unknown timezone.") from exc

    async def run_baseline(self, inputs, context):
        context.check_deadline()
        objective = inputs.objective
        demand = replace(self.demand, id=inputs.demand_config_id)
        result = run_baseline(self.snapshot, objective, inputs.departure_at, demand)
        context.check_deadline()
        return BaselineResult(
            metrics=result.metrics, accessibility=list(result.accessibility),
            journeys=list(result.journeys), evidence=list(result.evidence),
            provenance=list(result.provenance),
            limitations=[*result.limitations,
                "Synthetic fixture values are illustrative and do not describe Tipperary residents, services or actual transit.",
                "CPU-bound routing runs synchronously; the cooperative deadline is checked before and after calculation."],
        )

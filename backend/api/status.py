"""Advertise only backend capabilities implemented and wired into this app."""

from typing import Annotated

from fastapi import APIRouter, Depends

from backend.api.dependencies import get_orchestrator

from backend.api.models import (
    Capability,
    ExecutionLimits,
    RunStoreStatus,
    StatusData,
    StatusResponse,
)
from backend.orchestration.service import Orchestrator

router = APIRouter()


@router.get("/status", tags=["status"], response_model=StatusResponse)
def get_status(orchestrator: Annotated[Orchestrator, Depends(get_orchestrator)]) -> StatusResponse:
    backend = orchestrator.backend
    limits = orchestrator.limits
    store = orchestrator.store
    return StatusResponse(data=StatusData(
        status="degraded",
        data_mode=backend.capabilities.data_mode if backend else "synthetic",
        capabilities=[
            Capability(name="status", status="IMPLEMENTED"),
            Capability(name="sources", status="IMPLEMENTED"),
            Capability(name="communities", status="PLANNED"),
            Capability(name="objective_compilation", status="IMPLEMENTED"),
            Capability(name="baseline", status=backend.capabilities.implementation_status if backend else "PLANNED"),
            Capability(name="run_readback", status="IMPLEMENTED"),
            Capability(name="run_geojson", status="PLANNED"),
            Capability(name="candidate_generation", status="PLANNED"),
            Capability(name="candidate_simulation", status="PLANNED"),
            Capability(name="stress_testing", status="PLANNED"),
        ],
        supported_regions=[region for region in backend.capabilities.region_ids if region == "tipperary"] if backend else [],
        supported_intervention_kinds=[],
        limits=ExecutionLimits(
            max_active_runs_per_session=1, max_tool_actions=limits.max_tool_actions,
            max_candidates=limits.max_candidates, max_refinements=limits.max_refinements,
            run_deadline_seconds=limits.run_deadline_seconds,
        ),
        run_store=RunStoreStatus(
            storage="memory", ttl_seconds=store.ttl_seconds, max_runs=store.max_runs,
            restart_behavior="All runs and idempotency records are lost on restart, expiry or eviction; use one worker.",
        ),
        limitations=[
            "The parser supports only the documented primary-healthcare template in Tipperary.",
            "Source inventory metadata does not establish analytical readiness.",
            "The optional synthetic baseline uses an explicitly illustrative miniature fixture; the real Tipperary snapshot lacks an evidenced target cohort, services, validated walk links, opening hours and a bounded GTFS feed.",
            "The active-run limit applies to this entire local server; user/session isolation is not implemented.",
            "Candidate/refinement budgets exist, but candidate generation and simulation are unavailable.",
            "Tool deadlines require cooperative async adapters; CPU-bound routing needs isolation by B.",
        ] + (["No backend analysis dataset or simulation tool is connected; the default demo mode is synthetic."] if not backend else []),
    ))

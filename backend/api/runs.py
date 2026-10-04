from typing import Annotated

from fastapi import APIRouter, Depends

from backend.api.dependencies import get_orchestrator
from backend.api.models import ErrorResponse, RunReadbackData, RunReadbackResponse
from backend.orchestration.service import Orchestrator
from backend.agents.reporting import summarize_run

router = APIRouter()


@router.get("/runs/{run_id}", tags=["runs"], response_model=RunReadbackResponse,
            responses={404: {"model": ErrorResponse}})
def get_run(run_id: str, orchestrator: Annotated[Orchestrator, Depends(get_orchestrator)]) -> RunReadbackResponse:
    record = orchestrator.store.get(run_id)
    return RunReadbackResponse(data=RunReadbackData(
        run=record.run, assumptions=record.assumptions, limitations=record.limitations,
        tool_trace=record.tool_trace,
        agent_summary=summarize_run(record.run),
        model_usage=record.model_usage,
    ))

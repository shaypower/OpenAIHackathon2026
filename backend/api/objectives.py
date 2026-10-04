from typing import Annotated

from fastapi import APIRouter, Depends

from backend.agents.objectives import compile_objective
from backend.api.dependencies import get_orchestrator
from backend.api.models import (
    AnalyseObjectiveRequest, ErrorResponse, ObjectiveValidationData,
    ObjectiveValidationRequest, ObjectiveValidationResponse, RunAcceptanceResponse,
)
from backend.orchestration.service import Orchestrator

router = APIRouter()


@router.post("/objectives/validate", tags=["objectives"], response_model=ObjectiveValidationResponse,
             responses={422: {"model": ErrorResponse}})
def validate_objective(request: ObjectiveValidationRequest) -> ObjectiveValidationResponse:
    compiled = compile_objective(request.text)
    return ObjectiveValidationResponse(data=ObjectiveValidationData(
        objective=compiled.objective, assumptions=list(compiled.assumptions),
        limitations=[
            "Deterministic template parser: primary healthcare for elderly people without cars in Tipperary only.",
            "Compilation does not validate dataset/cohort availability or calculate accessibility.",
        ],
    ))


@router.post("/objectives/analyse", tags=["objectives"], status_code=202, response_model=RunAcceptanceResponse,
             responses={code: {"model": ErrorResponse} for code in (404, 409, 422, 429, 503)})
async def analyse_objective(
    request: AnalyseObjectiveRequest,
    orchestrator: Annotated[Orchestrator, Depends(get_orchestrator)],
) -> RunAcceptanceResponse:
    return RunAcceptanceResponse(data=await orchestrator.submit(request))

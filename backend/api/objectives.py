from typing import Annotated
from dataclasses import asdict

from fastapi import APIRouter, Depends

from backend.api.dependencies import get_orchestrator
from backend.api.models import (
    AnalyseObjectiveRequest, ErrorResponse, ObjectiveValidationData,
    ObjectiveValidationRequest, ObjectiveValidationResponse, RunAcceptanceResponse,
)
from backend.orchestration.service import Orchestrator

router = APIRouter()


@router.post("/objectives/validate", tags=["objectives"], response_model=ObjectiveValidationResponse,
             responses={code: {"model": ErrorResponse} for code in (422, 503)})
async def validate_objective(
    request: ObjectiveValidationRequest,
    orchestrator: Annotated[Orchestrator, Depends(get_orchestrator)],
) -> ObjectiveValidationResponse:
    compiled = await orchestrator.compiler.compile(request.text)
    return ObjectiveValidationResponse(data=ObjectiveValidationData(
        objective=compiled.objective, assumptions=list(compiled.assumptions), parser_mode=compiled.parser_mode,
        model_usage=asdict(compiled.model_usage) if compiled.model_usage else None,
        limitations=[
            ("Deterministic template parser: primary healthcare for elderly people/residents without cars in Tipperary only."
             if compiled.parser_mode == "deterministic_template" else
             "Model-extracted intent: primary healthcare for age-65+ residents without cars in Tipperary; review the interpretation."),
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

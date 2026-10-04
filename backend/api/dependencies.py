from fastapi import Request

from backend.orchestration.service import Orchestrator


def get_orchestrator(request: Request) -> Orchestrator:
    return request.app.state.orchestrator

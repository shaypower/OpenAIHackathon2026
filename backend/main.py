"""Minimal FastAPI application with its routes under ``/api``."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.api.router import router
from backend.api.errors import install_error_handlers
from backend.orchestration.service import Orchestrator
from backend.agents.config import compiler_from_environment

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await app.state.orchestrator.close()


def create_app(*, compiler=None) -> FastAPI:
    app = FastAPI(
        title="Hackathon API", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan,
    )
    app.state.orchestrator = Orchestrator(compiler=compiler if compiler is not None else compiler_from_environment())
    install_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()

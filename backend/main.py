"""Minimal FastAPI application with its routes under ``/api``."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.api.router import router
from backend.api.errors import install_error_handlers
from backend.orchestration.service import Orchestrator

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await app.state.orchestrator.close()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Hackathon API", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan,
    )
    app.state.orchestrator = Orchestrator()
    install_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()

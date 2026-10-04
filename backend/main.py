"""Compose the civic API and A's separately labelled GIS demo."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.agents.config import compiler_from_environment
from backend.api.errors import install_error_handlers
from backend.api.legacy import FRONTEND_DIR, router as legacy_router, simulate
from backend.api.router import router
from backend.orchestration.service import Orchestrator
from backend.orchestration.transport_adapter import SyntheticTransportAdapter

_DEFAULT_BACKEND = object()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        yield
    finally:
        await app.state.orchestrator.close()


def create_app(*, compiler=None, backend=_DEFAULT_BACKEND) -> FastAPI:
    if backend is _DEFAULT_BACKEND:
        backend = SyntheticTransportAdapter() if os.getenv("CIVIC_ENABLE_SYNTHETIC_BASELINE") == "1" else None
    app = FastAPI(
        title="Civic Access Lab API", version="0.2.0",
        description="Civic API and separately labelled illustrative GIS demo. Synthetic runs are not public-service assessments.",
        docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan,
    )
    app.state.orchestrator = Orchestrator(
        backend=backend, compiler=compiler if compiler is not None else compiler_from_environment(),
    )
    install_error_handlers(app)
    app.include_router(router)
    app.include_router(legacy_router)
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
    return app


app = create_app()

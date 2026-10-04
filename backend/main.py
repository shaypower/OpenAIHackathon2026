"""Compose the civic API and A's separately labelled GIS demo."""

import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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


def create_app(*, compiler=None, backend=_DEFAULT_BACKEND, frontend_dir: Path | None = None) -> FastAPI:
    if frontend_dir is not None and not all((frontend_dir / name).exists() for name in ("index.html", "assets", "data/hospital-context.json")):
        raise RuntimeError("Demo build is missing. Run npm run build before starting backend.demo:app.")
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
    if frontend_dir is not None:
        app.mount("/assets", StaticFiles(directory=frontend_dir / "assets"), name="demo-assets")
        app.mount("/data", StaticFiles(directory=frontend_dir / "data"), name="demo-data")

    @app.get("/", include_in_schema=False)
    async def home() -> FileResponse:
        return FileResponse((frontend_dir or FRONTEND_DIR) / "index.html", headers={"Cache-Control": "no-cache"})

    return app


app = create_app()

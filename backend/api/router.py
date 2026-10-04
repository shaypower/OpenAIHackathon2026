from fastapi import APIRouter

from backend.api.health import router as health_router
from backend.api.objectives import router as objectives_router
from backend.api.runs import router as runs_router
from backend.api.sources import router as sources_router
from backend.api.status import router as status_router
from backend.api.hospitals import router as hospitals_router

router = APIRouter(prefix="/api")
for child in (health_router, sources_router, status_router, objectives_router, runs_router, hospitals_router):
    router.include_router(child)

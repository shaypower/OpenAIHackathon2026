"""Hospital demo: check a captured OSM envelope; never infer planning approval."""
from functools import lru_cache
import json
import math
from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from shapely.geometry import box, shape
from shapely.ops import transform

from backend.orchestration.errors import WorkflowError

router = APIRouter()
CONTEXT_PATH = Path(__file__).resolve().parents[2] / "src/frontend/public/data/hospital-context.json"


class HospitalPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    area_id: Literal["nenagh-tyone", "thurles-west", "roscrea"]
    beds: Literal[40, 60, 80]
    context_id: str = Field(pattern=r"^[a-f0-9]{64}$")


@lru_cache(maxsize=1)
def load_context():
    try:
        value = json.loads(CONTEXT_PATH.read_text())
        if value["schemaVersion"] != 1 or not value["areas"]:
            raise ValueError("Invalid context")
        return value
    except (OSError, ValueError, KeyError) as exc:
        raise WorkflowError(503, "hospital_context_unavailable", "Hospital map context is unavailable.") from exc


@router.get("/hospitals/context", tags=["hospital planning"])
def hospital_context():
    load_context()
    return FileResponse(CONTEXT_PATH, media_type="application/json")


@router.post("/hospitals/preview", tags=["hospital planning"])
def hospital_preview(request: HospitalPreviewRequest):
    context = load_context()
    if request.context_id != context["osmSha256"]:
        raise WorkflowError(409, "hospital_context_changed", "Refresh the hospital context before placing this concept.")
    area = context["areas"][request.area_id]
    center = area["screenedCenter"]
    if not center:
        raise WorkflowError(409, "hospital_site_blocked", "No clear mapped site is available in this search area.")
    lon, lat = center
    def local(x, y, z=None):
        return ((x-lon)*math.pi/180*6378137*math.cos(lat*math.pi/180), (y-lat)*math.pi/180*6378137)
    if not transform(local, box(*area["bounds"])).contains(box(-115,-115,115,115)):
        raise WorkflowError(409, "hospital_site_blocked", "Site extends beyond captured map coverage.")
    buildings = 0
    for feature in area["features"]:
        category = feature["properties"]["kind"]
        buildings += category == "building"
        margin = 15 if category == "transport" else 8
        obstacle = transform(local, shape(feature["geometry"]))
        if not obstacle.is_valid or obstacle.is_empty or obstacle.intersects(box(-100-margin,-100-margin,100+margin,100+margin)):
            raise WorkflowError(409, "hospital_site_blocked", "Site overlaps a mapped obstacle or invalid geometry.")
    if not buildings:
        raise WorkflowError(503, "hospital_context_incomplete", "Building coverage is missing.")
    return {"schema_version": 1, "data": {"placement": {
        "status": "clear", "areaId": request.area_id, "beds": request.beds, "center": center,
        "checkedBuildings": buildings, "checkedObstacles": len(area["features"]),
        "checkedAt": context["capturedAt"], "basis": "api", "snapshotId": context["osmSha256"],
    }, "site_area_ha": 4, "planning_approval": "unassessed",
        "limitations": context["limitations"]}}

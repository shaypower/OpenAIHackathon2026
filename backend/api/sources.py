"""Read A's source inventory without treating planned sources as ingested."""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import ValidationError

from backend.api.errors import APIError
from backend.api.models import ErrorResponse, SourceInventory, SourcesResponse

router = APIRouter()


def get_inventory_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "source_inventory.json"


def read_inventory(path: Path) -> SourceInventory:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise APIError(503, "sources_unavailable", "Source inventory is unavailable.", retryable=True) from exc
    except UnicodeError as exc:
        raise APIError(503, "invalid_source_inventory", "Source inventory is invalid.") from exc

    try:
        return SourceInventory.model_validate_json(content)
    except ValidationError as exc:
        raise APIError(503, "invalid_source_inventory", "Source inventory is invalid.") from exc


@router.get(
    "/sources",
    tags=["sources"],
    response_model=SourcesResponse,
    responses={503: {"model": ErrorResponse, "description": "Inventory unavailable or invalid"}},
)
def get_sources(path: Annotated[Path, Depends(get_inventory_path)]) -> SourcesResponse:
    # Read on every request so a validated inventory update is visible immediately.
    return SourcesResponse(data=read_inventory(path))

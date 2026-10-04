from fastapi import APIRouter

router = APIRouter()


@router.get("/", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}

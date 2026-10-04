"""Minimal FastAPI application with its routes under ``/api``."""

from fastapi import FastAPI

app = FastAPI(
    title="Hackathon API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


@app.get("/api/", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}

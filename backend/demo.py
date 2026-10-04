"""One-origin presentation build: React, captured data and FastAPI together."""
from pathlib import Path

from backend.main import create_app

app = create_app(frontend_dir=Path(__file__).resolve().parents[1] / "dist")

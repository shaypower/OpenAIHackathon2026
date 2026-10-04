# Hackathon API

The FastAPI service lives in `backend/main.py`. Start it from the repository
root with:

```sh
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

The health endpoint is `GET /api/`; interactive API docs are at `/api/docs`.

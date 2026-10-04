#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python || ! -d node_modules ]]; then
  echo "Install dependencies first: python -m venv .venv && .venv/bin/python -m pip install -r backend/requirements.txt && npm install"
  exit 1
fi
api_port="${CIVIC_DEMO_API_PORT:-8765}"
web_port="${CIVIC_DEMO_WEB_PORT:-5173}"
CIVIC_ENABLE_SYNTHETIC_BASELINE=1 CIVIC_OBJECTIVE_COMPILER=template .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port "$api_port" &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM
echo "CIVIC demo: http://127.0.0.1:$web_port — choose an area, find a clear site, then show nearby benefits."
CIVIC_API_TARGET="http://127.0.0.1:$api_port" npm run dev -- --port "$web_port" --strictPort

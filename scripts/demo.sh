#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python || ! -d node_modules ]]; then
  echo "Install dependencies first: python -m venv .venv && .venv/bin/python -m pip install -r backend/requirements.txt && npm install"
  exit 1
fi
demo_port="${CIVIC_DEMO_PORT:-8000}"
if [[ ! "$demo_port" =~ ^[0-9]+$ ]] || (( demo_port < 1 || demo_port > 65535 )); then
  echo "CIVIC_DEMO_PORT must be a port from 1 to 65535."
  exit 1
fi
.venv/bin/python - "$demo_port" <<'PY'
import socket, sys
try:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", int(sys.argv[1])))
except OSError:
    sys.exit("Demo port is already in use. Stop the previous server or use CIVIC_DEMO_PORT=8001 npm run demo.")
PY
npm run build
echo "CIVIC demo: http://127.0.0.1:$demo_port — hospital planner, captured data and API on one server."
export CIVIC_ENABLE_SYNTHETIC_BASELINE=1 CIVIC_OBJECTIVE_COMPILER=template
exec .venv/bin/python -m uvicorn backend.demo:app --host 127.0.0.1 --port "$demo_port"

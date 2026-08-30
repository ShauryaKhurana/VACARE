#!/usr/bin/env bash
# Start Python on a loopback port, then Next on $PORT (public).
# Next rewrites /api/* to Python so the browser only needs one URL.
set -euo pipefail

API_PORT="${VACARE_API_PORT:-8000}"
export PYTHONPATH="${PYTHONPATH:-/app}"
cd /app

mkdir -p /app/data/uploads /app/data/parse_cache /app/form_cache

uvicorn src.web:app --host 127.0.0.1 --port "$API_PORT" &
API_PID=$!

for _ in $(seq 1 60); do
  if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${API_PORT}/api/health', timeout=1)" 2>/dev/null; then
    break
  fi
  sleep 0.25
done

cd /app/web
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"
node server.js &
WEB_PID=$!

term() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap term TERM INT

wait -n "$API_PID" "$WEB_PID" || true
status=$?
term
wait || true
exit "$status"

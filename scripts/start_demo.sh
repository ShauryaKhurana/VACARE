#!/usr/bin/env bash
# Full VACARE demo startup: env checks, sample PDFs, parse cache, demo claims, both UIs.
#
# Usage (from repo root):
#   ./scripts/start_demo.sh
#   ./scripts/start_demo.sh --no-replace   # keep existing demo claims if already seeded
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PYTHONPATH=.

VETERAN_URL="http://127.0.0.1:8000"
VSO_URL="http://127.0.0.1:8001"
PYTHON="${ROOT}/.venv/bin/python"
UVICORN="${ROOT}/.venv/bin/uvicorn"

REPLACE_DEMO=0
for arg in "$@"; do
  case "$arg" in
    --full) FULL_DEMO=1 ;;
    --no-replace) REPLACE_DEMO=0 ;;
    -h|--help)
      echo "Usage: ./scripts/start_demo.sh [--full]"
      echo "  Default: one claim (Tinnitus & Lower back pain). --full seeds four stages."
      exit 0
      ;;
  esac
done
FULL_DEMO="${FULL_DEMO:-0}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
err()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; }

bold "VACARE demo startup"
echo ""

# --- Python environment -------------------------------------------------------
if [[ ! -x "$PYTHON" ]]; then
  err "Virtualenv not found at .venv/"
  echo "  Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
ok "Python venv: .venv/"

if [[ ! -x "$UVICORN" ]]; then
  err "uvicorn not installed in .venv"
  echo "  Run: pip install -r requirements.txt"
  exit 1
fi

# --- .env ---------------------------------------------------------------------
if [[ ! -f "${ROOT}/.env" ]]; then
  warn ".env missing — copying from .env.example"
  cp "${ROOT}/.env.example" "${ROOT}/.env"
  warn "Edit .env and add GEMINI_API_KEY for live document parsing"
fi
ok ".env present"

# --- API keys -----------------------------------------------------------------
KEY_STATUS="$("$PYTHON" - <<'PY'
from src.gemini import api_key, available

key = api_key()
if available():
    print("ok:set")
elif key:
    print("warn:empty")
else:
    print("missing")
PY
)"

case "$KEY_STATUS" in
  ok:set)
    ok "GEMINI_API_KEY set — live story + document parsing enabled"
    ;;
  warn:empty)
    warn "GEMINI_API_KEY is in .env but empty — document parsing DISABLED"
    echo "  Demo still works: seeded claims + cached DD-214/medical parses."
    ;;
  missing)
    warn "GEMINI_API_KEY not set — document parsing DISABLED"
    echo "  Add your key to .env: https://aistudio.google.com/apikey"
    echo "  Demo still works: seeded claims + cached DD-214/medical parses."
    ;;
esac

VA_MOCK="$("$PYTHON" - <<'PY'
from src.va.client import _env
print(_env("VA_USE_MOCK", "true"))
PY
)"
VA_MOCK_LOWER="$(printf '%s' "$VA_MOCK" | tr '[:upper:]' '[:lower:]')"
if [[ "$VA_MOCK_LOWER" == "true" || "$VA_MOCK" == "1" ]]; then
  ok "VA_USE_MOCK=true — 526EZ sandbox submit uses mock responses"
else
  warn "VA_USE_MOCK=false — real VA sandbox (requires VA_API_KEY in .env)"
fi

echo ""

# --- Sample PDF fixtures ------------------------------------------------------
ensure_fixture() {
  local name="$1"
  local generator="$2"
  local path="${ROOT}/tests/fixtures/${name}"
  if [[ -f "$path" ]]; then
    ok "Fixture ready: tests/fixtures/${name}"
    return 0
  fi
  warn "Missing tests/fixtures/${name} — generating..."
  if ! "$PYTHON" "$generator"; then
    err "Could not generate ${name} (install fpdf2: pip install fpdf2)"
    exit 1
  fi
  ok "Generated tests/fixtures/${name}"
}

ensure_fixture "sample_dd214.pdf" "${ROOT}/scripts/generate_sample_dd214.py"
ensure_fixture "sample_medical_record.pdf" "${ROOT}/scripts/generate_sample_medical_record.py"
ensure_fixture "sample_service_treatment_record.pdf" "${ROOT}/scripts/generate_sample_service_treatment_record.py"

# --- Parse cache (offline DD-214 + medical demos) -----------------------------
bold "Seeding document parse cache..."
"$PYTHON" "${ROOT}/scripts/seed_sample_caches.py"
ok "Parse cache seeded (uploads hit cache without Gemini quota)"

# --- Demo claims (single primary claim by default) ------------------------------
bold "Seeding demo claim..."
if [[ "$FULL_DEMO" -eq 1 ]]; then
  "$PYTHON" "${ROOT}/scripts/seed_demo_journey.py" --full --replace
else
  "$PYTHON" "${ROOT}/scripts/seed_demo_journey.py"
fi

echo ""
bold "=========================================="
bold "  Open in your browser"
bold "=========================================="
echo ""
echo "  Veteran app (intake, claims, tracker):"
echo "    ${VETERAN_URL}"
echo ""
echo "  VSO review portal (inbox, approve, messages):"
echo "    ${VSO_URL}"
echo ""
echo "  Demo upload files (chat or claim upload):"
echo "    tests/fixtures/sample_dd214.pdf"
echo "    tests/fixtures/sample_medical_record.pdf"
echo "    tests/fixtures/sample_service_treatment_record.pdf"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# --- Servers ------------------------------------------------------------------
"$UVICORN" src.web:app --host 127.0.0.1 --port 8000 --reload &
PID1=$!
"$UVICORN" src.vso_web:app --host 127.0.0.1 --port 8001 --reload &
PID2=$!

trap 'kill $PID1 $PID2 2>/dev/null; exit 0' INT TERM EXIT
wait

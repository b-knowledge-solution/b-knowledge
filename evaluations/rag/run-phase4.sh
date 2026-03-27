#!/bin/bash

# =============================================================================
#  RAG Evaluation — Phase 4
#  Run this script to evaluate the B-Knowledge RAG system.
#
#  Usage:
#    ./run-phase4.sh
#
#  What this script does:
#    STEP 1  Checks that everything is configured correctly
#    STEP 2  Runs the evaluation and generates the report
#
#  No technical knowledge is needed to run this.
#  If something is wrong the script will explain exactly what to fix.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# check_pass / check_fail
# Uniform single-line output for each pre-flight check.
#
# @param $1  Check label
# @param $2  (check_fail only) Plain-language fix hint
# ---------------------------------------------------------------------------
check_pass() { printf "  %-44s ${GREEN}OK${NC}\n" "$1"; }
check_fail() {
    printf "  %-44s ${RED}FAILED${NC}\n" "$1"
    echo ""
    echo -e "${RED}  What to do:${NC}"
    echo "$2" | sed 's/^/    /'
    echo ""
    echo -e "${RED}  Fix the issue above and run this script again.${NC}"
    echo ""
    exit 1
}

# ---------------------------------------------------------------------------
# load_env — source .env so connectivity checks have the configured values
# ---------------------------------------------------------------------------
load_env() {
    if [ -f ".env" ]; then
        set -a
        # shellcheck source=/dev/null
        source .env
        set +a
    fi
}

load_env

# Replace 'host.docker.internal' with 'localhost' for host-side curl checks.
# That hostname resolves inside Docker but usually not on the host machine.
HOST_URL="${BKNOWLEDGE_API_URL:-}"
HOST_URL="${HOST_URL/host.docker.internal/localhost}"

# ===========================================================================
# HEADER
# ===========================================================================

echo ""
echo -e "${BOLD}╔═════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        RAG Evaluation — Phase 4                      ║${NC}"
echo -e "${BOLD}╚═════════════════════════════════════════════════════╝${NC}"
echo ""

# ===========================================================================
# STEP 1 — Pre-flight checks
#
# All six checks run in order.  The first one that fails prints a plain-
# language explanation and exits immediately.
# ===========================================================================

echo -e "${CYAN}${BOLD}STEP 1 / 2  Pre-flight checks${NC}"
echo "  ──────────────────────────────────────────────────────"
echo ""

# ── 1/6  Configuration file (".env") ─────────────────────────────────────
if [ ! -f ".env" ]; then
    check_fail "[1/6]  Configuration file (.env)" \
"The configuration file .env is missing.
Ask a developer to set it up:
  cp .env.example .env
  # Then fill in BKNOWLEDGE_API_URL, BKNOWLEDGE_CHAT_TOKEN, LLM_JUDGE_API_KEY"
fi

MISSING_VARS=()
[ -z "${BKNOWLEDGE_API_URL:-}" ]    && MISSING_VARS+=("BKNOWLEDGE_API_URL")
[ -z "${BKNOWLEDGE_CHAT_TOKEN:-}" ] && MISSING_VARS+=("BKNOWLEDGE_CHAT_TOKEN")
[ -z "${LLM_JUDGE_API_KEY:-}" ]     && MISSING_VARS+=("LLM_JUDGE_API_KEY")

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    check_fail "[1/6]  Configuration file (.env)" \
"The following required values are empty in .env:
  ${MISSING_VARS[*]}

Open .env in any text editor and fill in the missing values.
Ask a developer if you are not sure what the correct values are."
fi

check_pass "[1/6]  Configuration file (.env)"

# ── 2/6  B-Knowledge system is online ────────────────────────────────
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 "${HOST_URL}/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" != "200" ]; then
    check_fail "[2/6]  B-Knowledge system online" \
"Cannot reach the B-Knowledge system.
  Address : ${HOST_URL}
  Response: HTTP ${HTTP_STATUS}

Things to check:
  1. Is B-Knowledge running?
  2. Is BKNOWLEDGE_API_URL correct in .env?"
fi

check_pass "[2/6]  B-Knowledge system online"

# ── 3/6  Access token is accepted ────────────────────────────────────
TOKEN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    -X POST \
    -H "Authorization: Bearer ${BKNOWLEDGE_CHAT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"question":"ping"}' \
    "${HOST_URL}/api/chat/stream" 2>/dev/null || echo "000")

if [ "$TOKEN_STATUS" = "401" ] || [ "$TOKEN_STATUS" = "403" ]; then
    check_fail "[3/6]  Access token accepted" \
"The access token was rejected by the B-Knowledge system (HTTP ${TOKEN_STATUS}).
BKNOWLEDGE_CHAT_TOKEN in .env is invalid or has expired.

To get a new token:
  1. Open B-Knowledge in your browser
  2. Go to Settings → Embed Tokens
  3. Create a new token for Chat App
  4. Paste the new value into BKNOWLEDGE_CHAT_TOKEN in .env"
fi

if [ "$TOKEN_STATUS" = "000" ]; then
    check_fail "[3/6]  Access token accepted" \
"No response from ${HOST_URL}/api/chat/stream.
The server may still be starting up. Wait a moment and try again."
fi

check_pass "[3/6]  Access token accepted"

# ── 4/6  AI judge key is valid ────────────────────────────────────────
LLM_PROVIDER="${LLM_JUDGE_PROVIDER:-openai}"

if [ "$LLM_PROVIDER" = "anthropic" ]; then
    LLM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 \
        -H "x-api-key: ${LLM_JUDGE_API_KEY}" \
        -H "anthropic-version: 2023-06-01" \
        "https://api.anthropic.com/v1/models" 2>/dev/null || echo "000")
else
    LLM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 \
        -H "Authorization: Bearer ${LLM_JUDGE_API_KEY}" \
        "https://api.openai.com/v1/models" 2>/dev/null || echo "000")
fi

if [ "$LLM_STATUS" != "200" ]; then
    check_fail "[4/6]  AI judge key valid (${LLM_PROVIDER})" \
"The AI judge API key is invalid or has expired (HTTP ${LLM_STATUS}).
Provider: ${LLM_PROVIDER}

To fix:
  1. Get a valid API key from your AI provider
  2. Update LLM_JUDGE_API_KEY in .env"
fi

check_pass "[4/6]  AI judge key valid (${LLM_PROVIDER})"

# ── 5/6  Evaluation dataset is ready ─────────────────────────────────
if [ ! -f "dataset/eval_dataset.yaml" ]; then
    check_fail "[5/6]  Evaluation dataset" \
"The evaluation question file (dataset/eval_dataset.yaml) was not found.
This file is created in Phase 2 (dataset preparation).
If Phase 2 is complete, ask a developer to verify the file is in place."
fi

if ! grep -q "question:" dataset/eval_dataset.yaml 2>/dev/null; then
    check_fail "[5/6]  Evaluation dataset" \
"The dataset file exists but appears to be empty or invalid.
Ask a developer to check: dataset/eval_dataset.yaml"
fi

check_pass "[5/6]  Evaluation dataset"

# ── 6/6  Docker image is available ────────────────────────────────────
if ! docker compose images rag-evaluator 2>/dev/null | tail -n +2 | grep -q .; then
    check_fail "[6/6]  Evaluation engine (Docker)" \
"The evaluation engine Docker image has not been built yet.
Ask a developer to build it:
  make build"
fi

check_pass "[6/6]  Evaluation engine (Docker)"

# ── All checks passed ───────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}All checks passed — starting evaluation.${NC}"
echo ""

# ===========================================================================
# STEP 2 — Run evaluation + generate report
# ===========================================================================

echo -e "${CYAN}${BOLD}STEP 2 / 2  Running evaluation${NC}"
echo "  ──────────────────────────────────────────────────────"
echo ""
echo -e "${YELLOW}  This may take 1–3 hours depending on dataset size.${NC}"
echo -e "${YELLOW}  You can safely leave it running and check back later.${NC}"
echo ""

# Clean previous results so this run starts fresh
rm -rf results/eval_output.json results/eval_summary.md results/report.html \
        __pycache__ providers/__pycache__ metrics/__pycache__ scripts/__pycache__ .promptfoo
mkdir -p results

EVAL_DATASET="${PROMPTFOO_DATASET_PATH:-dataset/eval_dataset.yaml}"

# ── 2a  Run promptfoo evaluation ──────────────────────────────────────
echo -e "${BOLD}  Running evaluation questions...${NC}"
echo ""

if ! docker compose run --rm \
    -e PROMPTFOO_DATASET_PATH="$EVAL_DATASET" \
    rag-evaluator \
    promptfoo eval -c promptfooconfig.yaml; then
    echo ""
    echo -e "${RED}  Evaluation did not complete successfully.${NC}"
    echo "  Check the output above for details, or contact a developer."
    exit 1
fi

echo ""

# ── 2b  Generate summary report ─────────────────────────────────────
echo -e "${BOLD}  Generating report...${NC}"
echo ""

if ! docker compose run --rm rag-evaluator python3 scripts/generate_summary.py; then
    echo ""
    echo -e "${YELLOW}  Evaluation completed but the report could not be generated.${NC}"
    echo "  Raw results are saved in: results/eval_output.json"
fi

# ── Done ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔═════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        Evaluation complete                           ║${NC}"
echo -e "${BOLD}╚═════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Summary report saved at:"
echo "    results/eval_summary.md"
echo ""
echo -e "${YELLOW}  --> Next step: send this file to Tech Lead for review.${NC}"
echo ""
echo "  ──────────────────────────────────────────────────────"
echo -e "${CYAN}  For Tech Lead / Developer:${NC}"
echo "    View interactive HTML report:"
echo "      docker compose run --rm rag-evaluator promptfoo view"
echo "      then open: http://localhost:15500"
echo "    Raw data: results/eval_output.json"
echo ""


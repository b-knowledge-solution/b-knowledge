#!/bin/bash

# =============================================================================
#  RAG Evaluation Runner
#  Run this script to evaluate the B-Knowledge RAG system.
#
#  Usage:
#    ./run-eval.sh
#
#  What this script does:
#    STEP 1  Checks that everything is configured correctly
#    STEP 2  Runs the evaluation and generates the report
#
#  No technical knowledge is needed to run this.
#  If something is wrong the script will explain exactly what to fix.
# =============================================================================

set -o pipefail

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
# Scan result collectors
# add_result records each check outcome. All results are printed as a table
# after every check has run, so you see every issue at once.
#
# @param $1  Label   e.g. "[1/6]  Configuration file (.env)"
# @param $2  Status  PASS | FAIL | SKIP
# @param $3  Problem (FAIL only) one-line description
# @param $4  Fix     (FAIL only) multi-line hint, use literal \n as line break
# ---------------------------------------------------------------------------
SCAN_LABELS=()
SCAN_STATUSES=()
FAIL_LABELS=()
FAIL_PROBLEMS=()
FAIL_FIXES=()

add_result() {
    local label="$1" status="$2" problem="${3:-}" fix="${4:-}"
    SCAN_LABELS+=("$label")
    SCAN_STATUSES+=("$status")
    if [ "$status" = "FAIL" ]; then
        FAIL_LABELS+=("$label")
        FAIL_PROBLEMS+=("$problem")
        FAIL_FIXES+=("$fix")
    fi
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
echo -e "${BOLD}║        RAG Evaluation Runner                         ║${NC}"
echo -e "${BOLD}╚═════════════════════════════════════════════════════╝${NC}"
echo ""

# ===========================================================================
# STEP 1 — Scan all requirements
#
# All six checks run to completion before any result is shown.
# This way you see every issue at once, not just the first one.
# ===========================================================================

echo -e "${CYAN}${BOLD}STEP 1 / 2  Pre-flight checks${NC}"
echo "  Scanning..."
echo ""

# Dependency flags — some checks are skipped when their prerequisites fail
ENV_OK=false    # true once .env is valid and all required vars are loaded
BK_OK=false     # true once B-Knowledge responds on /health

# ── [1/6]  Configuration file (.env) ─────────────────────────────────────
if [ ! -f ".env" ]; then
    add_result "[1/6]  Configuration file (.env)" "FAIL" \
        ".env file is missing." \
        "Open a terminal in evaluations/rag and run:\n  cp .env.example .env\nThen open .env and fill in BKNOWLEDGE_CHAT_TOKEN and LLM_JUDGE_API_KEY."
else
    MISSING_VARS=()
    [ -z "${BKNOWLEDGE_API_URL:-}" ]    && MISSING_VARS+=("BKNOWLEDGE_API_URL")
    [ -z "${BKNOWLEDGE_CHAT_TOKEN:-}" ] && MISSING_VARS+=("BKNOWLEDGE_CHAT_TOKEN")
    [ -z "${LLM_JUDGE_API_KEY:-}" ]     && MISSING_VARS+=("LLM_JUDGE_API_KEY")
    if [ ${#MISSING_VARS[@]} -gt 0 ]; then
        add_result "[1/6]  Configuration file (.env)" "FAIL" \
            "Missing required values: ${MISSING_VARS[*]}" \
            "Open .env and fill in the empty fields.\nAsk a developer if you are unsure what values to use."
    else
        add_result "[1/6]  Configuration file (.env)" "PASS"
        ENV_OK=true
    fi
fi

# ── [2/6]  B-Knowledge system online ─────────────────────────────────────
if [ "$ENV_OK" = false ] || [ -z "${HOST_URL:-}" ]; then
    add_result "[2/6]  B-Knowledge system online" "SKIP"
else
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 "${HOST_URL}/health" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        add_result "[2/6]  B-Knowledge system online" "PASS"
        BK_OK=true
    else
        add_result "[2/6]  B-Knowledge system online" "FAIL" \
            "Cannot reach ${HOST_URL} (HTTP ${HTTP_STATUS})." \
            "Make sure B-Knowledge is running and accessible.\nCheck BKNOWLEDGE_API_URL in .env points to the correct address."
    fi
fi

# ── [3/6]  Access token accepted ─────────────────────────────────────────
# Skipped when B-Knowledge is offline — result would be misleading.
if [ "$BK_OK" = false ]; then
    add_result "[3/6]  Access token accepted" "SKIP"
else
    TOKEN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 -X POST \
        -H "Authorization: Bearer ${BKNOWLEDGE_CHAT_TOKEN:-}" \
        -H "Content-Type: application/json" \
        -d '{"question":"ping"}' \
        "${HOST_URL}/api/chat/stream" 2>/dev/null || echo "000")
    if [ "$TOKEN_STATUS" = "401" ] || [ "$TOKEN_STATUS" = "403" ]; then
        add_result "[3/6]  Access token accepted" "FAIL" \
            "Token rejected (HTTP ${TOKEN_STATUS})." \
            "Get a new token from B-Knowledge:\n  1. Open B-Knowledge > Settings > Embed Tokens\n  2. Create a new token for Chat App\n  3. Update BKNOWLEDGE_CHAT_TOKEN in .env"
    elif [ "$TOKEN_STATUS" = "000" ]; then
        add_result "[3/6]  Access token accepted" "FAIL" \
            "No response from the server." \
            "B-Knowledge may still be starting up. Wait 30 seconds and run again."
    else
        add_result "[3/6]  Access token accepted" "PASS"
    fi
fi

# ── [4/6]  AI judge key valid ─────────────────────────────────────────────
LLM_PROVIDER="${LLM_JUDGE_PROVIDER:-openai}"
if [ "$ENV_OK" = false ] || [ -z "${LLM_JUDGE_API_KEY:-}" ]; then
    add_result "[4/6]  AI judge key (${LLM_PROVIDER})" "SKIP"
else
    if [ "$LLM_PROVIDER" = "anthropic" ]; then
        LLM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
            -H "x-api-key: ${LLM_JUDGE_API_KEY}" \
            -H "anthropic-version: 2023-06-01" \
            "https://api.anthropic.com/v1/models" 2>/dev/null || echo "000")
    else
        LLM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
            -H "Authorization: Bearer ${LLM_JUDGE_API_KEY}" \
            "https://api.openai.com/v1/models" 2>/dev/null || echo "000")
    fi
    if [ "$LLM_STATUS" = "200" ]; then
        add_result "[4/6]  AI judge key (${LLM_PROVIDER})" "PASS"
    else
        add_result "[4/6]  AI judge key (${LLM_PROVIDER})" "FAIL" \
            "API key rejected or expired (HTTP ${LLM_STATUS})." \
            "Update LLM_JUDGE_API_KEY in .env with a valid ${LLM_PROVIDER} key."
    fi
fi

# ── [5/6]  Evaluation dataset ready ──────────────────────────────────────
if [ ! -f "dataset/eval_dataset.yaml" ]; then
    add_result "[5/6]  Evaluation dataset" "FAIL" \
        "dataset/eval_dataset.yaml not found." \
        "Export Q&A from Easy Dataset (http://localhost:1717) then run:\n  python scripts/json_to_yaml.py dataset/export_alpaca.json dataset/eval_dataset.yaml"
elif ! grep -q "question:" dataset/eval_dataset.yaml 2>/dev/null; then
    add_result "[5/6]  Evaluation dataset" "FAIL" \
        "dataset/eval_dataset.yaml exists but appears empty or invalid." \
        "Re-run: python scripts/json_to_yaml.py dataset/export_alpaca.json dataset/eval_dataset.yaml"
else
    add_result "[5/6]  Evaluation dataset" "PASS"
fi

# ── [6/6]  Docker image available ────────────────────────────────────────
DOCKER_OUTPUT=$(docker compose images rag-evaluator 2>&1) ; DOCKER_EXIT=$?
if [ "$DOCKER_EXIT" -ne 0 ]; then
    MSG=$(echo "$DOCKER_OUTPUT" | tr '[:upper:]' '[:lower:]')
    if echo "$MSG" | grep -qE "connect|daemon|socket|desktop"; then
        add_result "[6/6]  Evaluation engine (Docker)" "FAIL" \
            "Docker Desktop is not running." \
            "Start Docker Desktop and wait until the icon shows 'Engine running'.\nThen run this script again."
    else
        add_result "[6/6]  Evaluation engine (Docker)" "FAIL" \
            "Unexpected Docker error." \
            "Ask a developer to check the Docker setup: make build"
    fi
elif ! echo "$DOCKER_OUTPUT" | tail -n +2 | grep -q .; then
    add_result "[6/6]  Evaluation engine (Docker)" "FAIL" \
        "Docker image not built yet." \
        "Ask a developer to run: make build"
else
    add_result "[6/6]  Evaluation engine (Docker)" "PASS"
fi

# ===========================================================================
# Print full scan table
# ===========================================================================

echo ""
for i in "${!SCAN_LABELS[@]}"; do
    status="${SCAN_STATUSES[$i]}"
    case "$status" in
        PASS) printf "  %-44s ${GREEN}OK${NC}\n"         "${SCAN_LABELS[$i]}" ;;
        FAIL) printf "  %-44s ${RED}FAILED${NC}\n"       "${SCAN_LABELS[$i]}" ;;
        SKIP) printf "  %-44s \033[90mskipped\033[0m\n" "${SCAN_LABELS[$i]}" ;;
    esac
done
echo "  ──────────────────────────────────────────────────────"

# ===========================================================================
# If any failures — list all blockers and exit
# ===========================================================================

FAIL_COUNT=${#FAIL_LABELS[@]}
if [ "$FAIL_COUNT" -gt 0 ]; then
    echo ""
    plural="blockers"; [ "$FAIL_COUNT" -eq 1 ] && plural="blocker"
    echo -e "${RED}  ${FAIL_COUNT} ${plural} found. Fix everything listed below, then run this script again.${NC}"
    echo ""
    for i in "${!FAIL_LABELS[@]}"; do
        echo -e "${RED}  ${FAIL_LABELS[$i]}${NC}"
        echo "    Problem : ${FAIL_PROBLEMS[$i]}"
        first=true
        while IFS= read -r line; do
            if [ "$first" = true ]; then
                echo "    Fix     : $line"
                first=false
            else
                echo "              $line"
            fi
        done < <(printf '%b\n' "${FAIL_FIXES[$i]}")
        echo ""
    done
    exit 1
fi

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

# ── Single container run: promptfoo eval → generate_summary ──────────
# Both commands run inside the same container instance to avoid double spin-up.
echo -e "${BOLD}  Running evaluation and generating report...${NC}"
echo ""

if ! docker compose run --rm \
    -e PROMPTFOO_DATASET_PATH="$EVAL_DATASET" \
    rag-evaluator \
    sh -c "promptfoo eval -c promptfooconfig.yaml && python3 scripts/generate_summary.py"; then
    echo ""
    echo -e "${RED}  Evaluation did not complete successfully.${NC}"
    echo "  Check the output above for details, or contact a developer."
    echo "  Raw results (if any): results/eval_output.json"
    exit 1
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


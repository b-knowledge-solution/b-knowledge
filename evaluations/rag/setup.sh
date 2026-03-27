#!/bin/bash

# =============================================================================
#  RAG Evaluation System — One-time Setup
#
#  Run this script ONCE to prepare the evaluation environment.
#  After setup is complete, use ./run-eval.sh for every evaluation run.
#
#  What this script does:
#    [1/4]  Checks prerequisites  (Docker, docker-compose.yml)
#    [2/4]  Prepares configuration (.env from template, prompts when empty)
#    [3/4]  Builds Docker image   (rag-evaluator, ~2-5 minutes first time)
#    [4/4]  Starts Easy Dataset   (http://localhost:1717 — Q&A editor for QA team)
#
#  Usage:
#    ./setup.sh
# =============================================================================

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Result tracking — collect blockers, print all at the end
# ---------------------------------------------------------------------------
BLOCKER_COUNT=0
BLOCKER_LABELS=()
BLOCKER_PROBLEMS=()
BLOCKER_FIXES=()

add_blocker() {
    local label="$1" problem="$2" fix="$3"
    BLOCKER_COUNT=$((BLOCKER_COUNT + 1))
    BLOCKER_LABELS+=("$label")
    BLOCKER_PROBLEMS+=("$problem")
    BLOCKER_FIXES+=("$fix")
}

result_line() {
    local label="$1" status="$2"
    case "$status" in
        PASS) printf "  %-46s ${GREEN}OK${NC}\n"      "$label" ;;
        FAIL) printf "  %-46s ${RED}FAILED${NC}\n"    "$label" ;;
        INFO) printf "  %-46s ${CYAN}done${NC}\n"     "$label" ;;
        SKIP) printf "  %-46s ${GRAY}skipped${NC}\n"  "$label" ;;
    esac
}

# ---------------------------------------------------------------------------
# HEADER
# ---------------------------------------------------------------------------

echo ""
echo -e "${CYAN}${BOLD}=========================================================${NC}"
echo -e "${CYAN}${BOLD}  RAG Evaluation System - Setup${NC}"
echo -e "${CYAN}${BOLD}=========================================================${NC}"
echo ""
echo -e "${GRAY}  Run this script once to prepare the environment.${NC}"
echo -e "${GRAY}  For daily evaluation runs, use: ./run-eval.sh${NC}"
echo ""

# ===========================================================================
# [1/4]  Prerequisites
# ===========================================================================

echo -e "${CYAN}[1/4]  Checking prerequisites...${NC}"
echo ""

# Docker installed
if command -v docker &>/dev/null; then
    result_line "  Docker installed" "PASS"
else
    add_blocker "[1/4]  Docker installed" \
        "Docker is not installed." \
        "Install Docker Desktop from https://www.docker.com/products/docker-desktop\nThen run this script again."
fi

# Docker daemon running
if docker info &>/dev/null 2>&1; then
    result_line "  Docker daemon running" "PASS"
else
    add_blocker "[1/4]  Docker daemon running" \
        "Docker is installed but not running." \
        "Start Docker Desktop and wait until the tray/menu-bar icon shows 'Engine running'."
fi

# docker-compose.yml present
if [ -f "docker-compose.yml" ]; then
    result_line "  docker-compose.yml found" "PASS"
else
    add_blocker "[1/4]  docker-compose.yml" \
        "docker-compose.yml not found. Wrong directory?" \
        "Navigate to evaluations/rag and run: ./setup.sh"
fi

echo ""

# ===========================================================================
# [2/4]  Configuration (.env)
# ===========================================================================

echo -e "${CYAN}[2/4]  Preparing configuration (.env)...${NC}"
echo ""

ENV_CREATED=false

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        result_line "  Created .env from template" "INFO"
        ENV_CREATED=true
    else
        add_blocker "[2/4]  .env template" \
            ".env.example template not found." \
            "Ask a developer to restore .env.example in evaluations/rag."
    fi
else
    result_line "  .env already exists" "INFO"
fi

if [ -f ".env" ]; then
    # Source to read values
    set -a; source .env 2>/dev/null || true; set +a

    MISSING_VARS=()
    [ -z "${BKNOWLEDGE_API_URL:-}" ]    && MISSING_VARS+=("BKNOWLEDGE_API_URL")
    [ -z "${BKNOWLEDGE_CHAT_TOKEN:-}" ] && MISSING_VARS+=("BKNOWLEDGE_CHAT_TOKEN")
    [ -z "${LLM_JUDGE_API_KEY:-}" ]     && MISSING_VARS+=("LLM_JUDGE_API_KEY")

    if [ ${#MISSING_VARS[@]} -gt 0 ] || [ "$ENV_CREATED" = true ]; then
        echo ""
        echo -e "${YELLOW}  .env needs to be filled in before evaluation can run.${NC}"
        echo ""
        if [ ${#MISSING_VARS[@]} -gt 0 ]; then
            echo -e "${YELLOW}  Missing values:${NC}"
            for v in "${MISSING_VARS[@]}"; do echo "    $v"; done
            echo ""
        fi
        echo -e "${CYAN}  How to fill in each value:${NC}"
        echo "    BKNOWLEDGE_API_URL    - URL of your B-Knowledge instance, e.g. http://localhost:3001"
        echo "    BKNOWLEDGE_CHAT_TOKEN - B-Knowledge UI > Settings > Embed Tokens > Chat App"
        echo "    LLM_JUDGE_API_KEY     - Your OpenAI or Anthropic API key"
        echo ""
        echo -e "${YELLOW}  Open .env in your editor, fill in the values, save, then press Enter to continue.${NC}"
        read -r -p "  Press Enter when done... "
        echo ""

        # Re-check after edit
        set -a; source .env 2>/dev/null || true; set +a
        STILL_MISSING=()
        [ -z "${BKNOWLEDGE_API_URL:-}" ]    && STILL_MISSING+=("BKNOWLEDGE_API_URL")
        [ -z "${BKNOWLEDGE_CHAT_TOKEN:-}" ] && STILL_MISSING+=("BKNOWLEDGE_CHAT_TOKEN")
        [ -z "${LLM_JUDGE_API_KEY:-}" ]     && STILL_MISSING+=("LLM_JUDGE_API_KEY")

        if [ ${#STILL_MISSING[@]} -gt 0 ]; then
            add_blocker "[2/4]  .env configuration" \
                "Required values still empty: ${STILL_MISSING[*]}" \
                "Re-run ./setup.sh and fill in all required values when prompted."
        else
            result_line "  .env values confirmed" "PASS"
        fi
    else
        result_line "  .env values OK" "PASS"
    fi
fi

echo ""

# ===========================================================================
# [3/4]  Build Docker image (rag-evaluator)
# ===========================================================================

echo -e "${CYAN}[3/4]  Building Docker image...${NC}"
echo -e "${GRAY}       (this may take 2-5 minutes the first time)${NC}"
echo ""

# Check if already built
if docker compose images rag-evaluator 2>/dev/null | tail -n +2 | grep -q .; then
    result_line "  Docker image already built" "PASS"
    echo -e "       ${GRAY}Re-build anytime: docker compose build rag-evaluator${NC}"
else
    docker compose build rag-evaluator
    if [ $? -eq 0 ]; then
        echo ""
        result_line "  Docker image built" "PASS"
    else
        echo ""
        add_blocker "[3/4]  Docker image build" \
            "docker compose build failed." \
            "Check the output above.\nCommon causes: no internet connection (cannot pull base image), insufficient disk space."
    fi
fi

echo ""

# ===========================================================================
# [4/4]  Start Easy Dataset
# ===========================================================================

echo -e "${CYAN}[4/4]  Starting Easy Dataset (Q&A editor for QA team)...${NC}"
echo ""

# Check if already responding
ed_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://localhost:1717" 2>/dev/null || echo "000")

if [ "$ed_status" = "200" ]; then
    result_line "  Easy Dataset already running" "PASS"
    echo -e "       ${GRAY}Open: http://localhost:1717${NC}"
else
    docker compose up -d easy-dataset
    if [ $? -eq 0 ]; then
        # Wait up to 15 seconds
        ready=false
        for i in 1 2 3 4 5; do
            sleep 3
            s=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://localhost:1717" 2>/dev/null || echo "000")
            if [ "$s" = "200" ]; then ready=true; break; fi
        done
        if [ "$ready" = true ]; then
            result_line "  Easy Dataset started" "PASS"
            echo -e "       ${GRAY}Open: http://localhost:1717${NC}"
        else
            echo ""
            echo -e "${YELLOW}  Easy Dataset is starting — may take another minute.${NC}"
            echo -e "${YELLOW}  Open: http://localhost:1717 once it is ready.${NC}"
        fi
    else
        add_blocker "[4/4]  Easy Dataset" \
            "docker compose up easy-dataset failed." \
            "Check Docker output above. Common cause: port 1717 already in use."
    fi
fi

echo ""

# ===========================================================================
# [5/5]  Install Eval UI dependencies
# ===========================================================================

echo -e "${CYAN}[5/5]  Installing Eval UI dependencies...${NC}"
echo ""

if [ ! -d "eval-ui/node_modules" ]; then
    (cd eval-ui && npm install --silent)
    if [ $? -eq 0 ]; then
        result_line "  eval-ui npm install" "PASS"
    else
        add_blocker "[5/5]  Eval UI dependencies" \
            "npm install failed inside eval-ui/." \
            "Make sure Node.js 18+ is installed: node --version\nThen re-run this script."
    fi
else
    result_line "  eval-ui node_modules already present" "PASS"
fi

echo ""

# ===========================================================================
# Summary
# ===========================================================================

echo -e "${CYAN}${BOLD}=========================================================${NC}"
echo ""

if [ "$BLOCKER_COUNT" -gt 0 ]; then
    plural="issues"; [ "$BLOCKER_COUNT" -eq 1 ] && plural="issue"
    echo -e "${RED}  Setup incomplete — ${BLOCKER_COUNT} ${plural} to fix:${NC}"
    echo ""
    for i in "${!BLOCKER_LABELS[@]}"; do
        echo -e "${RED}  ${BLOCKER_LABELS[$i]}${NC}"
        echo "    Problem : ${BLOCKER_PROBLEMS[$i]}"
        first=true
        while IFS= read -r line; do
            if [ "$first" = true ]; then
                echo "    Fix     : $line"
                first=false
            else
                echo "              $line"
            fi
        done < <(printf '%b\n' "${BLOCKER_FIXES[$i]}")
        echo ""
    done
    echo -e "${RED}  Fix the issues above and run ./setup.sh again.${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}  Setup complete.${NC}"
echo ""
echo -e "${CYAN}  Two web UIs are now ready:${NC}"
echo ""
echo "    http://localhost:1717   Easy Dataset  — QA: create & manage Q&A pairs"
echo "    http://localhost:4000   Eval UI       — QA: run evaluation & view report"
echo ""
echo -e "  ${BOLD}Start the Eval UI (run in a separate terminal, keep it open):${NC}"
echo "    cd eval-ui"
echo "    node server.js"
echo ""
echo -e "  ${BOLD}QA workflow (no terminal needed after UI is running):${NC}"
echo "    1. localhost:1717  — build dataset, export Alpaca JSON"
echo "    2. Run once: python scripts/json_to_yaml.py dataset/export_alpaca.json dataset/eval_dataset.yaml"
echo "    3. localhost:4000  — click Run Evaluation, watch live log, read report"
echo ""
echo -e "  ${GRAY}Tech Lead: open http://localhost:4000 to view the latest report.${NC}"
echo ""

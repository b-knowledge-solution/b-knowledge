#!/bin/bash

##############################################################################
# verify-phase3.sh — Phase 3 Code Implementation Verification
#
# Verifies all Phase 3 code is in place and runs the eval pipeline end-to-end
# using mock data (no live API required).
#
# Output:
#   step 1/5 [ 20%]: clean previous artifacts    => done
#   step 2/5 [ 40%]: source files exist          => done
#   step 3/5 [ 60%]: docker image available      => done
#   step 4/5 [ 80%]: python imports valid        => done
#   step 5/5 [100%]: smoke eval (mock, 20 pairs) => done
#
#   phase 3 verify completed. [5/5]
#
# IDEMPOTENT: Step 1 always removes results/, __pycache__, and .promptfoo
# cache so a previously failed run never pollutes the next one.
#
# Usage:
#   ./verify-phase3.sh          # run full verify
#   ./verify-phase3.sh clean    # clean only, skip verify
##############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

STEP=0
TOTAL=5
FAILED=0

# ---------------------------------------------------------------------------
# Helper: run one labelled step with progress display
#
# @param $1  Step label (short description)
# @param $2  Command string to eval; non-zero exit = failure
# ---------------------------------------------------------------------------

run_step() {
    local name="$1"
    local cmd="$2"

    ((STEP++))
    # Compute percentage complete
    local pct=$(( STEP * 100 / TOTAL ))
    # Print progress line — name left-padded to 40 chars
    printf "step %d/%d [%3d%%]: %-40s" "$STEP" "$TOTAL" "$pct" "$name"

    # Run command, capture stderr; suppress stdout
    local err
    err=$(eval "$cmd" 2>&1 >/dev/null)
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}=> done${NC}"
    else
        echo -e "${RED}=> FAILED${NC}"
        # Show up to 3 lines of error detail, indented
        echo "$err" | tail -3 | sed 's/^/           /'
        ((FAILED++))
    fi
}

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

echo ""
echo -e "${CYAN}Phase 3 - Code Implementation Verify${NC}"
echo "─────────────────────────────────────────────────────────"
echo ""

# ===========================================================================
# STEP 1: Clean previous run artifacts
#
# Removes results files, __pycache__ folders, and .promptfoo cache.
# Ensures every re-run starts from a clean slate.
# ===========================================================================

run_step "clean previous artifacts" \
    "rm -rf results/eval_output.json results/report.html \
             __pycache__ providers/__pycache__ metrics/__pycache__ \
             scripts/__pycache__ .promptfoo && \
     mkdir -p results"

# Early exit if "clean" argument passed
if [ "${1:-}" = "clean" ]; then
    echo ""
    echo -e "${GREEN}Clean-only mode. Previous artifacts removed.${NC}"
    exit 0
fi

# ===========================================================================
# STEP 2: Required source files exist
#
# Every file that the eval pipeline needs must be present.
# ===========================================================================

run_step "source files exist" \
    "[ -f promptfooconfig.yaml ] && \
     [ -f providers/rag_provider.py ] && \
     [ -f providers/base.py ] && \
     [ -f metrics/accuracy.py ] && \
     [ -f metrics/precision.py ] && \
     [ -f metrics/recall.py ] && \
     [ -f metrics/f1.py ] && \
     [ -f metrics/__init__.py ] && \
     [ -f dataset/eval_dataset_test.yaml ]"

# ===========================================================================
# STEP 3: Docker image available
#
# The eval runs inside rag-eval:latest. Build it first with: make build
# ===========================================================================

run_step "docker image available" \
    "docker images rag-eval:latest --quiet | grep -q ."

# ===========================================================================
# STEP 4: Python imports valid (inside container)
#
# Verifies metrics and providers modules load without error inside Docker.
# ===========================================================================

run_step "python imports valid (in container)" \
    "docker compose run --rm rag-eval \
        python -c \
        'from metrics import score_all; from providers.rag_provider import RagProviderFactory; print(\"ok\")'"

# ===========================================================================
# STEP 5: Smoke eval — mock mode, 20-pair fixture
#
# Full eval cycle with MockRagProvider + fixture dataset.
# Success = promptfoo exits 0 AND results/eval_output.json is created.
# ===========================================================================

run_step "smoke eval (mock, 20 pairs)" \
    "docker compose run --rm \
        -e RAG_MOCK_MODE=true \
        -e PROMPTFOO_DATASET_PATH=dataset/eval_dataset_test.yaml \
        rag-eval \
        promptfoo eval -c promptfooconfig.yaml && \
     [ -f results/eval_output.json ]"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "─────────────────────────────────────────────────────────"
PASSED=$(( TOTAL - FAILED ))

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}phase 3 verify completed. [$PASSED/$TOTAL]${NC}"
    echo ""
    echo "  results/eval_output.json  ready"
    echo "  view report : docker compose run --rm rag-eval promptfoo view"
    echo "  next phase  : run with real dataset when Phase 2 QA is done"
    exit 0
else
    echo -e "${RED}${FAILED} step(s) failed. [$PASSED/$TOTAL passed]${NC}"
    echo "Fix the issues above and re-run: ./verify-phase3.sh"
    exit 1
fi

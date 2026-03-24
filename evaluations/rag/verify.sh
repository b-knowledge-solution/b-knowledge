#!/bin/bash

##############################################################################
# RAG Evaluation System - Quick Verification
#
# Shows simple progress: step 1/5: [name] => done
#                        step 2/5: [name] => done
#                        ...
#                        evaluation setting up completed. (5/5)
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

STEP=0
TOTAL_STEPS=5
FAILED=0

##############################################################################
# Check function
##############################################################################

check() {
    ((STEP++))
    echo -n "step $STEP/$TOTAL_STEPS: $1 "
    if eval "$2" > /dev/null 2>&1; then
        echo -e "${GREEN}=> done${NC}"
    else
        echo -e "${RED}=> failed${NC}"
        ((FAILED++))
    fi
}

##############################################################################
# STEP 1: Docker & Prerequisites
##############################################################################

echo -e "\n${YELLOW}Checking Docker & Prerequisites...${NC}"
check "Docker installed" "command -v docker"
check "Docker daemon running" "docker info"
check "Docker Compose available" "docker compose version"
check "Dockerfile exists" "[ -f Dockerfile ]"
check "docker-compose.yml exists" "[ -f docker-compose.yml ]"

##############################################################################
# STEP 2: Environment Configuration
##############################################################################

echo -e "\n${YELLOW}Checking Environment Setup...${NC}"
check ".env file exists" "[ -f .env ]"
check "BKNOWLEDGE_API_URL set" "grep -q '^BKNOWLEDGE_API_URL=' .env"
check "LLM_JUDGE_API_KEY set" "grep -q '^LLM_JUDGE_API_KEY=' .env"

##############################################################################
# STEP 3: Docker Image & Container
##############################################################################

echo -e "\n${YELLOW}Checking Docker Setup...${NC}"
check "Docker image built" "docker images rag-eval:latest --quiet | grep -q ."
check "Container starts" "timeout 30 docker compose run --rm rag-eval bash -c 'echo OK'"
check "Python available" "timeout 30 docker compose run --rm rag-eval python --version"
check "Promptfoo available" "timeout 30 docker compose run --rm rag-eval promptfoo --version"

##############################################################################
# STEP 4: Configuration Files
##############################################################################

echo -e "\n${YELLOW}Checking Configuration Files...${NC}"
check "Dataset folder exists" "[ -d dataset ]"
check "Providers folder exists" "[ -d providers ]"
check "Metrics folder exists" "[ -d metrics ]"
check "Makefile exists" "[ -f Makefile ]"

##############################################################################
# STEP 5: Final Status
##############################################################################

echo -e "\n${YELLOW}Finalizing...${NC}"
((STEP++))
echo -n "step $STEP/$TOTAL_STEPS: running final checks "
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}=> done${NC}"
else
    echo -e "${RED}=> failed${NC}"
fi

##############################################################################
# SUMMARY
##############################################################################

echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}evaluation setting up completed. ($STEP/$TOTAL_STEPS)${NC}"
    exit 0
else
    echo -e "${RED}evaluation setup has $FAILED issues. ($STEP/$TOTAL_STEPS)${NC}"
    echo ""
    echo "Common fixes:"
    echo "  - .env missing?      cp .env.example .env"
    echo "  - Docker not running? Start Docker Desktop"
    echo "  - Image not built?    docker compose build rag-eval"
    exit 1
fi

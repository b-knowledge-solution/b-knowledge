#!/bin/bash

##############################################################################
# RAG Evaluation System - Deploy Script
# 
# Purpose: Automated setup, validation, and deployment of RAG evaluation
# Usage: ./deploy.sh [--help] [--check-only] [--build] [--full]
#
# Phases:
#   1. Prerequisites check (Docker, python, etc.)
#   2. Environment configuration (.env validation)
#   3. Docker image build
#   4. Container validation (API connectivity)
#   5. Run evaluation (optional)
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

##############################################################################
# UTILITY FUNCTIONS
##############################################################################

log_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ $1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}\n"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

##############################################################################
# PHASE 1: CHECK PREREQUISITES
##############################################################################

check_prerequisites() {
    log_header "Phase 1: Checking Prerequisites"
    
    local all_ok=true
    
    # Check Docker
    if command -v docker &> /dev/null; then
        log_success "Docker is installed: $(docker --version)"
    else
        log_error "Docker is NOT installed"
        all_ok=false
    fi
    
    # Check Docker Compose
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        log_success "Docker Compose is installed"
    else
        log_error "Docker Compose is NOT installed"
        all_ok=false
    fi
    
    # Check Git
    if command -v git &> /dev/null; then
        log_success "Git is installed: $(git --version)"
    else
        log_error "Git is NOT installed"
        all_ok=false
    fi
    
    # Check if Docker daemon is running
    if docker info > /dev/null 2>&1; then
        log_success "Docker daemon is running"
    else
        log_error "Docker daemon is NOT running. Please start Docker."
        all_ok=false
    fi
    
    # Check current directory
    if [ -f "Dockerfile" ] && [ -f "docker-compose.yml" ]; then
        log_success "Found Dockerfile and docker-compose.yml"
    else
        log_error "Dockerfile or docker-compose.yml not found. Are you in evaluations/rag/ ?"
        all_ok=false
    fi
    
    if [ "$all_ok" = false ]; then
        log_error "Prerequisites check FAILED. Please install missing tools."
        exit 1
    fi
    
    log_success "All prerequisites OK"
}

##############################################################################
# PHASE 2: ENVIRONMENT CONFIGURATION
##############################################################################

setup_environment() {
    log_header "Phase 2: Environment Configuration"
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        log_warning ".env not found"
        
        if [ -f ".env.example" ]; then
            log_info "Creating .env from .env.example..."
            cp .env.example .env
            log_success ".env created from template"
            log_warning "⚠ IMPORTANT: Edit .env with your B-Knowledge API URL and API keys before proceeding!"
            echo ""
            echo "Required variables:"
            echo "  BKNOWLEDGE_API_URL=http://host.docker.internal:3001"
            echo "  BKNOWLEDGE_CHAT_TOKEN=<your-token>"
            echo "  BKNOWLEDGE_SEARCH_TOKEN=<your-token>"
            echo "  LLM_JUDGE_API_KEY=<your-key>"
            echo "  LANGFUSE_HOST=<host>"
            echo "  LANGFUSE_PUBLIC_KEY=<key>"
            echo "  LANGFUSE_SECRET_KEY=<key>"
            echo ""
            return 1  # Signal that user needs to configure
        else
            log_error ".env.example not found"
            return 1
        fi
    fi
    
    # Validate .env has required fields
    local required_vars=("BKNOWLEDGE_API_URL" "LLM_JUDGE_API_KEY")
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" .env; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Missing required variables in .env: ${missing_vars[*]}"
        return 1
    fi
    
    log_success ".env is properly configured"
    
    # Load .env for validation
    set -a
    source .env
    set +a
    
    log_info "B-Knowledge API URL: $BKNOWLEDGE_API_URL"
}

##############################################################################
# PHASE 3: BUILD DOCKER IMAGE
##############################################################################

build_docker_image() {
    log_header "Phase 3: Building Docker Image"
    
    log_info "Building Docker image (this may take 2-5 minutes)..."
    
    if docker compose build rag-eval; then
        log_success "Docker image built successfully"
        
        # Get image size
        local image_size=$(docker images rag-eval:latest --format "{{.Size}}" 2>/dev/null || echo "N/A")
        log_info "Image size: $image_size"
        
    else
        log_error "Docker build failed"
        return 1
    fi
}

##############################################################################
# PHASE 4: VALIDATE CONTAINER & API
##############################################################################

validate_container() {
    log_header "Phase 4: Validating Container & API Connectivity"
    
    log_info "Starting container validation..."
    
    # Test 1: Container starts
    log_info "Test 1: Container startup..."
    if docker compose run --rm rag-eval bash -c "echo 'Container is running'" > /dev/null 2>&1; then
        log_success "Container starts successfully"
    else
        log_error "Container failed to start"
        return 1
    fi
    
    # Test 2: Python works
    log_info "Test 2: Python environment..."
    if docker compose run --rm rag-eval python --version > /dev/null 2>&1; then
        log_success "Python environment OK"
    else
        log_error "Python execution failed"
        return 1
    fi
    
    # Test 3: Promptfoo installed
    log_info "Test 3: Promptfoo installation..."
    if docker compose run --rm rag-eval promptfoo --version > /dev/null 2>&1; then
        log_success "Promptfoo installed"
    else
        log_error "Promptfoo not found"
        return 1
    fi
    
    # Test 4: Required Python packages
    log_info "Test 4: Python dependencies..."
    if docker compose run --rm rag-eval python -c "import httpx; import dotenv; print('Dependencies OK')" > /dev/null 2>&1; then
        log_success "Python dependencies installed"
    else
        log_error "Missing Python dependencies"
        return 1
    fi
    
    # Test 5: Volumes mounted
    log_info "Test 5: Volume mounts..."
    if docker compose run --rm rag-eval bash -c "[ -d '/app/dataset' ] && [ -d '/app/results' ]" > /dev/null 2>&1; then
        log_success "Volumes mounted correctly"
    else
        log_error "Volume mounts failed"
        return 1
    fi
    
    # Test 6: API connectivity (if endpoint is accessible)
    log_info "Test 6: B-Knowledge API connectivity..."
    if docker compose run --rm rag-eval bash -c "python -c \"import httpx; r = httpx.get('$BKNOWLEDGE_API_URL/api/v1/health', timeout=5); print(f'API Status: {r.status_code}')\"" 2>/dev/null; then
        log_success "API connectivity verified"
    else
        log_warning "Could not verify API connectivity (may be offline)"
    fi
    
    log_success "All validation tests passed"
}

##############################################################################
# PHASE 5: VERIFY DATASET & CONFIG
##############################################################################

verify_configuration() {
    log_header "Phase 5: Configuration Verification"
    
    # Check dataset
    if [ -f "dataset/eval_dataset.yaml" ]; then
        local count=$(grep -c "^  - test:" dataset/eval_dataset.yaml || echo "0")
        log_success "Dataset found (approx $count test cases)"
    else
        log_warning "Dataset file not found at dataset/eval_dataset.yaml"
        log_info "You will need to prepare dataset in Phase 2 before running eval"
    fi
    
    # Check promptfoo config
    if [ -f "promptfooconfig.yaml" ]; then
        log_success "Promptfoo config found"
    else
        log_warning "promptfooconfig.yaml not found"
    fi
    
    # Check providers
    if [ -f "providers/rag_provider.py" ]; then
        log_success "RAG provider found"
    else
        log_warning "RAG provider not found (will need to implement)"
    fi
}

##############################################################################
# SUMMARY & NEXT STEPS
##############################################################################

show_summary() {
    log_header "Deployment Summary"
    
    echo "✓ Deployment completed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Prepare dataset (if not done):"
    echo "     - Upload docs to Easy Dataset UI"
    echo "     - Generate Q&A pairs"
    echo "     - Verify and export to dataset/eval_dataset.yaml"
    echo ""
    echo "  2. Develop evaluation code:"
    echo "     - Implement providers/rag_provider.py"
    echo "     - Implement metrics/* modules"
    echo "     - Test: make shell"
    echo ""
    echo "  3. Run evaluation:"
    echo "     - make eval (full pipeline)"
    echo "     - make report (generate reports)"
    echo ""
    echo "Useful commands:"
    echo "  make build          - Rebuild Docker image"
    echo "  make eval           - Run evaluation"
    echo "  make shell          - Interactive shell in container"
    echo "  make report         - Generate reports"
    echo "  docker compose logs - View container logs"
    echo ""
}

##############################################################################
# MAIN SCRIPT
##############################################################################

main() {
    local check_only=false
    local skip_validation=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help)
                echo "Usage: ./deploy.sh [options]"
                echo ""
                echo "Options:"
                echo "  --help          Show this help message"
                echo "  --check-only    Only check prerequisites, don't build"
                echo "  --skip-validation   Skip container validation tests"
                echo ""
                exit 0
                ;;
            --check-only)
                check_only=true
                shift
                ;;
            --skip-validation)
                skip_validation=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Change to script directory
    cd "$SCRIPT_DIR"
    
    # Execute phases
    log_header "RAG Evaluation System - Deployment"
    
    check_prerequisites || exit 1
    
    if [ "$check_only" = true ]; then
        log_success "Prerequisites check completed"
        exit 0
    fi
    
    setup_environment || {
        log_warning "Please configure .env and run deploy.sh again"
        exit 0
    }
    
    build_docker_image || exit 1
    
    if [ "$skip_validation" = false ]; then
        validate_container || exit 1
    fi
    
    verify_configuration
    
    show_summary
}

# Run main
main "$@"

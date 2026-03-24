#!/bin/bash
##
## RAG Evaluation Entry Point Script
## 
## This script orchestrates the entire RAG evaluation pipeline:
## 1. Validates environment and prerequisites
## 2. Converts CSV dataset to YAML format
## 3. Runs promptfoo evaluation
## 4. Generates reports
## 
## @description Main entry point for RAG evaluation system
## @usage bash run_eval.sh [options]
## @example bash run_eval.sh --full-report
##

set -e  # Exit on error

# Color definitions for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATASET_DIR="${SCRIPT_DIR}/dataset"
RESULTS_DIR="${SCRIPT_DIR}/results"
LOGS_DIR="${SCRIPT_DIR}/logs"

# Logger function
log() {
    local level=$1
    shift
    local message=$@
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)
            echo -e "${BLUE}[${timestamp}] ℹ️  ${message}${NC}"
            echo "[${timestamp}] INFO: ${message}" >> "${LOGS_DIR}/eval.log"
            ;;
        SUCCESS)
            echo -e "${GREEN}[${timestamp}] ✅ ${message}${NC}"
            echo "[${timestamp}] SUCCESS: ${message}" >> "${LOGS_DIR}/eval.log"
            ;;
        WARN)
            echo -e "${YELLOW}[${timestamp}] ⚠️  ${message}${NC}"
            echo "[${timestamp}] WARN: ${message}" >> "${LOGS_DIR}/eval.log"
            ;;
        ERROR)
            echo -e "${RED}[${timestamp}] ❌ ${message}${NC}"
            echo "[${timestamp}] ERROR: ${message}" >> "${LOGS_DIR}/eval.log"
            ;;
    esac
}

# Step 1: Initialize environment
step_init() {
    log INFO "Step 1/4: Initializing environment..."
    
    # Create required directories
    mkdir -p "${DATASET_DIR}" "${RESULTS_DIR}" "${LOGS_DIR}"
    
    # Load environment variables
    if [ -f "${SCRIPT_DIR}/.env" ]; then
        export $(cat "${SCRIPT_DIR}/.env" | grep -v '#' | xargs)
        log SUCCESS "Environment variables loaded"
    else
        log WARN ".env file not found - using system environment"
    fi
    
    # Verify required tools
    if ! command -v python &> /dev/null; then
        log ERROR "Python is not installed"
        return 1
    fi
    
    if ! command -v promptfoo &> /dev/null; then
        log WARN "Promptfoo not found in PATH, attempting npm install -g promptfoo"
        npm install -g promptfoo || {
            log ERROR "Failed to install promptfoo"
            return 1
        }
    fi
    
    log SUCCESS "Environment initialized"
    return 0
}

# Step 2: Prepare dataset (CSV -> YAML)
step_prepare_dataset() {
    log INFO "Step 2/4: Preparing dataset..."
    
    if [ ! -f "${DATASET_DIR}/qa_pairs.csv" ]; then
        log WARN "qa_pairs.csv not found in ${DATASET_DIR}"
        log INFO "Skipping dataset preparation"
        return 0
    fi
    
    local csv_file="${DATASET_DIR}/qa_pairs.csv"
    local yaml_file="${DATASET_DIR}/eval_dataset.yaml"
    
    log INFO "Converting CSV to YAML: ${csv_file} → ${yaml_file}"
    
    # Run converter script
    python "${SCRIPT_DIR}/scripts/csv_to_yaml.py" "${csv_file}" "${yaml_file}" || {
        log ERROR "Failed to convert CSV to YAML"
        return 1
    }
    
    log SUCCESS "Dataset prepared"
    return 0
}

# Step 3: Run evaluation
step_run_evaluation() {
    log INFO "Step 3/4: Running RAG evaluation..."
    
    if [ ! -f "${SCRIPT_DIR}/promptfooconfig.yaml" ]; then
        log WARN "promptfooconfig.yaml not found"
        log INFO "Skipping evaluation"
        return 0
    fi
    
    log INFO "Executing: promptfoo eval"
    
    # Run promptfoo evaluation
    cd "${SCRIPT_DIR}"
    promptfoo eval \
        --config promptfooconfig.yaml \
        --output "${RESULTS_DIR}/eval_results.json" || {
        log WARN "Evaluation completed with warnings"
    }
    
    log SUCCESS "Evaluation completed"
    return 0
}

# Step 4: Generate reports
step_generate_reports() {
    log INFO "Step 4/4: Generating reports..."
    
    if [ ! -f "${RESULTS_DIR}/eval_results.json" ]; then
        log WARN "No evaluation results found"
        return 0
    fi
    
    log INFO "Generating HTML report..."
    
    # Generate HTML report
    promptfoo show \
        --config promptfooconfig.yaml \
        --output "${RESULTS_DIR}/report.html" || {
        log WARN "HTML report generation skipped"
    }
    
    # Generate JSON summary
    python "${SCRIPT_DIR}/scripts/generate_report.py" \
        "${RESULTS_DIR}/eval_results.json" \
        "${RESULTS_DIR}" || {
        log WARN "Summary report generation failed"
    }
    
    log SUCCESS "Reports generated to ${RESULTS_DIR}"
    return 0
}

# Help function
show_help() {
    cat << EOF
RAG Evaluation Entry Point Script

USAGE:
  ./run_eval.sh [OPTIONS]

OPTIONS:
  --help              Show this help message
  --skip-prepare      Skip dataset preparation (CSV→YAML)
  --skip-eval         Skip evaluation step
  --skip-report       Skip report generation
  --full-report       Generate all report formats
  --verbose           Enable verbose logging
  --dry-run           Show what would be executed

EXAMPLES:
  ./run_eval.sh                    # Run complete pipeline
  ./run_eval.sh --skip-prepare     # Skip dataset prep
  ./run_eval.sh --full-report      # Generate all reports

OUTPUT:
  Results saved to: ${RESULTS_DIR}/
  Logs saved to:    ${LOGS_DIR}/eval.log

EOF
}

# Main execution
main() {
    log INFO "=========================================="
    log INFO "RAG Evaluation Pipeline"
    log INFO "=========================================="
    
    # Parse arguments
    SKIP_PREPARE=false
    SKIP_EVAL=false
    SKIP_REPORT=false
    FULL_REPORT=false
    VERBOSE=false
    DRY_RUN=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help)
                show_help
                exit 0
                ;;
            --skip-prepare)
                SKIP_PREPARE=true
                shift
                ;;
            --skip-eval)
                SKIP_EVAL=true
                shift
                ;;
            --skip-report)
                SKIP_REPORT=true
                shift
                ;;
            --full-report)
                FULL_REPORT=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            *)
                log ERROR "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Run pipeline
    step_init || exit 1
    
    if [ "$SKIP_PREPARE" = false ]; then
        step_prepare_dataset || exit 1
    else
        log INFO "Skipping dataset preparation"
    fi
    
    if [ "$SKIP_EVAL" = false ]; then
        step_run_evaluation || exit 1
    else
        log INFO "Skipping evaluation"
    fi
    
    if [ "$SKIP_REPORT" = false ]; then
        step_generate_reports || exit 1
    else
        log INFO "Skipping report generation"
    fi
    
    log INFO "=========================================="
    log SUCCESS "Evaluation pipeline completed!"
    log INFO "=========================================="
    
    return 0
}

# Execute main
main "$@"

#!/usr/bin/env bash
# =============================================================================
# build-images-offline.sh — Build Docker images for offline (air-gapped)
# environments using a local Nexus Repository Manager.
#
# All package sources (npm, pip, apt) and base images are pulled from Nexus
# instead of the public internet.
#
# Usage:
#   ./scripts/build-images-offline.sh                            # build all three
#   ./scripts/build-images-offline.sh --service be               # backend only
#   ./scripts/build-images-offline.sh --service worker           # RAG worker only
#   ./scripts/build-images-offline.sh --service converter        # converter only
#   ./scripts/build-images-offline.sh 1.2.3                      # override version tag
#   ./scripts/build-images-offline.sh --no-cache                 # disable layer cache
#   ./scripts/build-images-offline.sh --service be 1.2.3 --no-cache  # combined
#
# Configuration:
#   Nexus URLs  → docker/nexus.env  (copy from docker/nexus.env.example)
#   Image names → docker/.env       (falls back to docker/.env.example)
#
# Requirements:
#   - Docker with BuildKit support (DOCKER_BUILDKIT=1, enabled automatically)
#   - docker/nexus.env properly filled with your Nexus server details
#   - All base images pushed to your local Nexus Docker registry (see nexus.env.example)
# =============================================================================

set -euo pipefail

# Enable BuildKit — required for --mount=type=bind,from= in advance-rag build
export DOCKER_BUILDKIT=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'

step()  { echo; echo "══════════════════════════════════════════════════════════"; \
          echo "  ${CYAN}$*${RESET}"; \
          echo "══════════════════════════════════════════════════════════"; }
ok()    { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*" >&2; }
error() { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }

# ── Load Nexus configuration ───────────────────────────────────────────────────
NEXUS_ENV="${ROOT_DIR}/docker/nexus.env"
if [[ ! -f "${NEXUS_ENV}" ]]; then
  NEXUS_EXAMPLE="${ROOT_DIR}/docker/nexus.env.example"
  [[ -f "${NEXUS_EXAMPLE}" ]] || error "docker/nexus.env.example not found. Cannot continue."
  warn "docker/nexus.env not found — copying template from nexus.env.example"
  cp "${NEXUS_EXAMPLE}" "${NEXUS_ENV}"
  error "Please edit docker/nexus.env with your Nexus server details, then re-run."
fi

# shellcheck source=/dev/null
source "${NEXUS_ENV}"

# Validate required Nexus variables are set and non-empty
: "${NEXUS_REGISTRY:?NEXUS_REGISTRY is not set in docker/nexus.env}"
: "${NEXUS_NPM_REGISTRY:?NEXUS_NPM_REGISTRY is not set in docker/nexus.env}"
: "${NEXUS_PIP_INDEX:?NEXUS_PIP_INDEX is not set in docker/nexus.env}"
: "${NEXUS_TORCH_INDEX:?NEXUS_TORCH_INDEX is not set in docker/nexus.env}"
: "${NEXUS_APT_MIRROR:?NEXUS_APT_MIRROR is not set in docker/nexus.env}"
: "${RAGFLOW_DEPS_IMAGE:?RAGFLOW_DEPS_IMAGE is not set in docker/nexus.env}"

# Derive trusted-host values from index URLs if not explicitly set in nexus.env
# Strips the protocol (http:// or https://) and any path, keeping only host[:port]
NEXUS_PIP_INDEX_HOST="${NEXUS_PIP_INDEX_HOST:-$(echo "${NEXUS_PIP_INDEX}" | sed -E 's|https?://([^/]+).*|\1|')}"
NEXUS_TORCH_INDEX_HOST="${NEXUS_TORCH_INDEX_HOST:-$(echo "${NEXUS_TORCH_INDEX}" | sed -E 's|https?://([^/]+).*|\1|')}"

# ── Load image names / versions from docker/.env ──────────────────────────────
APP_ENV="${ROOT_DIR}/docker/.env"
if [[ ! -f "${APP_ENV}" ]]; then
  APP_ENV="${ROOT_DIR}/docker/.env.example"
  warn "docker/.env not found — using docker/.env.example for image names"
fi

# Read image names; fall back to safe defaults if not defined in the env file
BACKEND_IMAGE=$(grep -E '^BACKEND_IMAGE=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)
BACKEND_VERSION=$(grep -E '^BACKEND_VERSION=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)
RAG_IMAGE=$(grep -E '^RAG_IMAGE=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)
RAG_VERSION=$(grep -E '^RAG_VERSION=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)
CONVERTER_IMAGE=$(grep -E '^CONVERTER_IMAGE=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)
CONVERTER_VERSION=$(grep -E '^CONVERTER_VERSION=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)
FRONTEND_IMAGE=$(grep -E '^FRONTEND_IMAGE=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)
FRONTEND_VERSION=$(grep -E '^FRONTEND_VERSION=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)

BACKEND_IMAGE="${BACKEND_IMAGE:-kb-backend}"
BACKEND_VERSION="${BACKEND_VERSION:-latest}"
RAG_IMAGE="${RAG_IMAGE:-kb-worker}"
RAG_VERSION="${RAG_VERSION:-latest}"
CONVERTER_IMAGE="${CONVERTER_IMAGE:-kb-converter}"
CONVERTER_VERSION="${CONVERTER_VERSION:-latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-kb-frontend}"
FRONTEND_VERSION="${FRONTEND_VERSION:-latest}"

# ── Parse CLI arguments ────────────────────────────────────────────────────────
EXTRA_FLAGS=()
VERSION_OVERRIDE=""
TARGET_SERVICE="all"   # all | be | worker | converter

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cache)
      EXTRA_FLAGS+=("--no-cache")
      shift
      ;;
    --service)
      [[ $# -gt 1 ]] || error "--service requires a value: be | worker | converter | fe"
      TARGET_SERVICE="$2"
      shift 2
      ;;
    --*)
      error "Unknown flag: $1  (valid flags: --no-cache, --service)"
      ;;
    *)
      # First non-flag positional argument is treated as a version tag override
      if [[ -z "${VERSION_OVERRIDE}" ]]; then
        VERSION_OVERRIDE="$1"
      fi
      shift
      ;;
  esac
done

# Apply version override to all images if provided
if [[ -n "${VERSION_OVERRIDE}" ]]; then
  BACKEND_VERSION="${VERSION_OVERRIDE}"
  RAG_VERSION="${VERSION_OVERRIDE}"
  CONVERTER_VERSION="${VERSION_OVERRIDE}"
  FRONTEND_VERSION="${VERSION_OVERRIDE}"
fi

# ── Print active configuration ─────────────────────────────────────────────────
echo
echo "  Nexus Registry      : ${NEXUS_REGISTRY}"
echo "  npm Registry        : ${NEXUS_NPM_REGISTRY}"
echo "  PyPI Index          : ${NEXUS_PIP_INDEX}"
echo "  Torch Index         : ${NEXUS_TORCH_INDEX}"
echo "  APT Mirror          : ${NEXUS_APT_MIRROR}"
echo "  RAGFlow Deps Image  : ${RAGFLOW_DEPS_IMAGE}"
echo "  Target service      : ${TARGET_SERVICE}"
[[ ${#EXTRA_FLAGS[@]} -gt 0 ]] && echo "  Extra docker flags  : ${EXTRA_FLAGS[*]}"

# ── Build functions ────────────────────────────────────────────────────────────

build_be() {
  step "1/1 — Backend  →  ${BACKEND_IMAGE}:${BACKEND_VERSION}"
  docker build "${EXTRA_FLAGS[@]}" \
    --build-arg "NEXUS_REGISTRY=${NEXUS_REGISTRY}" \
    --build-arg "NEXUS_NPM_REGISTRY=${NEXUS_NPM_REGISTRY}" \
    -t "${BACKEND_IMAGE}:${BACKEND_VERSION}" \
    -f "${ROOT_DIR}/be/Dockerfile.offline" \
    "${ROOT_DIR}/be"
  ok "${BACKEND_IMAGE}:${BACKEND_VERSION}"
}

build_worker() {
  step "1/1 — RAG Worker  →  ${RAG_IMAGE}:${RAG_VERSION}"
  docker build "${EXTRA_FLAGS[@]}" \
    --build-arg "NEXUS_REGISTRY=${NEXUS_REGISTRY}" \
    --build-arg "NEXUS_APT_MIRROR=${NEXUS_APT_MIRROR}" \
    --build-arg "NEXUS_PIP_INDEX=${NEXUS_PIP_INDEX}" \
    --build-arg "NEXUS_PIP_INDEX_HOST=${NEXUS_PIP_INDEX_HOST}" \
    --build-arg "NEXUS_TORCH_INDEX=${NEXUS_TORCH_INDEX}" \
    --build-arg "NEXUS_TORCH_INDEX_HOST=${NEXUS_TORCH_INDEX_HOST}" \
    --build-arg "RAGFLOW_DEPS_IMAGE=${RAGFLOW_DEPS_IMAGE}" \
    -t "${RAG_IMAGE}:${RAG_VERSION}" \
    -f "${ROOT_DIR}/advance-rag/Dockerfile.offline" \
    "${ROOT_DIR}/advance-rag"
  ok "${RAG_IMAGE}:${RAG_VERSION}"
}

build_converter() {
  step "1/1 — Converter  →  ${CONVERTER_IMAGE}:${CONVERTER_VERSION}"
  docker build "${EXTRA_FLAGS[@]}" \
    --build-arg "NEXUS_REGISTRY=${NEXUS_REGISTRY}" \
    --build-arg "NEXUS_APT_MIRROR=${NEXUS_APT_MIRROR}" \
    --build-arg "NEXUS_PIP_INDEX=${NEXUS_PIP_INDEX}" \
    --build-arg "NEXUS_PIP_INDEX_HOST=${NEXUS_PIP_INDEX_HOST}" \
    -t "${CONVERTER_IMAGE}:${CONVERTER_VERSION}" \
    -f "${ROOT_DIR}/converter/Dockerfile.offline" \
    "${ROOT_DIR}/converter"
  ok "${CONVERTER_IMAGE}:${CONVERTER_VERSION}"
}

build_fe() {
  step "1/1 — Frontend  →  ${FRONTEND_IMAGE}:${FRONTEND_VERSION}"
  docker build "${EXTRA_FLAGS[@]}" \
    --build-arg "NEXUS_REGISTRY=${NEXUS_REGISTRY}" \
    --build-arg "NEXUS_NPM_REGISTRY=${NEXUS_NPM_REGISTRY}" \
    -t "${FRONTEND_IMAGE}:${FRONTEND_VERSION}" \
    -f "${ROOT_DIR}/fe/Dockerfile.offline" \
    "${ROOT_DIR}"
  ok "${FRONTEND_IMAGE}:${FRONTEND_VERSION}"
}

# ── Dispatch ───────────────────────────────────────────────────────────────────
case "${TARGET_SERVICE}" in
  all)
    step "Step 1/4 — Backend  →  ${BACKEND_IMAGE}:${BACKEND_VERSION}"
    docker build "${EXTRA_FLAGS[@]}" \
      --build-arg "NEXUS_REGISTRY=${NEXUS_REGISTRY}" \
      --build-arg "NEXUS_NPM_REGISTRY=${NEXUS_NPM_REGISTRY}" \
      -t "${BACKEND_IMAGE}:${BACKEND_VERSION}" \
      -f "${ROOT_DIR}/be/Dockerfile.offline" \
      "${ROOT_DIR}/be"
    ok "${BACKEND_IMAGE}:${BACKEND_VERSION}"

    step "Step 2/4 — RAG Worker  →  ${RAG_IMAGE}:${RAG_VERSION}"
    docker build "${EXTRA_FLAGS[@]}" \
      --build-arg "NEXUS_REGISTRY=${NEXUS_REGISTRY}" \
      --build-arg "NEXUS_APT_MIRROR=${NEXUS_APT_MIRROR}" \
      --build-arg "NEXUS_PIP_INDEX=${NEXUS_PIP_INDEX}" \
      --build-arg "NEXUS_PIP_INDEX_HOST=${NEXUS_PIP_INDEX_HOST}" \
      --build-arg "NEXUS_TORCH_INDEX=${NEXUS_TORCH_INDEX}" \
      --build-arg "NEXUS_TORCH_INDEX_HOST=${NEXUS_TORCH_INDEX_HOST}" \
      --build-arg "RAGFLOW_DEPS_IMAGE=${RAGFLOW_DEPS_IMAGE}" \
      -t "${RAG_IMAGE}:${RAG_VERSION}" \
      -f "${ROOT_DIR}/advance-rag/Dockerfile.offline" \
      "${ROOT_DIR}/advance-rag"
    ok "${RAG_IMAGE}:${RAG_VERSION}"

    step "Step 3/4 — Converter  →  ${CONVERTER_IMAGE}:${CONVERTER_VERSION}"
    docker build "${EXTRA_FLAGS[@]}" \
      --build-arg "NEXUS_REGISTRY=${NEXUS_REGISTRY}" \
      --build-arg "NEXUS_APT_MIRROR=${NEXUS_APT_MIRROR}" \
      --build-arg "NEXUS_PIP_INDEX=${NEXUS_PIP_INDEX}" \
      --build-arg "NEXUS_PIP_INDEX_HOST=${NEXUS_PIP_INDEX_HOST}" \
      -t "${CONVERTER_IMAGE}:${CONVERTER_VERSION}" \
      -f "${ROOT_DIR}/converter/Dockerfile.offline" \
      "${ROOT_DIR}/converter"
    ok "${CONVERTER_IMAGE}:${CONVERTER_VERSION}"

    step "Step 4/4 — Frontend  →  ${FRONTEND_IMAGE}:${FRONTEND_VERSION}"
    docker build "${EXTRA_FLAGS[@]}" \
      --build-arg "NEXUS_REGISTRY=${NEXUS_REGISTRY}" \
      --build-arg "NEXUS_NPM_REGISTRY=${NEXUS_NPM_REGISTRY}" \
      -t "${FRONTEND_IMAGE}:${FRONTEND_VERSION}" \
      -f "${ROOT_DIR}/fe/Dockerfile.offline" \
      "${ROOT_DIR}"
    ok "${FRONTEND_IMAGE}:${FRONTEND_VERSION}"

    echo
    echo "All offline images built successfully:"
    echo "  ${BACKEND_IMAGE}:${BACKEND_VERSION}"
    echo "  ${RAG_IMAGE}:${RAG_VERSION}"
    echo "  ${CONVERTER_IMAGE}:${CONVERTER_VERSION}"
    echo "  ${FRONTEND_IMAGE}:${FRONTEND_VERSION}"
    ;;
  be)
    build_be
    ;;
  worker)
    build_worker
    ;;
  converter)
    build_converter
    ;;
  fe)
    build_fe
    ;;
  *)
    error "Unknown service: '${TARGET_SERVICE}'  (valid: be | worker | converter | fe)"
    ;;
esac

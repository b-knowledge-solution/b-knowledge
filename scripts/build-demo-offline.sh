#!/usr/bin/env bash
# =============================================================================
# build-demo-offline.sh — Build the all-in-one demo Docker image for offline
# (air-gapped) environments using a local Nexus Repository Manager.
#
# Python packages (including PyTorch) are COPIED from the pre-built kb-worker
# image — no pip install needed. Only npm and apt use Nexus.
#
# Usage:
#   ./scripts/build-demo-offline.sh                  # build demo image
#   ./scripts/build-demo-offline.sh 1.2.3            # override version tag
#   ./scripts/build-demo-offline.sh --no-cache       # disable layer cache
#
# Configuration:
#   Nexus URLs  → docker/nexus.env  (copy from docker/nexus.env.example)
#   Image names → docker/.env       (falls back to docker/.env.example)
#
# Prerequisites:
#   1. Build kb-worker FIRST: ./scripts/build-images-offline.sh --service worker
#   2. Push kb-worker to your local Nexus Docker registry
#   3. Push base images to Nexus (python:3.11-slim-bullseye, node:22-alpine,
#      node:22-slim)
#   4. Push infiniflow/ragflow_deps:latest to Nexus
# =============================================================================

set -euo pipefail

# Enable BuildKit — required for --mount=type=bind,from= support
export DOCKER_BUILDKIT=1

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'

step()  { echo; echo "══════════════════════════════════════════════════════════"; \
          echo "  ${CYAN}$*${RESET}"; \
          echo "══════════════════════════════════════════════════════════"; }
ok()    { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*" >&2; }
error() { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

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

# Validate required Nexus variables
: "${NEXUS_REGISTRY:?NEXUS_REGISTRY is not set in docker/nexus.env}"
: "${NEXUS_NPM_REGISTRY:?NEXUS_NPM_REGISTRY is not set in docker/nexus.env}"
: "${NEXUS_APT_MIRROR:?NEXUS_APT_MIRROR is not set in docker/nexus.env}"
: "${RAGFLOW_DEPS_IMAGE:?RAGFLOW_DEPS_IMAGE is not set in docker/nexus.env}"
: "${RAG_IMAGE:?RAG_IMAGE is not set in docker/nexus.env. Set it to your pre-built kb-worker image path.}"

# ── Load image name / version from docker/.env ──────────────────────────────
APP_ENV="${ROOT_DIR}/docker/.env"
if [[ ! -f "${APP_ENV}" ]]; then
  APP_ENV="${ROOT_DIR}/docker/.env.example"
  warn "docker/.env not found — using docker/.env.example for image names"
fi

DEMO_IMAGE=$(grep -E '^DEMO_IMAGE=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)
DEMO_VERSION=$(grep -E '^DEMO_VERSION=' "${APP_ENV}" | cut -d= -f2 | tr -d '"' || true)

DEMO_IMAGE="${DEMO_IMAGE:-kb-demo}"
DEMO_VERSION="${DEMO_VERSION:-latest}"

# ── Parse CLI arguments ──────────────────────────────────────────────────────
EXTRA_FLAGS=()
VERSION_OVERRIDE=""

for arg in "$@"; do
  case "$arg" in
    --no-cache)
      EXTRA_FLAGS+=("--no-cache")
      ;;
    --*)
      error "Unknown flag: $arg  (valid flags: --no-cache)"
      ;;
    *)
      if [[ -z "${VERSION_OVERRIDE}" ]]; then
        VERSION_OVERRIDE="$arg"
      fi
      ;;
  esac
done

if [[ -n "${VERSION_OVERRIDE}" ]]; then
  DEMO_VERSION="${VERSION_OVERRIDE}"
fi

# ── Print active configuration ───────────────────────────────────────────────
echo
echo "  Nexus Registry      : ${NEXUS_REGISTRY}"
echo "  npm Registry        : ${NEXUS_NPM_REGISTRY}"
echo "  APT Mirror          : ${NEXUS_APT_MIRROR}"
echo "  RAGFlow Deps Image  : ${RAGFLOW_DEPS_IMAGE}"
echo "  RAG Worker Image    : ${RAG_IMAGE}"
echo "  Demo Image          : ${DEMO_IMAGE}:${DEMO_VERSION}"
[[ ${#EXTRA_FLAGS[@]} -gt 0 ]] && echo "  Extra docker flags  : ${EXTRA_FLAGS[*]}"

# ── Build ────────────────────────────────────────────────────────────────────
step "Building Demo All-in-One (offline)  →  ${DEMO_IMAGE}:${DEMO_VERSION}"

docker build "${EXTRA_FLAGS[@]+"${EXTRA_FLAGS[@]}"}" \
  --build-arg "NEXUS_REGISTRY=${NEXUS_REGISTRY}" \
  --build-arg "NEXUS_NPM_REGISTRY=${NEXUS_NPM_REGISTRY}" \
  --build-arg "NEXUS_APT_MIRROR=${NEXUS_APT_MIRROR}" \
  --build-arg "RAGFLOW_DEPS_IMAGE=${RAGFLOW_DEPS_IMAGE}" \
  --build-arg "RAG_IMAGE=${RAG_IMAGE}" \
  -t "${DEMO_IMAGE}:${DEMO_VERSION}" \
  -f "${ROOT_DIR}/docker/Dockerfile.demo.offline" \
  "${ROOT_DIR}"

ok "${DEMO_IMAGE}:${DEMO_VERSION}"

# ── Done ─────────────────────────────────────────────────────────────────────
echo
echo "Demo image built successfully (offline): ${DEMO_IMAGE}:${DEMO_VERSION}"
echo
echo "To start the demo stack:"
echo "  cd docker && docker compose -f docker-compose-demo.yml --env-file .env up -d"

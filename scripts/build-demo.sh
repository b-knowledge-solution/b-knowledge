#!/usr/bin/env bash
# build-demo.sh — Build the all-in-one demo Docker image.
#
# Usage:
#   ./scripts/build-demo.sh             # uses image name/tag from docker/.env
#   ./scripts/build-demo.sh 1.2.3       # overrides the version tag
#   ./scripts/build-demo.sh --no-cache  # passes --no-cache to docker build
#
# Image name is read from docker/.env (DEMO_IMAGE / DEMO_VERSION).
# Override in docker/.env before running.
#
# NOTE: Requires DOCKER_BUILDKIT=1 for --mount=type=bind support
# (model files from infiniflow/ragflow_deps).

set -euo pipefail

# Enable BuildKit — required for --mount=type=bind,from= support
export DOCKER_BUILDKIT=1

# ── Resolve project root (one level up from this script) ─────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Load image name / version from docker/.env (fallback to .env.example) ────
ENV_FILE="${ROOT_DIR}/docker/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  ENV_FILE="${ROOT_DIR}/docker/.env.example"
  echo "[build-demo] docker/.env not found — using docker/.env.example for image names"
fi

# Source only the demo image variables we need
DEMO_IMAGE=$(grep -E '^DEMO_IMAGE=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
DEMO_VERSION=$(grep -E '^DEMO_VERSION=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)

# Apply defaults if .env had no values
DEMO_IMAGE="${DEMO_IMAGE:-kb-demo}"
DEMO_VERSION="${DEMO_VERSION:-latest}"

# ── Parse CLI arguments ──────────────────────────────────────────────────────
EXTRA_FLAGS=()
VERSION_OVERRIDE=""

for arg in "$@"; do
  if [[ "${arg}" == "--no-cache" ]]; then
    EXTRA_FLAGS+=("--no-cache")
  elif [[ -z "${VERSION_OVERRIDE}" && "${arg}" != --* ]]; then
    VERSION_OVERRIDE="${arg}"
  fi
done

if [[ -n "${VERSION_OVERRIDE}" ]]; then
  DEMO_VERSION="${VERSION_OVERRIDE}"
fi

# ── Helper ───────────────────────────────────────────────────────────────────
step() { echo; echo "══════════════════════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════════════════════"; }
ok()   { echo "  ✓ $*"; }

# ── Build ────────────────────────────────────────────────────────────────────
step "Building Demo All-in-One  →  ${DEMO_IMAGE}:${DEMO_VERSION}"
echo "  Context: ${ROOT_DIR}"
echo "  Dockerfile: docker/Dockerfile.demo"
echo

docker build "${EXTRA_FLAGS[@]+"${EXTRA_FLAGS[@]}"}" \
  -t "${DEMO_IMAGE}:${DEMO_VERSION}" \
  -f "${ROOT_DIR}/docker/Dockerfile.demo" \
  "${ROOT_DIR}"

ok "${DEMO_IMAGE}:${DEMO_VERSION}"

# ── Done ─────────────────────────────────────────────────────────────────────
echo
echo "Demo image built successfully: ${DEMO_IMAGE}:${DEMO_VERSION}"
echo
echo "To start the demo stack:"
echo "  cd docker && docker compose -f docker-compose-demo.yml --env-file .env up -d"

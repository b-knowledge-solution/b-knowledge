#!/usr/bin/env bash
# build-images.sh — Build Docker images for backend, RAG worker, and converter.
#
# Usage:
#   ./scripts/build-images.sh             # uses image names/tags from docker/.env
#   ./scripts/build-images.sh 1.2.3       # overrides the version tag for all images
#   ./scripts/build-images.sh --no-cache  # passes --no-cache to every docker build
#
# Image names are read from docker/.env (or docker/.env.example as fallback).
# Override any of them in docker/.env before running.

set -euo pipefail

# ── Resolve project root (one level up from this script) ─────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Load image names / versions from docker/.env (fallback to .env.example) ──
ENV_FILE="${ROOT_DIR}/docker/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  ENV_FILE="${ROOT_DIR}/docker/.env.example"
  echo "[build] docker/.env not found — using docker/.env.example for image names"
fi

# Source only the image-name variables we need (avoid overriding shell env)
BACKEND_IMAGE=$(grep -E '^BACKEND_IMAGE=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
BACKEND_VERSION=$(grep -E '^BACKEND_VERSION=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
RAG_IMAGE=$(grep -E '^RAG_IMAGE=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
RAG_VERSION=$(grep -E '^RAG_VERSION=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
CONVERTER_IMAGE=$(grep -E '^CONVERTER_IMAGE=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
CONVERTER_VERSION=$(grep -E '^CONVERTER_VERSION=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
FRONTEND_IMAGE=$(grep -E '^FRONTEND_IMAGE=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
FRONTEND_VERSION=$(grep -E '^FRONTEND_VERSION=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)

# Apply defaults if .env had no values
BACKEND_IMAGE="${BACKEND_IMAGE:-kb-backend}"
BACKEND_VERSION="${BACKEND_VERSION:-latest}"
RAG_IMAGE="${RAG_IMAGE:-kb-worker}"
RAG_VERSION="${RAG_VERSION:-latest}"
CONVERTER_IMAGE="${CONVERTER_IMAGE:-kb-converter}"
CONVERTER_VERSION="${CONVERTER_VERSION:-latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-kb-frontend}"
FRONTEND_VERSION="${FRONTEND_VERSION:-latest}"

# ── Optional: version override from first positional arg ─────────────────────
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
  BACKEND_VERSION="${VERSION_OVERRIDE}"
  RAG_VERSION="${VERSION_OVERRIDE}"
  CONVERTER_VERSION="${VERSION_OVERRIDE}"
  FRONTEND_VERSION="${VERSION_OVERRIDE}"
fi

# ── Helper ────────────────────────────────────────────────────────────────────
step() { echo; echo "══════════════════════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════════════════════"; }
ok()   { echo "  ✓ $*"; }

# ── 1. Backend (Node.js / Express) ───────────────────────────────────────────
step "Step 1/4 — Backend  →  ${BACKEND_IMAGE}:${BACKEND_VERSION}"
docker build "${EXTRA_FLAGS[@]}" \
  -t "${BACKEND_IMAGE}:${BACKEND_VERSION}" \
  -f "${ROOT_DIR}/be/Dockerfile" \
  "${ROOT_DIR}/be"
ok "${BACKEND_IMAGE}:${BACKEND_VERSION}"

# ── 2. RAG Worker (advance-rag / Python) ─────────────────────────────────────
step "Step 2/4 — RAG Worker  →  ${RAG_IMAGE}:${RAG_VERSION}"
docker build "${EXTRA_FLAGS[@]}" \
  -t "${RAG_IMAGE}:${RAG_VERSION}" \
  -f "${ROOT_DIR}/advance-rag/Dockerfile" \
  "${ROOT_DIR}/advance-rag"
ok "${RAG_IMAGE}:${RAG_VERSION}"

# ── 3. Converter (LibreOffice / Python) ──────────────────────────────────────
step "Step 3/4 — Converter  →  ${CONVERTER_IMAGE}:${CONVERTER_VERSION}"
docker build "${EXTRA_FLAGS[@]}" \
  -t "${CONVERTER_IMAGE}:${CONVERTER_VERSION}" \
  -f "${ROOT_DIR}/converter/Dockerfile" \
  "${ROOT_DIR}/converter"
ok "${CONVERTER_IMAGE}:${CONVERTER_VERSION}"

# ── 4. Frontend (React/Vite → nginx:stable-alpine) ───────────────────────────
step "Step 4/4 — Frontend  →  ${FRONTEND_IMAGE}:${FRONTEND_VERSION}"
docker build "${EXTRA_FLAGS[@]}" \
  -t "${FRONTEND_IMAGE}:${FRONTEND_VERSION}" \
  -f "${ROOT_DIR}/fe/Dockerfile" \
  "${ROOT_DIR}"
ok "${FRONTEND_IMAGE}:${FRONTEND_VERSION}"

# ── Done ─────────────────────────────────────────────────────────────────────
echo
echo "All images built successfully:"
echo "  ${BACKEND_IMAGE}:${BACKEND_VERSION}"
echo "  ${RAG_IMAGE}:${RAG_VERSION}"
echo "  ${CONVERTER_IMAGE}:${CONVERTER_VERSION}"
echo "  ${FRONTEND_IMAGE}:${FRONTEND_VERSION}"

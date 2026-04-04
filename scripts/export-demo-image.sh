#!/usr/bin/env bash
# export-demo-image.sh — Save the kb-demo Docker image to a compressed tar archive.
#
# Usage:
#   ./scripts/export-demo-image.sh                    # saves to ./kb-demo-latest.tar.gz
#   ./scripts/export-demo-image.sh 1.2.3              # override version tag
#   ./scripts/export-demo-image.sh --output /tmp/out  # custom output directory
#
# Image name / version are read from docker/.env (DEMO_IMAGE / DEMO_VERSION).
# Compression uses pigz (parallel gzip) when available, otherwise gzip.

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'

step()  { echo; echo "══════════════════════════════════════════════════════════"; \
          echo -e "  ${CYAN}$*${RESET}"; \
          echo "══════════════════════════════════════════════════════════"; }
ok()    { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*" >&2; }
error() { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }

# ── Resolve paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Load image name / version from docker/.env ─────────────────────────────────
ENV_FILE="${ROOT_DIR}/docker/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  ENV_FILE="${ROOT_DIR}/docker/.env.example"
  warn "docker/.env not found — using docker/.env.example for image names"
fi

DEMO_IMAGE=$(grep -E '^DEMO_IMAGE=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
DEMO_VERSION=$(grep -E '^DEMO_VERSION=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"' || true)
DEMO_IMAGE="${DEMO_IMAGE:-kb-demo}"
DEMO_VERSION="${DEMO_VERSION:-latest}"

# ── Parse CLI arguments ────────────────────────────────────────────────────────
OUTPUT_DIR="${ROOT_DIR}"
VERSION_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output|-o)
      [[ -n "${2:-}" ]] || error "--output requires a directory argument"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --*)
      error "Unknown flag: $1  (valid flags: --output|-o <dir>)"
      ;;
    *)
      if [[ -z "${VERSION_OVERRIDE}" ]]; then
        VERSION_OVERRIDE="$1"
      fi
      shift
      ;;
  esac
done

[[ -n "${VERSION_OVERRIDE}" ]] && DEMO_VERSION="${VERSION_OVERRIDE}"

# ── Verify image exists locally ────────────────────────────────────────────────
if ! docker image inspect "${DEMO_IMAGE}:${DEMO_VERSION}" > /dev/null 2>&1; then
  error "Image ${DEMO_IMAGE}:${DEMO_VERSION} not found locally. Build it first:\n       ./scripts/build-demo.sh"
fi

# ── Choose compressor ──────────────────────────────────────────────────────────
if command -v pigz > /dev/null 2>&1; then
  COMPRESS_CMD="pigz"
  COMPRESS_LABEL="pigz (parallel gzip)"
else
  COMPRESS_CMD="gzip"
  COMPRESS_LABEL="gzip"
fi

# ── Output file path ───────────────────────────────────────────────────────────
mkdir -p "${OUTPUT_DIR}"
SAFE_VERSION="${DEMO_VERSION//:/-}"
OUTPUT_FILE="${OUTPUT_DIR}/${DEMO_IMAGE}-${SAFE_VERSION}.tar.gz"

# ── Get rough image size for display ──────────────────────────────────────────
IMAGE_SIZE=$(docker image inspect "${DEMO_IMAGE}:${DEMO_VERSION}" \
  --format='{{.Size}}' | awk '{printf "%.1f GB", $1/1024/1024/1024}')

# ── Export ─────────────────────────────────────────────────────────────────────
step "Exporting  ${DEMO_IMAGE}:${DEMO_VERSION}  →  ${OUTPUT_FILE}"
echo "  Image size (uncompressed) : ${IMAGE_SIZE}"
echo "  Compressor                : ${COMPRESS_LABEL}"
echo

docker save "${DEMO_IMAGE}:${DEMO_VERSION}" | ${COMPRESS_CMD} > "${OUTPUT_FILE}"

# ── Report ─────────────────────────────────────────────────────────────────────
ARCHIVE_SIZE=$(du -sh "${OUTPUT_FILE}" | cut -f1)
ok "Saved: ${OUTPUT_FILE}  (${ARCHIVE_SIZE} on disk)"

echo
echo "  To transfer to another machine:"
echo "    scp ${OUTPUT_FILE} user@remote-host:/destination/"
echo "  Then on the remote machine:"
echo "    ./scripts/import-demo-image.sh ${OUTPUT_FILE}"
echo

#!/usr/bin/env bash
# import-demo-image.sh — Load a kb-demo Docker image archive on the target machine.
#
# Usage:
#   ./scripts/import-demo-image.sh <archive>         # e.g. kb-demo-latest.tar.gz
#   ./scripts/import-demo-image.sh <archive> --tag my-tag  # re-tag after load
#
# Supports .tar.gz, .tgz, and plain .tar archives.
# After loading the image the script prints the docker compose command to start
# the demo stack.

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

# ── Parse CLI arguments ────────────────────────────────────────────────────────
ARCHIVE=""
RETAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag|-t)
      [[ -n "${2:-}" ]] || error "--tag requires a value, e.g. --tag kb-demo:1.2.3"
      RETAG="$2"
      shift 2
      ;;
    --*)
      error "Unknown flag: $1  (valid flags: --tag|-t <image:tag>)"
      ;;
    *)
      if [[ -z "${ARCHIVE}" ]]; then
        ARCHIVE="$1"
      fi
      shift
      ;;
  esac
done

# ── Validate input ─────────────────────────────────────────────────────────────
[[ -n "${ARCHIVE}" ]] || error "Usage: $0 <archive.tar.gz> [--tag <image:tag>]"
[[ -f "${ARCHIVE}" ]] || error "Archive not found: ${ARCHIVE}"

# ── Detect format and choose decompressor ──────────────────────────────────────
case "${ARCHIVE}" in
  *.tar.gz|*.tgz)
    # Prefer pigz for faster decompression; fall back to gzip / zcat
    if command -v pigz > /dev/null 2>&1; then
      LOAD_CMD="pigz -dc \"${ARCHIVE}\" | docker load"
      DECOMP_LABEL="pigz (parallel gzip)"
    else
      LOAD_CMD="gzip -dc \"${ARCHIVE}\" | docker load"
      DECOMP_LABEL="gzip"
    fi
    ;;
  *.tar)
    LOAD_CMD="docker load --input \"${ARCHIVE}\""
    DECOMP_LABEL="none (plain tar)"
    ;;
  *)
    error "Unsupported archive format: ${ARCHIVE}\n       Expected .tar.gz, .tgz, or .tar"
    ;;
esac

# ── Show archive size ──────────────────────────────────────────────────────────
ARCHIVE_SIZE=$(du -sh "${ARCHIVE}" | cut -f1)

step "Loading Docker image from  ${ARCHIVE}"
echo "  Archive size  : ${ARCHIVE_SIZE}"
echo "  Decompressor  : ${DECOMP_LABEL}"
echo

# ── Load the image ─────────────────────────────────────────────────────────────
LOAD_OUTPUT=$(eval "${LOAD_CMD}" 2>&1)
echo "${LOAD_OUTPUT}"

# ── Extract loaded image name from docker load output ─────────────────────────
# docker load prints: "Loaded image: <name>:<tag>"
LOADED_IMAGE=$(echo "${LOAD_OUTPUT}" | grep -oP '(?<=Loaded image: )\S+' || true)

if [[ -z "${LOADED_IMAGE}" ]]; then
  # Fallback: try "Loaded image ID:" format (unsigned images)
  warn "Could not detect loaded image name automatically — run 'docker images' to confirm."
else
  ok "Loaded: ${LOADED_IMAGE}"
fi

# ── Optional re-tag ────────────────────────────────────────────────────────────
if [[ -n "${RETAG}" && -n "${LOADED_IMAGE}" ]]; then
  docker tag "${LOADED_IMAGE}" "${RETAG}"
  ok "Re-tagged: ${LOADED_IMAGE}  →  ${RETAG}"
  LOADED_IMAGE="${RETAG}"
fi

# ── Print next steps ───────────────────────────────────────────────────────────
echo
echo "  Next steps:"
echo "  ─────────────────────────────────────────────────────────"

# Try to detect the image base name for the env hint
IMAGE_BASE="${LOADED_IMAGE%%:*}"
IMAGE_TAG="${LOADED_IMAGE##*:}"

echo "  1. Ensure docker/.env contains:"
echo "       DEMO_IMAGE=${IMAGE_BASE}"
echo "       DEMO_VERSION=${IMAGE_TAG}"
echo
echo "  2. Start the demo stack:"
echo "       cd ${ROOT_DIR}/docker"
echo "       docker compose -f docker-compose-demo.yml --env-file .env up -d"
echo
echo "  3. Open: http://localhost  (or the configured port)"
echo

#!/usr/bin/env bash
# =============================================================================
# build-converter-offline.sh — Build the converter (LibreOffice / Python)
# Docker image using a local Nexus Repository Manager. No internet access required.
#
# Usage:
#   ./scripts/build-converter-offline.sh                # build with defaults
#   ./scripts/build-converter-offline.sh 1.2.3          # override image version tag
#   ./scripts/build-converter-offline.sh --no-cache     # disable Docker layer cache
#
# Configuration:
#   Edit docker/nexus.env  (copy from docker/nexus.env.example).
#   Relevant variables:
#     NEXUS_REGISTRY, NEXUS_APT_MIRROR,
#     NEXUS_PIP_INDEX, NEXUS_PIP_INDEX_HOST
#
# Delegates to: scripts/build-images-offline.sh --service converter
# =============================================================================
exec "$(dirname "${BASH_SOURCE[0]}")/build-images-offline.sh" --service converter "$@"

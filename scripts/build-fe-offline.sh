#!/usr/bin/env bash
# =============================================================================
# build-fe-offline.sh — Build the frontend (React/Vite → nginx:stable-alpine)
# Docker image using a local Nexus Repository Manager. No internet access required.
#
# Usage:
#   ./scripts/build-fe-offline.sh                # build with defaults
#   ./scripts/build-fe-offline.sh 1.2.3          # override image version tag
#   ./scripts/build-fe-offline.sh --no-cache     # disable Docker layer cache
#
# Configuration:
#   Edit docker/nexus.env  (copy from docker/nexus.env.example).
#   Relevant variables:  NEXUS_REGISTRY, NEXUS_NPM_REGISTRY
#
# Delegates to: scripts/build-images-offline.sh --service fe
# =============================================================================
exec "$(dirname "${BASH_SOURCE[0]}")/build-images-offline.sh" --service fe "$@"

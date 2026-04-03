#!/usr/bin/env bash
# =============================================================================
# build-be-offline.sh — Build the backend (Node.js/Express) Docker image
# using a local Nexus Repository Manager. No internet access required.
#
# Usage:
#   ./scripts/build-be-offline.sh                # build with defaults
#   ./scripts/build-be-offline.sh 1.2.3          # override image version tag
#   ./scripts/build-be-offline.sh --no-cache     # disable Docker layer cache
#
# Configuration:
#   Edit docker/nexus.env  (copy from docker/nexus.env.example).
#   Relevant variables:  NEXUS_REGISTRY, NEXUS_NPM_REGISTRY
#
# Delegates to: scripts/build-images-offline.sh --service be
# =============================================================================
exec "$(dirname "${BASH_SOURCE[0]}")/build-images-offline.sh" --service be "$@"

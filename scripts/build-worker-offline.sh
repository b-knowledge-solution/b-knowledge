#!/usr/bin/env bash
# =============================================================================
# build-worker-offline.sh — Build the RAG worker (advance-rag / Python)
# Docker image using a local Nexus Repository Manager. No internet access required.
#
# Usage:
#   ./scripts/build-worker-offline.sh                # build with defaults
#   ./scripts/build-worker-offline.sh 1.2.3          # override image version tag
#   ./scripts/build-worker-offline.sh --no-cache     # disable Docker layer cache
#
# Configuration:
#   Edit docker/nexus.env  (copy from docker/nexus.env.example).
#   Relevant variables:
#     NEXUS_REGISTRY, NEXUS_APT_MIRROR,
#     NEXUS_PIP_INDEX, NEXUS_PIP_INDEX_HOST,
#     NEXUS_TORCH_INDEX, NEXUS_TORCH_INDEX_HOST,
#     RAGFLOW_DEPS_IMAGE
#
# Delegates to: scripts/build-images-offline.sh --service worker
# =============================================================================
exec "$(dirname "${BASH_SOURCE[0]}")/build-images-offline.sh" --service worker "$@"

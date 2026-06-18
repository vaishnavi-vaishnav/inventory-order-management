#!/usr/bin/env bash
# Build and push inventory app Docker images to Docker Hub.
# Usage: ./scripts/publish-docker.sh YOUR_DOCKERHUB_USERNAME [BACKEND_URL]
set -euo pipefail

DOCKER_USER="${1:?Usage: $0 DOCKERHUB_USERNAME [REACT_APP_BACKEND_URL]}"
BACKEND_URL="${2:-http://localhost:8001}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building backend: ${DOCKER_USER}/inventory-backend:latest"
docker build -t "${DOCKER_USER}/inventory-backend:latest" "${ROOT}/backend"

echo "==> Building frontend: ${DOCKER_USER}/inventory-frontend:latest"
docker build \
  --build-arg "REACT_APP_BACKEND_URL=${BACKEND_URL}" \
  -t "${DOCKER_USER}/inventory-frontend:latest" \
  "${ROOT}/frontend"

echo "==> Pushing images (run 'docker login' first if needed)"
docker push "${DOCKER_USER}/inventory-backend:latest"
docker push "${DOCKER_USER}/inventory-frontend:latest"

echo ""
echo "Done. Docker Hub links:"
echo "  https://hub.docker.com/r/${DOCKER_USER}/inventory-backend"
echo "  https://hub.docker.com/r/${DOCKER_USER}/inventory-frontend"

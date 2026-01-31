#!/bin/bash
set -e

IMAGE_NAME="mcp-probe:test"
CONTAINER_NAME="mcp-probe-test"
PORT=3000

cleanup() {
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== Building image ==="
docker build -t "$IMAGE_NAME" .

echo "=== Starting container ==="
docker run -d --name "$CONTAINER_NAME" -p "$PORT:$PORT" -e OBSERVABILITY=true "$IMAGE_NAME"

echo "=== Waiting for health check ==="
timeout 30 bash -c "until curl -sf http://localhost:$PORT/health; do sleep 1; done"

echo "=== Testing /health ==="
curl -sf http://localhost:$PORT/health | grep -q '"status":"ok"'

echo "=== Testing /dashboard/ ==="
curl -sf http://localhost:$PORT/dashboard/ | grep -q '<div id="root">'

echo ""
echo "✓ All infrastructure tests passed"

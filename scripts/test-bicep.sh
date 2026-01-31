#!/bin/bash
set -e

echo "=== Validating Bicep templates ==="

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
  echo "❌ Azure CLI not installed"
  exit 1
fi

# Lint the Bicep files
echo "=== Linting main.bicep ==="
az bicep lint --file infra/main.bicep

echo "=== Linting resources.bicep ==="
az bicep lint --file infra/resources.bicep

# Build (compile to ARM) to catch errors
echo "=== Building Bicep to ARM ==="
az bicep build --file infra/main.bicep --outfile /tmp/main.json

echo ""
echo "✓ Bicep validation passed"

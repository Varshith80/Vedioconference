#!/usr/bin/env bash
# Deploy every workflow in n8n/workflows/ to the target environment.
# Usage: ./scripts/deploy-n8n.sh production
set -euo pipefail

ENV=${1:-staging}
: "${N8N_BASE_URL:?N8N_BASE_URL is required}"
: "${N8N_API_KEY:?N8N_API_KEY is required}"

echo "→ Deploying n8n workflows to $ENV ($N8N_BASE_URL)"
for f in n8n/workflows/*.json; do
    echo "  - $f"
    curl -fsS -X POST \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -H "Content-Type: application/json" \
        --data-binary "@$f" \
        "$N8N_BASE_URL/api/v1/workflows?force=true" >/dev/null
done
echo "✅ All workflows deployed."

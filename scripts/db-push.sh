#!/usr/bin/env bash
# Apply Supabase migrations to the target environment.
# Usage: ./scripts/db-push.sh staging
set -euo pipefail

ENV=${1:-staging}
echo "→ Pushing schema to $ENV"
supabase db push --db-url "$(./scripts/db-url.sh "$ENV")"
echo "✅ Done."

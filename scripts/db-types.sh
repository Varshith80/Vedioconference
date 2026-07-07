#!/usr/bin/env bash
# Regenerate the typed Supabase client from the local DB.
set -euo pipefail
echo "→ Generating types"
pnpm db:types
echo "✅ apps/web/types/database.generated.ts updated"

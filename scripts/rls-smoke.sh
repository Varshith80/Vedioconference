#!/usr/bin/env bash
# =====================================================================
# rls-smoke.sh — run the Sprint B2 RLS smoke test against a
# Supabase Postgres database.
#
# Usage:
#   scripts/rls-smoke.sh <environment>
#     environment ∈ {local, staging, production}
#
# Reads DATABASE_URL from .env.<environment> (same convention as
# scripts/db-url.sh). Exits non-zero on the first failure.
#
# Does NOT touch .env.local — the user's local override.
# =====================================================================
set -euo pipefail

ENV=${1:-staging}
ENV_FILE=".env.$ENV"
ROOT=$(cd "$(dirname "$0")/.." && pwd)

if [[ ! -f $ENV_FILE ]]; then
    echo "ERROR: $ENV_FILE not found (tried: $ROOT/$ENV_FILE)" >&2
    exit 1
fi
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
if [[ -z $DATABASE_URL ]]; then
    echo "ERROR: DATABASE_URL not set in $ENV_FILE" >&2
    exit 1
fi

run_sql() {
    local file=$1
    echo "==> $file"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc -f "$ROOT/$file"
}

run_sql supabase/tests/rls_smoke_setup.sql
run_sql supabase/tests/rls_smoke_assertions.sql
run_sql supabase/tests/rls_smoke_teardown.sql

echo
echo "RLS smoke test: PASS"

#!/usr/bin/env bash
# Print the database URL for an environment.
# Reads from .env.$ENV if present, otherwise errors.
set -euo pipefail
ENV=${1:-staging}
ENV_FILE=".env.$ENV"
if [[ ! -f $ENV_FILE ]]; then
    echo "ERROR: $ENV_FILE not found" >&2
    exit 1
fi
grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-

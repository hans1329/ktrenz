#!/bin/bash
# scripts/db.sh — Run SQL against the production Supabase Postgres.
#
# Setup (one-time):
#   1. Dashboard → Project Settings → Database → Connection string → URI
#      (use the "Session" mode @ port 5432 for simplest psql compat)
#   2. Add to .env (gitignored):
#        DATABASE_URL="postgresql://postgres.jguylowswwgjvotdcsfj:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"
#
# Usage:
#   bash scripts/db.sh "SELECT ..."          # inline SQL
#   bash scripts/db.sh -f path/to/file.sql   # SQL file
#
# Notes:
# - Uses transactional safety: every invocation auto-wraps in BEGIN/COMMIT
#   so a buggy query can't leave dangling state. Override with --no-tx.
# - --raw bypasses the BEGIN/COMMIT wrap (for DDL or multi-statement files
#   that manage their own transactions).
# - Output is plain-text aligned table. Pipe through `column -t` if needed.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[db.sh] $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck disable=SC2046
export $(grep -E '^DATABASE_URL=' "$ENV_FILE" | sed 's/^DATABASE_URL=//; s/^"//; s/"$//' | xargs -I{} echo "DATABASE_URL={}")

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[db.sh] DATABASE_URL not set in $ENV_FILE" >&2
  echo "[db.sh] Add it: DATABASE_URL=\"postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres\"" >&2
  exit 1
fi

RAW=0
if [[ "$1" == "--raw" ]]; then
  RAW=1; shift
fi

PSQL_FLAGS=(--no-psqlrc --quiet --pset=pager=off -X)

if [[ "$1" == "-f" ]]; then
  FILE="$2"
  if [[ ! -f "$FILE" ]]; then
    echo "[db.sh] file not found: $FILE" >&2
    exit 1
  fi
  if [[ $RAW -eq 1 ]]; then
    psql "$DATABASE_URL" "${PSQL_FLAGS[@]}" -f "$FILE"
  else
    psql "$DATABASE_URL" "${PSQL_FLAGS[@]}" -1 -f "$FILE"
  fi
elif [[ -n "$1" ]]; then
  if [[ $RAW -eq 1 ]]; then
    psql "$DATABASE_URL" "${PSQL_FLAGS[@]}" -c "$1"
  else
    psql "$DATABASE_URL" "${PSQL_FLAGS[@]}" -1 -c "$1"
  fi
else
  echo "Usage: bash scripts/db.sh [--raw] <SQL>" >&2
  echo "       bash scripts/db.sh [--raw] -f <file.sql>" >&2
  exit 1
fi

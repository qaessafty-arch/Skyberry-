#!/usr/bin/env bash
# Applies all migrations to a throwaway local Postgres (with Supabase stubs) and runs the SQL tests.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
DIR="$(mktemp -d)"; PORT=54329
cleanup() { "$BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
RUNAS=""; [ "$(id -u)" = 0 ] && { chown -R postgres "$DIR" 2>/dev/null || true; RUNAS="su postgres -c"; }
run() { if [ -n "$RUNAS" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $DIR/data -A trust >/dev/null"
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c listen_addresses=' -l $DIR/log -w start >/dev/null"
PSQL="psql -h $DIR -p $PORT -U postgres -X -q -v ON_ERROR_STOP=1"
run "$PSQL -d postgres -c 'create database sky'" 
P="$PSQL -d sky"
run "$P -f $HERE/stubs.sql"
for f in "$HERE"/../migrations/*.sql; do echo "migrate: $(basename "$f")"; run "$P -f $f"; done
fail=0
for t in "$HERE"/*_test.sql; do
  echo "test: $(basename "$t")"
  if ! run "$P -f $t"; then fail=1; fi
done
[ $fail = 0 ] && echo "ALL DB TESTS PASSED" || { echo "DB TESTS FAILED"; exit 1; }

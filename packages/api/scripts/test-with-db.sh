#!/usr/bin/env bash
# Run the @miel/api test suite against an EPHEMERAL Postgres container. Mirrors
# packages/core/scripts/test-with-db.sh (own container name + port so the two
# suites can run side by side under `turbo run test`, and the same DATABASE_URL
# handoff CI uses). Migrations come from @miel/core's migrate entrypoint.
set -euo pipefail

CONTAINER="miel-api-test-pg"
PORT="${API_TEST_DB_PORT:-5437}"
IMAGE="postgres:16"
DB_USER="miel"
DB_PASS="miel"
DB_NAME="miel_test"

start_ephemeral_postgres() {
  # Pick a Docker daemon that actually responds (OrbStack vs Desktop). Override
  # with DOCKER_CONTEXT.
  docker_cmd=(docker)
  if [ -n "${DOCKER_CONTEXT:-}" ]; then
    docker_cmd=(docker --context "$DOCKER_CONTEXT")
  elif ! docker info >/dev/null 2>&1; then
    for ctx in orbstack desktop-linux default; do
      if docker --context "$ctx" info >/dev/null 2>&1; then
        echo "▸ active Docker context is unhealthy; using '$ctx'"
        docker_cmd=(docker --context "$ctx")
        break
      fi
    done
  fi
  if ! "${docker_cmd[@]}" info >/dev/null 2>&1; then
    echo "✗ no healthy Docker daemon found (tried orbstack, desktop-linux, default)" >&2
    exit 1
  fi
  docker() { command "${docker_cmd[@]}" "$@"; }

  cleanup() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

  echo "▸ starting ephemeral Postgres ($IMAGE) on :$PORT"
  docker run --rm -d \
    --name "$CONTAINER" \
    -e "POSTGRES_USER=$DB_USER" \
    -e "POSTGRES_PASSWORD=$DB_PASS" \
    -e "POSTGRES_DB=$DB_NAME" \
    -p "${PORT}:5432" \
    "$IMAGE" >/dev/null

  # Wait on the HOST-SIDE port (see core's script for why an in-container check
  # races the port-forward).
  echo "▸ waiting for Postgres on localhost:$PORT"
  for i in $(seq 1 30); do
    if nc -z -w1 localhost "$PORT" >/dev/null 2>&1 &&
       docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "✗ Postgres did not become ready on localhost:$PORT in time" >&2
      exit 1
    fi
    sleep 1
  done
}

if [ -n "${DATABASE_URL:-}" ]; then
  echo "▸ DATABASE_URL is already set — running against that Postgres, starting no container"
else
  export DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@localhost:${PORT}/${DB_NAME}"
  start_ephemeral_postgres
fi

# Migrations run either way (see core's script).
echo "▸ applying migrations"
bun run "$(dirname "$0")/../../core/src/db/migrate.ts"

echo "▸ running tests"
if [ "$#" -gt 0 ]; then
  bun test "$@"
else
  bun test ./src
fi

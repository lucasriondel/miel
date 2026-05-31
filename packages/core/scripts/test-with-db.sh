#!/usr/bin/env bash
# Run the @miel/core test suite against an EPHEMERAL Postgres container, so tests
# never touch the dev database (miel-postgres on :5435) and leave zero residue.
#
# The container uses `--rm` and NO named volume: stopping it deletes the
# container and its data. A trap tears it down on any exit (pass, fail, Ctrl-C).
#
# Usage: bun run test            (from packages/core — wired in package.json)
#        ./scripts/test-with-db.sh [extra bun test args]
set -euo pipefail

CONTAINER="miel-test-pg"
PORT="${TEST_DB_PORT:-5436}"
IMAGE="postgres:16"
DB_USER="miel"
DB_PASS="miel"
DB_NAME="miel_test"
export DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@localhost:${PORT}/${DB_NAME}"

# Pick a Docker daemon that actually responds. On machines with both OrbStack and
# Docker Desktop installed, the active context can point at a wedged daemon; we
# probe contexts and use the first healthy one. Override with DOCKER_CONTEXT.
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

# Always clean up the container on exit (covers test failure and interrupts).
cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Remove any leftover from a previously interrupted run before starting fresh.
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

echo "▸ starting ephemeral Postgres ($IMAGE) on :$PORT"
docker run --rm -d \
  --name "$CONTAINER" \
  -e "POSTGRES_USER=$DB_USER" \
  -e "POSTGRES_PASSWORD=$DB_PASS" \
  -e "POSTGRES_DB=$DB_NAME" \
  -p "${PORT}:5432" \
  "$IMAGE" >/dev/null

# Wait on the HOST-SIDE port, not in-container pg_isready: the container reports
# ready before the daemon (esp. OrbStack) finishes wiring the host→container
# port forward, so an in-container check races ahead and migrate hits
# ECONNREFUSED. nc against localhost:$PORT only succeeds once the forward is live.
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

echo "▸ applying migrations"
bun run "$(dirname "$0")/../src/db/migrate.ts"

echo "▸ running tests"
# With explicit args (e.g. a single test file), run just those; otherwise the
# whole src tree.
if [ "$#" -gt 0 ]; then
  bun test "$@"
else
  bun test ./src
fi

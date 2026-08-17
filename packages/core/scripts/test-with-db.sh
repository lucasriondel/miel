#!/usr/bin/env bash
# Run the @miel/core test suite against an EPHEMERAL Postgres container, so tests
# never touch the dev database (miel-postgres on :5435) and leave zero residue.
#
# The container uses `--rm` and NO named volume: stopping it deletes the
# container and its data. A trap tears it down on any exit (pass, fail, Ctrl-C).
#
# A caller that already has a throwaway Postgres exports DATABASE_URL and this
# script uses that one instead of starting anything — that is how CI runs the
# suite (#103), against the workflow's `postgres:16` service container.
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
# Ceiling for any one `bun` invocation below. The whole suite runs in seconds;
# this is a runaway guard, not a budget, so it is set far above a slow-machine
# worst case. Override with TEST_TIMEOUT=<seconds>.
TIMEOUT="${TEST_TIMEOUT:-600}"

# Run a command with two independent kill switches, because `timeout(1)` is not
# on stock macOS (no coreutils) and this script also runs in CI on Linux.
#
#   1. a deadline — the command is killed after $TIMEOUT seconds.
#   2. an orphan check — the watchdog also kills the command if THIS script has
#      died. That is the case that actually bit us: cancelling a Claude Code
#      session kills the wrapper shell, and the orphaned `bun test` was left
#      spinning on a dead stdout pipe at 100% CPU for three and a half days.
#      The EXIT trap cannot help there — the script never gets to run it.
#
# The watchdog is disowned so killing the script does not take it with it; it
# notices the missing parent within a second and cleans up the child.
run_bounded() {
  "$@" &
  local child=$!
  local self=$$

  (
    local waited=0
    while [ "$waited" -lt "$TIMEOUT" ]; do
      sleep 1
      waited=$((waited + 1))
      kill -0 "$child" 2>/dev/null || exit 0        # finished on its own
      if ! kill -0 "$self" 2>/dev/null; then        # parent script is gone
        kill -9 "$child" 2>/dev/null || true
        exit 0
      fi
    done
    echo "✗ '$*' exceeded ${TIMEOUT}s — killing it" >&2
    kill -9 "$child" 2>/dev/null || true
  ) &
  local watchdog=$!
  disown "$watchdog" 2>/dev/null || true

  local status=0
  wait "$child" || status=$?
  kill "$watchdog" 2>/dev/null || true
  return "$status"
}

start_ephemeral_postgres() {
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
}

if [ -n "${DATABASE_URL:-}" ]; then
  echo "▸ DATABASE_URL is already set — running against that Postgres, starting no container"
else
  export DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@localhost:${PORT}/${DB_NAME}"
  start_ephemeral_postgres
fi

# Migrations run either way: a database handed in by DATABASE_URL may be empty
# too, and re-applying an already-migrated one is a no-op.
echo "▸ applying migrations"
run_bounded bun run "$(dirname "$0")/../src/db/migrate.ts"

echo "▸ running tests"
# With explicit args (e.g. a single test file), run just those; otherwise the
# whole src tree.
if [ "$#" -gt 0 ]; then
  run_bounded bun test "$@"
else
  run_bounded bun test ./src

  # The Postgres store adapters (#132) run in a process of their own, and are
  # named `.dbtest.ts` so the sweep above does not collect them. They are the
  # one suite that must reach the real `db/client`, and `mock.module` is
  # process-global: any suite that fakes the client owns it for every file
  # loaded after it, so in the sweep these would silently be asserting against
  # somebody else's fake instead of against Postgres. When the aggregates that
  # still fake the client have stores of their own, this can rejoin the sweep.
  echo "▸ running the Postgres store adapters (own process)"
  run_bounded bun test ./src/stores/postgres.dbtest.ts
fi

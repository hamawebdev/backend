#!/bin/sh
# Container entrypoint: apply pending Prisma migrations, then start the server.
#
# Safety rules:
# - Only `prisma migrate deploy` is used. It applies committed migrations in
#   order under an advisory lock and never resets, drops or pushes the schema.
# - A database that already has tables but no migration history (P3005) is
#   baselined only if its schema is identical to prisma/schema.prisma.
#   Otherwise the container exits without touching the data.
# - Set RUN_MIGRATIONS=false to skip this step.
set -eu

# Commit reported by /health: the image's build commit unless GIT_SHA is set
if [ -z "${GIT_SHA:-}" ] || [ "${GIT_SHA}" = "unknown" ]; then
  GIT_SHA="$(cat /app/.git-sha 2>/dev/null || true)"
  export GIT_SHA="${GIT_SHA:-unknown}"
fi

PRISMA=./node_modules/.bin/prisma
SCHEMA=prisma/schema.prisma

migrate() {
  "$PRISMA" migrate deploy --schema "$SCHEMA"
}

baseline_if_identical() {
  echo "Database has tables but no migration history; checking it matches $SCHEMA"
  set +e
  "$PRISMA" migrate diff --from-schema-datasource "$SCHEMA" --to-schema-datamodel "$SCHEMA" --exit-code >/dev/null
  status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    echo "Refusing to baseline: the database schema differs from $SCHEMA (diff exit code $status)."
    echo "Reconcile it manually, then mark migrations with 'prisma migrate resolve --applied <name>'."
    exit 1
  fi
  for dir in prisma/migrations/*/; do
    name=$(basename "$dir")
    echo "Marking $name as applied"
    "$PRISMA" migrate resolve --schema "$SCHEMA" --applied "$name"
  done
}

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL is not set" >&2
    exit 1
  fi
  echo "Applying database migrations"
  if ! output=$(migrate 2>&1); then
    echo "$output"
    case "$output" in
      *P3005*) baseline_if_identical; migrate ;;
      *) exit 1 ;;
    esac
  else
    echo "$output"
  fi
fi

exec "$@"

#!/bin/sh
set -e

echo "Waiting for the database to accept connections…"
attempt=0
until npx prisma migrate deploy 2>/tmp/migrate.log; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Database never became ready. Last error:"
    cat /tmp/migrate.log
    exit 1
  fi
  sleep 2
done

echo "Migrations applied. Starting the app…"
exec "$@"

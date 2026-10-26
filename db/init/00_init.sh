#!/bin/bash
# Eseguito da postgres:16 solo alla prima inizializzazione del volume.
set -euo pipefail
for f in /albo/migrations/0*.sql; do
  echo "Migrazione: $f"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f"
done
for f in /albo/seed/*.sql; do
  echo "Seed: $f"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f"
done

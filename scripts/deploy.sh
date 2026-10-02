#!/bin/sh
# Production update on the VPS, run by GitHub Actions over SSH (see docs/DEPLOY.md) or by hand: `sh scripts/deploy.sh`.
# Pulls main, refreshes the base images (security fixes), rebuilds, and restarts what changed; the web container runs
# the database migrations on start. .env and data/ are not in git, so they stay as they are.
set -eu
cd "$(dirname "$0")/.."
for key in POSTGRES_PASSWORD ENCRYPTION_KEY APP_URL ADMIN_URL; do
  grep -q "^$key=." .env || { echo "deploy: $key is empty in .env (see docs/DEPLOY.md, part E)" >&2; exit 1; }
done
git pull --ff-only origin main
docker compose --profile https pull --ignore-buildable --quiet
docker compose --profile https build --pull
docker compose --profile https up -d --remove-orphans
docker image prune -f >/dev/null
docker compose ps

#!/bin/sh
# Production update on the VPS, run by GitHub Actions over SSH (see docs/DEPLOY.md) or by hand: `sh scripts/deploy.sh`.
# Pulls main, refreshes the base images (security fixes), rebuilds, and restarts what changed; the web container runs
# the database migrations on start. .env and data/ are not in git, so they stay as they are.
# HTTPS profile (Caddy): not passed here. Set COMPOSE_PROFILES=https in .env only when Caddy should own ports 80/443;
# on a VPS where nginx already does, leave it unset.
set -eu
cd "$(dirname "$0")/.."
for key in POSTGRES_PASSWORD ENCRYPTION_KEY APP_URL ADMIN_URL; do
  grep -q "^$key=." .env || { echo "deploy: $key is empty in .env (see docs/DEPLOY.md, part E)" >&2; exit 1; }
done
git pull --ff-only origin main
docker compose pull --ignore-buildable --quiet
docker compose build --pull
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
docker compose ps

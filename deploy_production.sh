#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; OLD_DIR="$(dirname "$ROOT_DIR")/NTUEECourseWebsite2021"; BACKUP_DIR="$(dirname "$ROOT_DIR")/NTUEECourseWebsite2026-deploy-backups"; YES=0; CHECK=0
while (($#)); do case "$1" in --yes) YES=1;; --check) CHECK=1;; -h|--help) echo "Usage: ./deploy_production.sh [--yes] [--check]"; exit 0;; *) echo "Unknown option: $1" >&2; exit 2;; esac; shift; done
old() { docker compose -p ntueecoursewebsite2021 -f "$OLD_DIR/docker-compose.yml" "$@"; }; new() { docker compose -p ntueecoursewebsite2026 --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/docker-compose.yml" "$@"; }
[[ -f "$ROOT_DIR/.env" && -f "$OLD_DIR/.env" ]] || { echo "Create 2026 .env before production handover." >&2; exit 1; }; old config --quiet; new config --quiet; "$ROOT_DIR/deploy_old.sh" --check
((CHECK)) && { "$ROOT_DIR/deploy.sh" --production --check || true; echo "Handover prerequisites checked; no state changed."; exit 0; }
if ((!YES)); then read -r -p "Type DEPLOY2026 to build, back up 2021, and switch production: " answer; [[ "$answer" == DEPLOY2026 ]] || { echo Cancelled.; exit 1; }; fi
echo "Building 2026 images before downtime..."; new build
mongo=$(old ps -q course-mongodb); [[ -n "$mongo" ]] || { echo "2021 Mongo is not running." >&2; exit 1; }
name=$(sed -n 's/^MONGO_DBNAME=//p' "$OLD_DIR/.env" | head -n1); user=$(sed -n 's/^MONGO_USERNAME=//p' "$OLD_DIR/.env" | head -n1); pass=$(sed -n 's/^MONGO_PASSWORD=//p' "$OLD_DIR/.env" | head -n1); mkdir -p "$BACKUP_DIR"; archive="production-${name}-2021-cutover-$(date +%Y%m%d-%H%M%S).archive.gz"
docker exec -e N="$name" -e U="$user" -e P="$pass" -e A="$archive" "$mongo" sh -eu -c 'mongodump --quiet -u "$U" -p "$P" --authenticationDatabase admin --db "$N" --archive="/tmp/$A" --gzip; mongorestore --archive="/tmp/$A" --gzip --dryRun >/dev/null'
docker cp "$mongo:/tmp/$archive" "$BACKUP_DIR/$archive"; docker exec "$mongo" rm -f "/tmp/$archive"; sha256sum "$BACKUP_DIR/$archive"
echo "Stopping 2021; its containers, images, and volumes remain recoverable..."; old down --remove-orphans
trap 'echo "2026 handover failed; rolling back to 2021..." >&2; "$ROOT_DIR/deploy_old.sh" --yes --skip-backup || true' ERR
"$ROOT_DIR/deploy.sh" --production --no-build --skip-backup --restore "$BACKUP_DIR/$archive"
trap - ERR
echo "Production handover succeeded. Roll back with: ./deploy_old.sh"

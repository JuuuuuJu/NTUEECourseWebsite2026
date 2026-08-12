#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLD_DIR="$(dirname "$ROOT_DIR")/NTUEECourseWebsite2021"
BACKUP_DIR="$(dirname "$ROOT_DIR")/NTUEECourseWebsite2026-deploy-backups"
YES=0; CHECK=0; BACKUP=1
while (($#)); do case "$1" in --yes) YES=1;; --check) CHECK=1;; --skip-backup) BACKUP=0;; -h|--help) echo "Usage: ./deploy_old.sh [--yes] [--check] [--skip-backup]"; exit 0;; *) echo "Unknown option: $1" >&2; exit 2;; esac; shift; done
old() { docker compose -p ntueecoursewebsite2021 -f "$OLD_DIR/docker-compose.yml" "$@"; }
new() { docker compose -p ntueecoursewebsite2026 --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/docker-compose.yml" "$@"; }
docker info >/dev/null 2>&1 || { echo "Cannot access Docker." >&2; exit 1; }
[[ -f "$OLD_DIR/.env" && -f "$ROOT_DIR/.env" ]] || { echo "A production .env is missing." >&2; exit 1; }
old config --quiet; new config --quiet
((CHECK)) && { echo "Rollback prerequisites are valid; no state changed."; exit 0; }
if ((!YES)); then
  echo "WARNING: this returns to the preserved 2021 DB snapshot. New writes made on 2026 are archived but not merged."
  read -r -p "Type ROLLBACK to continue: " answer
  [[ "$answer" == ROLLBACK ]] || { echo Cancelled.; exit 1; }
fi
mongo=$(new ps -q course-mongodb)
if ((BACKUP)) && [[ -n "$mongo" ]]; then
  name=$(sed -n 's/^MONGO_DBNAME=//p' "$ROOT_DIR/.env" | head -n1); user=$(sed -n 's/^MONGO_USERNAME=//p' "$ROOT_DIR/.env" | head -n1); pass=$(sed -n 's/^MONGO_PASSWORD=//p' "$ROOT_DIR/.env" | head -n1)
  mkdir -p "$BACKUP_DIR"; archive="production-${name}-before-rollback-$(date +%Y%m%d-%H%M%S).archive.gz"
  docker exec -e N="$name" -e U="$user" -e P="$pass" -e A="$archive" "$mongo" sh -eu -c 'mongodump --quiet -u "$U" -p "$P" --authenticationDatabase admin --db "$N" --archive="/tmp/$A" --gzip; mongorestore --archive="/tmp/$A" --gzip --dryRun >/dev/null'
  docker cp "$mongo:/tmp/$archive" "$BACKUP_DIR/$archive"; docker exec "$mongo" rm -f "/tmp/$archive"; sha256sum "$BACKUP_DIR/$archive"
fi
new down --remove-orphans
old up -d --remove-orphans
for i in $(seq 1 60); do f=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3000/ 2>/dev/null || true); a=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3000/api/session 2>/dev/null || true); [[ "$f" == 200 && "$a" =~ ^(200|401|403)$ ]] && { echo "Rollback succeeded: frontend=$f API=$a"; old ps; exit 0; }; sleep 2; done
echo "Rollback containers started but health check failed." >&2; old logs --tail=120 >&2 || true; exit 1

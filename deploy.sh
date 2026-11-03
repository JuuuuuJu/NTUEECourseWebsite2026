#!/usr/bin/env bash
# Back up MongoDB, update 2024-fall, rebuild and restart the website.
# Usage: ./deploy.sh [--no-pull]
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="2024-fall"
BACKUP_DIR="${DEPLOY_BACKUP_DIR:-$(dirname "$ROOT_DIR")/NTUEECourseWebsite2026-deploy-backups}"
PULL=1

case "${1:-}" in
  "") ;;
  --no-pull) PULL=0 ;;
  -h|--help) sed -n 2,3p "$0"; exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac

cd "$ROOT_DIR"
[[ -f .env ]] || { echo "Missing .env (cp .env.example .env)" >&2; exit 1; }
docker compose config --quiet

echo "Starting MongoDB to take a backup..."
docker compose up -d --wait course-mongodb

db_name=$(sed -n 's/^MONGO_DBNAME=//p' .env | head -n1)
mkdir -p "$BACKUP_DIR"
archive="$BACKUP_DIR/production-${db_name}-predeploy-$(date +%Y%m%d-%H%M%S).archive.gz"
docker compose exec -T -e DB="$db_name" course-mongodb sh -eu -c \
  'mongodump --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db "$DB" --archive --gzip' \
  > "$archive"
[[ -s "$archive" ]] || { echo "Backup is empty; aborting." >&2; rm -f "$archive"; exit 1; }
echo "Backup: $archive"

if ((PULL)); then
  git pull --ff-only origin "$BRANCH"
fi

docker compose up -d --build --remove-orphans
docker compose ps

for _ in $(seq 1 60); do
  if docker compose exec -T web curl -fsS -o /dev/null http://localhost/ &&
     docker compose exec -T web curl -sS -o /dev/null -w '%{http_code}' http://localhost/api/session | grep -qE '^(200|401|403)$'; then
    echo "Website is healthy."
    exit 0
  fi
  sleep 2
done
echo "Website did not become healthy; check: docker compose logs --tail=100" >&2
exit 1

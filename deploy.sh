#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="production"
BUILD=1
CHECK_ONLY=0
BACKUP=1
DB_RECOVERY_STATUS="not checked"
RESTORE_MODE="keep"
RESTORE_SOURCE=""
RESTORE_SOURCE_KIND=""

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [--production|--staging] [--no-build] [--skip-backup] [--check]

Recreates the complete website in place while preserving named data volumes.
It supports both Docker Compose v2 (`docker compose`) and legacy v1
(`docker-compose`). The script never passes --volumes to `down`.

Options:
  --production  Deploy docker-compose.yml (default, serves port 3000)
  --staging     Deploy docker-compose.staging.yml (serves port 3001)
  --no-build    Reuse existing images instead of rebuilding them
  --skip-backup Skip the pre-deploy mongodump (named volumes are still kept)
  --check       Validate configuration and prerequisites without changing Docker
  -h, --help    Show this help
EOF
}

while (($#)); do
  case "$1" in
    --production) PROFILE="production" ;;
    --staging) PROFILE="staging" ;;
    --no-build) BUILD=0 ;;
    --skip-backup) BACKUP=0 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or is not in PATH." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Cannot access the Docker daemon. Start Docker or fix Docker permissions." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Neither Docker Compose v2 nor legacy docker-compose is available." >&2
  exit 1
fi

if [[ "$PROFILE" == "staging" ]]; then
  COMPOSE_FILE="$ROOT_DIR/docker-compose.staging.yml"
  ENV_FILE="$ROOT_DIR/.env.staging"
  URL="http://127.0.0.1:3001/"
else
  COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
  ENV_FILE="$ROOT_DIR/.env"
  URL="http://127.0.0.1:3000/"
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing $ROOT_DIR/.env (required by the backend Dockerfile)." >&2
  exit 1
fi
if [[ "$PROFILE" == "staging" && ! -f "$ENV_FILE" ]]; then
  echo "Missing staging environment file: $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"
compose() { "${COMPOSE[@]}" -f "$COMPOSE_FILE" "$@"; }

echo "Profile: $PROFILE"
echo "Compose: ${COMPOSE[*]}"
echo "File:    $COMPOSE_FILE"
compose config --quiet

if ((CHECK_ONLY)); then
  echo "Configuration is valid; no Docker state was changed."
  exit 0
fi

backup_database() {
  local mongo_container db_name db_user db_password backup_dir backup_stamp backup_name
  mongo_container="course-mongo"
  if [[ "$PROFILE" == "staging" ]]; then
    mongo_container="course-staging-mongo"
  fi

  if ! docker ps --format "{{.Names}}" | grep -Fxq "$mongo_container"; then
    echo "No running $mongo_container container; skipping pre-deploy DB backup."
    return 0
  fi

  db_name=$(sed -n "s/^MONGO_DBNAME=//p" "$ENV_FILE" | head -n 1)
  db_user=$(sed -n "s/^MONGO_USERNAME=//p" "$ENV_FILE" | head -n 1)
  db_password=$(sed -n "s/^MONGO_PASSWORD=//p" "$ENV_FILE" | head -n 1)
  if [[ -z "$db_name" || ! "$db_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "Cannot determine a safe MONGO_DBNAME from $ENV_FILE." >&2
    return 1
  fi
  if [[ -z "$db_user" || -z "$db_password" ]]; then
    echo "MONGO_USERNAME and MONGO_PASSWORD must be set in $ENV_FILE." >&2
    return 1
  fi

  echo "Verifying that the new .env credentials can open the existing DB volume..."
  if ! docker exec \
    -e DEPLOY_DB_USER="$db_user" \
    -e DEPLOY_DB_PASSWORD="$db_password" \
    "$mongo_container" sh -eu -c "
      if command -v mongosh >/dev/null 2>&1; then client=mongosh; else client=mongo; fi
      \"\$client\" --quiet --host 127.0.0.1 --port 27017 \\
        --username \"\$DEPLOY_DB_USER\" --password \"\$DEPLOY_DB_PASSWORD\" \\
        --authenticationDatabase admin --eval \"db.adminCommand({ping:1}).ok\" \\
        | grep -q 1
    "; then
    echo "The credentials in $ENV_FILE do not match the existing Mongo volume." >&2
    echo "Deployment was aborted before stopping any containers. Fix .env first." >&2
    return 1
  fi

  existing_count=$(database_document_count "$mongo_container" "$db_name" "$db_user" "$db_password")
  if [[ "$existing_count" == "0" ]]; then
    echo "Existing Docker DB has no documents; not creating an empty pre-deploy backup."
    return 0
  fi

  backup_dir="${DEPLOY_BACKUP_DIR:-$(dirname "$ROOT_DIR")/NTUEECourseWebsite2026-deploy-backups}"
  mkdir -p "$backup_dir"
  backup_stamp=$(date +%Y%m%d-%H%M%S)
  backup_name="${PROFILE}-${db_name}-predeploy-${backup_stamp}.archive.gz"

  echo "Creating verified pre-deploy DB backup: $backup_dir/$backup_name"
  docker exec -e DEPLOY_DB_NAME="$db_name" -e DEPLOY_DB_USER="$db_user" \
    -e DEPLOY_DB_PASSWORD="$db_password" -e DEPLOY_BACKUP_NAME="$backup_name" \
    "$mongo_container" sh -eu -c "
    mongodump --quiet \\
      --host 127.0.0.1 --port 27017 \\
      --username \"\$DEPLOY_DB_USER\" \\
      --password \"\$DEPLOY_DB_PASSWORD\" \\
      --authenticationDatabase admin \\
      --db \"\$DEPLOY_DB_NAME\" \\
      --archive=\"/tmp/\$DEPLOY_BACKUP_NAME\" --gzip
    mongorestore --archive=\"/tmp/\$DEPLOY_BACKUP_NAME\" --gzip --dryRun \\
      --nsInclude=\"\$DEPLOY_DB_NAME.*\" >/dev/null
  "
  docker cp "$mongo_container:/tmp/$backup_name" "$backup_dir/$backup_name"
  docker exec -e DEPLOY_BACKUP_NAME="$backup_name" "$mongo_container" \
    sh -eu -c "rm -f \"/tmp/\$DEPLOY_BACKUP_NAME\""
  sha256sum "$backup_dir/$backup_name"
}


database_document_count() {
  local container="$1" db_name="$2" db_user="$3" db_password="$4"
  docker exec -e DEPLOY_DB_NAME="$db_name" -e DEPLOY_DB_USER="$db_user" -e DEPLOY_DB_PASSWORD="$db_password" "$container" sh -eu -c '
    if command -v mongosh >/dev/null 2>&1; then client=mongosh; else client=mongo; fi
    "$client" --quiet --username "$DEPLOY_DB_USER" --password "$DEPLOY_DB_PASSWORD" --authenticationDatabase admin "$DEPLOY_DB_NAME" --eval "var total=0; db.getCollectionNames().forEach(function(n){total+=db.getCollection(n).countDocuments({});}); print(total);" | tail -n 1 | tr -d "[:space:]"
  '
}

choose_restore_source() {
  local parent_dir entry kind path key selected=0 index
  local -a sources kinds options
  parent_dir=$(dirname "$ROOT_DIR")

  while IFS= read -r entry; do
    kind=${entry%% *}
    path=${entry#* }
    [[ -n "$path" && "$path" != "$ROOT_DIR" ]] || continue
    sources+=("$path")
    if [[ "$kind" == "f" ]]; then
      kinds+=("file")
      options+=("Backup file: $path")
    else
      kinds+=("folder")
      options+=("MongoDB dump folder: $path")
    fi
  done < <(
    find "$parent_dir" -mindepth 1 -maxdepth 1 \( -type d -o -type f -name '*.gz' \) -printf '%y %p\n' 2>/dev/null | sort -k2
  )

  sources=("" "${sources[@]}")
  kinds=("keep" "${kinds[@]}")
  options=("Keep existing Docker volume data (do not restore)" "${options[@]}")

  if [[ ! -t 0 || ! -t 1 ]]; then
    RESTORE_MODE="keep"
    echo "DB restore selection: non-interactive terminal; keeping Docker volume data."
    return 0
  fi

  printf '\033[?1049h\033[?25l'
  trap 'printf "\033[?25h\033[?1049l"; exit 130' INT TERM
  while true; do
    printf '\033[H\033[2J'
    echo "Choose a backup file or folder from $parent_dir (Up/Down, Enter):"
    for index in "${!options[@]}"; do
      if ((index == selected)); then
        printf '  \033[7m> %s\033[0m\n' "${options[$index]}"
      else
        printf '    %s\n' "${options[$index]}"
      fi
    done
    IFS= read -rsn1 key
    if [[ "$key" == $'\e' ]]; then IFS= read -rsn2 key || true; fi
    case "$key" in
      '[A') ((selected > 0)) && ((selected--)) || true ;;
      '[B') ((selected + 1 < ${#options[@]})) && ((selected++)) || true ;;
      '') break ;;
    esac
  done
  printf '\033[?25h\033[?1049l'
  trap - INT TERM

  RESTORE_SOURCE_KIND="${kinds[$selected]}"
  RESTORE_SOURCE="${sources[$selected]}"
  if [[ "$RESTORE_SOURCE_KIND" == "keep" ]]; then
    RESTORE_MODE="keep"
    echo "Selected: keep existing Docker volume data."
  else
    RESTORE_MODE="source"
    echo "Selected backup $RESTORE_SOURCE_KIND: $RESTORE_SOURCE"
  fi
}

recover_database_if_needed() {
  local container db_name db_user db_password count inspect source_db attempt
  local -a format_args
  container="course-mongo"; [[ "$PROFILE" == "staging" ]] && container="course-staging-mongo"
  db_name=$(sed -n 's/^MONGO_DBNAME=//p' "$ENV_FILE" | head -n 1)
  db_user=$(sed -n 's/^MONGO_USERNAME=//p' "$ENV_FILE" | head -n 1)
  db_password=$(sed -n 's/^MONGO_PASSWORD=//p' "$ENV_FILE" | head -n 1)

  for attempt in $(seq 1 60); do
    if docker exec -e DEPLOY_DB_USER="$db_user" -e DEPLOY_DB_PASSWORD="$db_password" "$container" sh -c 'if command -v mongosh >/dev/null 2>&1; then client=mongosh; else client=mongo; fi; "$client" --quiet --username "$DEPLOY_DB_USER" --password "$DEPLOY_DB_PASSWORD" --authenticationDatabase admin --eval "db.adminCommand({ping:1}).ok" | grep -q 1' >/dev/null 2>&1; then break; fi
    [[ "$attempt" == "60" ]] && { echo "MongoDB did not become ready." >&2; return 1; }; sleep 2
  done

  count=$(database_document_count "$container" "$db_name" "$db_user" "$db_password")
  if [[ "$RESTORE_MODE" == "keep" ]]; then
    if [[ "$count" == "0" ]]; then DB_RECOVERY_STATUS="kept the selected Docker volume, but it contains no documents"; else DB_RECOVERY_STATUS="kept existing Docker volume data ($count documents)"; fi
    echo "DB recovery: $DB_RECOVERY_STATUS."
    return 0
  fi

  if [[ "$RESTORE_SOURCE_KIND" == "file" ]]; then
    echo "Restoring selected archive file directly: $RESTORE_SOURCE"
    docker cp "$RESTORE_SOURCE" "$container:/tmp/deploy-restore.archive.gz" >/dev/null
    inspect=$(docker exec "$container" mongorestore --archive=/tmp/deploy-restore.archive.gz --gzip --dryRun --verbose 2>&1 || true)
    source_db=$(printf '%s\n' "$inspect" | sed -n 's/.*archive prelude \([^.]*\)\..*/\1/p' | head -n 1)
    if [[ -z "$source_db" ]]; then
      docker exec "$container" rm -f /tmp/deploy-restore.archive.gz
      DB_RECOVERY_STATUS="selected file is not a usable MongoDB gzip archive: $RESTORE_SOURCE"
      echo "DB recovery: $DB_RECOVERY_STATUS."
      return 0
    fi
    docker exec "$container" mongorestore --quiet --username "$db_user" --password "$db_password" --authenticationDatabase admin --archive=/tmp/deploy-restore.archive.gz --gzip --drop --nsFrom="$source_db.*" --nsTo="$db_name.*"
    docker exec "$container" rm -f /tmp/deploy-restore.archive.gz
  else
    echo "Restoring selected MongoDB dump folder directly: $RESTORE_SOURCE"
    docker exec "$container" sh -eu -c 'rm -rf /tmp/deploy-restore-dir; mkdir -p /tmp/deploy-restore-dir'
    docker cp "$RESTORE_SOURCE/." "$container:/tmp/deploy-restore-dir/" >/dev/null
    if find "$RESTORE_SOURCE" -type f -name '*.bson.gz' -print -quit 2>/dev/null | grep -q .; then format_args+=(--gzip); fi
    inspect=$(docker exec "$container" mongorestore --dir=/tmp/deploy-restore-dir "${format_args[@]}" --dryRun --verbose 2>&1 || true)
    source_db=$(printf '%s\n' "$inspect" | sed -n 's/.*found collection \([^. ]*\)\..*/\1/p' | head -n 1)
    if [[ -z "$source_db" ]]; then
      docker exec "$container" rm -rf /tmp/deploy-restore-dir
      DB_RECOVERY_STATUS="selected folder is not a usable MongoDB dump directory: $RESTORE_SOURCE"
      echo "DB recovery: $DB_RECOVERY_STATUS."
      return 0
    fi
    docker exec "$container" mongorestore --quiet --username "$db_user" --password "$db_password" --authenticationDatabase admin --dir=/tmp/deploy-restore-dir "${format_args[@]}" --drop --nsFrom="$source_db.*" --nsTo="$db_name.*"
    docker exec "$container" rm -rf /tmp/deploy-restore-dir
  fi

  count=$(database_document_count "$container" "$db_name" "$db_user" "$db_password")
  if [[ "$count" != "0" ]]; then
    DB_RECOVERY_STATUS="restored $count documents directly from selected $RESTORE_SOURCE_KIND: $RESTORE_SOURCE"
  else
    DB_RECOVERY_STATUS="restore completed from selected $RESTORE_SOURCE_KIND, but the target DB contains no documents"
  fi
  echo "DB recovery: $DB_RECOVERY_STATUS."
}

if ((BACKUP)); then
  backup_database
fi

choose_restore_source

# docker-compose 1.29 can fail while replacing images with KeyError:
# ContainerConfig. A clean container/network teardown avoids that bug. Named
# volumes are intentionally retained, so MongoDB and backup data survive.
echo "Stopping and removing the existing $PROFILE containers (data volumes kept)..."
compose down --remove-orphans

if [[ "$PROFILE" == "production" ]] && ! docker network inspect nginx >/dev/null 2>&1; then
  echo "Creating required external Docker network: nginx"
  docker network create nginx >/dev/null
fi

UP_ARGS=(up -d --remove-orphans)
if ((BUILD)); then
  UP_ARGS+=(--build)
fi

on_error() {
  status=$?
  echo "Deployment failed. Recent service logs:" >&2
  compose logs --tail=120 >&2 || true
  exit "$status"
}
trap on_error ERR

echo "Building and starting the complete $PROFILE website..."
compose "${UP_ARGS[@]}"

recover_database_if_needed

echo "Waiting for $URL ..."
for attempt in $(seq 1 90); do
  if command -v curl >/dev/null 2>&1; then
    frontend_code=$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 3 "$URL" 2>/dev/null || true)
    api_code=$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 3 "${URL}api/session" 2>/dev/null || true)
    if [[ "$frontend_code" == "200" && "$api_code" =~ ^(200|401|403)$ ]]; then
      trap - ERR
      echo "Deployment is healthy: $URL (frontend $frontend_code, API $api_code)"
      echo "Database status: $DB_RECOVERY_STATUS."
      compose ps
      exit 0
    fi
  elif command -v wget >/dev/null 2>&1; then
    if wget -q -T 3 -O /dev/null "$URL"; then
      trap - ERR
      echo "Deployment is healthy: $URL"
      echo "Database status: $DB_RECOVERY_STATUS."
      compose ps
      exit 0
    fi
  else
    echo "Neither curl nor wget is installed; checking container state only."
    echo "Database status: $DB_RECOVERY_STATUS."
    trap - ERR
    compose ps
    exit 0
  fi
  if ((attempt % 10 == 0)); then
    echo "Still waiting ($attempt/90)..."
  fi
  sleep 2
done

echo "Services started but $URL did not become healthy in time." >&2
false

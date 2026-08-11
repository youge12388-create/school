#!/usr/bin/env bash
set -Eeuo pipefail

export PATH="/opt/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

APP_DIR="/opt/school-syt"
RELEASE_DIR="$APP_DIR/releases"
SHARED_DIR="$APP_DIR/shared"
GIT_URL="git@github.com:youge12388-create/school.git"
HEALTH_URL="http://127.0.0.1:3000/login"
LOCK_FILE="$APP_DIR/.deploy.lock"

mkdir -p "$RELEASE_DIR" "$SHARED_DIR/data/logs"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "deployment already running"; exit 1; }

PREVIOUS_DIR="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
RELEASE_TAG="$(date +%Y%m%d%H%M%S)"
CURRENT_DIR="$RELEASE_DIR/$RELEASE_TAG"

echo "[1/6] cloning repository"
git clone --depth=1 "$GIT_URL" "$CURRENT_DIR"
cd "$CURRENT_DIR"

echo "[2/6] writing shared environment"
if [ -f "$SHARED_DIR/.env" ]; then
  cp "$SHARED_DIR/.env" .env.local
else
  cat > .env.local <<EOF
DATABASE_PATH=$SHARED_DIR/data/app.db
UPLOAD_DIR=$SHARED_DIR/data/uploads
IMPORT_DIR=$SHARED_DIR/data/imports
APP_KEY_PATH=$SHARED_DIR/data/keys/app.key
EOF
fi

echo "[3/6] installing dependencies"
/opt/node24/bin/npm install --include=dev --no-audit --no-fund

echo "[4/6] building application"
/opt/node24/bin/npm run build

echo "[5/6] switching release and restarting service"
ln -sfn "$SHARED_DIR/data" "$CURRENT_DIR/data"
ln -sfn "$CURRENT_DIR" "$APP_DIR/current"
systemctl restart school-syt
systemctl is-active --quiet school-syt

echo "[6/6] checking health"
for _ in $(seq 1 20); do
  if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null; then
    echo "deployment succeeded: $CURRENT_DIR"
    echo "commit: $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 1
done

echo "health check failed; rolling back" >&2
if [ -n "$PREVIOUS_DIR" ] && [ -d "$PREVIOUS_DIR" ]; then
  ln -sfn "$PREVIOUS_DIR" "$APP_DIR/current"
  systemctl restart school-syt
  echo "rolled back to: $PREVIOUS_DIR" >&2
fi
exit 1

#!/usr/bin/env bash

# Deploy a release and only declare success after the managed service passes a
# local HTTP health check.  Override APP_DIR/SERVICE_USER when the host uses a
# non-default layout.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/school-syt}"
RELEASE_DIR="$APP_DIR/releases"
SHARED_DIR="$APP_DIR/shared"
GIT_URL="${GIT_URL:-https://github.com/youge12388-create/school.git}"
SERVICE_NAME="${SERVICE_NAME:-school-syt}"
SERVICE_USER="${SERVICE_USER:-}"
PORT="${PORT:-3000}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/login}"
DATABASE_PATH="${DATABASE_PATH:-$SHARED_DIR/data/app.db}"
UPLOAD_DIR="${UPLOAD_DIR:-$SHARED_DIR/data/uploads}"
IMPORT_DIR="${IMPORT_DIR:-$SHARED_DIR/data/imports}"
APP_KEY_PATH="${APP_KEY_PATH:-$SHARED_DIR/data/keys/app.key}"
SESSION_TTL_HOURS="${SESSION_TTL_HOURS:-24}"
MAX_UPLOAD_MB="${MAX_UPLOAD_MB:-20}"

if [ -z "${NODE_BIN:-}" ]; then
    NODE_BIN="$(command -v node)"
fi
NODE_DIR="$(dirname "$NODE_BIN")"
PM2_BIN="${PM2_BIN:-$(command -v pm2 2>/dev/null || true)}"

mkdir -p "$RELEASE_DIR" "$SHARED_DIR/data/logs" "$UPLOAD_DIR" "$IMPORT_DIR"

if [ -z "$SERVICE_USER" ]; then
    SERVICE_USER="$(stat -c '%U' "$APP_DIR" 2>/dev/null || true)"
fi
if [ -z "$SERVICE_USER" ] || ! id "$SERVICE_USER" >/dev/null 2>&1; then
    SERVICE_USER="$(id -un)"
fi

run_as_service_user() {
    local pm2_home="${PM2_HOME:-/home/$SERVICE_USER/.pm2}"
    local -a command=(env
        "PATH=$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
        "PM2_HOME=$pm2_home"
        "NODE_ENV=production"
        "HOSTNAME=127.0.0.1"
        "PORT=$PORT"
        "DATABASE_PATH=$DATABASE_PATH"
        "UPLOAD_DIR=$UPLOAD_DIR"
        "IMPORT_DIR=$IMPORT_DIR"
        "APP_KEY_PATH=$APP_KEY_PATH"
        "SESSION_TTL_HOURS=$SESSION_TTL_HOURS"
        "MAX_UPLOAD_MB=$MAX_UPLOAD_MB"
        "$PM2_BIN")

    if [ "$(id -un)" = "$SERVICE_USER" ]; then
        "${command[@]}" "$@"
    elif command -v runuser >/dev/null 2>&1; then
        runuser -u "$SERVICE_USER" -- "${command[@]}" "$@"
    elif command -v sudo >/dev/null 2>&1; then
        sudo -u "$SERVICE_USER" -- "${command[@]}" "$@"
    else
        echo "Unable to switch to service user: $SERVICE_USER" >&2
        return 1
    fi
}

start_pm2() {
    local release_dir="$1"
    if [ -z "$PM2_BIN" ]; then
        echo "PM2 was not found; refusing to start an unmanaged service" >&2
        return 1
    fi
    if run_as_service_user describe "$SERVICE_NAME" >/dev/null 2>&1; then
        run_as_service_user delete "$SERVICE_NAME" >/dev/null
    fi
    run_as_service_user start "$release_dir/.next/standalone/server.js" \
        --name "$SERVICE_NAME" \
        --cwd "$release_dir" \
        --interpreter "$NODE_BIN"
    run_as_service_user save >/dev/null
}

restart_service() {
    local release_dir="$1"
    if systemctl cat "$SERVICE_NAME.service" >/dev/null 2>&1; then
        SERVICE_MODE="systemd"
        systemctl restart "$SERVICE_NAME"
        systemctl is-active --quiet "$SERVICE_NAME"
        return
    fi
    SERVICE_MODE="pm2"
    start_pm2 "$release_dir"
}

rollback() {
    if [ -z "${PREVIOUS_DIR:-}" ] || [ ! -d "$PREVIOUS_DIR" ]; then
        echo "No previous release is available for rollback" >&2
        return 1
    fi
    ln -sfn "$PREVIOUS_DIR" "$APP_DIR/current"
    if [ "${SERVICE_MODE:-}" = "systemd" ]; then
        systemctl restart "$SERVICE_NAME"
    else
        start_pm2 "$PREVIOUS_DIR"
    fi
}

health_check() {
    for _ in $(seq 1 30); do
        if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
            return 0
        fi
        sleep 1
    done
    return 1
}

echo "[1/5] cloning repository"
RELEASE_TAG="$(date +%Y%m%d%H%M%S)"
CURRENT_DIR="$RELEASE_DIR/$RELEASE_TAG"
PREVIOUS_DIR="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
git clone "$GIT_URL" "$CURRENT_DIR"
cd "$CURRENT_DIR"

echo "[2/5] writing runtime environment"
if [ -f "$SHARED_DIR/.env" ]; then
    cp "$SHARED_DIR/.env" .env.local
else
    cat > .env.local <<EOF
DATABASE_PATH=$DATABASE_PATH
UPLOAD_DIR=$UPLOAD_DIR
IMPORT_DIR=$IMPORT_DIR
APP_KEY_PATH=$APP_KEY_PATH
SESSION_TTL_HOURS=$SESSION_TTL_HOURS
MAX_UPLOAD_MB=$MAX_UPLOAD_MB
PORT=$PORT
EOF
fi

echo "[3/5] installing production dependencies"
npm ci --omit=dev

echo "[4/5] building application"
npm run build

echo "[5/5] switching release and restarting managed service"
ln -sfn "$SHARED_DIR/data" "$CURRENT_DIR/data"
ln -sfn "$CURRENT_DIR" "$APP_DIR/current"

if ! restart_service "$CURRENT_DIR" || ! health_check; then
    echo "Deployment health check failed; rolling back..." >&2
    rollback || true
    exit 1
fi

echo "Deployment succeeded: $CURRENT_DIR"
echo "Commit: $(git rev-parse --short HEAD)"

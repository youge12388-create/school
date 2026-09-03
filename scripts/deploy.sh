#!/usr/bin/env bash

# 宝塔生产环境唯一发布入口。
#
# 这个脚本只适用于当前生产拓扑：
#   /opt/school-opt
#   宝塔 Node 项目 school_syt
#   /www/server/nodejs/v24.18.0/bin
#
# 它不会创建 systemd、独立 PM2、nohup 进程，也不会终止 3000 端口上的进程。
# 宝塔 Node 项目控制器不可用时会在 git pull 前失败退出，避免产生双重托管。

set -Eeuo pipefail

readonly APP_DIR="/opt/school-opt"
readonly PROJECT_NAME="school_syt"
readonly NODE_DIR="/www/server/nodejs/v24.18.0/bin"
readonly NODE_BIN="$NODE_DIR/node"
readonly NPM_BIN="$NODE_DIR/npm"
readonly HEALTH_URL="https://check.medicalchinaway.com/login"
# 进程级健康检查：/api/health 返回进程 startedAt，用于确认 Baota 重启真正切到了新进程。
readonly HEALTH_JSON_URL="https://check.medicalchinaway.com/api/health"
readonly PANEL_MODEL="/www/server/panel/class/projectModel/nodejsModel.py"
readonly PANEL_PYTHON="/www/server/panel/pyenv/bin/python"
readonly LOCK_FILE="/var/lock/school_syt-baota-release.lock"
readonly HEALTH_ATTEMPTS=30
readonly HEALTH_DELAY_SECONDS=2

APP_OWNER=""
PREVIOUS_COMMIT=""
ROLLBACK_REQUIRED=0
ROLLBACK_ATTEMPTED=0
RELEASE_COMPLETE=0
# 发起 Baota 重启请求的时刻（毫秒）。新进程的 startedAt 必须 >= 该值才算重启生效。
RESTART_EPOCH_MS=0

log() {
  printf '[school_syt deploy] %s\n' "$*"
}

fail() {
  printf '[school_syt deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy.sh --check   # validate the local Baota Node-project controller
  bash scripts/deploy.sh           # pull, install, build, restart through Baota, and health-check

The script only supports /opt/school-opt and the Baota Node project school_syt.
It releases from the 'master' branch only; checkout 'master' before running it.
It invokes the installed Baota Node-project controller directly; no panel API token is required.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is unavailable: $1"
}

acquire_release_lock() {
  require_command flock
  exec 9>"$LOCK_FILE" || fail "Cannot open the release lock: $LOCK_FILE"
  flock -n 9 || fail "Another school_syt release is already running."
}

as_app_owner() {
  runuser -u "$APP_OWNER" -- env \
    "PATH=$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    "$@"
}

assert_master_branch() {
  local current_branch
  current_branch="$(as_app_owner git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "master" ]]; then
    fail "Refusing to release from branch '${current_branch}'. Only 'master' is allowed; run 'git checkout master'."
  fi
}

validate_baota_controller() {
  [[ "$(id -u)" == "0" ]] || fail "Run this production release as root through the Baota terminal."
  [[ -f "$PANEL_MODEL" ]] || fail "Baota Node project controller was not found: $PANEL_MODEL"
  [[ -x "$PANEL_PYTHON" ]] || fail "Baota Python runtime was not found: $PANEL_PYTHON"
  grep -q 'def restart_project' "$PANEL_MODEL" || \
    fail "This Baota version has no detectable Node-project restart controller; restart it from the Baota UI."
  grep -q 'def get_project_list' "$PANEL_MODEL" || \
    fail "This Baota version has no detectable Node-project query controller; verify school_syt from the Baota UI."
}

validate_environment() {
  [[ -d "$APP_DIR/.git" ]] || fail "Expected Git working tree was not found: $APP_DIR"
  cd "$APP_DIR"
  [[ "$(pwd -P)" == "$APP_DIR" ]] || fail "Resolved working directory is not $APP_DIR"

  APP_OWNER="$(stat -c '%U' "$APP_DIR")"
  [[ "$APP_OWNER" != "UNKNOWN" ]] || fail "Could not resolve the owner of $APP_DIR"
  id "$APP_OWNER" >/dev/null 2>&1 || fail "The owner of $APP_DIR is not a valid local user: $APP_OWNER"

  [[ -x "$NODE_BIN" && -x "$NPM_BIN" ]] || \
    fail "Expected Baota Node v24.18.0 binaries were not found under $NODE_DIR"
  [[ "$("$NODE_BIN" --version)" == "v24.18.0" ]] || \
    fail "Expected Node v24.18.0 at $NODE_BIN"

  require_command git
  require_command curl
  require_command stat
  require_command grep
  require_command mktemp
  require_command runuser

  as_app_owner git diff --quiet || fail "Tracked production files have unstaged changes; resolve them before publishing."
  as_app_owner git diff --cached --quiet || fail "Tracked production files have staged changes; resolve them before publishing."
  [[ -z "$(as_app_owner git status --porcelain --untracked-files=all)" ]] || \
    fail "Production working tree has untracked files; resolve them before publishing."

}

baota_node_project_call() {
  local action="$1"

  "$PANEL_PYTHON" - "$action" "$PROJECT_NAME" <<'PY'
import sys

sys.path.insert(0, "/www/server/panel/class")
from projectModel.nodejsModel import main as NodeProjectModel

action, project_name = sys.argv[1:]


class PanelRequest:
    def __init__(self, **values):
        self.__dict__.update(values)

    def __contains__(self, name):
        return hasattr(self, name)


def includes_project(value):
    if isinstance(value, dict):
        if value.get("name") == project_name or value.get("project_name") == project_name:
            return True
        return any(includes_project(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(includes_project(item) for item in value)
    return False


controller = NodeProjectModel()
if action == "verify":
    payload = controller.get_project_list(PanelRequest(p=1, limit=100, search=""))
    if not includes_project(payload):
        raise SystemExit(f"Baota did not confirm Node project {project_name}.")
elif action == "restart":
    payload = controller.restart_project(PanelRequest(project_name=project_name))
    if not isinstance(payload, dict) or payload.get("status") is not True:
        message = payload.get("msg") if isinstance(payload, dict) else repr(payload)
        raise SystemExit(f"Baota could not restart {project_name}: {message}")
else:
    raise SystemExit(f"Unsupported Baota action: {action}")
PY
}

verify_baota_project() {
  if ! baota_node_project_call verify; then
    fail "Baota's local Node-project controller could not confirm $PROJECT_NAME."
  fi
  log "Baota controller confirmed project $PROJECT_NAME."
}

restart_baota_project() {
  log "Requesting Baota to restart project $PROJECT_NAME..."
  baota_node_project_call restart
}

# 等待“重启确实生效”：/api/health 返回的 startedAt >= 重启请求时刻才算成功，
# 否则即使旧实例仍响应 /login 也会判失败（避免误报发布成功）。
# 旧版本代码没有 /api/health（404/405）时回退到登录页可达性检查（回滚场景兼容）。
wait_for_health() {
  local attempt
  local http_code
  local health_file
  local started_at

  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
    http_code="$(curl --silent --show-error --max-time 5 -o /dev/null -w '%{http_code}' "$HEALTH_JSON_URL")"
    if [[ "$http_code" == "200" ]]; then
      health_file="$(mktemp)"
      if curl --silent --show-error --max-time 5 "$HEALTH_JSON_URL" -o "$health_file"; then
        started_at="$("$NODE_BIN" -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(p?.startedAt ?? ""))' "$health_file" 2>/dev/null || true)"
        rm -f "$health_file"
        if [[ -n "$started_at" ]] && [[ "$started_at" -ge "$RESTART_EPOCH_MS" ]]; then
          log "Process restart confirmed (startedAt=$started_at >= $RESTART_EPOCH_MS)."
          return 0
        fi
      else
        rm -f "$health_file"
      fi
    elif [[ "$http_code" == "404" || "$http_code" == "405" ]]; then
      # 回滚目标是旧代码（无 /api/health）：退回登录页可达性检查。
      if curl --silent --show-error --fail --max-time 5 "$HEALTH_URL" >/dev/null; then
        return 0
      fi
    fi
    sleep "$HEALTH_DELAY_SECONDS"
  done

  log "Health endpoint $HEALTH_JSON_URL did not report a restarted process within the timeout."
  return 1
}

rollback() {
  local previous_commit="$1"
  local reason="$2"

  ROLLBACK_ATTEMPTED=1
  log "Release failed: $reason"
  log "Restoring Git commit $previous_commit; persistent data is never changed by this script."

  if ! as_app_owner git reset --hard "$previous_commit"; then
    fail "Rollback could not restore the previous Git commit. The running project was not replaced automatically."
  fi
  if ! as_app_owner "$NPM_BIN" ci --no-audit --no-fund; then
    fail "Rollback restored source code but could not restore dependencies. Check the running Baota project before another restart."
  fi
  if ! as_app_owner "$NPM_BIN" run build; then
    fail "Rollback restored source code but the previous build failed. Check the running Baota project before another restart."
  fi
  RESTART_EPOCH_MS="$(date +%s%3N)"
  if ! restart_baota_project; then
    fail "Rollback build completed but Baota did not confirm the restart. Restart school_syt from the Baota UI."
  fi
  if ! wait_for_health; then
    fail "Rollback restart was requested but the process restart could not be confirmed."
  fi

  log "Rollback completed and $HEALTH_URL is healthy again."
}

on_exit() {
  local status="$?"

  trap - EXIT INT TERM HUP
  if [[ "$status" -ne 0 && "$ROLLBACK_REQUIRED" -eq 1 && "$ROLLBACK_ATTEMPTED" -eq 0 && "$RELEASE_COMPLETE" -eq 0 ]]; then
    ROLLBACK_ATTEMPTED=1
    log "Release ended unexpectedly (exit $status); starting protected rollback."
    rollback "$PREVIOUS_COMMIT" "unexpected interruption or command failure"
  fi
  exit "$status"
}

on_interrupt() {
  exit 130
}

on_terminate() {
  exit 143
}

main() {
  case "${1:-}" in
    --help|-h)
      usage
      return 0
      ;;
    --check|"")
      ;;
    *)
      usage >&2
      return 2
      ;;
  esac

  acquire_release_lock
  validate_baota_controller
  validate_environment
  verify_baota_project
  assert_master_branch

  if [[ "${1:-}" == "--check" ]]; then
    log "Preflight passed. No source code, dependency, process, or data change was made."
    return 0
  fi

  PREVIOUS_COMMIT="$(as_app_owner git rev-parse HEAD)"

  log "Pulling the current branch with fast-forward-only protection..."
  if ! as_app_owner git pull --ff-only; then
    fail "git pull failed before the release changed. Resolve the Git state and try again."
  fi

  ROLLBACK_REQUIRED=1
  trap on_exit EXIT
  trap on_interrupt INT
  trap on_terminate TERM
  # 宝塔 Web 终端断连会发 SIGHUP；不 trap 则 EXIT 陷阱不执行、发布半成功无回滚。
  trap on_terminate HUP

  log "Installing the complete locked dependency set for the production build..."
  if ! as_app_owner "$NPM_BIN" ci --no-audit --no-fund; then
    rollback "$PREVIOUS_COMMIT" "npm ci failed"
    exit 1
  fi

  log "Building the Next.js production bundle..."
  if ! as_app_owner "$NPM_BIN" run build; then
    rollback "$PREVIOUS_COMMIT" "npm run build failed"
    exit 1
  fi

  # 重启后首次请求可能触发自动迁移（改库结构），发布前先备份数据库。
  log "Backing up the SQLite database before restart..."
  if ! as_app_owner "$NPM_BIN" run backup >/dev/null 2>&1; then
    log "WARN: npm run backup failed. The in-process pre-migration backup still applies; continuing."
  fi

  RESTART_EPOCH_MS="$(date +%s%3N)"
  if ! restart_baota_project; then
    rollback "$PREVIOUS_COMMIT" "Baota did not confirm the project restart"
    exit 1
  fi

  log "Waiting for the restarted process at $HEALTH_JSON_URL..."
  if ! wait_for_health; then
    rollback "$PREVIOUS_COMMIT" "process restart health check failed"
    exit 1
  fi

  RELEASE_COMPLETE=1
  log "Release completed successfully at commit $(as_app_owner git rev-parse --short HEAD)."
}

main "$@"

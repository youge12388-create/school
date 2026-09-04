#!/usr/bin/env bash

# 宝塔生产环境唯一发布入口（云端构建方案）。
#
# 这个脚本只适用于当前生产拓扑：
#   /opt/school-opt
#   宝塔 Node 项目 school_syt
#   /www/server/nodejs/v24.18.0/bin
#
# 发布流程（不在服务器上执行 npm ci / next build）：
#   1) git pull --ff-only（固定 master）
#   2) 从 GitHub Releases 下载 GitHub Actions 为本次 commit 构建的
#      standalone 产物（build-<sha>/standalone.tar.gz，公开仓库免凭证）
#   3) 校验并交换 .next/standalone（旧包保留为 .next/standalone.old）
#   4) 通过宝塔本地 Node 项目控制器重启 school_syt
#   5) /api/health 进程级健康检查；任一步失败自动回滚：
#      git reset 回旧提交 + 用 .old 备份还原旧运行时包再重启。
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
readonly ARTIFACT_FILE="$APP_DIR/standalone-release.tar.gz"
readonly STANDALONE_DIR="$APP_DIR/.next/standalone"
readonly STANDALONE_NEW="$APP_DIR/.next/standalone.new"
readonly STANDALONE_OLD="$APP_DIR/.next/standalone.old"
# 发布成功后在仓库外记录已发布的 commit（避免污染 git 工作区）。
readonly RELEASE_MARKER="/opt/.school_syt_release_commit"

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
  bash scripts/deploy.sh           # pull, download the Actions-built standalone
                                   # artifact, restart through Baota, and health-check

The script only supports /opt/school-opt and the Baota Node project school_syt.
It releases from the 'master' branch only; checkout 'master' before running it.
It never builds on the server: the standalone bundle comes from the GitHub
Actions release for the same commit (repo must be public, or a token must be
available). It invokes the installed Baota Node-project controller directly.
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
  require_command tar

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
# 回滚目标若是无 /api/health 的旧代码（404/405）则退回登录页可达性检查。
wait_for_health() {
  local attempt
  local http_code
  local health_file
  local health_url
  local started_at
  local last_observation="no HTTP response"

  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
    # A short connection reset is expected while Baota is replacing the Node
    # process. Do not let `set -e` turn that transient state into a rollback.
    # The query value also avoids an intermediary returning a stale response.
    health_url="${HEALTH_JSON_URL}?release_check=${RESTART_EPOCH_MS}-${attempt}"
    if ! http_code="$(curl --silent --show-error --max-time 5 -o /dev/null -w '%{http_code}' "$health_url")"; then
      http_code="000"
    fi
    if [[ "$http_code" == "200" ]]; then
      health_file="$(mktemp)"
      if curl --silent --show-error --max-time 5 "$health_url" -o "$health_file"; then
        started_at="$("$NODE_BIN" -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(p?.startedAt ?? ""))' "$health_file" 2>/dev/null || true)"
        rm -f "$health_file"
        if [[ -n "$started_at" ]] && [[ "$started_at" -ge "$RESTART_EPOCH_MS" ]]; then
          log "Process restart confirmed (startedAt=$started_at >= $RESTART_EPOCH_MS)."
          return 0
        fi
        last_observation="HTTP 200, startedAt=${started_at:-missing}"
      else
        rm -f "$health_file"
        last_observation="HTTP 200, but the health response could not be read"
      fi
    elif [[ "$http_code" == "404" || "$http_code" == "405" ]]; then
      # 回滚目标是旧代码（无 /api/health）：退回登录页可达性检查。
      if curl --silent --show-error --fail --max-time 5 "$HEALTH_URL" >/dev/null; then
        return 0
      fi
      last_observation="HTTP $http_code, login fallback was unavailable"
    else
      last_observation="HTTP $http_code"
    fi
    sleep "$HEALTH_DELAY_SECONDS"
  done

  log "Health endpoint $HEALTH_JSON_URL did not report a restarted process within the timeout (last observation: $last_observation)."
  return 1
}

# 解析 origin 得到 GitHub owner/repo（兼容 https 与 git@ 两种 remote 写法）。
release_repo_slug() {
  local url
  url="$(as_app_owner git -C "$APP_DIR" config --get remote.origin.url)"
  case "$url" in
    https://github.com/*) url="${url#https://github.com/}" ;;
    git@github.com:*) url="${url#git@github.com:}" ;;
  esac
  url="${url%.git}"
  [[ "$url" == */* && -n "${url%%/*}" && -n "${url#*/}" ]] || \
    fail "Cannot parse GitHub owner/repo from remote.origin.url: $url"
  printf '%s\n' "$url"
}

# 下载 GitHub Actions 为指定 commit 构建的 standalone 产物。
# 失败时返回非零（不改变仓库与运行目录），由调用方决定回滚动作。
download_artifact() {
  local commit="$1"
  local slug
  local repo_url
  slug="$(release_repo_slug)"
  repo_url="https://github.com/${slug}/releases/download/build-${commit}/standalone.tar.gz"
  log "Downloading standalone artifact: $repo_url"

  rm -f "$ARTIFACT_FILE"
  if ! curl --fail --silent --show-error --location --max-time 600 "$repo_url" -o "$ARTIFACT_FILE"; then
    rm -f "$ARTIFACT_FILE"
    log "Artifact for commit $commit is not available yet."
    return 1
  fi
  if [[ "$(stat -c '%s' "$ARTIFACT_FILE")" -lt 1000000 ]]; then
    rm -f "$ARTIFACT_FILE"
    log "Artifact for commit $commit looks truncated (under 1 MB)."
    return 1
  fi
  if ! as_app_owner tar -tzf "$ARTIFACT_FILE" >/dev/null 2>&1; then
    rm -f "$ARTIFACT_FILE"
    log "Artifact for commit $commit is not a valid tar archive."
    return 1
  fi
  log "Artifact downloaded and validated ($(stat -c '%s' "$ARTIFACT_FILE") bytes)."
}

# 把下载的产物交换为当前运行包：旧包挪到 .old，健康检查通过后才删除。
install_artifact() {
  log "Swapping .next/standalone with the downloaded bundle..."
  as_app_owner rm -rf "$STANDALONE_NEW"
  as_app_owner mkdir -p "$STANDALONE_NEW"
  as_app_owner tar -xzf "$ARTIFACT_FILE" -C "$STANDALONE_NEW"
  as_app_owner bash -c "
    cd '$APP_DIR' || exit 1
    rm -rf '$STANDALONE_OLD'
    if [[ -d '$STANDALONE_DIR' ]]; then
      mv '$STANDALONE_DIR' '$STANDALONE_OLD'
    fi
    mv '$STANDALONE_NEW' '$STANDALONE_DIR'
  "
  log "New standalone bundle is in place."
}

rollback() {
  local previous_commit="$1"
  local reason="$2"

  ROLLBACK_ATTEMPTED=1
  log "Release failed: $reason"
  log "Restoring Git commit $previous_commit and the previous runtime bundle; persistent data is never changed."

  if ! as_app_owner git reset --hard "$previous_commit"; then
    fail "Rollback could not restore the previous Git commit. The running project was not replaced automatically."
  fi
  if ! as_app_owner bash -c "
      cd '$APP_DIR' || exit 1
      rm -rf '$STANDALONE_DIR'
      if [[ -d '$STANDALONE_OLD' ]]; then
        mv '$STANDALONE_OLD' '$STANDALONE_DIR'
      fi
    "; then
    fail "Rollback restored source code but could not restore the previous runtime bundle. Restart school_syt from the Baota UI."
  fi

  RESTART_EPOCH_MS="$(date +%s%3N)"
  if ! restart_baota_project; then
    fail "Rollback bundle restored but Baota did not confirm the restart. Restart school_syt from the Baota UI."
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

  local new_commit
  local installed_commit=""
  new_commit="$(as_app_owner git rev-parse HEAD)"
  # 跳过条件 = 代码没有新提交 且 运行包已经是该提交的产物（有发布标记）。
  # 仅“代码拉到新 commit 但运行包还是旧的”（含首次引导）必须继续发布。
  if [[ -f "$RELEASE_MARKER" ]]; then
    installed_commit="$(cat "$RELEASE_MARKER" 2>/dev/null || true)"
  fi
  if [[ "$new_commit" == "$PREVIOUS_COMMIT" && "$installed_commit" == "$new_commit" && -d "$STANDALONE_DIR" ]]; then
    log "Commit $new_commit is already released (runtime matches the release marker); nothing to do."
    return 0
  fi
  if [[ "$new_commit" == "$PREVIOUS_COMMIT" && "$installed_commit" != "$new_commit" ]]; then
    log "Source is at $new_commit but the running bundle is older; releasing the current artifact."
  fi

  # 产物下载失败：代码已拉取但运行包未动、进程未动，直接还原 Git 状态退出。
  if ! download_artifact "$new_commit"; then
    as_app_owner git reset --hard "$PREVIOUS_COMMIT" || true
    fail "Standalone artifact for commit $new_commit was not downloaded. Wait for the GitHub Actions build (or re-run it) and try again. Git was restored to $PREVIOUS_COMMIT."
  fi

  ROLLBACK_REQUIRED=1
  trap on_exit EXIT
  trap on_interrupt INT
  trap on_terminate TERM
  # 宝塔 Web 终端断连会发 SIGHUP；不 trap 则 EXIT 陷阱不执行、发布半成功无回滚。
  trap on_terminate HUP

  # 重启后首次请求可能触发自动迁移（改库结构），发布前先备份数据库。
  log "Backing up the SQLite database before restart..."
  if ! as_app_owner "$NPM_BIN" run backup >/dev/null 2>&1; then
    log "WARN: npm run backup failed. The in-process pre-migration backup still applies; continuing."
  fi

  install_artifact
  rm -f "$ARTIFACT_FILE"

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
  printf '%s\n' "$new_commit" > "$RELEASE_MARKER"
  as_app_owner rm -rf "$STANDALONE_OLD"
  log "Release completed successfully at commit $(as_app_owner git rev-parse --short HEAD)."
}

main "$@"

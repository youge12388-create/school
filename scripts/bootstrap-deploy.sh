#!/bin/bash
# 首次部署一键脚本：拉代码 -> 构建 -> 迁移 -> systemd -> 创建管理员
# 用法：
#   git clone https://github.com/youge12388-create/school.git /tmp/school-bootstrap
#   ADMIN_PASSWORD='你的强密码' bash /tmp/school-bootstrap/scripts/bootstrap-deploy.sh

set -euo pipefail

APP_DIR=/opt/school-syt
GIT_URL=https://github.com/youge12388-create/school.git
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
NPM_BIN="$(command -v npm)"
NODE_BIN="$(command -v node)"
NPM_DIR="$(dirname "$NPM_BIN")"
NODE_DIR="$(dirname "$NODE_BIN")"
RUN_PATH="$NPM_DIR:$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"

echo "========================================"
echo " 学校筛查系统 - 首次部署一键脚本"
echo "========================================"

echo "[1/8] 创建目录..."
mkdir -p "$APP_DIR/releases" \
  "$APP_DIR/shared/data/uploads" \
  "$APP_DIR/shared/data/imports" \
  "$APP_DIR/shared/data/keys" \
  "$APP_DIR/shared/backups"

RELEASE=$(date +%Y%m%d%H%M%S)
CURRENT_DIR="$APP_DIR/releases/$RELEASE"

echo "[2/8] 拉取最新代码..."
git clone "$GIT_URL" "$CURRENT_DIR"
cd "$CURRENT_DIR"

echo "[3/8] 写入环境配置..."
cat > .env.local <<EOF
DATABASE_PATH=$APP_DIR/shared/data/app.db
UPLOAD_DIR=$APP_DIR/shared/data/uploads
IMPORT_DIR=$APP_DIR/shared/data/imports
APP_KEY_PATH=$APP_DIR/shared/data/keys/app.key
SESSION_TTL_HOURS=12
MAX_UPLOAD_MB=20
EOF

echo "[4/8] 安装依赖并构建..."
export PATH="$RUN_PATH"
npm ci || npm ci --registry=https://registry.npmmirror.com
npm run build

echo "[5/8] 创建运行用户并授权..."
id school-syt >/dev/null 2>&1 || \
  useradd --system --home "$APP_DIR" --shell /sbin/nologin school-syt
chown -R school-syt:school-syt "$APP_DIR"

echo "[6/8] 执行数据库迁移..."
runuser -u school-syt -- env \
  PATH="$RUN_PATH" \
  DATABASE_PATH="$APP_DIR/shared/data/app.db" \
  UPLOAD_DIR="$APP_DIR/shared/data/uploads" \
  IMPORT_DIR="$APP_DIR/shared/data/imports" \
  APP_KEY_PATH="$APP_DIR/shared/data/keys/app.key" \
  "$NPM_BIN" run db:migrate

echo "[7/8] 配置 systemd 服务..."
ln -sfn "$CURRENT_DIR" "$APP_DIR/current"
chown -h school-syt:school-syt "$APP_DIR/current"
cat > /etc/systemd/system/school-syt.service <<EOF
[Unit]
Description=School SYT Next.js Application
After=network.target

[Service]
Type=simple
User=school-syt
Group=school-syt
WorkingDirectory=$APP_DIR/current
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=PATH=$RUN_PATH
Environment=DATABASE_PATH=$APP_DIR/shared/data/app.db
Environment=UPLOAD_DIR=$APP_DIR/shared/data/uploads
Environment=IMPORT_DIR=$APP_DIR/shared/data/imports
Environment=APP_KEY_PATH=$APP_DIR/shared/data/keys/app.key
Environment=SESSION_TTL_HOURS=12
Environment=MAX_UPLOAD_MB=20
ExecStart=$NPM_BIN start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now school-syt
sleep 3

echo "[8/8] 创建管理员账号..."
if [ -n "$ADMIN_PASSWORD" ]; then
  runuser -u school-syt -- env \
    PATH="$RUN_PATH" \
    DATABASE_PATH="$APP_DIR/shared/data/app.db" \
    UPLOAD_DIR="$APP_DIR/shared/data/uploads" \
    IMPORT_DIR="$APP_DIR/shared/data/imports" \
    APP_KEY_PATH="$APP_DIR/shared/data/keys/app.key" \
    "$NPM_BIN" run admin:create -- admin "系统管理员" "$ADMIN_PASSWORD"
else
  echo "跳过管理员创建。部署后执行："
  echo "  runuser -u school-syt -- env PATH='$RUN_PATH' DATABASE_PATH='$APP_DIR/shared/data/app.db' '$NPM_BIN' run admin:create -- admin 系统管理员 '你的强密码'"
fi

echo "========================================"
echo " 部署完成！"
echo " 当前版本: $RELEASE"
echo " 服务检查: systemctl status school-syt"
echo " 端口检查: ss -lntp | grep 3000"
echo " 日志:     journalctl -u school-syt -n 100 --no-pager"
echo "========================================"

#!/bin/bash
# 腾讯云一键部署脚本 - 从 GitHub 拉取最新代码并部署
# 放在 /opt/school-syt/deploy-from-github.sh
# 执行: bash /opt/school-syt/deploy-from-github.sh

set -e

APP_DIR="/opt/school-syt"
RELEASE_DIR="$APP_DIR/releases"
SHARED_DIR="$APP_DIR/shared"
GIT_URL="https://github.com/youge12388-create/school.git"

echo "========================================"
echo " 学校筛查系统 - 从 GitHub 部署"
echo "========================================"
echo ""

# 检查 releases 目录
if [ ! -d "$RELEASE_DIR" ]; then
    echo "创建 releases 目录..."
    mkdir -p "$RELEASE_DIR"
fi

# 创建新版本目录
RELEASE_TAG=$(date +%Y%m%d%H%M%S)
CURRENT_DIR="$RELEASE_DIR/$RELEASE_TAG"

echo "[1/5] 从 GitHub 克隆最新代码..."
git clone "$GIT_URL" "$CURRENT_DIR"
echo "  代码已克隆到: $CURRENT_DIR"
echo ""

cd "$CURRENT_DIR"

echo "[2/5] 创建环境变量配置文件..."
if [ -f "$SHARED_DIR/.env" ]; then
    cp "$SHARED_DIR/.env" "$CURRENT_DIR/.env.local"
    echo "  已从 $SHARED_DIR/.env 复制配置"
else
    cat > .env.local << EOF
DATABASE_PATH=$SHARED_DIR/data/app.db
UPLOAD_DIR=$SHARED_DIR/data/uploads
IMPORT_DIR=$SHARED_DIR/data/imports
APP_KEY_PATH=$SHARED_DIR/data/keys/app.key
EOF
    echo "  已生成默认配置"
fi
echo ""

echo "[3/5] 安装生产依赖..."
npm ci --omit=dev
echo ""

echo "[4/5] 构建项目..."
npm run build
echo ""

echo "[5/5] 切换版本并重启服务..."
# 切软链接
ln -sfn "$CURRENT_DIR" "$APP_DIR/current"
# 数据目录软链接（兼容旧配置）
if [ ! -L "$CURRENT_DIR/data" ]; then
    ln -sfn "$SHARED_DIR/data" "$CURRENT_DIR/data"
fi
# 重启服务
if systemctl is-active --quiet school-syt 2>/dev/null; then
    systemctl restart school-syt
    echo "  已通过 systemctl 重启 school-syt 服务"
elif pm2 list 2>/dev/null | grep -q school-syt; then
    pm2 restart school-syt
    echo "  已通过 pm2 重启 school-syt 服务"
else
    echo "  未检测到服务，直接启动..."
    PID=$(lsof -ti:3000 2>/dev/null)
    [ -n "$PID" ] && kill "$PID"
    nohup node "$CURRENT_DIR/node_modules/.bin/next start" > "$SHARED_DIR/data/logs/deploy-$(date +%Y%m%d-%H%M%S).log" 2>&1 &
fi
echo ""

echo "========================================"
echo " 部署完成！"
echo " 当前版本: $RELEASE_TAG"
echo " 当前目录: $CURRENT_DIR"
echo ""
echo " 请 Ctrl+F5 硬刷新浏览器查看效果"
echo " 如果网站异常，回滚命令:"
echo "   rm -f $APP_DIR/current"
echo "   ln -sfn $APP_DIR/releases/上一个版本 $APP_DIR/current"
echo "   systemctl restart school-syt"
echo "========================================"
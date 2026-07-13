#!/bin/bash
# 一键部署脚本 - 宝塔终端 / Linux 服务器用
# 在项目目录下执行: bash scripts/deploy.sh

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "========================================"
echo " 学校筛查系统 - 一键部署"
echo "========================================"
echo "项目目录: $APP_DIR"
echo ""

# 1. 拉取最新代码
echo "[1/4] 拉取最新代码..."
git pull
echo ""

# 2. 安装依赖
echo "[2/4] 安装依赖..."
npm ci --omit=dev
echo ""

# 3. 构建
echo "[3/4] 构建项目..."
npm run build
echo ""

# 4. 重启服务
echo "[4/4] 重启服务..."
if systemctl is-active --quiet school-syt 2>/dev/null; then
    systemctl restart school-syt
    echo "已通过 systemctl 重启 school-syt 服务"
elif pm2 list 2>/dev/null | grep -q school-syt; then
    pm2 restart school-syt
    echo "已通过 pm2 重启 school-syt 服务"
else
    echo "未检测到 systemd 或 pm2 服务，尝试查找并重启 next 进程..."
    PID=$(lsof -ti:3000 2>/dev/null)
    if [ -n "$PID" ]; then
        kill "$PID"
        echo "已停止旧进程 (PID: $PID)"
    fi
    nohup node node_modules/.bin/next start > data/logs/deploy-$(date +%Y%m%d-%H%M%S).log 2>&1 &
    echo "已启动新进程"
fi
echo ""

echo "========================================"
echo " 部署完成！"
echo " 请 Ctrl+F5 硬刷新浏览器查看效果"
echo "========================================"
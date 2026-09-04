# 高校筛查与申请管理系统

面向在华留学顾问的本地 Web 系统，用于维护学校项目知识库、筛选项目、管理客户、跟进申请流程并加密保存申请材料。

## 当前生产发布（宝塔，云端构建方案）

当前生产环境只使用宝塔 Node 项目托管：项目目录为 `/opt/school-opt`，项目名为 `school_syt`，Node 为 `/www/server/nodejs/v24.18.0/bin`，健康检查地址为 `https://check.medicalchinaway.com/login`。

在宝塔终端以 root 身份先运行预检查，再发布：

```bash
cd /opt/school-opt
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

**服务器不执行构建。** 每次推送到 GitHub `master` 后，`.github/workflows/build-standalone.yml`（GitHub Actions）会在云端完成 `npm ci` + `next build`，并把 `.next/standalone` 发布为 `build-<commit>` 的 Release 产物（仓库为公开仓库，服务器免凭证下载）。`scripts/deploy.sh` 只做：调用宝塔本地 Node 项目控制器确认 `school_syt` 存在 → `git pull --ff-only` → 下载本次 commit 对应的 standalone 产物并校验 → 备份数据库 → 交换 `.next/standalone`（旧包保留为 `.old`）→ 宝塔控制器重启 → `/api/health` 进程级健康检查；任一步失败或进程被中断时，自动恢复发布前 Git 提交、用 `.old` 还原旧运行包并再次重启。它不依赖面板 HTTP API 路由或令牌，以 `/opt/school-opt` 现有所有者执行 Git，避免把宝塔项目文件改成 root 所有；不会创建 systemd、独立 PM2 或 nohup 进程，也不会写入或回滚 `data/`。

> 注意：发布前请确认 GitHub Actions 已为当前 `master` 提交产出 Release（约几分钟）。`deploy.sh` 找不到对应产物时会还原 Git 并安全退出，不会影响正在运行的服务。

旧的腾讯云/systemd 教程仅是历史记录，不能用于当前生产环境。

## 当前数据

首次导入已完成：

- 86 所学校
- 281 条唯一项目
- 原 Excel 中 1 条完全重复项目已去重
- 86 条项目因 CSCA、截止日期或费用等信息不完整进入待复核队列

系统不会把原表未写明的信息推断为“符合”或“不符合”，统一显示“数据库未有相关信息”。

## 本地 Windows 一键部署（仅本机）

以下脚本自动完成安装依赖、构建、数据库迁移、启动生产服务并打开浏览器：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
```

如果希望开机自动启动（登录时自动部署）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1 -Startup
```

### 服务管理

部署后，服务在后台静默运行（无窗口），通过以下命令管理：

```powershell
.\scripts\manage-service.ps1 status     # 查看运行状态
.\scripts\manage-service.ps1 stop       # 停止服务
.\scripts\manage-service.ps1 restart    # 重启
.\scripts\manage-service.ps1 logs       # 查看最近 50 行日志
.\scripts\manage-service.ps1 info       # 查看部署信息
```

### 桌面快捷方式

双击 `scripts\open-local.ps1` 或桌面快捷方式，自动检测生产服务 → 已构建则启动 → 回退开发模式。

## 首次启动（手动）

如果需要手动启动开发模式：

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:migrate
npm run admin:create -- admin "系统管理员" "请替换为至少10位的强密码"
npm run dev
```

浏览器打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

也可以双击或执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

### 本地测试账号

以下账号只用于本机功能测试，禁止用于生产或公网部署：

- 用户名：`admin`
- 密码：`local-admin-2026`

测试结束后应通过 `npm run admin:password -- admin` 改为独立的强密码。

## 环境要求

- Windows 10/11
- Node.js 24
- npm 11

## 首次启动

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:migrate
npm run admin:create -- admin "系统管理员" "请替换为至少10位的强密码"
npm run dev
```

浏览器打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

也可以双击或执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```


.env.example 默认使用 Zeabur 推荐的 /data 持久化路径；本地开发如果不希望写入系统根目录，请复制后把 .env.local 中的路径改回 ./data/...。

## Zeabur 部署说明

本项目使用 Next.js + SQLite，并通过 Node.js 内置 `node:sqlite` 访问数据库。Zeabur 上建议使用 Node.js 24，并把所有运行期数据放到持久化 Volume 中。

### 1. 环境变量

在 Zeabur 项目的 Environment Variables 中配置：

```env
DATABASE_PATH=/data/app.sqlite
UPLOAD_DIR=/data/uploads
IMPORT_DIR=/data/imports
APP_KEY_PATH=/data/app.key
SESSION_TTL_HOURS=24
MAX_UPLOAD_MB=20
```

### 2. 持久化 Volume

需要在 Zeabur 创建 Volume，建议挂载到 `/data`。以下文件都应该放在 `/data` 下，避免服务重启或重新部署后丢失：

- `/data/app.sqlite`：SQLite 数据库文件
- `/data/uploads`：加密后的上传材料
- `/data/imports`：导入预览临时文件
- `/data/app.key`：文件加密密钥

如果没有持久化 Volume，SQLite 数据库、上传文件和 `APP_KEY` 可能会在重启后丢失；`APP_KEY` 丢失后，旧上传文件将无法解密。

### 3. 构建与启动

优先沿用项目脚本：

```bash
npm install
npm run build
npm start
```

`npm start` 使用 `next start`，Next.js 默认监听 `0.0.0.0` 并读取 Zeabur 注入的 `PORT`，适合容器平台访问。

### 4. 首次上线后的命令

部署完成后，在 Zeabur 的 Command Execution 中执行数据库迁移：

```bash
npm run db:migrate
```

然后创建管理员账号，参数依次是“用户名、显示名称、密码”：

```bash
npm run admin:create -- admin "系统管理员" "请替换为至少10位的强密码"
```

`admin:create` 会自动确保数据库迁移已执行；如果用户名已存在，脚本会停止并提示“用户名已存在”。生产环境不要使用弱密码或测试密码。

已有账号改密时，密码通过环境变量提供，不写入代码：

```powershell
$env:ADMIN_PASSWORD = "请替换为至少10位的强密码"
npm run admin:password -- admin
Remove-Item Env:ADMIN_PASSWORD
```

改密脚本会同时清除该账号的旧会话。

## Excel 导入

网页中以管理员或数据管理员身份进入“数据导入”，同时选择：

- `高校汇总-中文.xlsx`
- `高校项目汇总-中文.xlsx`

系统会先显示新增、修改、重复、冲突和待复核统计。确认后才写入数据库。

少量数据可在同一页面切换到“手动录入一条”。仅学校中文名必填，其余字段可留空；同名学校会自动关联，保存后的项目可立即在学校库和学校筛查中搜索；已存在相同项目类型与授课语言时会阻止重复创建。

命令行直接导入：

```powershell
npm run data:import -- "C:\path\高校汇总-中文.xlsx" "C:\path\高校项目汇总-中文.xlsx"
```

生成带永久内部 ID 的维护模板：

```powershell
npm run data:template
```

## 常用命令

```powershell
npm run dev
npm run build
npm start
npm test
npm run typecheck
npm run lint
npm run backup
```

## 数据与安全

以下内容均被 `.gitignore` 排除：

- `data/app.db`：SQLite 数据库
- `data/uploads/`：AES-256-GCM 加密材料
- `data/keys/app.key`：材料解密密钥
- `data/imports/`：待确认导入预览
- `backups/`：本机备份

真实保存客户护照和成绩单前，请启用 Windows BitLocker。数据库、附件和密钥必须同时备份，但建议分开保管。

详细说明见：

- [架构文档](docs/ARCHITECTURE.md)
- [备份恢复](docs/BACKUP_AND_RESTORE.md)
- 系统内“安全说明”页面

## 暂不包含

首版不包含企业微信集成、客户公开分享链接、自动翻译、短信通知、支付和外部 AI 推荐。企业微信将在本地流程稳定后接入登录、组织架构或消息提醒。

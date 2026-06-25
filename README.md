# 高校筛查与申请管理系统

面向在华留学顾问的本地 Web 系统，用于维护学校项目知识库、筛选项目、管理客户、跟进申请流程并加密保存申请材料。

## 当前数据

首次导入已完成：

- 86 所学校
- 281 条唯一项目
- 原 Excel 中 1 条完全重复项目已去重
- 86 条项目因 CSCA、截止日期或费用等信息不完整进入待复核队列

系统不会把原表未写明的信息推断为“符合”或“不符合”，统一显示“数据库未有相关信息”。

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

## Excel 导入

网页中以管理员或数据管理员身份进入“数据导入”，同时选择：

- `高校汇总-中文.xlsx`
- `高校项目汇总-中文.xlsx`

系统会先显示新增、修改、重复、冲突和待复核统计。确认后才写入数据库。

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

# CODEX_HANDOFF.md

## 1. 当前项目目标

本项目是一个本地高校项目筛查与客户申请管理系统，服务对象是在华留学顾问团队。

首版目标：

- 从两份 Excel 建立学校/项目知识库。
- 顾问按客户条件筛选学校项目，保存推荐方案并生成可打印对比页。
- 管理客户档案、跟进记录、申请状态和申请材料。
- 支持多账号、角色权限、审计日志和本地加密文件存储。
- 先本地单机跑通，后续再考虑服务器部署或企业微信集成。

明确不包含首版：

- 企业微信登录/通讯录/消息提醒。
- 客户外部分享链接。
- 自动翻译。
- 短信通知。
- 在线支付。
- 外部 AI 推荐。

当前本地数据状态（来自上一轮 `data/app.db` 统计，接手时请重新确认）：

- 学校：86 所。
- 有效项目：281 条。
- 当前客户：以本机 `data/app.db` 为准，接手时运行数据库统计确认。
- 活跃用户：1 个。
- 待复核项目：86 条。
- 截止状态：开放中 106 条，已截止 123 条，未知 52 条。

## 2. 已完成的主要功能

- 初始化 Next.js 本地 Web 应用。
- 建立 SQLite 数据库 schema 和初始迁移。
- 支持学校/项目 Excel 解析、导入预览、确认导入。
- 已导入真实 Excel 数据，并在导入时去掉 1 条完全重复项目。
- 支持学校、项目、客户、申请、审计、数据导入等页面。
- 支持管理员、顾问、数据管理员三类角色。
- 登录系统已实现，当前测试账号按用户要求设为 `admin / admin`。
- 密码使用 `scrypt` 哈希。
- 会话使用安全 Cookie。
- 客户材料上传、下载、AES-256-GCM 加密存储已实现。
- 文件类型白名单：PDF、JPG、PNG、DOCX、XLSX。
- 默认上传大小上限：20 MB。
- 审计日志已覆盖登录、客户、推荐、申请、导入、文件相关操作。
- 筛选系统已实现基础匹配：
  - 申请学历。
  - 授课语言。
  - 目标专业。
  - 首年预算。
  - CSCA。
  - GPA。
  - HSK / IELTS / TOEFL / Duolingo。
  - 省份/城市。
  - 奖学金。
  - 申请截止状态。
  - 截止日期起止范围。
- 筛选结果会显示匹配证据，不符合项目不会直接删除。
- 新增客户页面已从 Server Action 改为普通 POST API：`/api/customers`。
- 全局样式已向 Google / Material 风格调整：浅灰背景、白色卡片、蓝色主按钮、圆角输入框、轻阴影。

## 3. 当前技术栈

- TypeScript
- Next.js `16.2.9`
- React `19.2.4`
- SQLite，通过 Node.js `node:sqlite`
- Drizzle ORM `0.45.2`
- `drizzle-orm/sqlite-proxy`
- Zod
- Vitest
- ESLint
- SheetJS `xlsx@0.18.5`
- `lucide-react`

环境要求：

- Windows 10/11。
- Node.js 24。
- npm 11。

重要提醒：

- `node:sqlite` 在当前 Node 版本仍会输出 ExperimentalWarning。
- `xlsx@0.18.5` 有已知依赖审计风险，后续需要评估替换或升级方案。

## 4. 项目目录结构说明

```text
D:\codex-all\school-syt
├── src
│   ├── app
│   │   ├── api                 # Route Handlers：登录、客户、导入、文件等内部 API
│   │   ├── login               # 登录页
│   │   ├── (workspace)         # 登录后的业务页面
│   │   ├── actions.ts          # Server Actions：跟进、申请、推荐、账号等
│   │   ├── account-actions.ts  # 账号相关动作
│   │   ├── globals.css         # 全局 UI 样式
│   │   └── layout.tsx          # 根布局
│   ├── components              # 导航、通用 UI、导入面板
│   └── lib
│       ├── db                  # schema、迁移、Drizzle/SQLite 连接
│       ├── auth.ts             # 会话、当前用户、角色校验
│       ├── audit.ts            # 审计日志写入
│       ├── excel-import.ts     # Excel 表头校验和原始行解析
│       ├── import-service.ts   # 导入预览、确认写入
│       ├── program-parser.ts   # 项目字段解析
│       ├── matcher.ts          # 筛选、匹配证据、排序
│       ├── queries.ts          # 页面读查询
│       ├── file-crypto.ts      # 文件加密/解密
│       └── constants.ts        # 角色、状态、标签、文件类型等常量
├── drizzle                    # SQL 迁移文件
├── scripts                    # 本地启动、迁移、导入、管理员、备份脚本
├── docs                       # 架构和备份恢复说明
├── public                     # 静态资源
├── data                       # 本地数据库、上传文件、密钥、导入缓存；不进 Git
└── backups                    # 本地备份；不进 Git
```

## 5. 关键文件说明

### 项目配置

- `package.json`
  - npm scripts、依赖版本。
- `.env.example`
  - 本地数据库、上传目录、密钥路径、会话时长、上传大小。
- `.gitignore`
  - 已排除 `.env*`、`data/`、`backups/`、构建产物等。
- `AGENTS.md`
  - 项目协作规则，下一位 Codex 必须先读。

### 数据库

- `src/lib/db/schema.ts`
  - 核心实体定义：`users`、`sessions`、`audit_logs`、`schools`、`programs`、`customers`、`applications`、`documents` 等。
- `src/lib/db/index.ts`
  - Drizzle sqlite-proxy 连接。
  - 已修过 `all()` / `get()` 的返回映射问题。
- `src/lib/db/raw.ts`
  - 原生 SQLite helper。
  - 当前建议对写操作优先使用它，避免 sqlite-proxy mutation 兼容性问题。
- `src/lib/db/migration.ts`
  - 本地迁移执行逻辑。
- `drizzle/0000_initial.sql`
  - 初始表结构。

### 认证和权限

- `src/lib/auth.ts`
  - 创建/销毁会话、获取当前用户、角色校验。
- `src/lib/password.ts`
  - `scrypt` 密码哈希和验证。
- `src/app/api/auth/login/route.ts`
  - 登录 API。
- `src/app/actions.ts`
  - 包含登出、创建用户、启停用户等动作。

### 导入和解析

- `src/lib/excel-import.ts`
  - 读取和校验 Excel。
- `src/lib/program-parser.ts`
  - 解析费用、语言、GPA、CSCA、日期、奖学金等。
- `src/lib/import-service.ts`
  - 创建导入预览、确认导入、写入学校/项目/专业。
- `src/components/import-panel.tsx`
  - 前端导入交互。
- `src/app/api/imports/preview/route.ts`
  - 导入预览 API。
- `src/app/api/imports/confirm/route.ts`
  - 导入确认 API。

### 筛选和推荐

- `src/lib/matcher.ts`
  - 匹配规则、证据生成、排序。
  - 已加入 `deadlineFrom`、`deadlineTo`、`deadlineMode`。
- `src/app/(workspace)/screening/page.tsx`
  - 筛选页面。
  - 已加入申请截止状态、截止日期从、截止日期到。
- `src/app/(workspace)/recommendations/[id]/print/page.tsx`
  - 推荐方案打印页。

### 客户和申请

- `src/app/(workspace)/customers/page.tsx`
  - 客户列表。
- `src/app/(workspace)/customers/new/page.tsx`
  - 新增客户表单。
- `src/app/api/customers/route.ts`
  - 新增客户 POST API。
- `src/app/(workspace)/customers/[id]/page.tsx`
  - 客户详情、跟进、材料、申请、推荐方案。
- `src/app/(workspace)/applications/page.tsx`
  - 申请列表。
- `src/app/(workspace)/applications/[id]/page.tsx`
  - 申请详情和状态时间线。

### 文件和安全

- `src/lib/file-crypto.ts`
  - AES-256-GCM 加密、解密、完整性校验。
- `src/app/api/documents/upload/route.ts`
  - 材料上传。
- `src/app/api/documents/[id]/route.ts`
  - 材料下载。
- `src/app/(workspace)/security/page.tsx`
  - 安全说明页。

### 样式

- `src/app/globals.css`
  - 当前全局视觉风格入口。
- `src/components/ui.tsx`
  - 通用页面标题、徽章、空状态等。
- `src/components/app-nav.tsx`
  - 后台导航。

## 6. 已经做过的重要技术决策

- 首版选择本地一体化 Web 应用，不先接企业微信。
- SQLite 数据、上传材料、加密密钥全部放在本地 `data/` 下，并排除 Git。
- 使用多账号和角色权限，即使首版只有单机试用，也为后续多人使用保留边界。
- 所有员工可查看全部客户，权限主要限制在账号管理和数据维护。
- 学校和项目保留原始文本、结构化字段、来源批次、复核状态。
- 未明确的数据不推断，统一使用 `UNKNOWN` / “数据库未有相关信息”。
- 专业匹配不调用外部 AI，使用关键词和人工维护同义词。
- 费用按首年上限判断，费用不完整时结果中明确提示。
- GPA 不做不可靠自动换算，计分制不一致时要求人工复核。
- 已截止项目默认排后或折叠，日期未知仍显示并提示。
- 人工确认过的结构化字段不应被后续 Excel 自动覆盖。
- 文件不放公开目录，下载必须走受控 API。
- 客户和材料默认归档，不设计普通用户永久删除入口。
- 因 Drizzle sqlite-proxy 在本项目里出现写入/返回映射问题，近期写操作倾向改用 `openRawDatabase()`。
- 企业微信未来作为独立适配层接入，不把企业微信字段混进核心业务模型。

## 7. 当前还没完成的任务

- Git 仓库已初始化，主分支为 `master`，已有多次提交和 `feature/school-screening` 合并记录。
- 最近一轮已跑过：typecheck、lint、test、build。接手后如继续改代码，应重新运行相关验证。
- 用户最新反馈后的改动需要继续验证：
  - 筛选页申请时间/截止时间筛选是否在浏览器里实际生效。
  - 新增客户是否可以从页面成功提交并跳转详情页。
  - `admin / admin` 登录是否在当前运行进程中生效。
- `README.md`、`docs/ARCHITECTURE.md` 当前可用；如终端显示乱码，优先确认 PowerShell 编码和读取方式。
- 数据管理员在系统内直接修正学校、项目、专业同义词和解析结果的能力还不完整。
- 导入冲突复核队列还不完整。
- 人工确认字段保护策略需要进一步验证。
- 推荐方案的打印样式仍可继续优化。
- 客户流程中的编辑能力、归档恢复能力还可补强。
- 多账号权限需要补充越权测试。
- 性能测试还没做：282 项目 / 5,000 客户场景。
- 企业微信集成尚未开始。

## 8. 已知 bug 和风险点

### 高优先级

- 文档已同步为 UTF-8；如个别终端仍显示乱码，先确认终端编码，再判断是否需要修正文案文件。
- Drizzle sqlite-proxy 与 Node `node:sqlite` 的返回格式兼容性较脆弱。登录问题曾由 `all()` / `get()` 映射错误引起。
- `src/app/actions.ts` 里仍有不少写操作走 Drizzle mutation，如果再出现写入失败，优先改为 `openRawDatabase()`。
- 当前默认密码 `admin / admin` 只适合本地测试，真实使用前必须强制修改。

### 中优先级

- 当前有 Git 仓库，可以用 `git status` / `git diff` 审查；注意不要提交 `data/`、密钥或上传材料。
- `xlsx@0.18.5` 有审计风险。
- `node:sqlite` 仍是实验特性，未来 Node 升级可能影响行为。
- 没有 HTTPS，不能直接开放公网。
- 本地 `data/` 里包含真实业务数据、密钥和材料，备份时必须同时备份数据库、上传目录和密钥，但建议分开保管。

### 近期用户反馈相关

- 用户之前反馈“账号密码错误”，已经把当前测试账号设为 `admin / admin`，登录 API 曾验证可重定向到 `/dashboard`。
- 用户反馈“申请时间筛选没有加上去 / 申请截止时间没加上去”，筛选页和 matcher 已加入截止日期相关字段，但还需浏览器实测。
- 用户反馈“无法添加客户”，已新增 `/api/customers` 写入路线绕开原 Server Action，但还需浏览器实测。
- 用户反馈“前端太丑”，已调整 `globals.css` 为更接近 Google / Material 的基础风格，但还需要继续做页面级视觉打磨。

## 9. 本地运行命令

首次安装：

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:migrate
```

创建管理员：

```powershell
npm run admin:create -- admin "系统管理员" "admin"
```

当前用户要求本地测试账号密码均为：

```text
admin / admin
```

启动开发服务：

```powershell
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

Windows 一键启动脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

桌面快捷方式入口脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open-local.ps1
```

当前已创建桌面快捷方式：

```text
C:\Users\w\Desktop\高校筛查系统.lnk
```

如果 3000 端口已有旧进程，先停止：

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force
}
```

导入 Excel：

```powershell
npm run data:import -- "C:\Users\w\Documents\WXWork\1688857755951099\Cache\File\2026-06\高校汇总-中文.xlsx" "C:\Users\w\Documents\WXWork\1688857755951099\Cache\File\2026-06\高校项目汇总-中文.xlsx"
```

生成维护模板：

```powershell
npm run data:template
```

备份：

```powershell
npm run backup
```

## 10. 构建、测试、检查命令

类型检查：

```powershell
npm run typecheck
```

Lint：

```powershell
npm run lint
```

单元测试：

```powershell
npm test
```

覆盖率：

```powershell
npm run test:coverage
```

生产构建：

```powershell
npm run build
```

生产启动：

```powershell
npm start
```

建议完整验证顺序：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

## 11. 下一位 Codex 接手时应该先看哪些文件

必须先看：

1. `AGENTS.md`
2. `CODEX_HANDOFF.md`
3. `package.json`
4. `.env.example`
5. `src/lib/db/schema.ts`
6. `src/lib/db/index.ts`
7. `src/lib/db/raw.ts`
8. `src/lib/auth.ts`
9. `src/app/api/auth/login/route.ts`
10. `src/app/api/customers/route.ts`
11. `src/app/(workspace)/customers/new/page.tsx`
12. `src/lib/matcher.ts`
13. `src/app/(workspace)/screening/page.tsx`
14. `src/app/globals.css`
15. `src/lib/import-service.ts`
16. `src/app/actions.ts`
17. `src/lib/constants.ts`

如果处理导入和数据：

- `src/lib/excel-import.ts`
- `src/lib/program-parser.ts`
- `src/lib/program-parser.test.ts`
- `src/lib/matcher.test.ts`
- `src/app/api/imports/preview/route.ts`
- `src/app/api/imports/confirm/route.ts`

如果处理文件安全：

- `src/lib/file-crypto.ts`
- `src/lib/file-crypto.test.ts`
- `src/app/api/documents/upload/route.ts`
- `src/app/api/documents/[id]/route.ts`

如果处理客户/申请流程：

- `src/app/(workspace)/customers/[id]/page.tsx`
- `src/app/(workspace)/applications/[id]/page.tsx`
- `src/app/actions.ts`
- `src/lib/queries.ts`

## 12. 下一步建议从哪里继续

建议下一位 Codex 按这个顺序继续：

1. 先运行检查：

   ```powershell
   npm run typecheck
   npm run lint
   npm test
   ```

2. 如果有 TypeScript 错误，优先处理最近改动或编码读取异常导致的问题。

3. 检查当前未提交改动，确认登录 Host 修复、桌面启动脚本和文档同步是否需要一起提交。

4. 重启开发服务，浏览器实测：

   - 登录：`admin / admin`。
   - 新增客户。
   - 筛选页截止日期状态、起始日期、结束日期。
   - 保存推荐方案。
   - 客户详情创建申请。
   - 申请状态变更。
   - 上传/下载材料。

5. 如果新增客户或其他写操作仍失败，优先检查是否仍走 Drizzle mutation；必要时改为 `openRawDatabase()`。

6. 使用 `git status --short` 检查未提交改动，确认后提交当前修复。

7. 修复并更新文档：

   - `README.md`
   - `docs/ARCHITECTURE.md`
   - `docs/BACKUP_AND_RESTORE.md`

8. 继续 UI 打磨：

   - 统一导航和页面间距。
   - 优化表单密度。
   - 优化筛选结果卡片。
   - 优化客户详情页信息层级。
   - 优化打印页。

9. 补充测试：

   - 登录成功/失败。
   - 新增客户成功/缺少姓名失败。
   - 截止日期筛选。
   - 客户创建后的审计日志。
   - 文件类型拒绝。
   - 应用状态回退必须填写原因。

10. 最终交付前完整运行：

    ```powershell
    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run dev
    ```

## 当前接手判断

当前最重要的不是继续加新功能，而是先把最近一轮修复真正跑通：

1. 确认当前未提交改动范围。
2. 确认项目能 typecheck。
3. 确认 `admin / admin` 可登录。
4. 确认新增客户可用。
5. 确认截止时间筛选可用。
6. 再继续 UI 打磨和数据复核能力。


## 13. 本轮 UI 重写补充

- 新增 `src/app/google-ui.css` 作为当前 Google / Swiss 简约风格覆盖层。
- `src/app/layout.tsx` 在 `globals.css` 后引入 `google-ui.css`，因此后置样式覆盖旧视觉，不改业务逻辑。
- 本轮 UI 重点：白色工作区、浅灰网格背景、Google 蓝主按钮、1px 分隔线、圆角卡片、统一表单和表格密度。
- 如果后续继续深度重构 UI，建议逐步把旧 `globals.css` 中的重复规则合并进 `google-ui.css` 或反向整理成单一设计系统文件。
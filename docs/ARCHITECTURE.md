# 系统架构

最后更新：2026-07-01

## 当前边界

系统当前是本地一体化 Web 应用：Next.js 负责页面和内部 API，SQLite 保存业务数据，上传材料在本机目录中加密存放。首版只面向本机/内网试用，不包含企业微信、外部客户分享、短信、支付或外部 AI 推荐。

后续服务器部署或企业微信接入时，应作为部署层或适配层扩展，不改变学校、项目、客户、申请和材料这些核心业务模型。

## 目录与职责

    src/app/                  Next.js 页面、Server Action 与 Route Handler
    src/app/api/              登录、客户、导入、文件等内部 API
    src/app/(workspace)/      登录后的业务页面
    src/app/google-ui.css     当前 Google 简约风格覆盖层
    src/components/           导航、通用界面、Excel 导入交互、筛查结果卡片
    src/lib/db/               Drizzle 表结构、SQLite 适配与迁移
    src/lib/http.ts           根据当前请求 Host 生成站内 URL，避免本地 Cookie 域名错位
    src/lib/excel-import.ts   Excel 表头校验和原始行转换
    src/lib/program-parser.ts 费用、语言、CSCA、GPA、年龄、日期解析
    src/lib/soft-requirements.ts 从申请要求文本识别竞赛、SAT、研究成果、论文和志愿经历
    src/lib/import-service.ts 导入预览、去重、确认写入
    src/lib/matcher.ts        可解释筛选、证据与排序
    src/lib/queries.ts        页面读查询
    src/lib/file-crypto.ts    AES-256-GCM 文件加密和完整性校验
    src/lib/auth.ts           会话 Cookie 和角色校验
    src/lib/user-service.ts   账号创建、密码重置与会话失效事务
    src/lib/audit-record.ts   不依赖 Web 运行时的审计记录写入
    src/lib/audit.ts          Web 运行时审计入口
    drizzle/                  可审查的 SQL 迁移
    scripts/                  管理员、导入、模板、启动和备份命令
    scripts/start-local.ps1   本地迁移并启动开发服务
    scripts/open-local.ps1    桌面快捷方式入口：检测服务、启动并打开登录页
    data/                     本地数据库、密钥、附件和临时文件；不进 Git

## 请求与数据流

1. 浏览器访问 Next.js App Router 页面。
2. 页面提交表单到 Route Handler 或 Server Action。
3. 写入流程先校验当前会话和角色。
4. 业务逻辑进入 src/lib 中的导入、筛查、客户、申请、文件或审计模块。
5. 数据写入 SQLite；上传材料写入非公开目录，并逐文件 AES-256-GCM 加密。
6. 登录、客户创建和文件上传等表单提交后，通过 appUrl(request, path) 生成跳转地址，保持用户当前访问的 Host，避免 127.0.0.1 和 localhost 混用导致会话 Cookie 不生效。

## Excel 导入数据流

1. Excel 上传后先校验工作表和表头。
2. 每行同时保存原始 JSON 和结构化字段。
3. 自动解析无法确认的字段使用 UNKNOWN，项目标记为 NEEDS_REVIEW。
4. 预览阶段比较已有数据，显示新增、修改、完全重复和人工数据冲突。
5. 管理员确认后，在单个 SQLite 事务中更新学校、项目、专业和导入批次。
6. 学校和项目保留来源批次、原始文本、结构化字段和复核状态。
7. 人工确认过的结构化字段不应被后续自动导入静默覆盖，冲突应进入复核流程。

## 手动录入数据流

1. 管理员或数据管理员在数据导入页切换到“手动录入一条”。
2. Route Handler 重新校验角色；仅学校中文名必填，其余字段可以留空并由 Zod 校验长度和枚举值。
3. 同名学校自动关联；不存在时创建人工确认的学校记录。
4. 项目文本复用 Excel 导入的解析器，生成费用、语言要求、截止日期和专业索引；缺失项目类型或授课语言时保存为 UNKNOWN 并标记待复核。
5. 手工项目设置 manually_verified，后续 Excel 预览显示冲突且确认导入时不覆盖。
6. 写入学校、项目、专业索引和审计日志使用同一个 SQLite 事务。
7. 相同学校、项目类型和授课语言的有效项目不允许重复手动创建。


## 筛查数据流

1. getProgramsForScreening() 读取全部有效项目和学校信息。
2. rankPrograms() 根据客户筛选条件生成匹配结果、证据和排序分数。
3. soft-requirements.ts 仅从“申请要求及材料”按句段识别软性竞争力；区分明确要求、可选加分、仅提及和未写明。
4. 软性条件明确要求但客户不具备时判定不符合；可选项缺失不淘汰，具备时增加证据和排序分；未写明不产生负面结论。
5. 年龄筛选优先重新解析原始申请要求，修正历史数据中“只有最高年龄却同时写入最低年龄”的旧结构化结果。
6. 专业匹配使用关键词和人工维护同义词，不调用外部 AI。
7. 预算按首年费用上限判断；费用缺失时展示风险提示。
8. GPA 仅在计分制一致时自动比较；无法可靠换算时提示人工复核。
9. 截止日期未过的项目优先；已过期项目保留并折叠；日期未知继续展示并警告。
10. 推荐方案保存当时的筛选条件和证据，后续打印不依赖重新计算。

## 模块职责

### 数据层

- src/lib/db/schema.ts 定义核心表：用户、会话、审计、学校、项目、专业、客户、跟进、推荐、申请、材料、导入批次。
- src/lib/db/index.ts 使用 node:sqlite 和 Drizzle sqlite-proxy，启用 WAL、外键和 5 秒 busy timeout。
- src/lib/db/raw.ts 提供原生 SQLite 连接。对复杂联表读、事务写和 sqlite-proxy 易错场景，优先使用原生 SQLite。
- 修改表结构时新增 drizzle/ 迁移文件，不直接改生产数据库。

### 身份与权限

- 账号只能由管理员创建。
- 账号创建使用同源校验的 Route Handler，并在同一个 SQLite 事务中写入用户和审计日志。
- CLI 重置密码后删除该账号全部旧会话，密码只接受环境变量或标准输入。
- ADMIN：全部权限。
- DATA_MANAGER：顾问权限，加知识库导入和复核。
- ADVISOR：筛选、客户、申请和材料操作。
- 所有角色当前均可查看全部客户，这是已确认的业务口径。
- 会话 Cookie 名为 school_syt_session，使用 httpOnly、sameSite: strict，生产环境启用 secure。
- 本地测试请统一使用同一个访问地址，例如 http://127.0.0.1:3000。

### 客户管理

- customers.contract_status 保存 UNKNOWN、NOT_SIGNED、SIGNED 三态，迁移文件为 0001_customer_contract_status.sql。
- 客户列表按负责老师和签约状态直接过滤。
- 院校录取情况从有效申请状态实时汇总，避免在客户表重复保存可能失真的录取结果。
- 后续跟进摘要读取最近一条 follow_ups，完整沟通时间线仍在客户详情页展示。
- 新增客户与对应审计日志使用同一个原生 SQLite 事务，任一步失败都会整体回滚。

### 申请流程

- 申请状态统一由 applications.status 保存。
- 状态变化写入 application_events，必须填写原因。
- 状态允许回退或跳转，但保留完整时间线。
- 材料可关联客户，也可关联具体申请。

### 文件安全

- 浏览器不能直接访问上传目录。
- 文件扩展名和 MIME 类型必须同时在白名单中。
- 文件使用随机内部名称保存，原文件名只写入数据库。
- AES-256-GCM 同时提供加密和篡改检测。
- 下载需要有效会话，并写入审计日志。
- 客户和材料默认归档，不提供普通用户永久删除入口。

### 审计

审计表只有写入和查询入口，没有更新、删除页面。记录登录、账号、客户、跟进、申请、文件、推荐与导入操作。

### 本地启动

- scripts/start-local.ps1：进入项目根目录，缺少 .env.local 时从 .env.example 复制，执行迁移后运行 npm run dev。
- scripts/open-local.ps1：面向桌面快捷方式。先请求 http://127.0.0.1:3000/login，服务不可用时以最小化 PowerShell 启动 start-local.ps1，最多等待 60 秒，然后打开登录页。
- 当前桌面快捷方式位于 C:\Users\w\Desktop\高校筛查系统.lnk。

## 架构决策

- 首版本地单机使用，仍保留多账号与角色，避免未来开放多人时重写。
- 不使用外部 AI，专业匹配采用可维护的同义词组，结果稳定且可解释。
- 未明确的数据不推断为符合或不符合，统一使用 UNKNOWN / “数据库未有相关信息”。
- Drizzle 负责 schema 和简单查询；复杂联表和关键事务可使用原生 SQLite，减少 sqlite-proxy 字段顺序和写入兼容性风险。
- 企业微信不是首版数据源；未来作为登录、组织架构或通知适配层，不改变核心业务表。
- UI 当前通过 src/app/google-ui.css 做后置覆盖，继续打磨时应逐步沉淀到通用组件，避免把业务逻辑混入样式改造。

## 后续维护

- 新增解析规则必须补充单元测试，并保留原始字段作为回退。
- 新增筛查规则必须返回可解释证据，不能只改变排序。
- 开放局域网或服务器部署前必须配置 HTTPS、反向代理、网络白名单和异地加密备份。
- 企业微信集成应新增独立适配模块，不把企业微信字段混入客户和项目核心模型。
- 每次中等以上改动后同步更新 docs/PROJECT_STATE.md。

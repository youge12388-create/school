# 项目状态同步

最后更新：2026-06-30

## 当前项目目标

本项目是一个本地高校筛查与客户申请管理系统，服务在华留学顾问团队。首版重点是本地跑通：从 Excel 建立学校/项目知识库，按客户条件筛查项目，管理客户、跟进、申请状态和材料，并保留多账号、权限、审计和未来服务器/企业微信接入边界。

首版不包含企业微信、客户外部分享、自动翻译、短信、支付或外部 AI 推荐。

## 当前进度

- Git 仓库已初始化，主分支为 `master`。
- 学校筛查专项分支已存在：`feature/school-screening`，并已多次合并回 `master`。
- 当前主干包含 Next.js 本地 Web 应用、SQLite 数据库、Excel 导入、筛查、客户、申请、材料、审计和基础账号权限。
- 登录测试账号按用户要求为 `admin / admin`，仅适合本地测试。
- 本轮已修复本地登录跳转 Host 不一致导致“密码要输两次”的问题。
- 本轮已新增桌面快捷启动脚本，桌面快捷方式名称为 `高校筛查系统.lnk`。
- 当前工作区还有未提交改动，主要集中在登录跳转、客户/文件上传重定向、快捷启动脚本和文档同步。

## 最近完成的改动

- 新增 `src/lib/http.ts`，通过请求 Host 生成站内跳转 URL，避免 `127.0.0.1` 与 `localhost` 混用导致 Cookie 丢失。
- 新增 `src/lib/http.test.ts` 覆盖 Host 保持、协议转发和非法 Host 回退。
- 更新以下 Route Handler 使用 `appUrl()`：
  - `src/app/api/auth/login/route.ts`
  - `src/app/api/customers/route.ts`
  - `src/app/api/documents/upload/route.ts`
- 新增 `scripts/open-local.ps1`：检测本地服务，不可用时最小化启动 `scripts/start-local.ps1`，等待后打开登录页。
- 更新 `.gitignore` 和 `eslint.config.mjs`，避免 `.codex-preview-*` 预览目录进入 Git 或 lint。

## 关键文件

- `AGENTS.md`：本项目协作规则，新窗口必须先读。
- `docs/ARCHITECTURE.md`：当前架构说明。
- `CODEX_HANDOFF.md`：较完整的工程交接说明。
- `package.json`：脚本、依赖和运行方式。
- `src/lib/db/schema.ts`：核心数据模型。
- `src/lib/db/index.ts`：Drizzle sqlite-proxy 连接和全局 SQLite 实例。
- `src/lib/db/raw.ts`：原生 SQLite helper。
- `src/lib/auth.ts`：会话、Cookie 和角色校验。
- `src/lib/http.ts`：站内跳转 URL 生成，修复本地 Host 混用问题。
- `src/lib/import-service.ts`：Excel 导入预览和确认写入。
- `src/lib/program-parser.ts`：费用、语言、CSCA、GPA、日期等解析。
- `src/lib/matcher.ts`：筛查匹配、证据和排序。
- `src/lib/queries.ts`：主要页面查询。
- `src/app/google-ui.css`：当前 Google 简约风格覆盖层。
- `scripts/start-local.ps1`：本地开发启动脚本。
- `scripts/open-local.ps1`：桌面快捷方式入口脚本。

## 当前架构概览

```text
浏览器
  ↓
Next.js App Router 页面 / Route Handler
  ↓
src/lib 业务模块
  ├─ auth / audit / http
  ├─ import-service / excel-import / program-parser
  ├─ matcher / queries
  └─ file-crypto
  ↓
SQLite 本地数据库 + data/uploads 加密材料
```

核心原则：

- 页面只负责展示和表单入口。
- Route Handler / Server Action 负责写入流程和跳转。
- 复杂业务逻辑放在 `src/lib`。
- 数据库结构由 `src/lib/db/schema.ts` 和 `drizzle/` 迁移维护。
- 上传材料不进入公开目录，下载必须走受控 API。

## 已知问题和风险

- 当前工作区存在未提交改动，接手前先运行 `git status --short`。
- Next build 可能仍有 Turbopack NFT warning，和 `node:sqlite` / 原生 SQLite 引入有关；目前不一定阻塞构建。
- `node:sqlite` 会输出 ExperimentalWarning。
- Vitest / Next build 在受限 Windows sandbox 中可能遇到 `spawn EPERM`，必要时用提升权限重跑。
- `admin / admin` 只适合本机调试，真实使用前必须改强密码。
- `xlsx@0.18.5` 存在依赖审计风险，后续可评估替换方案。
- 企业微信尚未接入；后续应作为独立适配层，不混入核心业务表。

## 最近一次验证结果

上一轮已通过：

- `npm run typecheck`
- `npm run lint`
- `npm test`（53 个测试通过）
- `npm run build`

直接登录 POST 测试已确认成功跳转到：

```text
http://127.0.0.1:3000/dashboard
```

本次仅同步文档，未改业务代码。

## 下一步建议

1. 先提交当前登录跳转和桌面启动脚本改动。
2. 用浏览器实测快捷方式启动、`admin / admin` 登录、新增客户、材料上传下载。
3. 继续做学校筛查板块时，优先在 `feature/school-screening` 或对应 worktree 上推进。
4. UI 深改继续围绕 `src/app/google-ui.css` 和页面级组件做小步重构，避免一次性重写业务页面。
5. 企业微信放到第二阶段，先稳定本地流程和数据复核能力。
## 本轮筛选修复记录（2026-06-29）

- 扩大导师接收函筛选识别词：导师接收意向函、导师审核通过、导师邀请函、意向导师推荐信、英文 invitation / pre-acceptance / pre-approval。
- 涉及文件：src/lib/matcher.ts、src/lib/matcher.test.ts。
- 验证结果：npm test -- src/lib/matcher.test.ts 通过；npm run typecheck 通过；npm run lint 通过。
- 本地只读统计：明确要求识别由 27 个项目提升到 41 个项目，涉及学校由 11 所提升到 15 所；当前未截止明确要求学校由 3 所提升到 4 所。
- 已知风险：导师接收函仍是文本规则识别，尚未结构化到专业/学院粒度；部分学院必须、其他学院非必需的混合表述仍建议后续引入“部分要求/需人工复核”状态。
## 本轮导师接收函机制修复（2026-06-29）

- 新增导师接收函 PARTIAL_REQUIRED（部分学院/部分专业要求）识别状态；选择“明确或部分要求”时，部分要求项目不再被排除，而是进入“需要补充条件”。
- 修复“必须要求”和“非必需”同时出现时被直接判为不要求的问题，例如上海大学、西北工业大学这类混合表述。
- 扩大识别“导师接收国际学生意向表”等表达，覆盖浙江工商大学样式。
- 筛选页将“学校明确要求”文案改为“明确或部分要求”；截止状态为“全部状态”时，已截止项目分组默认展开。
- 涉及文件：src/lib/matcher.ts、src/lib/matcher.test.ts、src/app/(workspace)/screening/page.tsx。
- 验证结果：npm test -- src/lib/matcher.test.ts、npm run typecheck、npm run lint 均通过。
- 本地只读统计：截图条件下，当前未截止且可展示的导师接收函相关项目由 9 个提升到 17 个，学校由 4 所提升到 6 所；全部导师接收函状态统计为 REQUIRED 37、PARTIAL_REQUIRED 14、UNKNOWN 230。
- 已知风险：仍为文本规则识别，不能替代专业/学院级结构化字段；普通“预录取/接收院校审核”等非导师语境不应被纳入导师接收函要求。
## 本轮筛选 UI 标记调整（2026-06-29）

- CSCA 筛选空值文案从“未确认”改为“不限”，逻辑仍为不参与 CSCA 筛选。
- 筛选结果卡片新增导师接收函标记：REQUIRED 显示“需导师接收函”，PARTIAL_REQUIRED 显示“部分需导师接收函”。
- 涉及文件：src/app/(workspace)/screening/page.tsx、src/components/screening-result-card.tsx、src/app/google-ui.css。
- 验证结果：npm run typecheck、npm run lint、npm test -- src/lib/matcher.test.ts 均通过。
## 本轮学校详情上下文重构（2026-06-29）

- 从筛选结果进入学校详情时，结果卡片链接会携带筛选上下文（type/language/major，若没有筛选条件则携带 programId）。
- 学校详情页读取筛选上下文后，项目区域默认只展示相关项目；普通从学校库进入时仍展示该校全部项目。
- 学校详情页新增“查看该校全部项目”入口，用于从筛选上下文切回完整学校档案。
- 解决从硕士筛选结果进入学校详情时混入本科项目的问题。
- 涉及文件：src/components/screening-result-card.tsx、src/app/(workspace)/screening/page.tsx、src/app/(workspace)/schools/[id]/page.tsx、src/app/google-ui.css。
- 验证结果：npm run typecheck、npm run lint、npm test -- src/lib/matcher.test.ts、npm run build 均通过；build 仍有既有 Turbopack NFT warning 与 node:sqlite ExperimentalWarning。

## 本轮筛选结果紧凑展示修复（2026-06-29）

- 筛选结果改为互斥分组：所有“明确不符合”项目（包括已截止项目）只进入默认收起区，不再同时出现在自动展开的已截止区。
- 专业列表由保留换行的纵向正文改为横向标签流；支持按换行和中英文分号拆分、去空值和去重。
- 新增 `src/lib/screening-results.ts` 统一处理结果分组与专业文本转换，避免页面继续叠加条件分支。
- 新增 `src/lib/screening-results.test.ts`，覆盖“已截止且明确不符合”不会重复展开，以及专业文本拆分去重。
- 涉及文件：`src/app/(workspace)/screening/page.tsx`、`src/components/screening-result-card.tsx`、`src/app/google-ui.css`、`src/lib/screening-results.ts`、`src/lib/screening-results.test.ts`。
- 验证结果：`npm run typecheck`、`npm run lint`、筛选相关测试（34 个）和 `npm run build` 均通过；本地浏览器确认明确不符合分组默认关闭、专业标签横向换行。
- 已知风险：专业数量特别多的项目仍会占用数行，但已从“一项一行”压缩为横向流；如需进一步压缩，可后续增加“显示前 N 项 / 展开全部”。
- 后续补充：学校详情页的“专业列表 / 专业方向”已复用同一横向标签组件；项目介绍、学校简介和申请要求仍按正文分段展示。验证通过：typecheck、lint、专业拆分测试和 build。

## 本轮数据导入增强（2026-06-29）

- 数据导入页新增“Excel 批量导入 / 手动录入一条”双入口；手动录入仅要求学校中文名，其余字段可留空并标记待复核。
- 同名学校自动关联；手工项目写入 programs、program_majors 和 audit_logs，可立即进入项目库与筛查查询。
- 手工项目设置 manually_verified；后续 Excel 预览显示冲突，确认导入也不会覆盖人工值。
- 相同学校、项目类型和授课语言的有效项目会阻止重复创建，整个写入流程使用 SQLite 事务。
- 新增 src/app/api/imports/manual/route.ts、src/components/manual-entry-form.tsx、src/lib/import-service.test.ts；更新 import-service、import-panel、样式和导入文档。
- 验证：导入集成测试 8 项通过；全量测试、typecheck、lint 和 build 均通过；浏览器确认仅学校中文名必填，项目类型和授课语言默认“暂不填写”，控制台无错误。
- 已知风险：手工录入当前以“学校 + 项目类型 + 授课语言”为项目唯一业务键，与既有 Excel 导入规则一致；如果未来同校需要维护多个同类型同语言项目，应先调整数据模型与唯一识别规则。

## 本轮全自动部署脚本（2026-06-29）

- 新增 `scripts/deploy.ps1`：一键部署脚本，自动完成 npm ci → 创建 .env.local → npm run build → npm run db:migrate → 后台启动生产服务（next start）→ 打开浏览器。
- 新增 `scripts/manage-service.ps1`：服务管理脚本，支持 status / stop / restart / logs / info。
- 更新 `scripts/open-local.ps1`：优先检测生产服务 → 已构建则自动部署 → 回退开发模式。
- 支持 `-Startup` 参数注册 Windows 计划任务，登录时自动部署。
- 生产服务使用 System.Diagnostics.Process 静默启动（无窗口），PID 和日志写入 `data/.service.pid` 和 `data/logs/`。
- 涉及文件：`scripts/deploy.ps1`（新建）、`scripts/manage-service.ps1`（新建）、`scripts/open-local.ps1`（更新）、`README.md`（更新）。
- 验证结果：见下文。
- 已知风险：开机自启（-Startup）需管理员权限注册计划任务；生产服务日志可能丢失最后的几条输出（PowerShell 后台作业在进程退出时可能来不及写完）。
- 下一步建议：用浏览器实测 deploy.ps1 完整流程；如需更高可用性，后续可考虑作为 Windows 服务运行（NSSM 或 Node 进程包装）。

## 腾讯云生产部署（2026-06-29）

- 已将本地筛选系统和 SQLite 数据迁移到腾讯云服务器 `114.132.180.195`，系统为 OpenCloudOS 9.6。
- 生产应用目录为 `/opt/school-syt/current`，持久化数据位于 `/opt/school-syt/shared/data/app.db`，当前迁移数据为 88 所学校、283 个项目、1 个用户。
- 使用 Node.js 24.13.0 和 systemd 服务 `school-syt.service` 运行，服务监听 `127.0.0.1:3000`，已设置开机自启和异常自动重启。
- Nginx 配置位于 `/www/server/panel/vhost/nginx/shuqi.fun.conf`，根域名与 `www` 均反向代理到 Next.js 服务，HTTP 自动跳转 HTTPS。
- Cloudflare DNS 已将 `shuqi.fun` 指向 `114.132.180.195`，`www.shuqi.fun` 跟随根域名；`y.shuqi.fun` 保持原配置不变。
- 已安装 Cloudflare Origin CA 证书并启用“完全（严格）”SSL/TLS 模式，证书文件位于 `/www/server/panel/vhost/cert/shuqi.fun/`。
- 线上验收：`https://shuqi.fun/login`、`https://www.shuqi.fun/login` 和直连源站 HTTPS 均返回 200；`http://shuqi.fun/login` 返回 301 并跳转 HTTPS。
- 已知风险：生产环境仍有默认测试账号 `admin / admin`，必须立即修改为强密码；当前数据库和上传文件尚未配置自动异地备份。
- 下一步建议：修改管理员密码，配置每日数据备份与保留策略，并限制宝塔面板和 SSH 的公网来源。

## 本轮生产部署教程文档（2026-06-29）

- 新增 `docs/腾讯云服务器部署教程-小白版.md`，面向第一次接触服务器的使用者，覆盖部署原理、完整操作、实际故障、排错、更新、回滚、备份和安全检查。
- 新增 `docs/腾讯云服务器部署教程-小白版.docx`，采用 A4 中文商务说明页排版，包含标题层级、提示框、表格、代码块、页眉和页码。
- 文档仅记录路径、配置模板和公开连接信息，不包含真实私钥、证书私钥、密码或 API Token。
- 验证结果：Markdown 共 1155 行；DOCX 包含 9 个 OpenXML 条目，全部 XML 校验通过，标题、回滚和备份章节均存在。
- 已知风险：DOCX 由 OpenXML 直接生成，本机没有安装 Word 或 LibreOffice，因此未做真实 Office 渲染截图；包结构和内容已完成程序化校验。
## 本轮筛选UI优化（2026-06-30）

- 学校筛选页"申请目标"板块：移除**年龄**和**入学年份**两个筛选字段。
- CSCA 筛选条件从"学术与语言条件"板块移至"申请目标"板块最前面，优先级高于申请学历。
- 右上角新增全局搜索框，输入关键词后跳转至 `/schools?q=...` 进行学校搜索。
- 涉及文件：`src/app/(workspace)/screening/page.tsx`、`src/components/global-search.tsx`（新建）、`src/app/(workspace)/layout.tsx`、`src/app/globals.css`。
- 验证结果：TypeScript 编译通过，68 个测试全部通过。
- 已知风险：matcher.ts 中 `age` 和 `intakeYear` 相关代码保留但不再被调用，后续可清理。

## 本轮筛选结果卡片视觉重构（2026-06-30）

- 修复排名列加入后旧三列 CSS 造成的学校名称横向错位；结果卡片统一为“左侧选择与排名 + 右侧内容”的固定双列结构。
- 状态与详情入口并入标题操作区，学校名称、项目名称、元信息和专业方向统一左对齐。
- 专业方向默认展示前 8 项，超出部分显示“另有 N 个”，完整信息仍可进入学校详情查看。
- 证据提醒区改为四列等宽轻量状态卡，仅用细左边框和低饱和底色表达通过、补充、待核实和不符合，减少大色块占用。
- 涉及文件：`src/components/screening-result-card.tsx`、`src/app/google-ui.css`、`src/app/globals.css`。
- 验证结果：`npm run typecheck` 通过；目标组件 ESLint 通过；浏览器前四张卡片高度、内容起点、排名位置和证据列宽完全一致，控制台无错误。
- 已修复：全量 `npm run lint` 已在 ESLint 忽略配置中排除 `coverage/` 和 `releases/`，不再扫描生成产物。

## 本轮客户筛选条件面板压缩（2026-06-30）

- 客户筛选条件改为紧凑信息面板：顶部标题、说明和学校搜索同行展示。
- 申请目标采用左侧分组标签轨与六列字段栅格；申请时间保持三列；学术与语言、预算与偏好改为 43px 高折叠栏。
- 控件高度统一为 36px，字段间距、分组间距和操作区留白同步缩小；开始筛查与清空条件统一右对齐。
- 精简说明文案和“导师接收函要求”字段名称，避免标签换行造成列高不一致。
- 涉及文件：`src/app/(workspace)/screening/page.tsx`、`src/app/google-ui.css`。
- 验证结果：筛选卡片总高度 363px，申请目标六个字段均为 58px 高，高级折叠栏均为 43px；`npm run typecheck`、目标页面 ESLint 和浏览器控制台检查均通过。

## 本轮手动录入页面入口修复（2026-06-30）

- 根因：原“手动录入一条”仅依赖 ImportPanel 客户端状态切换，没有独立 URL，页面状态异常时无法进入表单。
- 新增独立受权限保护页面 `/imports/manual`，直接展示手动录入学校与项目表单。
- Excel 批量导入与手动录入入口改为原生页面链接，避免依赖客户端状态或路由水合，支持直接访问、刷新和浏览器返回。
- 涉及文件：`src/components/import-method-tabs.tsx`、`src/components/import-panel.tsx`、`src/app/(workspace)/imports/manual/page.tsx`、`src/app/google-ui.css`。
- 验证结果：真实鼠标点击成功跳转到 `/imports/manual`；表单可见、学校中文名必填、保存按钮可用；类型检查、目标文件 ESLint 和手动导入服务 8 项测试均通过，浏览器控制台无错误。

## 本轮 GitHub 上传前严格修复（2026-06-30）

- 删除误入工作区的 `releases/`、`school-syt.zip` 和 `tmp_patch.js`；当前未跟踪上传候选仅剩 5 个源码文件，约 10KB，无超过 100MB 文件。
- 更新 `.gitignore` 和 `eslint.config.mjs`：忽略 `releases/`、`*.zip`、`tmp_patch.js`、`coverage/`，避免构建产物和压缩包再次进入 Git / lint。
- 修复筛选池查询：`getProgramsForScreening()` 重新排除已归档学校，新增导入服务回归测试覆盖该条件。
- 修复学校搜索：筛选页搜索框 Enter 会阻止父表单提交并跳转 `/schools?q=...`；顶栏接入 `GlobalSearch`。
- 修复学校 / 项目编辑：编辑页增加 `ADMIN`、`DATA_MANAGER` 页面级权限；保存学校会标记 `VERIFIED` 并支持清空可选字段；保存项目会重新解析费用、CSCA、语言成绩、GPA、年龄、截止日期和专业索引，并设置 `manuallyVerified` 防止后续 Excel 覆盖。
- 恢复筛选结果卡片的“顾问推荐理由”输入，保存推荐方案后打印页可继续展示逐项目理由。
- 验证结果：`npm test` 69 项通过；`npm run typecheck` 通过；`npm run lint` 通过；`git diff --check 0fdec32a7f700d1be9d087cbabb89553f928c4be` 通过；`npm run build` 通过。
- 已知风险：`npm run build` 仍有既有 Turbopack NFT warning 和 `node:sqlite` ExperimentalWarning；本轮未能执行联网 `npm audit`，此前已知 `xlsx@0.18.5` 有依赖审计风险，上传前建议在可联网环境补跑。

## 本轮 Zeabur 部署配置补齐（2026-06-30）
- 为 Zeabur 部署补齐最小配置：`package.json` 增加 Node.js 24 引擎要求，`npm start` 改为平台友好的 `next start`，由 Next.js 默认监听 `0.0.0.0` 并读取平台 `PORT`。
- 更新 `.env.example` 为 Zeabur 推荐持久化路径：`DATABASE_PATH=/data/app.sqlite`、上传目录、导入目录和 `APP_KEY_PATH=/data/app.key`。
- README 新增“Zeabur 部署说明”，记录环境变量、`/data` Volume、首次迁移命令 `npm run db:migrate` 和管理员创建命令 `npm run admin:create -- <用户名> <显示名称> <密码>`。
- 本轮不改业务逻辑、不新增复杂部署配置文件；当前未发现已有 Dockerfile、`zbpack.json` 或 `nixpacks.toml`。
- 验证结果：`npm run typecheck` 通过；`npm run lint` 通过；`npm run build` 通过；`npm test` 69 项通过。构建仍有既有 Turbopack NFT warning 与 `node:sqlite` ExperimentalWarning。

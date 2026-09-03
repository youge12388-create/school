# school-syt 代码审查报告（2026-09-03）

> 审查基线：分支 `master`（HEAD f8391586），工作区未提交改动仅部署文档类。
> 审查范围：全库 126 个源码文件——安全与认证、全部 API 路由、近期 10 条提交（宝塔发布脚本重构、院校更新台账导入/模板、启动自动迁移、编辑模式重构等）、核心业务逻辑与数据完整性。
> 方法：三个并行专项通读 + 关键发现逐条二次代码核验。初稿未修改任何代码；
> 2026-09-03 已按确认范围实施修复（清单见文末「修复状态」）。
> 结论：**未发现可直接远程利用的 P0 漏洞；有 2 个体系性授权缺陷、5 个代码/发布正确性 P1 问题，以及一批 P2/P3 加固项。**

---

## 0. 结论摘要

正面项（经核验成立）：

- **会话机制**：令牌 256-bit 随机、库中仅存 sha256；Cookie `HttpOnly + SameSite=Strict + Secure`（生产或 X-Forwarded-Proto=https）；登出删库中会话行，服务端真正失效；无会话固定；角色/停用即时生效（实时 JOIN users 并校验 active）。
- **密码**：scrypt + 16B 随机盐 + 64B key + `timingSafeEqual`；默认迁移不播种账号。
- **加密材料**：AES-256-GCM，每次 `randomBytes(12)` 新 IV（无 nonce 复用），IV/tag/checksum 存库；上传/下载路径穿越防护成立；下载响应带 `nosniff` + attachment。
- **注入**：SQL 全参数化（拼接仅限编译期常量白名单）；全仓无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`；xlsx 往返实测无公式注入。
- **学校域写权限对称**：basic/confidential/programs PATCH、legacy update、导入三条路径均按角色剥离机密字段，URL 直达无法绕过；院校动态的机密字段在 GET 序列化层即剥离（非仅 UI 隐藏）。
- **导入两阶段状态机**：preview→confirm 有 `status=PREVIEW` 校验；confirm 内逐行实时重查而非信任快照；重复项目整事务回滚。
- **Schema/迁移一致性**：drizzle 0000-0005 SQL 与 schema.ts 列、唯一索引一致（差异仅见 P3-13）。

---

## 1. P1（建议修复后再发布）

### P1-1 客户域无属主/角色授权：任意登录角色可读写任意客户的 PII 与加密材料

**位置**：`src/app/api/documents/[id]/route.ts:16-25`（仅 `requireUser()`，无客户归属/角色检查即可解密下载）；`src/app/api/documents/upload/route.ts:16-21`；`src/app/actions.ts:38-112`（跟进、改派、归档）、`:114-190`（建申请/改状态）、`:512-556`（保存推荐）；`src/app/api/customers/route.ts:22-31`（创建时可指定任意 ownerId）；读取侧 `src/lib/queries.ts:564, 711`。

**风险**：`customers.owner_id`、`documents.uploaded_by`、`follow_ups.author_id` 与"负责老师"筛选 UI 表明系统有属主语义，但服务端对客户及其子资源（身份证/电话/微信等 PII、加密扫描件）不区分属主与角色。任意一个低权限账号（含 MARKET_MANAGER 等）直接改 URL 即可下载全部客户材料、改派、归档、改申请状态。触发条件仅为登录。

**产品决策（已与负责人确认）**：客户域保持**全员共享（团队 CRM）**，但**敏感操作按角色收窄**。

**建议修复**：下载/上传材料、改派、归档、状态流转等操作限顾问/管理类角色（如 ADVISOR/DATA_MANAGER/ADMIN），并对"改派/归档"增加属主或管理角色校验；材料下载前校验 `customerId` 存在且调用方有权访问该客户。

### P1-2 跨角色导入确认可绕过机密字段权限

**位置**：`src/app/api/imports/confirm/route.ts:5-12`（仅 `requireRole([...IMPORT_ROLES])`）；`src/lib/import-service.ts:794-852`（`confirmImport` 不校验 `import_batches.imported_by`，也不校验确认者角色不低于预览创建者）；预览 JSON 明文落盘 `data/imports/<batchId>.json`（import-service.ts:286-292，ADMIN 预览时含全部机密列）。

**风险**：预览阶段按创建者角色剥离机密列（仅 ADMIN 保留），但确认阶段只按确认者角色放行并**原样回放磁盘 JSON**。低权限角色若获得某 ADMIN 创建的 batchId（响应回传/UI 显示/磁盘文件），可确认该批次，`upsertSchool` 把机密运营列（含 `cooperation_fee_text` 等）写入学校表，绕过"仅 ADMIN 可导入机密字段"规则。

**建议修复**：`confirmImport` 校验 `batch.imported_by === 确认者 || 确认者角色为 ADMIN`；或批次记录机密级别并在确认时复核；预览文件以 0600 权限写入受控目录。

### P1-3 台账导入解析脆弱：无表头校验、固定列下标、无事务、日期字符串静默丢失

**位置**：`src/lib/school-update-import.ts:41-74`（`parseSchoolUpdateWorkbook` 固定列下标 `row[0..12]`、`rows.slice(2)` 前不校验表头）；`:76-186`（`importSchoolUpdateRows` 逐行独立 INSERT/UPDATE，无 BEGIN/COMMIT，异常时半提交且不写审计）；`:27-39`（`excelDate` 只接受数值型 Excel 序列日期）。

**风险**：
- 旧 15 列模板（dc14c26f 之前的格式，含附件列）重新导入会**整行错列**：附件→网址、网址→更新时间、操作人→机密内容（机密列被污染）……且因"序号"存在会直接 **UPDATE 改写已存在的台账记录**，静默错乱，审计只记计数。
- 用户把日期填成字符串（`2026/3/1` 等）时静默置 null 仍整行导入。
- 批量中途失败：已处理行已提交、请求返回 500、无审计，重导产生重复/覆盖。

**建议修复**：解析前校验表头行与 `SCHOOL_UPDATE_TEMPLATE_HEADERS` 一致（不一致返回"请下载新模板"）；按表头名映射列而非裸下标；整体包事务（失败回滚并返回行号/原因）；`excelDate` 增加字符串日期解析。

### P1-4 维护模板（官方下载通道）缺"合作收费"列，该机密字段经模板流程永远静默丢失

**位置**：`src/app/api/templates/maintenance/route.ts:11-49`（HEADERS 硬编码 37 列，止于"学校申请更新频率"，无"合作收费"）；`src/lib/excel-import.ts:151`（按表头名取 `row["合作收费"]`）。

**背景**：4de647e1 在 permissions/excel-import/import-service 全链路加了"合作收费"（permissions.ts:66,82 已含），唯独维护模板 GET 未加；`scripts/export-template.ts`（CLI 维护模板）同样缺（含其它机密列，属历史欠账）。

**风险**：官方数据流"下载模板 → 填写合作收费 → 上传"中该列不存在 → 导入"成功"但字段永远为空，无任何提示。与提交信息宣称"表头全链路接入"不符。

**建议修复**：HEADERS 追加 `"合作收费"`（保持与 `CONFIDENTIAL_TEMPLATE_HEADERS` 过滤集合一致），补模板导出/回读往返测试；`scripts/export-template.ts` 一并核对。

### P1-5 编辑保存非事务：学校整页保存与逐项目循环部分失败留半成品

**位置**：`src/lib/program-editor.ts:106-137`（`saveProgramFields`：update programs → delete program_majors → insert program_majors → audit，各语句独立自动提交）；`src/app/api/schools/update/route.ts:60-135`（先 UPDATE schools 落库，再 for 循环逐项目保存）。

**风险**：第 k 个项目抛错（校验/唯一约束/并发竞态）→ 学校字段与第 1..k-1 个项目已提交，页面报"保存失败"但数据实际半保存；重试重复写审计（SCHOOL_UPDATED/PROGRAM_UPDATED 每次重试新增）；在 delete majors 与 insert majors 之间中断会留下"0 专业索引"的项目。

**建议修复**：用 `BEGIN IMMEDIATE ... COMMIT/ROLLBACK` 包住整个 route 的学校更新 + 全部项目保存 + 审计（与 import-service 同款写法），majors 先删后插纳入同一事务。

### P1-6 deploy.sh 无"重启后运行版本"验证，可能误报发布成功

**位置**：`scripts/deploy.sh:209-233`（`restart_baota_project` 只校验宝塔 API 返回 `status:true`，语义为"已受理"）；`:235-246`（`wait_for_health` 只 curl `$HEALTH_URL`（/login）能否 200）。

**风险**：若宝塔重启静默未切进程（命中旧实例/接口异常）或健康 URL 前有页面级缓存/基础认证，脚本会把"git HEAD 已在新提交、运行进程仍在旧代码"判定为发布成功；回滚后同样可能误报。

**建议修复**：应用暴露只读 `/api/health`（返回 git rev/build id/进程启动时间戳）；deploy 在 restart 前后各取一次并断言进程启动时间 ≥ restart 请求时刻且 rev 为目标 commit；健康检查对 /login 用 `--fail` 校验非 4xx/5xx。

### P1-7 deploy.sh 未处理 SIGHUP：断连窗口内发布半成功且无自动回滚

**位置**：`scripts/deploy.sh:275-293`（`on_exit` 只 trap EXIT，另 trap INT/TERM 后转 EXIT；**无 HUP**——bash 收到未 trap 的 SIGHUP 直接终止，EXIT trap 不执行）。

**风险**：脚本声明在宝塔 Web 终端以 root 运行。断连/浏览器关闭发生在"已请求宝塔重启新代码（坏）→ 健康检查尚未判失败"窗口时，进程死亡 → 无回滚、无收尾；新代码若启动失败则站点停摆直到人工介入。SIGKILL/断电同理（无法 trap）。

**建议修复**：`trap on_terminate HUP`（并以 setsid/tmux 方式运行发布）；发布开始把 `PREVIOUS_COMMIT` 与状态写入状态文件，下次运行时检测"上次未完成"自动续行回滚。这不违反"不为应用建 nohup 进程"的约束（约束对象是托管进程，非发布脚本自身）。

---

## 2. P2

| # | 问题 | 位置 | 建议 |
|---|---|---|---|
| P2-1 | **市场经理视图泄露"申请要求及材料"**：详情页把含 `requirementsText` 的完整 knowledge 传给组件，组件在非编辑态无条件渲染该段落，无 `marketManagerView` 门禁（与白名单字段设计矛盾，常含内部申请口径） | `src/app/(workspace)/schools/[id]/page.tsx:304-328`、`src/components/school-program-card.tsx:281-286` | 该 section 加 `!marketManagerView` 条件；更彻底：序列化层按角色剥离 program 长文本字段 |
| P2-2 | **网址字段无 scheme 白名单（javascript: 链接注入面）**：院校动态网址（API 写入 + Excel 导入）不校验 scheme，渲染端 `school-update-item.tsx:34` 直接 `<a href={url}>`；对比 `knowledge-fields.tsx:78` 已有 `^https?://` 保护。写入者可来自外部导入内容，点击者可能是低权限角色 | `school-update-item.tsx:34`、`api/schools/[id]/updates/route.ts:53-81`、`school-update-import.ts:76-186` | 入参统一校验 `^https?://`（限长）；渲染端兜底 scheme 白名单，非 http(s) 一律降级纯文本 |
| P2-3 | **修改密码不吊销既有会话**（被盗会话改密后仍有效至过期 12h；CLI reset 会删 sessions，行为不一致） | `src/app/account-actions.ts:27-30` vs `src/lib/user-service.ts:159` | 改密时删除该用户全部 sessions（可保留当前：先删后重建） |
| P2-4 | **审计 changed 字段失真残留**：confidential PATCH 整卡全字段上报（前端每次提交全字段）；`saveProgramFields` 的 changed 恒含 `updatedAt`（新旧 Date 永不相等）；note 保存相同文本也记变更。8141e72d 只修好了 basic 路由 | `program-editor.ts:126-135`、`api/schools/[id]/confidential/route.ts:52-58`、`api/schools/[id]/note/route.ts` | 路由内先 SELECT 旧值做真实 diff；抽公共 `changedFields`；updatedAt 类隐式字段排除 |
| P2-5 | **整页保存无乐观锁**：并发双人编辑时 B 的旧快照静默覆盖 A 的全部保存（无 version/updated_at 校验） | `api/schools/update/route.ts:55-110`、`api/programs/[id]/route.ts:31-72` | 表单携带加载时 updated_at，`WHERE id=? AND updated_at=?` 不符返回冲突；或先读后 diff 只写 changed |
| P2-6 | **归档学校再导入不复活**：`upsertSchool` 按 external_id/name_zh 查找不带 `archived=0`，UPDATE 也不重置 archived → 命中归档行则数据写成功但永远不可见，且 name_zh 唯一约束堵死重建。当前无归档 UI，属潜在（导入路径应防御） | `import-service.ts:337-357`、`createImportPreview` 比对 SQL（:195） | 命中归档行时置 `archived=0` 或报错提示先恢复；preview 比对显式排除归档行 |
| P2-7 | **台账删除不清附件孤儿**：软删记录后附件行与磁盘密文保留且不可访问，反复新增-删除累积孤儿；上传先写文件后插行，DB 失败留孤儿文件 | `api/school-updates/[id]/route.ts:106-112`、`api/school-updates/attachments/route.ts:80-113` | 删除时附件一并置 archived；上传改先插行后写文件、失败 unlink |
| P2-8 | **Dashboard"学校"口径错误**：INNER JOIN programs 计数 → 62，学校列表 88（26 所无项目学校从工作台消失），同一概念两个数字 | `src/lib/queries.ts:39` | 明确语义"含项目的合作院校"改 label，或与列表同口径（LEFT JOIN） |
| P2-9 | **Excel 冲突/空行静默丢弃**：同名学校字段冲突"先到先得"保留首值无告警；空校名行、缺项目类型行静默过滤，preview summary 不计数 | `src/lib/excel-import.ts:204-231, 329-340` | 冲突与跳过行计入 preview summary/entries |
| P2-10 | **启动自动迁移无备份、无 busy_timeout**：迁移前不备份（回滚不还原数据）；并发双实例首启 `BEGIN IMMEDIATE` 会 SQLITE_BUSY；"旧代码迁移列表也含失败迁移"时回滚也无法恢复（唯一双败坏路径） | `src/lib/db/migration.ts:57-81`、`db/index.ts:23-35` | 迁移前当日首次自动备份 data/*.db（复用 scripts/backup.ts）；迁移连接设 busy_timeout；ADD COLUMN 前查 `PRAGMA table_info` |
| P2-11 | **质量门禁缺失**：无 CI；coverage 无 thresholds（vitest.config.ts include 仅 `src/lib`）；最近核心新代码 program-editor.ts **0%**、queries.ts 24.47%；宣称的 75.33% 无自动化保障；dc14c26f 新测试 mock 恒返回 ADMIN，403 权限分支未覆盖 | `vitest.config.ts`、`school-update-import-api.test.ts` | 为 program-editor/saveProgramFields 与新 PATCH 路由补集成测试；加 thresholds 过渡值；如承诺 75% 需 CI 执行 test:coverage |

---

## 3. P3（加固项，按主题分组）

**口令与密钥卫生**
- README.md:94-97 明文记录默认管理员口令（`data/initial-admin.txt` 同存明文）——建议占位符 + 部署校验 admin 是否仍命中文档口令；initial-admin.txt 用后即删/0600。
- 数据库（含 scrypt 哈希、全部业务数据）与 `data/keys/app.key` 同盘明文；密钥无轮换机制。

**认证与限流**
- 登录限流 key=`username\0ip`（login-rate-limit.ts:11-13）：`TRUST_PROXY=true` 时取 x-forwarded-for 首项可被伪造绕过；`false`（默认）时 ip=null → 全局共享 key，攻击者可对已知用户名反复触发 15 分钟锁定（登录 DoS）；限流表在内存，重启清零。
- 用户不存在/被禁用分支不做 scrypt（毫秒级返回）→ 时序枚举（auth/login/route.ts:36）——建议对不存在用户走假 verify。
- `TRUST_PROXY=true` 时 303 跳转应取 x-forwarded-host 并白名单校验（http.ts:5-21）；默认 SAFE_HOST_PATTERN 已防 CRLF/路径注入，风险仅在直连/透传场景。
- 变更型 Route Handler 无显式 Origin 校验，依赖 SameSite=Strict（可接受，属单一纵深防御）；`api/admin/users/route.ts:27-33` 每次 POST 转储全部 headers（含 x-forwarded-*）到 console，建议保留日志但去掉 header 转储。
- sessions 过期行无清理任务。

**依赖与上传**
- xlsx ^0.18.5 存在已知 CVE-2023-30533（原型污染）、CVE-2024-22363（ReDoS），且解析的是用户上传工作簿——建议升级（如 0.19.x 社区分支）或限制触发角色。
- 上传仅校验"声明 MIME ↔ 扩展名一致 + 大小上限"，无 magic-byte 内容嗅探；`MAX_UPLOAD_MB` 未防 0/负。
- 机密预览 JSON 明文落盘（data/imports/*.json，未强制 0600）；preview 文件先落盘后插 import_batches，DB 失败留孤儿文件。

**输入/输出**
- LIKE 搜索不转义 `%`/`_`（queries.ts listSchools:126-131、noted:223-234、customers:571-575）——含 `%` 的输入退化为全表匹配，建议 ESCAPE 或 instr()。
- 客户/审计分页同毫秒无 tie-breaker（queries.ts:670 `updated_at DESC`、:890 `created_at DESC`）——翻页可能重复/遗漏。
- customers/route.ts:101-113 把 SQLite 异常 message 拼进 303 query 展示；多处 API catch 直接回显 `error.message`——可能泄露表名/约束等内部信息。
- 自由文本多数无长度上限；`asNumber` 前缀截取（"12abc"→12）且缺范围校验（qs_ranking 可为负）。
- 安全头（CSP/HSTS/X-Frame-Options）完全未配置。
- 审计失败路径不全：密码修改失败、导入确认失败等无审计；`SCHOOL_UPDATE_ATTACHMENT_DOWNLOADED`/`DOCUMENT_DOWNLOADED` 不在 audit.ts `AUDIT_ACTIONS` 常量，界面文案退化为英文 action。
- needsReview（queries.ts:42-45）与 deadlines（:62-78）统计未排除归档行（当前库无归档行，逻辑应与 listPrograms 对齐）。

**Schema/迁移**
- schema.ts 缺 `schools_external_id_unique`、`programs_external_id_unique` 两个部分唯一索引声明（drizzle 0002 已建）——未来 drizzle-kit diff 可能误删/重建。
- 0003 school_updates 两表 created_at/updated_at 无默认值，而 schema.ts `timestamps` 声明了默认值——当前写入点都显式传值，未来依赖 DB 默认值的 Drizzle insert 会 NOT NULL 失败。
- migration.ts 硬编码 6 个迁移文件 + standalone 需 copy-standalone-assets 拷贝 drizzle，三处人工同步易漏。

**业务边界**
- 学费解析（program-parser.ts:34-58）：非人民币币种文本（"$32000"/美元）被按人民币数值取走与客户 CNY 预算比较；"以万为单位"文本被 <50 过滤判 UNKNOWN（安全方向）；"学期价 + 学年合计"同格文本可能高估年费。建议检测到非 RMB/万 时标 reviewReason 且不写数值字段。
- 导入 confirm 成功后 unlink 预览文件失败会抛错把"已提交"误报为失败（import-service.ts:842-846）——unlink 失败应仅告警。
- 两次并发 confirm 同一批次会完整重放（先读状态未在写锁内复查）——单进程下影响极小。
- school-note-section.tsx:19-20 死代码（savedAt 恒 0、formRef 未被读取）。

**deploy.sh 细节**
- 回滚/发布的 `npm run build` 原地覆盖 `.next`：失败/打断会留半成品 .next，当前进程仍在内存跑旧代码，下次自然重启才暴露——建议构建到临时目录成功后原子替换。
- `as_app_owner` 不传 HOME：runuser 继承 root HOME，git 读 /root/.gitconfig 而非应用用户配置（会走 fail 路径，可检测）。
- APP_DIR 属主为 root 时守卫被绕过（`stat -c %U` 未拒绝 root，注释声称的"避免 root 所有"失效）。
- 发布前无 DB 备份联动（注释称"persistent data is never changed"，但自动迁移会改库结构）。
- `--check` 不验证健康 URL 可达性与迁移可执行性（预检通过 ≠ 发布能成功，如无 NAT hairpin 回环场景）。
- basic PATCH 唯一键冲突等 SQL 错误未捕获 → 返回 500 HTML，前端真实原因被吞（api/schools/[id]/basic/route.ts:84-110）。

---

## 4. 误报排除记录（人工核验后确认不成立）

- **筛查 GPA 跨计分制误判**（初报："客户未填满分制时 5 分制 GPA 3.5 被裸数值比较判为满足 4 分制项目 min 3.0"）——**不成立**。`matcher.ts:565-573`：program.gpaMin/gpaScale 任一缺失 → UNKNOWN；`criteria.gpaScale !== program.gpaScale`（含 null 对值）→ UNKNOWN"计分制不同需人工复核"；仅当两侧 scale 明确且相等才做数值比较。逻辑是安全的，无需修复。

---

## 5. 修复优先级建议（供后续修复任务使用）

1. **第一优先（代码层，可本地测试）**：P1-1 客户域授权（按"全员共享 + 敏感操作按角色收窄 + 属主校验"的产品语义）、P1-2 导入确认越权、P1-3 台账解析加固、P1-4 模板补列、P1-5 保存事务化；P2-1/2-2/2-3/2-4/2-8 等小改动项；配套补测试并跑 lint/typecheck/test。
2. **第二优先（发布流程，留待生产发布前单独演练）**：P1-6/P1-7 deploy.sh 加固（/api/health 版本校验、HUP/状态文件续滚）、自动迁移备份与 busy_timeout、发布前 DB 备份联动。
3. **持续**：CI + coverage 阈值（P2-11）；P3 中口令卫生、限流、xlsx 升级、安全头等按上线节奏消化。

---

## 6. 修复状态（2026-09-03 更新）

用户确认范围 = 代码层全部 P1/P2 + 发布流程（不含 CI 与 P3），均已实施并通过验证（25 个测试文件 166 用例通过、`tsc --noEmit` 通过、eslint 0 error）。

### 已修复

| 条目 | 改动 |
|---|---|
| P1-1 客户域授权 | permissions 新增 `CUSTOMER_CASE_ROLES = [ADMIN/ADVISOR/DATA_MANAGER]` + `canHandleCustomerCases`；6 个客户/申请/推荐 server actions 与 documents 上传/下载 API 由 requireUser 改为该角色集（视图仍全员共享）；customers/[id]、applications/[id] 页对非案件角色隐藏归档/跟进/上传/下载/改派/状态表单 |
| P1-2 导入确认越权 | confirm 路由校验 `imported_by === 本人 或 ADMIN`（403）；预览 JSON 落盘 chmod 0600（Windows 忽略） |
| P1-3 台账导入 | 表头按名校验（缺列报「请下载最新模板」，旧 15 列格式被拒）；按表头名映射列；字符串日期解析（YYYY-MM-DD/斜杠/点 + 可选时分秒）；整批 BEGIN IMMEDIATE 事务，出错整体回滚并带行号；测试 fixture 同步更新并新增拒绝旧表头/文本日期用例 |
| P1-4 模板补列 | templates/maintenance 的 HEADERS 追加「合作收费」（非机密角色经 CONFIDENTIAL_TEMPLATE_HEADERS 自动过滤）；核对结论：scripts/export-template.ts 是按项目导出的维护文件（无学校机密列通道），无需加列，未改动 |
| P1-5 保存事务化 | program-editor.saveProgramFields 改同步 sqlite 单事务（update programs + 先删后插 majors + audit），支持 `inTransaction` 供整页保存复用；api/schools/update 整页保存（学校行 + N 项目 + 审计）包单事务，任一步失败整体回滚 |
| P1-6 deploy.sh 误报成功 | 新增 `/api/health`（返回进程 startedAt）；deploy.sh 重启前记录 `RESTART_EPOCH_MS`，健康检查改为轮询 /api/health 直到 `startedAt >= 重启时刻`；旧代码无该端点（404/405）时回退登录页检查（回滚兼容） |
| P1-7 deploy.sh SIGHUP | traps 增加 HUP（与 TERM 同处理器，断连也走 EXIT 回滚） |
| P2-1 市场经理泄露 | page.tsx 对 marketManagerView 删除 knowledge 的「申请要求及材料」键（含 rawJson 覆盖）；school-program-card 该段落加 `!marketManagerView` 门禁 |
| P2-2 URL scheme | utils 新增 `safeHttpUrl`；动态 POST/台账 PATCH 的网址字段非法 scheme 返回 400；台账导入非法 scheme 置 null；school-update-item 渲染层非 http(s) 降级纯文本 |
| P2-3 改密会话 | 改密后删除该用户除当前会话外的全部 sessions |
| P2-4 审计失真 | confidential PATCH 先读旧值做真实 diff（无变化跳过写/审计）；note 仅内容变化才写审计；program-editor 与整页保存的 changed 跳过 updatedAt 等隐式字段、只跟踪表单可编辑字段 |
| P2-6 归档复活 | upsertSchool 两处 UPDATE 统一 `archived = 0`，归档学校再导入即复活 |
| P2-7 附件孤儿 | 台账 DELETE 时把该记录附件行一并 archived=1 |
| P2-8 dashboard 口径 | 学校计数改为 `COUNT(*) FROM schools WHERE archived=0`，与列表页 88 同口径 |
| P2-9 Excel 静默丢行 | mergeSchoolRows 统计同名冲突行与空校名行；parseProgramWorkbook 统计缺关键信息被丢弃的程序行；preview summary 新增 fileConflicts/fileSkipped，import-panel 条件展示 |
| P2-10 迁移安全 | migration 连接设 busy_timeout=5000；有待执行迁移时先 `wal_checkpoint(FULL)` + `VACUUM INTO` 备份到 backups/migration-<ts>/（失败仅告警；重复文件自动加序号） |
| 发布前 DB 备份 | deploy.sh 在重启前执行 `npm run backup`（失败仅告警，进程内迁移备份兜底） |

### 遗留（未在本次范围/需另行决策）

- **P2-5 乐观锁**（整页并发双人编辑互相覆盖）——需冲突 UX 设计，未做。
- **P2-11 CI + coverage 阈值**（属「持续」批次，未做）。
- **P3 全部加固项**（口令卫生、限流 XFF、xlsx 升级、安全头等，见第 3 节清单）。
- screening 页「保存推荐」仅做了服务端角色门禁，未加 UI 隐藏（市场经理提交会被拒绝）。
- deploy.sh 改动无法在本机执行验证（无服务器访问），代码层面修复；上线发布前应在宝塔终端先跑 `--check` 并人工演练一次发布/回滚。
- export-template.ts 经核对为「按项目导出的维护模板」，与学校级机密列（合作收费）通道无关，未加列。

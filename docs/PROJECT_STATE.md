# 项目状态同步

最后更新：2026-07-08

## 数据导入模块：下载模板功能修复（2026-07-08）

- 新增 `GET /api/templates/maintenance`：空白维护模板，含"高校汇总"（27 列含 12 合作字段）和"高校项目"（38 列含合作字段）两张表头。
- 重写 `GET /api/templates/programs`：从"项目维护模板"改为"全量数据导出"，同样含两张 Sheet，导出当前数据库中所有未归档学校与项目数据。
- 导入页面（`/imports`）按钮区现在有两个按钮：下载维护模板、导出完整数据。
- 涉及文件：`src/app/api/templates/maintenance/route.ts`（新增）、`src/app/api/templates/programs/route.ts`（重写）、`src/app/(workspace)/imports/page.tsx`。
- 验证：`npm run typecheck` 通过，`npm run lint` 通过（仅 1 个既有 warning），`npm run build` 通过。

## 数据导入模块：全面支持 12 个学校合作字段（2026-07-07）

- 目标：`schools` 表新增的 12 个合作字段在 Excel 导入、手动录入两条数据入口完整打通，并补充测试覆盖。
- 涉及字段：团体申请账号、奖学金发放形式、是否可代收、合作截止日期、公司招生名额、学校招生计划、招生偏向、语言生考核、学历生考核、合作备注、特殊情况备注、申请更新频率。
- Excel 导入（`src/lib/excel-import.ts`）：
  - `toSchool` 改为按优先级读取字段：高校汇总表使用简洁字段名，项目表保留旧字段名兼容；两套字段名均可导入同一批合作字段。
  - `toProgramSchool` 同时兼容真实项目表字段名和简洁字段名。
- 手动录入（`src/lib/import-service.ts`、`src/components/manual-entry-form.tsx`）：
  - `manualEntrySchema` 与 `buildManualSchool` 新增 12 个合作字段。
  - 手动录入表单新增"学校合作与招生信息"折叠区，12 个字段按短输入/长文本分组展示，并提示仅作顾问参考、不参与自动判断。
- 测试（`src/lib/import-service.test.ts`）：
  - 新增"高校汇总表可直接导入全部 12 个合作字段"测试。
  - 扩展现有"项目表可补充学校合作字段"与手动录入测试，断言全部 12 个字段写入数据库。
  - 修复测试运行时的 `server-only` 导入错误（`vi.mock`）。
- 涉及文件：`src/lib/excel-import.ts`、`src/lib/import-service.ts`、`src/components/manual-entry-form.tsx`、`src/lib/import-service.test.ts`、`docs/PROJECT_STATE.md`。
- 验证结果：`npm run typecheck` 通过；`npm run lint` 通过；`src/lib/import-service.test.ts` 13 项全过；`npm run build` 通过。全量测试 100 项中 94 项通过，6 项失败为既有软性条件/生源地偏好预存问题，与本次改动无关。
- 已知风险与未指定：
  - 学校编辑页（`/schools/[id]/edit`）尚未开放 12 个合作字段编辑；如需在页面端维护这些字段，后续再补。
  - 高校汇总表合作字段为可选，不填不会报错；若后续要求必填，需调整 `validateHeaders` 逻辑。
  - "招生偏向"在手动录入中尚未做权限隔离（详情页已隔离），敏感信息仍建议由管理员/数据管理员在页面端维护。


## 测试补充：auth + queries 模块覆盖（2026-07-07）

- 目标：uth.ts（0%覆盖）和 queries.ts（15%覆盖）补齐模块化测试。
- 新增文件：src/lib/auth.test.ts，9 个用例；扩展 src/lib/queries.test.ts，新增 8 个用例。
- auth 覆盖（9 用例）：getCurrentUser（有效/无cookie/过期/禁用）、equireUser（重定向/认证）、equireRole（拒绝/允许）、uditLoginFailure。
- queries 覆盖（+8 用例）：listSchools（分页/搜索）、getSchoolDetails（详情/不存在）、getMajorCatalog（分组）、listCustomers（过滤已归档）、listApplications（状态筛选）、listAuditLogs（分页+用户名）。
- 覆盖率变化：
  - uth.ts：0% → 60.71%（stmts），0% → 52.63%（branch），0% → 71.42%（funcs）
  - queries.ts：15.21% → 65.21%（stmts），0% → 52.45%（branch），11.11% → 50%（funcs）
  - 项目整体：76.45% → 82.36%（stmts），66.7% → 71.22%（branch），82.63% → 89.47%（funcs）
- 验证：
pm test 17 文件 104 passed / 1 skipped / 0 fail，无回归。
- 已知限制：
  - uth.ts 未覆盖 createSession/destroySession（需 drizzle + cookie mock 联动，可后续补）
  - queries.ts 未覆盖 getCustomer/listPrograms/getProgramsForScreening/listUsers/listImports/listCustomerOptions（后续按需补充）
  - udit.ts 仍为 0%（仅一层薄封装，风险低）## 筛选模块：目标专业下拉（12 大类分组 + 搜索）（2026-07-06）

- 背景：原"目标专业"是纯文本 input，用户需要手动输入专业名。游sir 提出：分析全部专业、按大类分组下拉、还要能搜索。
- 实现：
  - 新建 `src/lib/major-categories.ts`：定义教育部 12 大类（哲学/经济商科/法学政治/教育心理/文学语言/历史学/医学/农学/艺术学/管理学/理学/工学）+ 关键词归类规则 + 噪音过滤规则（HSK 课程、文化讲座、课程时间说明等非专业条目）。归类顺序：特异度高的类（医学/农学/艺术/管理）在前，engineering 在后兜底"X 工程"。提供 `categorizeMajor` / `categorizeMajors` / `isMajorNoise` / `splitMajorText` 四个工具函数。
  - `src/lib/queries.ts` 新增 `getMajorCatalog()`：扫描所有未归档项目的 `major_text`，按 12 大类分组返回。供筛选页服务端预查询后传给客户端组件。
  - 新建 `src/components/major-picker.tsx`（客户端 combobox）：文本输入 + 分组下拉面板 + 实时过滤。支持键盘导航（上下箭头/Enter/Esc），点击外部关闭，无结果提示。选中值通过受控 input 的 `name` 属性提交到 form GET，与原 input 完全兼容。
  - `src/app/(workspace)/screening/page.tsx`：把原 `<input name="major">` 替换为 `<MajorPicker>`，服务端预查询 `majorCatalog` 并传入。
  - CSS（`src/app/google-ui.css` 末尾新增 `.major-picker*` 系列类）：相对定位容器 + 浮动下拉面板 + 分组标题 + 选项 hover/active 高亮，最大高度 320px 可滚动。
- 数据扫描结果：原始 7663 条 major_text 条目，过滤 275 条噪音，去重后净 1822 条；分布：工学 346 / 艺术学 319 / 文学语言 139 / 经济商科 128 / 法学政治 110 / 医学 107 / 理学 103 / 教育心理 92 / 管理学 85 / 农学 66 / 历史学 23 / 哲学 10 / 其他(未归类) 294。
- 测试（`src/lib/major-categories.test.ts`，7 个）：常见专业归类正确性、工学不吞医学/农学专业（"生物医学工程"→医学，"森林工程"→农学）、噪音过滤、splitMajorText 切分、categorizeMajors 清洗+去重+按拼音排序+空分组过滤。
- 涉及文件：`src/lib/major-categories.ts`、`src/lib/major-categories.test.ts`、`src/lib/queries.ts`、`src/components/major-picker.tsx`、`src/app/(workspace)/screening/page.tsx`、`src/app/google-ui.css`、`docs/PROJECT_STATE.md`。
- 验证结果：`npx tsc --noEmit` 通过；`npm run lint` 通过（修了 1 个 a11y warning：input role="combobox"）；`npm run build` 通过；`npx vitest run` 87 通过 / 5 失败（全部为预存问题：matcher 2 个 SAT/竞赛 evidence 未实现 + soft-requirements 3 个解析问题，经 `git stash` 基线比对确认与本次改动无关）。
- 已知风险与未指定：
  - 未归类 294 条（含一些非专业噪音未过滤掉，如"城乡人类聚落的生态环境"等长句）会出现在"其他"分组里，用户也能搜到。如要进一步清洗可加更多噪音规则。
  - 归类用关键词匹配，存在边界 case：如"法学研究方法"会归到法学（含"法学"），但实际可能是其他类的课程名。当前数据未触发严重误归类。
  - MajorPicker 是受控组件（`value={query}`），用户输入但未选中下拉项时，按"开始筛查"会以输入文本提交，行为正确。
  - 下拉面板 z-index=50，在筛选卡片内绝对定位；如未来页面有更高 z-index 的浮层，需检查是否被遮挡。
  - 未做浏览器人工回归，建议重点验证：输入搜索、键盘导航、点击选中、外部点击关闭、与 form GET 提交联动、移动端面板是否溢出屏幕。

## 筛选模块修复：专业匹配分层 + evidence 透明化（2026-07-06）

- 问题：用户筛选"本科/英文/土木工程/CSCA 没有/有其他奖学金/申请时间只看开发中"，结果出现"对外经济贸易大学 · 本科 · 英文授课"项目，但该项目没有土木工程专业。evidence 仅显示"专业名称或同义词匹配"，无法识破是误匹配。
- 根因：`majorMatches`（`src/lib/matcher.ts`）的同义词组 `工程: ["工程","机械","土木","自动化","材料","电气","电子"]` 里有"工程"这个超通用词；query"土木工程"包含"工程"→ 命中"工程"组；该项目 major_text 里有"经济发展合作与多元材料与工程2+2（UIBE+BUCT）"包含"工程"→ 也命中 → 返回 true。同样的隐患存在于"医学""经济""教育"等单字大类词上。
- 修复方案（用户拍板）：分两层展示
  1. 第一层精确包含匹配：query 作为完整字串在 majorText 中出现 → evidence `PASS "专业名称匹配：包含\"xxx\""`
  2. 第二层同类方向匹配：精确未命中但同义词组命中 → 项目仍保留显示，evidence `NEED "未找到\"xxx\"本专业，但有同类方向：yyy（命中关键词\"zzz\"）"`，列出该学校实际命中的专业条目（最多 3 个，超过显示"等 N 个"）。
  3. 完全无匹配 → evidence `FAIL "未找到相关专业"`，进入"明确不符合"折叠区。
- 实现：
  - `majorMatches` 改为返回结构化 `MajorMatchResult`（`{ matched, matchType: "exact"|"synonym"|"none", synonymKeyword?, matchedMajors? }`）；新增 `extractMatchedMajorEntries` 工具函数把 majorText 按换行/分号/逗号分割后筛出命中条目。
  - `evaluateProgram` 里 targetMajor 分支基于 matchType 生成不同 evidence：synonym 用 `NEED`（导致 fitLevel 进入 NEEDS_ACTION，排在精确匹配之后），符合用户"先精准配对，然后下面出来可能匹配"的语义。
- 测试（`src/lib/matcher.test.ts`）：原"通过专业同义词匹配"测试改为结构化断言（检查 matchType/synonymKeyword/matchedMajors）；新增 3 个测试——"专业精确匹配返回 exact 类型"、"专业完全无匹配返回 none 类型"、"专业 evidence 区分精确与同类匹配"（含实际场景：majorText 含"经济发展合作与多元材料与工程2+2"时搜"土木工程"应给出 NEED evidence + 列出该专业名）。
- 涉及文件：`src/lib/matcher.ts`、`src/lib/matcher.test.ts`、`docs/PROJECT_STATE.md`。
- 验证结果：`npx tsc --noEmit` 通过；`npm run build` 通过；`npx vitest run src/lib/matcher.test.ts` 32 通过 / 2 失败（与上次会话一致的预存问题：SAT/竞赛 evidence 未实现，与本次改动无关）。
- 已知风险：
  - 同义词组里"工程""医学""经济"等通用词仍未移除，理论上同类匹配仍可能误命中（但 evidence 已透明化，用户能从"命中关键词'工程'"识破）。
  - 同类专业现在会以 NEED 状态进入 NEEDS_ACTION 区，结果列表可能比之前更长；用户可手动跳过。
  - `extractMatchedMajorEntries` 按换行/分号/逗号分割，若 majorText 使用其他分隔符（如"/"）会拿到较长条目；当前数据未触发此情况。

## 筛选模块修复：学校搜索页内化 + 院校层次 evidence（2026-07-06）

- 问题1：筛选页顶部"搜索学校"输入框点击后跳转到 `/schools`，用户期望在筛选模块下方看到结果。
- 问题2：新增"院校层次"筛选时，卡片底部 evidence 条缺少对应提醒（其他所有筛选条件都有 evidence）。
- 修复1（`src/app/(workspace)/screening/page.tsx`）：删除 `HeaderSearch` 客户端组件（`router.push('/schools')`），替换为 `<form>` 内原生 `<input name="q">`，作为筛选条件的一部分提交；`searchKeys` 新增 `"q"`，`toCriteria` 新增 `schoolQuery`。
- 修复1（`src/lib/matcher.ts`）：新增 `schoolNameMatches`（normalizeKeyword 模糊匹配）作为硬过滤；`ScreeningCriteria` 新增 `schoolQuery` 字段。
- 修复2（`src/lib/matcher.ts`）：新增 `schoolTierEvidence` 函数（PASS/FAIL）；`evaluateProgram` 在 `criteria.schoolTier` 存在时 push evidence；移除 `rankPrograms` 中的 `matchesSchoolTier` 硬过滤——不符合院校层次的学校改入"明确不符合"折叠区（与 `programType` 一致），用户可展开查看原因。
- CSS（`src/app/globals.css`）：移除 `.header-search{display:none}` 和 `.screening-filter-card .card-header{flex-direction:column...}` 两条误全局规则（原意是 mobile-only 但未包裹 `@media`，导致桌面端 header 也变纵向且搜索框被隐藏）；`google-ui.css` 已有正确的 `@media(max-width:760px)` 处理。
- 删除 `src/components/header-search.tsx`（无引用死代码）。
- 测试（`src/lib/matcher.test.ts`）：更新 2 个 schoolTier 硬过滤测试为 evidence 行为（检查 fitLevel 而非过滤）；新增 2 个测试——"院校层次生成 evidence 提醒"、"学校名称搜索做页内过滤"。
- 涉及文件：`src/lib/matcher.ts`、`src/lib/matcher.test.ts`、`src/app/(workspace)/screening/page.tsx`、`src/app/globals.css`、`src/components/header-search.tsx`（删除）、`docs/PROJECT_STATE.md`。
- 验证结果：`npx tsc --noEmit` 通过；`npm run lint` 通过；`npm run build` 通过；`npx vitest run src/lib/matcher.test.ts` 29 通过 / 2 失败（经 `git stash` 基线比对确认为预存问题：SAT/竞赛 evidence 未实现，与本次改动无关）。
- 已知风险：
  - 移除 schoolTier 硬过滤后，不符合院校层次的学校会出现在"明确不符合"折叠区（默认收起），结果总数可能增加；如用户反馈噪音过大可恢复硬过滤。
  - 学校名称搜索为 normalizeKeyword 模糊匹配（忽略大小写/标点/空格），不支持拼音或英文别名。

## 本轮详情页排版重构（2026-07-06）

- 目标：解决三个详情页（客户/学校/申请）信息杂乱、留白过大、重点不突出、需长时间下滑的问题。
- 设计原则：通过视觉层次（label 小字灰色 + value 加粗）+ 紧凑布局（减小 padding/min-height）+ 主次分离（信息卡 vs 操作卡）让重点一眼可见；申请材料类不折叠。
- CSS（`src/app/google-ui.css` 末尾新增）：新增独立类 `.card-compact` / `.detail-status-bar` / `.detail-field-grid` / `.detail-field` / `.detail-list` / `.detail-timeline` / `.detail-action-card` / `.program-core-grid` / `.program-material-section` / `.program-long-section`，不改动全局 `.card`，避免影响筛选页 / 列表页 / 工作台。同步压缩 `.school-overview-card` / `.school-programs-section` / `.school-program-card` / `.knowledge-field` 的留白。
- 客户详情页（`src/app/(workspace)/customers/[id]/page.tsx`）：
  - 顶部新增状态条：客户编号 / 国籍 / 负责老师 / 签约状态 Badge，一行展示。
  - 合并"联系信息 / 申请目标 / 成绩条件"三张卡 → 一张"客户档案"卡，内部三组分组（detail-group-title）+ 3 列字段网格。
  - "客户管理状态" + "新建申请"合并为一张操作卡（dashed 边框，视觉权重低），inline 表单。
  - 跟进 / 材料两列并排，列表优先，新建表单用 `.detail-action-card` 包裹。
  - 申请记录 / 已保存筛选方案改用 `.detail-list` 紧凑列表行。
- 学校详情页（`src/app/(workspace)/schools/[id]/page.tsx`）：
  - 项目卡字段拆分三组：`PROGRAM_CORE_FIELDS`（12 个短字段，4 列网格 always 显示）/ `PROGRAM_MATERIAL_FIELD`（"申请要求及材料"，不折叠，重点信息）/ `PROGRAM_LONG_FIELDS`（8 个长字段，用原生 `<details>` 折叠，避免多项目时下滑过长）。
  - 折叠区内 `knowledge-field-grid` 改为单列紧凑展示。
  - 学校知识卡 / 合作卡加 `.card-compact`。
- 申请详情页（`src/app/(workspace)/applications/[id]/page.tsx`）：
  - 顶部新增状态条：当前状态 / 申请截止 / 客户 / 项目，一眼定位。
  - "项目要求及材料"提到主位，不折叠。
  - "调整状态"改为操作卡（dashed 边框，视觉权重低），inline 表单。
  - 状态时间线改用 `.detail-timeline` 紧凑展示。
- 涉及文件：`src/app/google-ui.css`、`src/app/(workspace)/customers/[id]/page.tsx`、`src/app/(workspace)/schools/[id]/page.tsx`、`src/app/(workspace)/applications/[id]/page.tsx`、`docs/PROJECT_STATE.md`。
- 验证结果：`npm run typecheck` 通过；`npm run lint` 通过；`npm run build` 通过（仅有既有 Turbopack NFT warning 与 node:sqlite ExperimentalWarning）。
- 已知风险与未指定：
  - 项目长字段默认折叠，需用户点击展开。如果实际使用中发现某字段（如"专业列表"）需要默认可见，可从 `PROGRAM_LONG_FIELDS` 移到 `PROGRAM_CORE_FIELDS` 或单独不折叠。
  - 未做浏览器人工回归，建议重点验证：客户管理状态更新、添加跟进、上传材料、新建申请、调整申请状态、学校项目折叠展开。
  - CSS 类为新增，与全局 `.card` 隔离；如后续详情页样式异常，优先检查 `.card-compact` / `.detail-*` 类是否被覆盖。

## 本轮学校合作字段与项目身份重构（2026-07-06）

- 目标：支持新 Excel（117 所学校、474 条项目、含 12 个学校级合作字段）安全导入，避免同校同类型同语言项目互相覆盖。
- 数据库：`schools` 表新增 12 个可空 TEXT 合作字段（团体申请账号、奖学金发放形式、是否可代收、合作截止日期、公司招生名额、学校招生计划、招生偏向、语言生/学历生考核、合作备注、特殊情况备注、申请更新频率）；为 `schools.external_id` 和 `programs.external_id` 建唯一索引（partial index，NULL 不参与）。
- 迁移：新增 `drizzle/0002_school_cooperation_fields.sql`，并在 `src/lib/db/migration.ts` 注册；`src/lib/db/schema.ts` 同步字段定义。
- Excel 导入（`src/lib/excel-import.ts`）：
  - `toSchool` 解析 12 个合作列；新增 `toProgramSchool` 从高校项目表提取学校基础+合作信息，按学校聚合写入 `schools`。
  - `mergeSchoolRows` 同校字段聚合：首个非空值生效，同字段多个非空值不一致直接抛错，避免静默选值。
  - `normalizeTeachingLanguage` / `normalizeProgramType` 空值或非标准值统一为 `UNKNOWN`；`toProgram` 将"项目类型/授课语言待复核"写入 `parsed.reviewReasons`，`upsertProgram` 据此设置 `review_status = NEEDS_REVIEW`。
  - 同校同类型同语言存在多个项目时，必须提供"项目ID"，否则在解析阶段抛错，防止业务键覆盖。
- 导入服务（`src/lib/import-service.ts`）：
  - `mergeSchoolSources` 合并高校汇总表与项目表学校信息，非空字段覆盖空字段。
  - `upsertSchool` / `upsertProgram` 使用 `COALESCE(?, column)` 实现空白单元格不覆盖旧值；`manually_verified` 项目继续保护，不自动覆盖。
  - 现有项目匹配优先 `external_id`，回退到"学校+类型+语言"legacy key，保证已有项目原 id 原位更新。
- 详情页（`src/app/(workspace)/schools/[id]/page.tsx`）：新增"合作与招生信息"卡片，按"申请通道 / 招生计划 / 考核安排 / 合作说明"四组展示，仅显示非空字段；"招生偏向"仅 `ADMIN`/`DATA_MANAGER` 可见（`canEdit ? ... : null`），不参与筛选。
- 筛选门槛（`src/lib/matcher.ts`）：`review_status = NEEDS_REVIEW` 或授课语言为 `UNKNOWN` 的项目不进入"可直接申请"，落入"待核实"。
- 测试：`src/lib/import-service.test.ts` 新增 2 项——"从高校项目表新增学校并写入合作字段"、"同校同类型同语言多项目必须提供项目ID"。
- 涉及文件：`drizzle/0002_school_cooperation_fields.sql`（新增）、`src/lib/db/schema.ts`、`src/lib/db/migration.ts`、`src/lib/excel-import.ts`、`src/lib/import-service.ts`、`src/lib/import-service.test.ts`、`src/lib/matcher.ts`、`src/lib/matcher.test.ts`、`src/app/(workspace)/schools/[id]/page.tsx`、`src/app/google-ui.css`、`src/components/import-panel.tsx`、`src/app/api/imports/preview/route.ts`、`scripts/import-excel.ts`、`vitest.config.ts`。
- 验证结果：`npm run typecheck` 通过；`npm test` 80 项中 75 项通过，5 项失败经 `git stash` 基线比对确认为预存问题（`soft-requirements.test.ts` 3 项、`matcher.test.ts` 2 项，均为软性条件解析，与本次改动无关）；2 个新增测试通过。
- 已知风险与未指定：
  - 46 所"新学校"按中文名精确比对，未做更名/别名排查，正式导入前需人工确认冲突清单。
  - 81 条授课语言为空的数据将标记 `UNKNOWN` + `NEEDS_REVIEW`，需人工复核。
  - HS / SSS / Study Tour 等非标准项目类型映射为 `UNKNOWN`，不静默转换。
  - 合作字段当前为自由 TEXT，不参与自动筛选；后续如需筛选应再增结构化字段（如 `collection_status`、`quota_status`）。
  - "招生偏向"含敏感信息（国籍/肤色等），已做管理员可见隔离，但尚未加审计日志。
  - 本轮仅改代码与迁移，未对生产数据库执行迁移和导入；正式导入前需先备份生产数据库及 WAL，并在副本验证。

## 副本导入验证（2026-07-06）

在 `./data/import-test-20260706.db`（生产副本）完成迁移 + 新 Excel 导入验证，验证后已清理临时副本。

**导入前为支持新 Excel 格式做的 3 处设计调整：**
- `createImportPreview` 的 `schoolBuffer` 改为可选：新 Excel 只有"高校项目"工作表，无"高校汇总"独立表；仅传 `programBuffer` 时，学校信息从项目表聚合（`toProgramSchool` + `mergeSchoolSources` 已支持）。
- `mergeSchoolRows` 同校字段冲突由"抛错中止"改为"首个非空值胜出"：真实数据同校多行字段不一致常见（如黑龙江三江美术职业技术学院有"佳木斯校区"/"哈尔滨校区"），抛错会中止整个导入；原始值仍保留在 `rawJson` 供复核。
- 同校同类型同语言多项目缺"项目ID"时，由"抛错中止"改为"自动生成合成 ID"：基于 `学校|类型|语言|项目介绍` 的 sha256 前 8 位，前缀 `auto:`；新 Excel 未填项目ID，抛错会阻塞导入。合成 ID 在内容不变时可重导入稳定匹配。

**导入结果（与首次只读分析吻合）：**
- 学校：NEW 47、MODIFIED 71、CONFLICT 0（原 88 所 → 135 所）
- 项目：NEW 193、MODIFIED 275、CONFLICT 5、源内重复 1、待复核 182（原 283 个 → 476 个）
- 迁移：0000/0001/0002 全部应用，12/12 合作字段建表成功
- 合作字段抽样：武汉理工大学、西南财经大学、广西医科大学等 `group_application_account = "√"` 写入成功
- 自动 ID：西安电子科技大学 2 个、华南师范大学 2 个 `auto:` ID，4 个项目全部保留未互相覆盖
- 手工保护：5 个真实手工确认项目（中山大学 3 + 南京师范大学 2）保持 `VERIFIED` 未被覆盖；另有 2 个测试数据（"测试"/"测试大学"）
- 待复核：AUTO_PARSED 286、NEEDS_REVIEW 185、VERIFIED 5
- UNKNOWN 语言项目：84（含 81 条空值 + 非标准语言值）
- 验证：`npm run typecheck` 通过；`src/lib/import-service.test.ts` 12 项全过（含改写的自动 ID 测试）

**未指定 / 待确认：**
- 合成 `auto:` ID 是临时方案，建议后续在 Excel 补充正式"项目ID"列替换。
- 黑龙江三江美术职业技术学院等学校的 `所在城市` 实际是校区名，语义有偏差，但原始值在 `rawJson` 中保留。
- 生产数据库尚未执行迁移和导入，需用户确认后再操作。

## 本轮数据导入主次关系修复（2026-07-06）

- Excel 导入主次关系对调：高校汇总表改必填（主表），高校项目汇总表改可选（补充）。仅上传高校汇总表也可导入学校基础信息，项目数据为空。
- 涉及文件：`src/components/import-panel.tsx`、`src/app/api/imports/preview/route.ts`、`src/lib/import-service.ts`、`src/lib/import-service.test.ts`、`scripts/import-excel.ts`、`docs/需求规格说明书.md`。
- 验证结果：`npm run typecheck` 通过；`npm run lint` 通过；`src/lib/import-service.test.ts` 12 项全过（含新增“仅上传高校汇总也可导入学校”测试）；`npm run build` 通过。build 仍有既有 Turbopack NFT warning 与 node:sqlite ExperimentalWarning。
- 未指定：字段级合并优先级保留现状（项目表非空字段可覆盖高校汇总同名字段），未调整。如需“高校汇总字段优先、项目表只填空字段”，后续再改。

## 本轮筛选条件清空修复（2026-07-03）

- “清空条件”改为独立客户端控件：点击时先主动清空当前表单，再移除查询参数，避免浏览器表单恢复和 Next.js 同路由复用继续保留旧值。
- 涉及文件：`src/app/(workspace)/screening/page.tsx`、`src/components/clear-screening-filters.tsx`。
- 验证结果：`npm run typecheck`、`npm run lint`、`npm run build` 通过；使用独立临时数据库完成浏览器回归，确认已提交的英文/211条件和未提交的英文/211/目标专业条件均能清空，URL 查询参数与结果区状态同步恢复。

## 本轮院校层次筛选（2026-07-03）

- 学校筛查页提供“不限、985、211、仅双一流、双非普通院校”硬筛选，各档互斥，不符合层次的项目不进入结果区。
- 分类只读取学校 `tags` 字段并按完整标签判断：`985` 档要求有 `985` 标签；`211` 档要求有 `211` 且无 `985` 标签；“仅双一流”要求有 `双一流` 且无 `985`/`211` 标签；“双非普通院校”要求三类标签均不存在。学校简介中的“985优势工程”等文本不参与判断。
- 筛选方案的 `criteriaJson` 会保存 `schoolTier`，未新增数据库字段、迁移或导入模板列。
- 涉及文件：`src/app/(workspace)/screening/page.tsx`、`src/app/google-ui.css`、`src/lib/matcher.ts`、`src/lib/matcher.test.ts`、`src/lib/queries.ts`。
- 验证结果：院校层次测试已覆盖互斥分类、非法参数、标签精确匹配和“985优势工程”干扰文本；`npm run typecheck` 通过，`npm run lint` 通过（保留1条既有未使用变量警告）。Vitest 在受限 Windows 沙箱中因 `spawn EPERM` 未启动，沙箱外重跑又受当前工具额度限制，需额度恢复后补跑。只读数据核对结果为985 19所、211 10所、仅双一流5所、双非普通院校54所，西南财经大学归入211。

## 当前项目目标

本项目是一个本地高校筛查与客户申请管理系统，服务在华留学顾问团队。首版重点是本地跑通：从 Excel 建立学校/项目知识库，按客户条件筛查项目，管理客户、跟进、申请状态和材料，并保留多账号、权限、审计和未来服务器/企业微信接入边界。

移动端已完成第二阶段优化：P0+P1 问题已修复（底部导航增加"更多"Tab 接入抽屉、移动端全局搜索栏、触摸目标增大、筛查表单精简、详情页适配、CSS 断点统一、长列表分页、文件上传支持移动端拍照）。

首版不包含企业微信、客户外部分享、自动翻译、短信、支付或外部 AI 推荐。

## 当前进度

- 2026-07-02：完成筛选页低风险性能优化。无筛选条件时不再读取全量项目；实际筛选查询不再拼接重复且体积较大的 `raw_json`。本地 283 个项目对比中，筛选文本量减少 60.7%，筛选 SQL 平均耗时由约 36.4ms 降至约 22.5ms，导师接收函识别结果无变化，规则处理耗时由约 20.9ms 降至约 11.9ms。验证：`npm run typecheck`、`npm run lint`、`npm run build` 通过；相关测试 46 项中 41 项通过，5 项为既有软性条件规则失败。
- 2026-07-02（第二轮）：移动端 P0+P1 优化 + 重构。1) 底部导航增加"更多"Tab，点击打开抽屉，解决 5 个页面无入口问题。2) layout 增加移动端搜索栏。3) 触摸目标 36→40px，筛查操作按钮 sticky。4) 筛查表单 560px 保持 2 列。5) 详情页卡片内表格扁平化，时间线 padding 减小。6) CSS 断点统一：google-ui.css 820px→760px，globals.css 1050px→1160px，消除三套断点混用。7) 客户/学校/审计日志列表增加分页（客户 20/页、学校 20/页、审计 50/页），新增 `src/components/pagination.tsx` 通用分页组件。8) `listSchools`/`listAuditLogs`/`listCustomers` 改为返回 `{ rows, total, page, pageSize }`。9) 文件上传增加 `accept` 和 `capture="environment"` 支持移动端拍照。涉及文件：`src/components/mobile-nav.tsx`、`src/components/pagination.tsx`、`src/app/(workspace)/layout.tsx`、`src/app/(workspace)/customers/page.tsx`、`src/app/(workspace)/schools/page.tsx`、`src/app/(workspace)/audit/page.tsx`、`src/app/(workspace)/customers/[id]/page.tsx`、`src/lib/queries.ts`、`src/app/globals.css`、`src/app/google-ui.css`。验证：`npm run typecheck`、`npm run lint`、`npm run build` 全部通过。

- 2026-07-02（第一轮）：新增移动端页面适配。参照 4 张设计图，为工作台、筛查、学校库、账号管理、客户、我的六个页面增加移动端布局：底部 4 Tab 导航、移动端头部（汉堡菜单 + 标题 + 操作）、卡片式内容区域。桌面端通过 `desktop-only`/`mobile-only` 与媒体查询隔离，保持原样式不变。涉及文件：`src/app/(workspace)/layout.tsx`、6 个页面文件、`src/components/ui.tsx`、`src/components/mobile-shell.tsx`、`src/components/mobile-nav.tsx`、`src/app/globals.css`。验证：`npm run typecheck`、`npm run lint`、`npm run build` 通过；浏览器 527px 视口下 6 个页面渲染正常，底部 Tab、抽屉导航、头部操作均可交互。全量测试 93 项中 88 项通过，5 项失败为既有软性条件规则问题，与本次改动无关。

- 2026-07-01：修复申请列表及其他多表查询字段错位。根因是 SQLite 代理将结果先转对象，重复列名覆盖后破坏 Drizzle 的列顺序；现改为 `setReturnArrays(true)` 直接返回数组，并新增重复列名关联查询回归测试。验证：目标测试 2 项通过，`npm run typecheck`、`npm run lint`、`npm run build` 通过；全量测试 84 项中 79 项通过，剩余 5 项为本次未修改的软性条件规则既有失败。

- 2026-07-01：已移除独立“项目库”板块及其导航、工作台和学校列表跳转入口；项目数据仍保留供学校详情、客户申请和学校筛查使用。 验证：`npm run typecheck`、`npm run lint` 和 `npm run build` 通过，构建路由清单不再包含 `/programs`。

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
- 同名学校自动关联；手工项目写入 programs、program_majors 和 audit_logs，可立即进入学校库与筛查查询。
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

## 本轮 Zeabur 构建失败根因修复（2026-06-30）
- 根因：`src/lib/db/index.ts` 在模块导入时立即创建 `DatabaseSync`，导致 Zeabur / Docker 的 `npm run build` 阶段提前打开运行期 SQLite 路径，Volume 未挂载或数据库目录不可用时构建失败。
- 修复：数据库连接改为懒加载，导入 `@/lib/db` 不再打开 SQLite；首次执行 Drizzle 查询或调用 `sqlite.prepare/exec` 时才创建连接并设置 WAL、foreign_keys 和 busy_timeout。
- 新增回归测试：`src/lib/db/index.test.ts` 验证导入数据库模块不会创建 SQLite 文件。
- 验证结果：`npm test -- src/lib/db/index.test.ts` 通过；使用临时 `DATABASE_PATH` 模拟 Zeabur 构建，`npm run build` 通过；`npm run typecheck` 通过；`npm run lint` 通过；`npm test` 70 项通过；常规 `npm run build` 通过。构建仍有既有 Turbopack NFT warning 与 `node:sqlite` ExperimentalWarning。

## 本轮 Zeabur npm install 失败修复（2026-06-30）
- Zeabur 日志显示失败发生在 Docker `RUN npm install` 阶段，报错 `npm error Invalid Version:`，尚未进入 `npm run build`。
- 根因定位：`package-lock.json` 中存在唯一缺失 `version` 的包条目 `node_modules/@img/sharp-wasm32/node_modules/@emnapi/runtime`，npm 11 在解析 `@img/sharp-wasm32` optional dependency 时触发空版本比较错误。
- 修复：删除该异常嵌套 lock 条目，让 npm 重新使用正常的 `@emnapi/runtime` 解析结果；未改业务代码。
- 验证结果：`npm install --package-lock-only --ignore-scripts --no-audit --no-fund` 通过；lock 中缺失 version 条目为 0；`npm run typecheck` 通过；`npm run build` 通过。

## 本轮筛选条件与软性竞争力增强（2026-07-01）

- 申请目标首行固定为申请学历、授课语言、目标专业、CSCA、年龄、奖学金需求；年龄紧跟 CSCA。国籍与导师接收函放在第二行。
- 导师接收函筛选删除“学校明确不要求”和“数据库未写明”，仅保留“不限”和“明确或部分要求”；知识库未写明时不推断为不要求。
- 新增“软性竞争力”折叠区：竞赛最高层级、SAT、研究成果/专利、论文成果、志愿者经历。
- 新增 `src/lib/soft-requirements.ts`，只读取“申请要求及材料”，按句段识别 REQUIRED / PREFERRED / MENTIONED / UNKNOWN，并排除入学后志愿服务、办学资质和奖学金名称等误命中。
- 明确要求但客户不具备时判为不符合；可选或加分项缺失不淘汰，客户具备时生成证据并提高排序；未写明不产生负面结论。
- 修复年龄解析旧 bug：“不超过 35 岁”不再同时写入最低 35 岁；支持“必须满 18 岁”和“18-25 岁”。筛选时优先重解析原始要求，因此现有数据库无需重导即可避开历史错误结构化值。
- 涉及文件：`src/app/(workspace)/screening/page.tsx`、`src/app/google-ui.css`、`src/lib/matcher.ts`、`src/lib/program-parser.ts`、`src/lib/soft-requirements.ts` 及对应测试、`docs/ARCHITECTURE.md`、`docs/需求规格说明书.md`。
- 浏览器验收：首行 6 个字段在宽屏同一行；导师选项已精简；软性条件可展开；提交后年龄、竞赛和 SAT 参数保留；结果卡片展示对应证据。
- 验证结果：`npm test` 81 项通过；`npm run typecheck`、`npm run lint`、`npm run build` 均通过。
- 已知风险：软性条件仍依赖知识库文本规则，新增学校表述应补充样本测试；志愿者经历在当前知识库覆盖较少。构建仍有既有 Turbopack NFT warning 和 `node:sqlite` ExperimentalWarning。

## 本轮退出登录线上错误修复（2026-07-02）

- 现象：线上点击“退出登录”进入 Next.js 通用服务端错误页；本地开发模式和原生产构建均无法复现，故障边界指向线上反向代理或部署版本下的 Server Action 传输层。
- 修复：退出入口由 Server Action 改为普通 `POST /api/auth/logout` Route Handler，复用现有 Host/协议安全跳转逻辑；保留退出审计、数据库会话删除和 Cookie 清理，并允许过期会话幂等退出。
- 涉及文件：`src/app/(workspace)/layout.tsx`、`src/app/actions.ts`、`src/app/api/auth/logout/route.ts`、`src/app/api/auth/logout/route.test.ts`。
- 回归测试：新增 2 项，覆盖正常退出审计/清理/303 跳转，以及过期会话清理。
- 验证结果：目标测试 2 项通过；`npm run typecheck` 通过；全量 lint 0 错误（保留 `src/lib/matcher.ts` 既有 1 条未使用变量 warning）；`npm run build` 通过；本地生产模式浏览器确认退出后进入 `/login`、控制台无错误、再次访问 `/dashboard` 仍回到登录页。
- 全量测试：86 项中 81 项通过，5 项失败均为本次未修改的软性条件规则既有失败（`soft-requirements.test.ts` 3 项、`matcher.test.ts` 2 项）。
- 风险：修复需重新部署后才能在线上生效；构建仍有既有 Turbopack NFT warning 与 `node:sqlite` ExperimentalWarning。

## 本轮管理员改密与账号持久化修复（2026-07-02）

- 修改前使用项目备份脚本生成一致性备份：`backups/20260702-081931`。
- 本地 `admin` 已更新为用户指定的新密码，密码只保存为 scrypt 哈希；该账号旧会话已清空，并记录 `PASSWORD_RESET_CLI` 审计。
- 新增 `scripts/reset-password.ts` 和 `npm run admin:password -- <用户名>`，密码通过环境变量或标准输入提供，不写入代码和命令参数。
- 账号创建从 Server Action 调整为同源校验的 `POST /api/admin/users` Route Handler，规避线上代理/部署版本下的 Action 传输错误；成功或校验失败均返回明确页面提示。
- 新增 `src/lib/user-service.ts`：账号校验、用户写入和审计写入使用同一 SQLite 事务；重复用户名返回可读错误。`src/lib/audit-record.ts` 提供 Web 与 CLI 共用的纯数据库审计写入。
- 结论：本地与服务器 SQLite 不会自动同步。服务器新增账号重启或发布后消失，优先检查运行进程的 `DATABASE_PATH` 是否固定为 `/opt/school-syt/shared/data/app.db`；代码没有自动删除用户的逻辑。
- 自动化验证：账号服务、账号接口和退出登录目标测试 8 项通过；新增的重复用户名页面错误测试通过类型检查和 lint，但因本轮工具额度限制未单独重跑。全量测试 92 项中 87 项通过，5 项仍为既有软性条件规则失败。
- 浏览器生产模式验证使用临时数据库副本：旧管理员密码失效，新密码可登录；创建测试账号后刷新仍存在，并可用该账号登录；临时数据库和测试进程已清理，真实数据库未写入测试账号。
- `npm run typecheck` 通过；全量 lint 0 错误（保留 `src/lib/matcher.ts` 既有 1 条 warning）；`npm run build` 通过。构建仍有既有 Turbopack NFT warning 与 `node:sqlite` ExperimentalWarning。
- 已更新 `README.md`、`docs/ARCHITECTURE.md` 和腾讯云部署教程，记录本地/宝塔改密方式及生产数据库路径检查命令。线上生效前需部署本次代码，并在宝塔终端针对永久数据库单独执行改密。

## 首页统计修复：学校数按有效项目去重（2026-07-07）

- 背景：游sir反馈首页学校数显示 135，但实际应为 117-119 左右，并要求复核是否存在学校名称重复。
- 根因：`getDashboardData()` 原先直接统计 `schools.archived = 0` 的学校总数；当前库里有 16 所未归档学校没有任何未归档项目，因此首页展示为 135。按“至少有 1 个有效项目的未归档学校”统计为 119，符合预期范围。
- 本次修复：`src/lib/queries.ts` 中首页学校数改为 `COUNT(DISTINCT s.id)`，并要求学校和项目都未归档；项目数、待复核项目数同步要求挂载学校未归档；30 天内截止项目列表也过滤已归档学校/项目。
- 回归测试：新增 `src/lib/queries.test.ts`，覆盖空学校、归档学校、归档项目不进入首页统计；有效客户仍按未归档客户统计。
- 数据复核结果：当前真实库严格口径为学校 119、项目 476、有效客户 1、待复核项目 185。
- 疑似名称变体 5 组，共多 6 条：哈尔滨工业大学/哈尔滨工业大学（哈尔滨）/哈尔滨工业大学（深圳）；广西外国语大学/广西外国语学院；河南医药大学/河南医药大学（新乡医学院）；深圳职业技术大学/深圳职业技术学院；黄河水利职业技术大学/黄河水利职业技术学院。
- 未合并原因：同时合并上述名称变体会把学校数降到 113，不符合本次 117-119 的业务预期；且部分可能是校区、升格前后名称或真实不同主体，物理合并会影响项目外键，需人工确认后再做数据治理。
- 最近验证：`npm test -- src/lib/queries.test.ts` 通过；`npm run typecheck` 通过；`npm run lint` 通过；`npm run build` 通过（保留既有 Turbopack NFT warning 与 node:sqlite ExperimentalWarning）。
- 后续建议：如要彻底清理数据，先在学校库增加“疑似重复/无有效项目”复核视图，再人工决定归档、合并或保留，避免误合并真实校区或升格前后学校。



## 筛选模块联调修复：学校搜索、生源地与详情定位（2026-07-08）

- 背景：筛选页学校搜索消失或结果不相关，生源地来源与标记缺失；筛选结果点开详情会进入无上下文学校库，不能直接看到对应项目；目标专业 evidence 需要恢复为两层。
- 核心判断：筛选模块核心排序和结果分区不做重构；本轮只补齐筛选条件接入、数据源、专业 evidence 展示和详情页定位，避免扩大改动。
- 学校搜索：src/app/(workspace)/screening/page.tsx 保留筛选模块内的 q 条件；src/lib/matcher.ts 使用 schoolNameMatches 做中文学校名子串过滤，避免跳到学校库后丢失筛选上下文。
- 生源地来源：src/lib/queries.ts 的 getProgramsForScreening() 把 raw_json 与 schools.recruitment_preference_text 并入筛查文本；src/lib/matcher.ts 扩展生源地偏好识别词，恢复相关标记。
- 专业 evidence：src/lib/matcher.ts 按用户指定语义展示：精准专业命中显示「有匹配的专业」；无精准专业但有同类方向显示「可能同类的专业」；完全无关才显示未找到相关专业。
- 详情定位：src/components/screening-result-card.tsx 的详情链接始终带 programId；学校详情页优先按 programId 命中对应项目；src/components/scroll-to-program.tsx 进入详情后滚动到对应项目，目标专业 chip 用 major-chip.highlight 标红。
- 涉及文件：src/lib/matcher.ts、src/lib/matcher.test.ts、src/lib/queries.ts、src/components/screening-result-card.tsx、src/components/scroll-to-program.tsx、src/app/(workspace)/schools/[id]/page.tsx、src/app/(workspace)/screening/page.tsx、src/app/google-ui.css、docs/PROJECT_STATE.md。
- 最近验证：npm run typecheck 通过；npm run lint 通过；npx vitest run --no-color --exclude src/lib/import-service.test.ts 通过，15 个测试文件通过，82 passed / 1 skipped。
- 已知风险：详情入口仍复用学校详情页路由，但会带 from=screening、programId 和 major 参数；如果页面仍看不到对应项目，优先检查实际 URL 是否包含 programId，以及筛选项目 id 是否存在于学校详情返回的 programs 中。
- 下一步建议：重启本地项目后，用筛选页真实点击验证详情 URL、项目自动定位和搜索专业标红。
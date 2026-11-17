# 招生批次数据模型方案

## 当前问题

`programs` 表把招生年份、季节、截止日期和申请时间说明压在 `semester_text`、`application_time_text`、`deadline_date` 等字段中。一个项目可能同时有春季、秋季或多轮申请，现有结构无法表达“哪个日期属于哪个批次”，也会把历史资料误当成当前资料。该问题不能只靠 Prompt 解决。

## 建议模型

新增 `admission_batches`，一个项目可以有多条招生批次：

| 字段 | 含义 |
| --- | --- |
| `id` | 批次 ID |
| `program_id` | 关联知识库项目 |
| `intake_year` | 入学年份，必填 |
| `intake_season` | `SPRING/SUMMER/AUTUMN/WINTER/UNKNOWN` |
| `round` | 第几轮或批次名称，可空 |
| `application_open_at` | 开放时间，可空 |
| `deadline_at` | 截止时间，可空 |
| `deadline_status` | `OPEN/CLOSED/EXPIRED/UNKNOWN` |
| `enrollment_status` | `CONFIRMED/EXPECTED/UNKNOWN` |
| `source_year` | 原始资料年份 |
| `source_text` | 脱敏后的来源说明 |
| `source_url` | 官方来源，可空 |
| `verified_at` | 人工核实时间，可空 |
| `verified_by` | 核实人，可空 |
| `review_status` | `AUTO_PARSED/VERIFIED/NEEDS_REVIEW` |
| `notes` | 内部备注 |
| `created_at/updated_at` | 时间戳 |

建议索引：

- `(program_id, intake_year, intake_season, round)` 唯一索引。
- `(intake_year, intake_season, deadline_at)` 查询索引。
- `(review_status, verified_at)` 核实工作流索引。

费用也应逐步拆分适用年份，至少保存 `fee_source_year` 和 `fee_verified_at`。在完成拆分前，旧年费用继续按“待核实”展示。

## 迁移步骤

1. 只新增表和索引，不删除或重命名现有列。
2. 从 `semester_text` 和 `application_time_text` 解析年份、季节和日期；解析不确定的记录写成 `UNKNOWN/NEEDS_REVIEW`。
3. 保留现有项目字段作为兼容来源，筛查先读取已核实批次，再回退到旧字段并标注待核实。
4. 管理端增加批次维护和人工核实入口；同一项目可维护多条批次。
5. 完成数据核对和回滚演练后，再决定是否停止写入旧字段。

## 风险

- 同一项目可能有多轮申请，自动解析只能生成候选批次，不能据此认定截止日期。
- 春季/秋季等季节在不同学校命名可能不一致，需要保留原始批次名称。
- 历史数据和当前数据会暂时并存，展示层必须优先已核实批次，否则仍可能误导。
- 需要业务负责人确认：当前主推哪些入学年份和季节、哪些批次算“当前招生”、旧批次保留多久。

## 验收条件

- 同一项目可保存多条批次，且能区分已截止、开放中、预期开班和未知。
- 任何筛查结果只能引用一个明确的批次 ID。
- 未经人工核实的批次不得出现在“已确认”群组。
- 没有批次证据时，费用、截止和开班状态只能显示“待核实”。

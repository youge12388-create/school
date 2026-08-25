import * as XLSX from "xlsx";

import { requireRole } from "@/lib/auth";
import {
  canEditConfidentialSchoolFields,
  CONFIDENTIAL_TEMPLATE_HEADERS,
  IMPORT_ROLES,
} from "@/lib/permissions";
import { openRawDatabase } from "@/lib/db/raw";

// 与参照表“高校项目汇总-中文(20260704).xlsx”表头完全对齐（37列）
const HEADERS = [
  "序号",
  "院校分类",
  "学校中文名",
  "学校英文名",
  "所在城市",
  "项目类型",
  "学费",
  "授课语言",
  "项目介绍",
  "学制",
  "学制备注",
  "专业列表",
  "专业方向",
  "申请要求及材料",
  "学期安排",
  "申请时间说明",
  "奖学金类别",
  "奖学金内容",
  "奖学金备注",
  "奖学金截止日期",
  "住宿费",
  "保险费",
  "自费生申请费",
  "奖学金申请费",
  "费用备注",
  "团体申请账号",
  "奖学金发放形式\noffer是否标明",
  "是否可代收",
  "截止日期",
  "公司招生名额",
  "学校招生计划",
  "招生偏向",
  "语言生是否面试、笔试",
  "学历生是否面试、笔试",
  "合作备注",
  "特殊情况备注",
  "学校申请更新频率",
];

// 数据库列 → 参照表列索引（0-based，跳过第0列“序号”）
const COL_KEYS: (string | null)[] = [
  null, // 序号 — 运行时生成
  "category",
  "name_zh",
  "name",
  "city",
  "program_type",
  "tuition_text",
  "teaching_language",
  "introduction",
  "duration",
  "duration_note",
  "major_text",
  "direction_text",
  "requirements_text",
  "semester_text",
  "application_time_text",
  "scholarship_category",
  "scholarship_content",
  "scholarship_note",
  "scholarship_deadline_text",
  "accommodation_text",
  "insurance_text",
  "application_fee_text",
  "scholarship_application_fee_text",
  "fee_note",
  "group_application_account",
  "scholarship_disbursement_text",
  "collection_service_text",
  "cooperation_deadline_text",
  "company_recruitment_quota_text",
  "school_recruitment_plan_text",
  "recruitment_preference_text",
  "language_student_assessment_text",
  "degree_student_assessment_text",
  "cooperation_note",
  "special_case_note",
  "application_update_frequency",
];

export async function GET() {
  const user = await requireRole([...IMPORT_ROLES]);
  const canEditConfidential = canEditConfidentialSchoolFields(user.role);
  const headers = canEditConfidential
    ? HEADERS
    : HEADERS.filter((header) => !CONFIDENTIAL_TEMPLATE_HEADERS.includes(header));
  const colKeys = canEditConfidential
    ? COL_KEYS
    : COL_KEYS.filter(
        (_, index) => !CONFIDENTIAL_TEMPLATE_HEADERS.includes(HEADERS[index]),
      );

  const database = openRawDatabase();

  const rows = database
    .prepare(
      `SELECT s.category, s.name_zh, s.name, s.city,
              p.program_type, p.tuition_text, p.teaching_language,
              p.introduction, p.duration, p.duration_note,
              p.major_text, p.direction_text, p.requirements_text,
              p.semester_text, p.application_time_text,
              p.scholarship_category, p.scholarship_content,
              p.scholarship_note, p.scholarship_deadline_text,
              p.accommodation_text, p.insurance_text,
              p.application_fee_text, p.scholarship_application_fee_text,
              p.fee_note,
              s.group_application_account, s.scholarship_disbursement_text,
              s.collection_service_text, s.cooperation_deadline_text,
              s.company_recruitment_quota_text, s.school_recruitment_plan_text,
              s.recruitment_preference_text, s.language_student_assessment_text,
              s.degree_student_assessment_text, s.cooperation_note,
              s.special_case_note, s.application_update_frequency,
              s.name_zh AS school_name
       FROM programs p JOIN schools s ON s.id = p.school_id
       WHERE p.archived = 0 AND s.archived = 0
       ORDER BY s.name_zh, p.program_type`,
    )
    .all() as Array<Record<string, unknown>>;

  database.close();

  const workbook = XLSX.utils.book_new();

  // Sheet 1: 高校项目
  const dataRows = rows.map((row, i) =>
    colKeys.map((key, colIdx) => {
      if (colIdx === 0) return i + 1; // 序号
      return key ? (row[key] ?? "") : "";
    }),
  );
  const sheet1 = XLSX.utils.aoa_to_sheet([
    ["高校项目汇总-中文版"],
    headers,
    ...dataRows,
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet1, "高校项目");

  // Sheet 2: 高校项目数据统计
  const stats = new Map<string, number>();
  for (const row of rows) {
    const name = (row.school_name as string) || "";
    stats.set(name, (stats.get(name) || 0) + 1);
  }
  const statsRows = [...stats.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh"))
    .map(([name, count]) => [name, count]);
  const sheet2 = XLSX.utils.aoa_to_sheet([
    ["学校名称", "项目数量"],
    ...statsRows,
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet2, "高校项目数据统计");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        "attachment; filename*=UTF-8''knowledge-base-export.xlsx",
      "Cache-Control": "no-store",
    },
  });
}

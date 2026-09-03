import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { asText } from "@/lib/utils";

// 机密字段 → 表列名映射：合作关系、招生计划、考核安排、合作收费
const CONFIDENTIAL_COLUMNS: Record<string, string> = {
  groupApplicationAccount: "group_application_account",
  scholarshipDisbursementText: "scholarship_disbursement_text",
  collectionServiceText: "collection_service_text",
  cooperationDeadlineText: "cooperation_deadline_text",
  companyRecruitmentQuotaText: "company_recruitment_quota_text",
  schoolRecruitmentPlanText: "school_recruitment_plan_text",
  recruitmentPreferenceText: "recruitment_preference_text",
  languageStudentAssessmentText: "language_student_assessment_text",
  degreeStudentAssessmentText: "degree_student_assessment_text",
  cooperationNote: "cooperation_note",
  specialCaseNote: "special_case_note",
  applicationUpdateFrequency: "application_update_frequency",
  cooperationFeeText: "cooperation_fee_text",
};

// 详情页"合作关系/机密字段"卡片就地编辑：仅高级管理员可修改
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(["ADMIN"]);
  const { id } = await context.params;
  const school = sqlite
    .prepare("SELECT id, name_zh FROM schools WHERE id = ? AND archived = 0")
    .get(id) as { id: string; name_zh: string } | undefined;
  if (!school) {
    return Response.json({ error: "学校不存在" }, { status: 404 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const keys = Object.keys(body).filter((key) => key in CONFIDENTIAL_COLUMNS);
  if (!keys.length) {
    return Response.json({ error: "没有可保存的机密字段" }, { status: 400 });
  }
  // 先读旧值做真实 diff，避免整卡全字段上报导致审计失真。
  const oldRow = sqlite
    .prepare(
      `SELECT ${keys
        .map((key) => `${CONFIDENTIAL_COLUMNS[key]} AS ${key}`)
        .join(", ")} FROM schools WHERE id = ?`,
    )
    .get(id) as Record<string, unknown>;
  const changed: string[] = [];
  for (const key of keys) {
    const oldValue = oldRow?.[key] ?? null;
    const newValue = asText(body[key]) || null;
    if ((oldValue ?? "") !== (newValue ?? "")) changed.push(key);
  }
  if (!changed.length) {
    return Response.json({ id, changed: [] });
  }
  const values = changed.map((key) => asText(body[key]) || null);
  sqlite
    .prepare(
      `UPDATE schools SET
       ${changed.map((key) => `${CONFIDENTIAL_COLUMNS[key]} = ?`).join(", ")},
       updated_at = ?
       WHERE id = ?`,
    )
    .run(...values, Date.now(), id);
  writeAudit({
    userId: user.id,
    action: "SCHOOL_UPDATED",
    entityType: "SCHOOL",
    entityId: id,
    details: { nameZh: school.name_zh, changed },
  });
  revalidatePath(`/schools/${id}`);
  revalidatePath("/schools");
  return Response.json({ id });
}

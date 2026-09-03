import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { RULE_STATUSES } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import {
  canEditConfidentialSchoolFields,
  SCHOOL_EDITOR_ROLES,
  stripConfidentialSchoolUpdates,
} from "@/lib/permissions";
import { saveProgramFields } from "@/lib/program-editor";
import { appUrl } from "@/lib/http";
import { asText } from "@/lib/utils";

function optionalFormText(formData: FormData, key: string) {
  return asText(formData.get(key)) || null;
}

function optionalFormNumber(formData: FormData, key: string) {
  const text = asText(formData.get(key));
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

// 学校行可写字段 → 表列名。机密字段按角色剥离后再写入。
const SCHOOL_COLUMN_MAP: Record<string, string> = {
  nameZh: "name_zh",
  name: "name",
  category: "category",
  province: "province",
  city: "city",
  website: "website",
  partnershipRating: "partnership_rating",
  cscaStatus: "csca_status",
  qsRanking: "qs_ranking",
  rankingInfo: "ranking_info",
  description: "description",
  tags: "tags",
  cooperationPrograms: "cooperation_programs",
  infoNote: "info_note",
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
  reviewStatus: "review_status",
};

function changedFields(
  old: Record<string, unknown>,
  updates: Record<string, unknown>,
) {
  const changed: string[] = [];
  for (const key of Object.keys(updates)) {
    if (key === "updatedAt") continue; // 隐式字段不进入审计 changed
    if ((old[key] ?? "") !== (updates[key] ?? "")) {
      changed.push(key);
    }
  }
  return changed;
}

// 整页编辑（schools/[id]/edit）：学校行 + 全部项目在单个事务内提交，
// 任一步失败整体回滚，避免“学校已保存、项目半保存”的半成品。
export async function POST(request: Request) {
  const formData = await request.formData();
  const id = asText(formData.get("id"));
  if (!id) {
    return NextResponse.redirect(
      appUrl(request, `/schools?error=缺少学校ID`),
      303,
    );
  }

  try {
    const user = await requireRole([...SCHOOL_EDITOR_ROLES]);

    const nameZh = asText(formData.get("nameZh"));
    if (!nameZh) throw new Error("学校中文名不能为空");

    const partnershipRating = optionalFormNumber(formData, "partnershipRating") ?? 0;
    const cscaStatus = asText(formData.get("cscaStatus"));
    if (!RULE_STATUSES.includes(cscaStatus as never)) {
      throw new Error("CSCA 状态无效");
    }
    if (partnershipRating < 0 || partnershipRating > 5) {
      throw new Error("合作星级必须在 0 到 5 之间");
    }

    const updates = {
      nameZh,
      name: optionalFormText(formData, "name") || nameZh,
      category: optionalFormText(formData, "category"),
      province: optionalFormText(formData, "province"),
      city: optionalFormText(formData, "city"),
      website: optionalFormText(formData, "website"),
      partnershipRating,
      cscaStatus: cscaStatus as (typeof RULE_STATUSES)[number],
      qsRanking: optionalFormNumber(formData, "qsRanking"),
      rankingInfo: optionalFormText(formData, "rankingInfo"),
      description: optionalFormText(formData, "description"),
      tags: optionalFormText(formData, "tags"),
      cooperationPrograms: optionalFormText(formData, "cooperationPrograms"),
      infoNote: optionalFormText(formData, "infoNote"),
      groupApplicationAccount: optionalFormText(formData, "groupApplicationAccount"),
      scholarshipDisbursementText: optionalFormText(formData, "scholarshipDisbursementText"),
      collectionServiceText: optionalFormText(formData, "collectionServiceText"),
      cooperationDeadlineText: optionalFormText(formData, "cooperationDeadlineText"),
      companyRecruitmentQuotaText: optionalFormText(formData, "companyRecruitmentQuotaText"),
      schoolRecruitmentPlanText: optionalFormText(formData, "schoolRecruitmentPlanText"),
      recruitmentPreferenceText: optionalFormText(formData, "recruitmentPreferenceText"),
      languageStudentAssessmentText: optionalFormText(formData, "languageStudentAssessmentText"),
      degreeStudentAssessmentText: optionalFormText(formData, "degreeStudentAssessmentText"),
      cooperationNote: optionalFormText(formData, "cooperationNote"),
      specialCaseNote: optionalFormText(formData, "specialCaseNote"),
      applicationUpdateFrequency: optionalFormText(formData, "applicationUpdateFrequency"),
      cooperationFeeText: optionalFormText(formData, "cooperationFeeText"),
      reviewStatus: "VERIFIED" as const,
      updatedAt: Date.now(),
    };
    const permittedUpdates = canEditConfidentialSchoolFields(user.role)
      ? updates
      : stripConfidentialSchoolUpdates(updates);

    const oldSelectColumns = Object.keys(SCHOOL_COLUMN_MAP)
      .map((key) => `${SCHOOL_COLUMN_MAP[key]} AS ${key}`)
      .join(", ");
    const oldSchool = sqlite
      .prepare(`SELECT ${oldSelectColumns} FROM schools WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!oldSchool) throw new Error("学校不存在");

    const writeColumns = Object.keys(permittedUpdates).filter(
      (key) => key in SCHOOL_COLUMN_MAP,
    );
    const permitted = permittedUpdates as Record<string, unknown>;
    const writeValues = writeColumns.map(
      (key) => permitted[key] as string | number | null,
    );

    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite
        .prepare(
          `UPDATE schools SET
           ${writeColumns.map((key) => `${SCHOOL_COLUMN_MAP[key]} = ?`).join(", ")},
           updated_at = ?
           WHERE id = ?`,
        )
        .run(...writeValues, updates.updatedAt, id);
      writeAudit({
        userId: user.id,
        action: "SCHOOL_UPDATED",
        entityType: "SCHOOL",
        entityId: id,
        details: {
          nameZh: oldSchool.nameZh,
          changed: changedFields(oldSchool, permittedUpdates),
        },
      });

      // 保存项目数据（同一表单一并提交，复用同事务连接）
      for (let i = 0; ; i++) {
        const programId = asText(formData.get(`program_${i}_id`));
        if (!programId) break;
        const name = asText(formData.get(`program_${i}_name`));
        const programType = asText(formData.get(`program_${i}_programType`));
        const teachingLanguage = asText(formData.get(`program_${i}_teachingLanguage`));
        if (!name || !programType || !teachingLanguage) {
          throw new Error(`项目 "${name || programId}"：项目名称、申请学历和授课语言不能为空`);
        }
        saveProgramFields(
          user.id,
          programId,
          {
            name,
            programType,
            teachingLanguage,
            majorText: asText(formData.get(`program_${i}_majorText`)) || null,
            requirementsText:
              asText(formData.get(`program_${i}_requirementsText`)) || null,
            applicationTimeText:
              asText(formData.get(`program_${i}_applicationTimeText`)) || null,
            tuitionText: asText(formData.get(`program_${i}_tuitionText`)),
            accommodationText:
              asText(formData.get(`program_${i}_accommodationText`)) || null,
            firstYearCostMax: optionalFormNumber(
              formData,
              `program_${i}_firstYearCostMax`,
            ),
            deadlineDate:
              asText(formData.get(`program_${i}_deadlineDate`)) || null,
            duration: optionalFormText(formData, `program_${i}_duration`),
            introduction:
              optionalFormText(formData, `program_${i}_introduction`),
            scholarshipContent:
              optionalFormText(formData, `program_${i}_scholarshipContent`),
          },
          true,
        );
      }
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }

    revalidatePath(`/schools/${id}`);
    revalidatePath("/schools");
    return NextResponse.redirect(appUrl(request, `/schools/${id}`), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return NextResponse.redirect(
      appUrl(request, `/schools/${id}/edit?error=${encodeURIComponent(message)}`),
      303,
    );
  }
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { RULE_STATUSES } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import {
  canEditConfidentialSchoolFields,
  SCHOOL_EDITOR_ROLES,
  stripConfidentialSchoolUpdates,
} from "@/lib/permissions";
import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
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

function changedFields(
  old: Record<string, unknown>,
  updates: Record<string, unknown>,
) {
  const changed: string[] = [];
  for (const key of Object.keys(updates)) {
    const oldVal = (old as Record<string, unknown>)[key];
    const newVal = (updates as Record<string, unknown>)[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changed.push(key);
    }
  }
  return changed;
}

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
    if (!nameZh) {
      return NextResponse.redirect(
        appUrl(request, `/schools/${id}/edit?error=${encodeURIComponent("学校中文名不能为空")}`),
        303,
      );
    }

    const partnershipRating = optionalFormNumber(formData, "partnershipRating") ?? 0;
    const cscaStatus = asText(formData.get("cscaStatus"));
    if (!RULE_STATUSES.includes(cscaStatus as never)) {
      return NextResponse.redirect(
        appUrl(request, `/schools/${id}/edit?error=${encodeURIComponent("CSCA 状态无效")}`),
        303,
      );
    }
    if (partnershipRating < 0 || partnershipRating > 5) {
      return NextResponse.redirect(
        appUrl(request, `/schools/${id}/edit?error=${encodeURIComponent("合作星级必须在 0 到 5 之间")}`),
        303,
      );
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
      updatedAt: new Date(),
    };
    const permittedUpdates = canEditConfidentialSchoolFields(user.role)
      ? updates
      : stripConfidentialSchoolUpdates(updates);

    const [oldSchool] = await db.select().from(schools).where(eq(schools.id, id));
    if (!oldSchool) throw new Error("学校不存在");
    await db.update(schools).set(permittedUpdates).where(eq(schools.id, id));
    await writeAudit({
      userId: user.id,
      action: "SCHOOL_UPDATED",
      entityType: "SCHOOL",
      entityId: id,
      details: {
        nameZh: oldSchool.nameZh,
        changed: changedFields(oldSchool, permittedUpdates),
      },
    });

    // 保存项目数据（同一表单一并提交）
    for (let i = 0; ; i++) {
      const programId = asText(formData.get(`program_${i}_id`));
      if (!programId) break;
      await updateSingleProgram(user.id, formData, i, programId);
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

async function updateSingleProgram(userId: string, formData: FormData, index: number, programId: string) {
  const name = asText(formData.get(`program_${index}_name`));
  const programType = asText(formData.get(`program_${index}_programType`));
  const teachingLanguage = asText(formData.get(`program_${index}_teachingLanguage`));
  if (!name || !programType || !teachingLanguage) {
    throw new Error(`项目 "${name || programId}"：项目名称、申请学历和授课语言不能为空`);
  }

  await saveProgramFields(userId, programId, {
    name,
    programType,
    teachingLanguage,
    majorText: asText(formData.get(`program_${index}_majorText`)) || null,
    requirementsText: asText(formData.get(`program_${index}_requirementsText`)) || null,
    applicationTimeText: asText(formData.get(`program_${index}_applicationTimeText`)) || null,
    tuitionText: asText(formData.get(`program_${index}_tuitionText`)),
    accommodationText: asText(formData.get(`program_${index}_accommodationText`)) || null,
    firstYearCostMax: optionalFormNumber(formData, `program_${index}_firstYearCostMax`),
    deadlineDate: asText(formData.get(`program_${index}_deadlineDate`)) || null,
    duration: optionalFormText(formData, `program_${index}_duration`),
    introduction: optionalFormText(formData, `program_${index}_introduction`),
    scholarshipContent: optionalFormText(formData, `program_${index}_scholarshipContent`),
  });
}

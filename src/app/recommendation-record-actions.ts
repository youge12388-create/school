"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getUserPermissions } from "@/lib/access-control";
import { getCurrentUser } from "@/lib/auth";
import { rankPrograms } from "@/lib/matcher";
import { getProgramsForScreening } from "@/lib/queries";
import { MAX_PLAN_ITEMS, planRegion } from "@/lib/recommendation-profile";
import {
  deleteRecommendationRecord,
  existingPlanRequest,
  hashPlanRequest,
  saveRecommendationRecord,
  updateRecommendationRecord,
} from "@/lib/recommendation-records";
import { hasPrivatePlanText, planIdField, planProfileFields, planRequestField, planTitleField, profileFormValues, safePlanEvidence } from "@/lib/recommendation-validation";
import { isScreeningPlanEligible } from "@/lib/screening-results";

type FormResult = { error: string; saved?: boolean; deleted?: boolean };
const profileSchema = z.object(planProfileFields);
const optionalText = z.string().max(160).nullish();
const optionalNumber = z.number().nullish();
const optionalDate = z.iso.datetime().transform((value) => new Date(value)).nullish();
const manualCriteria = z.object({
  programType: z.string().max(30).optional(), teachingLanguage: z.string().max(30).optional(),
  targetMajor: z.string().max(160).optional(), schoolTier: z.enum(["985", "211", "double_first_class_only", "double_non"]).optional(),
  schoolQuery: z.string().max(160).optional(), budget: optionalNumber, gpa: optionalNumber, gpaScale: optionalNumber,
  hskLevel: optionalNumber, hskScore: optionalNumber, ielts: optionalNumber, toefl: optionalNumber,
  duolingo: optionalNumber, age: optionalNumber, cscaStatus: z.enum(["REQUIRED", "NOT_REQUIRED", "UNKNOWN"]).nullish(),
  hasPaperPatent: optionalText, hasCompetition: optionalText, nationality: z.string().max(160).optional(),
  province: z.string().max(120).optional(), city: z.string().max(120).optional(), scholarshipType: z.string().max(30).optional(),
  accommodationRequired: z.boolean().optional(), supervisorAcceptance: z.enum(["required", "not_required", "unknown"]).nullish(),
  enrollmentRegion: z.string().max(30).optional(), deadlineFrom: optionalDate, deadlineTo: optionalDate,
  deadlineMode: z.enum(["open", "unknown", "expired", "all"]).optional(),
}).strict();

const manualSchema = z.object({
  ...planProfileFields,
  requestId: planRequestField,
  title: planTitleField,
  items: z.array(z.object({ programId: planIdField, reason: z.string().trim().max(400) })).min(1).max(MAX_PLAN_ITEMS),
  criteria: manualCriteria,
});

function planVersionFrom(formData: FormData) {
  const versionValue = formData.get("version");
  return typeof versionValue === "string" && /^\d+$/.test(versionValue)
    ? Number(versionValue)
    : Number.NaN;
}

export async function saveScreeningPlanAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  const permissions = user ? getUserPermissions(user) : [];
  if (!user || !permissions.includes("SCREENING_VIEW") || !permissions.includes("RECOMMENDATION_MANAGE")) {
    return { error: "当前账号无权保存方案。" };
  }

  const ids = formData.getAll("programIds");
  if (!ids.length || ids.length > MAX_PLAN_ITEMS || new Set(ids).size !== ids.length) {
    return { error: "请勾选 1 至 30 个不同的项目。" };
  }
  let criteriaValue: unknown;
  try {
    const criteriaJson = formData.get("criteriaJson");
    if (typeof criteriaJson !== "string" || criteriaJson.length > 8000) throw new Error();
    criteriaValue = JSON.parse(criteriaJson);
  } catch {
    return { error: "筛查条件无效，请重新筛查后再保存。" };
  }
  const parsed = manualSchema.safeParse({
    ...profileFormValues(formData),
    requestId: formData.get("requestId"),
    title: formData.get("title"),
    criteria: criteriaValue,
    items: ids.map((id) => ({ programId: id, reason: typeof id === "string" ? formData.get(`reason_${id}`) ?? "" : "" })),
  });
  if (!parsed.success) return { error: "请填写学生姓名和方案名称，并检查地区、备注及推荐理由长度。" };

  const { requestId, title, criteria, items, ...profile } = parsed.data;
  if (hasPrivatePlanText([title, ...Object.values(profile), ...items.map((item) => item.reason), ...Object.values(criteria)])) {
    return { error: "请移除方案中的联系方式、证件信息或敏感限制。" };
  }
  const identity = { id: requestId, createdBy: user.id, requestHash: hashPlanRequest({ mode: "manual", ...parsed.data }) };
  try {
    const existing = existingPlanRequest(identity);
    if (existing === "conflict") return { error: "这次保存请求已使用，请重新筛查后再保存。" };
    if (existing === "missing") {
      const selectedIds = new Set(items.map((item) => item.programId));
      const programs = (await getProgramsForScreening()).filter((program) => selectedIds.has(program.id));
      const results = new Map(rankPrograms(programs, criteria)
        .filter(isScreeningPlanEligible)
        .map((result) => [result.program.id, result]));
      const snapshots = [];
      for (const { programId, reason } of items) {
        const result = results.get(programId);
        if (!result) return { error: "部分项目已更新或不在筛查结果中，请刷新后重新选择。" };
        const { program } = result;
        snapshots.push({
          programId,
          schoolId: program.schoolId,
          schoolName: program.schoolName,
          schoolRegion: planRegion(program.province, program.city) || null,
          programName: program.programName,
          fitLevel: result.fitLevel,
          reason: reason || null,
          evidenceJson: JSON.stringify(result.evidence.map((entry) => ({ ...entry, detail: safePlanEvidence(entry.detail) }))),
          factsJson: JSON.stringify({ programType: program.programType, language: program.teachingLanguage,
            majorText: program.majorText, tuitionText: program.tuitionText, firstYearCostMax: program.firstYearCostMax,
            deadlineAt: program.deadlineDate?.getTime() }),
        });
      }
      if (saveRecommendationRecord({ ...identity, ...profile, title, criteriaJson: JSON.stringify(criteria), mode: "manual", items: snapshots }) === "conflict") {
        return { error: "这次保存请求已使用，请重新筛查后再保存。" };
      }
    }
  } catch {
    return { error: "方案未保存，请稍后重试。" };
  }
  revalidatePath("/recommendations");
  redirect(`/recommendations/${requestId}/print`);
}

export async function updateRecommendationRecordAction(
  id: string, _prev: FormResult, formData: FormData,
): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user || !getUserPermissions(user).includes("RECOMMENDATION_MANAGE")) {
    return { error: "当前账号无权编辑方案记录。" };
  }
  const version = planVersionFrom(formData);
  if (!planIdField.safeParse(id).success || !Number.isSafeInteger(version) || version < 0) {
    return { error: "无法识别此方案，请刷新后重试。" };
  }
  const parsed = profileSchema.safeParse(profileFormValues(formData));
  if (!parsed.success) return { error: "请填写学生姓名，并检查地区和备注的长度。" };
  if (hasPrivatePlanText(Object.values(parsed.data))) {
    return { error: "请移除联系方式、证件信息或敏感限制后再保存。" };
  }
  try {
    const result = updateRecommendationRecord(id, version, parsed.data, user.id);
    if (result === "missing") return { error: "此方案不存在。" };
    if (result === "conflict") return { error: "方案已被更新，请刷新后继续编辑。" };
  } catch {
    return { error: "方案记录未保存，请稍后重试。" };
  }
  revalidatePath("/recommendations");
  revalidatePath(`/recommendations/${id}/print`);
  return { error: "", saved: true };
}

export async function deleteRecommendationRecordAction(
  id: string, _prev: FormResult, formData: FormData,
): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user || !getUserPermissions(user).includes("RECOMMENDATION_MANAGE")) {
    return { error: "当前账号无权删除方案记录。" };
  }
  const version = planVersionFrom(formData);
  if (!planIdField.safeParse(id).success || !Number.isSafeInteger(version) || version < 0) {
    return { error: "无法识别此方案，请刷新后重试。" };
  }
  try {
    const result = deleteRecommendationRecord(id, version, user.id);
    if (result === "missing") return { error: "此方案不存在或已删除。" };
    if (result === "conflict") return { error: "方案已被更新，请刷新后再删除。" };
  } catch {
    return { error: "方案记录未删除，请稍后重试。" };
  }
  revalidatePath("/recommendations");
  revalidatePath(`/recommendations/${id}/print`);
  return { error: "", deleted: true };
}

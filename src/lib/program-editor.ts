import { eq } from "drizzle-orm";

import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { programMajors, programs } from "@/lib/db/schema";
import { invalidateMajorCatalog } from "@/lib/queries";
import { parseProgram, splitMajors } from "@/lib/program-parser";
import { newId, normalizeKeyword } from "@/lib/utils";

export type ProgramEditFields = {
  name: string;
  programType: string;
  teachingLanguage: string;
  majorText: string | null;
  requirementsText: string | null;
  applicationTimeText: string | null;
  tuitionText: string;
  accommodationText: string | null;
  firstYearCostMax: number | null;
  deadlineDate: string | null;
  duration: string | null;
  introduction: string | null;
  scholarshipContent: string | null;
};

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

// 单个项目的字段保存：解析、落库、专业同步与审计。
// 页面内联编辑与整页编辑共用，避免两套实现漂移。
export async function saveProgramFields(
  userId: string,
  programId: string,
  fields: ProgramEditFields,
) {
  const parsed = parseProgram({
    tuitionText: fields.tuitionText,
    accommodationText: fields.accommodationText ?? "",
    insuranceText: "",
    applicationFeeText: "",
    requirementsText: fields.requirementsText ?? "",
    applicationTimeText: fields.applicationTimeText ?? "",
    majorText: fields.majorText ?? "",
    programType: fields.programType,
  });
  const deadlineDate = fields.deadlineDate
    ? new Date(`${fields.deadlineDate}T23:59:59+08:00`)
    : parsed.deadlineDate;
  const validDeadlineDate =
    deadlineDate && Number.isFinite(deadlineDate.getTime())
      ? deadlineDate
      : null;

  const updates = {
    name: fields.name,
    programType: fields.programType,
    teachingLanguage: fields.teachingLanguage,
    majorText: fields.majorText || null,
    requirementsText: fields.requirementsText || null,
    tuitionText: fields.tuitionText,
    tuitionMin: parsed.tuition.min,
    tuitionMax: parsed.tuition.max,
    tuitionPeriod: parsed.tuition.period,
    firstYearCostMax: fields.firstYearCostMax ?? parsed.firstYearCostMax,
    costIncomplete:
      fields.firstYearCostMax == null ? parsed.costIncomplete : false,
    cscaStatus: parsed.cscaStatus,
    hskLevelMin: parsed.hskLevelMin,
    hskScoreMin: parsed.hskScoreMin,
    ieltsMin: parsed.ieltsMin,
    toeflMin: parsed.toeflMin,
    duolingoMin: parsed.duolingoMin,
    gpaMin: parsed.gpaMin,
    gpaScale: parsed.gpaScale,
    minAge: parsed.minAge,
    maxAge: parsed.maxAge,
    deadlineDate: validDeadlineDate,
    deadlineStatus: validDeadlineDate
      ? validDeadlineDate.getTime() >= Date.now()
        ? "OPEN"
        : "EXPIRED"
      : parsed.deadlineStatus,
    introduction: fields.introduction || null,
    duration: fields.duration || null,
    accommodationText: fields.accommodationText || null,
    applicationTimeText: fields.applicationTimeText || null,
    scholarshipContent: fields.scholarshipContent || null,
    parsedJson: JSON.stringify(parsed),
    reviewStatus: "VERIFIED" as const,
    manuallyVerified: true,
    updatedAt: new Date(),
  };

  const [oldProgram] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, programId));
  if (!oldProgram) throw new Error(`项目 ${fields.name} 不存在`);

  await db.update(programs).set(updates).where(eq(programs.id, programId));
  await db
    .delete(programMajors)
    .where(eq(programMajors.programId, programId));
  const majorValues = splitMajors(fields.majorText ?? "").map((major) => ({
    id: newId(),
    programId,
    name: major,
    normalizedName: normalizeKeyword(major),
    category: null,
  }));
  if (majorValues.length) {
    await db.insert(programMajors).values(majorValues);
  }
  await writeAudit({
    userId,
    action: "PROGRAM_UPDATED",
    entityType: "PROGRAM",
    entityId: programId,
    details: {
      name: oldProgram.name,
      changed: changedFields(oldProgram, updates),
    },
  });
  invalidateMajorCatalog();
  return oldProgram.schoolId;
}

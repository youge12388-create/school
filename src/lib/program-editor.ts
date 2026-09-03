import { sqlite } from "@/lib/db";
import { invalidateMajorCatalog } from "@/lib/queries";
import { parseProgram, splitMajors } from "@/lib/program-parser";
import { newId, normalizeKeyword } from "@/lib/utils";
import { writeAudit } from "@/lib/audit";

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

// 审计只跟踪用户在表单里可编辑的字段，派生/隐式字段（updatedAt、parsedJson、
// reviewStatus、manuallyVerified、deadlineStatus 等）不进入 changed。
const TRACKED_FIELDS = [
  "name",
  "programType",
  "teachingLanguage",
  "majorText",
  "requirementsText",
  "applicationTimeText",
  "tuitionText",
  "accommodationText",
  "firstYearCostMax",
  "deadlineDate",
  "duration",
  "introduction",
  "scholarshipContent",
] as const;

const OLD_PROGRAM_COLUMNS = `
  id, school_id AS schoolId, name,
  program_type AS programType, teaching_language AS teachingLanguage,
  major_text AS majorText, requirements_text AS requirementsText,
  application_time_text AS applicationTimeText, tuition_text AS tuitionText,
  accommodation_text AS accommodationText,
  first_year_cost_max AS firstYearCostMax, deadline_date AS deadlineDate,
  duration, introduction, scholarship_content AS scholarshipContent
`;

type OldProgramRow = {
  id: string;
  schoolId: string;
  name: string;
  programType: string;
  teachingLanguage: string;
  majorText: string | null;
  requirementsText: string | null;
  applicationTimeText: string | null;
  tuitionText: string;
  accommodationText: string | null;
  firstYearCostMax: number | null;
  deadlineDate: number | null;
  duration: string | null;
  introduction: string | null;
  scholarshipContent: string | null;
};

function changedFields(oldProgram: OldProgramRow, updates: Record<string, unknown>) {
  const changed: string[] = [];
  for (const key of TRACKED_FIELDS) {
    const oldValue = (oldProgram as unknown as Record<string, unknown>)[key];
    const newValue = updates[key];
    if ((oldValue ?? "") !== (newValue ?? "")) {
      changed.push(key);
    }
  }
  return changed;
}

// 单个项目的字段保存：解析、落库、专业同步与审计。
// 页面内联编辑与整页编辑共用，避免两套实现漂移。
//
// 事务说明：SQLite 单连接上的 BEGIN 必须与语句同批同步执行，否则并发请求会
// 交错进同一事务。这里统一使用同步语句；整页编辑（/api/schools/update）会先
// BEGIN 再以 inTransaction=true 调用本函数，函数自身不再嵌套开事务。
export function saveProgramFields(
  userId: string,
  programId: string,
  fields: ProgramEditFields,
  inTransaction = false,
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
  const now = Date.now();

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
    deadlineDate: validDeadlineDate ? validDeadlineDate.getTime() : null,
    deadlineStatus: validDeadlineDate
      ? validDeadlineDate.getTime() >= now
        ? "OPEN"
        : "EXPIRED"
      : parsed.deadlineStatus,
    introduction: fields.introduction || null,
    duration: fields.duration || null,
    accommodationText: fields.accommodationText || null,
    applicationTimeText: fields.applicationTimeText || null,
    scholarshipContent: fields.scholarshipContent || null,
    parsedJson: JSON.stringify(parsed),
    reviewStatus: "VERIFIED",
    manuallyVerified: 1,
  };

  const oldProgram = sqlite
    .prepare(`SELECT ${OLD_PROGRAM_COLUMNS} FROM programs WHERE id = ?`)
    .get(programId) as OldProgramRow | undefined;
  if (!oldProgram) throw new Error(`项目 ${fields.name} 不存在`);

  if (!inTransaction) sqlite.exec("BEGIN IMMEDIATE");
  try {
    sqlite
      .prepare(
        `UPDATE programs SET
           name = ?, program_type = ?, teaching_language = ?,
           major_text = ?, requirements_text = ?, tuition_text = ?,
           tuition_min = ?, tuition_max = ?, tuition_period = ?,
           first_year_cost_max = ?, cost_incomplete = ?, csca_status = ?,
           hsk_level_min = ?, hsk_score_min = ?, ielts_min = ?,
           toefl_min = ?, duolingo_min = ?, gpa_min = ?, gpa_scale = ?,
           min_age = ?, max_age = ?, deadline_date = ?, deadline_status = ?,
           introduction = ?, duration = ?, accommodation_text = ?,
           application_time_text = ?, scholarship_content = ?,
           parsed_json = ?, review_status = ?, manually_verified = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updates.name,
        updates.programType,
        updates.teachingLanguage,
        updates.majorText,
        updates.requirementsText,
        updates.tuitionText,
        updates.tuitionMin,
        updates.tuitionMax,
        updates.tuitionPeriod,
        updates.firstYearCostMax,
        updates.costIncomplete ? 1 : 0,
        updates.cscaStatus,
        updates.hskLevelMin,
        updates.hskScoreMin,
        updates.ieltsMin,
        updates.toeflMin,
        updates.duolingoMin,
        updates.gpaMin,
        updates.gpaScale,
        updates.minAge,
        updates.maxAge,
        updates.deadlineDate,
        updates.deadlineStatus,
        updates.introduction,
        updates.duration,
        updates.accommodationText,
        updates.applicationTimeText,
        updates.scholarshipContent,
        updates.parsedJson,
        updates.reviewStatus,
        updates.manuallyVerified,
        now,
        programId,
      );
    sqlite
      .prepare("DELETE FROM program_majors WHERE program_id = ?")
      .run(programId);
    const majorValues = splitMajors(fields.majorText ?? "").map((major) => ({
      name: major,
      normalizedName: normalizeKeyword(major),
    }));
    const insertMajor = sqlite.prepare(
      `INSERT INTO program_majors
       (id, program_id, name, normalized_name, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const major of majorValues) {
      insertMajor.run(newId(), programId, major.name, major.normalizedName, null, now);
    }
    writeAudit({
      userId,
      action: "PROGRAM_UPDATED",
      entityType: "PROGRAM",
      entityId: programId,
      details: {
        name: oldProgram.name,
        changed: changedFields(oldProgram, updates),
      },
    });
    if (!inTransaction) sqlite.exec("COMMIT");
  } catch (error) {
    if (!inTransaction) sqlite.exec("ROLLBACK");
    throw error;
  }
  invalidateMajorCatalog();
  return oldProgram.schoolId;
}

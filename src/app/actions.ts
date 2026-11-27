"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  APPLICATION_STATUSES,
  CONTRACT_STATUSES,
  RULE_STATUSES,
  type ApplicationStatus,
  type ContractStatus,
} from "@/lib/constants";
import { userHasPermission } from "@/lib/access-control";
import { writeAudit } from "@/lib/audit";
import { requirePermission, requireRole } from "@/lib/auth";
import {
  stripConfidentialSchoolUpdates,
} from "@/lib/permissions";
import { db, sqlite } from "@/lib/db";
import { withTransaction } from "@/lib/db/raw";
import {
  programs,
  programMajors,
  schools,
  users,
} from "@/lib/db/schema";
import { parseProgram, splitMajors } from "@/lib/program-parser";
import { invalidateMajorCatalog } from "@/lib/queries";
import { manualReviewState } from "@/lib/manual-verification";
import { asText, newId, normalizeKeyword, parseDateInput } from "@/lib/utils";

export async function addFollowUpAction(formData: FormData) {
  const user = await requirePermission("FOLLOW_UP_MANAGE");
  const customerId = asText(formData.get("customerId"));
  const content = asText(formData.get("content"));
  if (!customerId || !content) throw new Error("客户和沟通内容不能为空");
  const nextFollowUpAt = parseDateInput(formData.get("nextFollowUpAt"));
  const channel = asText(formData.get("channel")) || "其他";
  const id = newId();
  // 跟进记录、客户下次跟进时间与审计日志必须同生共死，避免只写入一半。
  withTransaction(sqlite, (db) => {
    db.prepare(
      `INSERT INTO follow_ups (id, customer_id, author_id, channel, content, next_follow_up_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, customerId, user.id, channel, content, nextFollowUpAt ? nextFollowUpAt.getTime() : null, Date.now());
    if (nextFollowUpAt) {
      db.prepare(`UPDATE customers SET next_follow_up_at = ?, updated_at = ? WHERE id = ?`)
        .run(nextFollowUpAt.getTime(), Date.now(), customerId);
    }
    writeAudit({
      userId: user.id,
      action: "FOLLOW_UP_ADDED",
      entityType: "CUSTOMER",
      entityId: customerId,
    }, db);
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function updateCustomerManagementAction(formData: FormData) {
  const user = await requirePermission("CUSTOMER_EDIT");
  const customerId = asText(formData.get("customerId"));
  const ownerId = asText(formData.get("ownerId"));
  const contractStatus = asText(formData.get("contractStatus")) as ContractStatus;
  if (!customerId || !ownerId || !CONTRACT_STATUSES.includes(contractStatus)) {
    throw new Error("负责老师和签约状态不能为空");
  }

  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, ownerId), eq(users.active, true)))
    .limit(1);
  if (!owner) throw new Error("负责老师账号不存在");

  withTransaction(sqlite, (db) => {
    db.prepare("UPDATE customers SET owner_id = ?, contract_status = ?, updated_at = ? WHERE id = ?")
      .run(ownerId, contractStatus, Date.now(), customerId);
    writeAudit({
      userId: user.id,
      action: "CUSTOMER_MANAGEMENT_UPDATED",
      entityType: "CUSTOMER",
      entityId: customerId,
      details: { ownerId, contractStatus },
    }, db);
  });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}
export async function archiveCustomerAction(formData: FormData) {
  const user = await requirePermission("CUSTOMER_EDIT");
  const customerId = asText(formData.get("customerId"));
  withTransaction(sqlite, (db) => {
    db.prepare("UPDATE customers SET archived = 1, updated_at = ? WHERE id = ?").run(Date.now(), customerId);
    writeAudit({
      userId: user.id,
      action: "CUSTOMER_ARCHIVED",
      entityType: "CUSTOMER",
      entityId: customerId,
    }, db);
  });
  redirect("/customers");
}

export async function createApplicationAction(formData: FormData) {
  const user = await requirePermission("APPLICATION_MANAGE");
  const customerId = asText(formData.get("customerId"));
  const programId = asText(formData.get("programId"));
  if (!customerId || !programId) throw new Error("客户和项目不能为空");
  const id = newId();
  const notes = asText(formData.get("notes")) || null;
  // 申请、初始状态事件与审计日志在同一事务内写入。
  withTransaction(sqlite, (db) => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO applications (id, customer_id, program_id, owner_id, status, notes, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(id, customerId, programId, user.id, "MATERIAL_PREPARATION", notes, now, now);
    db.prepare(
      `INSERT INTO application_events (id, application_id, from_status, to_status, reason, actor_id, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    ).run(newId(), id, "MATERIAL_PREPARATION", "创建申请", user.id, now);
    writeAudit({
      userId: user.id,
      action: "APPLICATION_CREATED",
      entityType: "APPLICATION",
      entityId: id,
    }, db);
  });
  redirect(`/applications/${id}`);
}

export async function updateApplicationStatusAction(formData: FormData) {
  const user = await requirePermission("APPLICATION_MANAGE");
  const applicationId = asText(formData.get("applicationId"));
  const toStatus = asText(formData.get("toStatus")) as ApplicationStatus;
  const reason = asText(formData.get("reason"));
  if (!APPLICATION_STATUSES.includes(toStatus) || !reason) {
    throw new Error("状态和调整原因不能为空");
  }
  // 读取旧状态、更新申请、写状态事件和审计必须原子完成，否则并发调整会丢事件。
  const customerId = withTransaction(sqlite, (db) => {
    const current = db.prepare("SELECT status, customer_id AS customerId FROM applications WHERE id = ?")
      .get(applicationId) as { status: string; customerId: string } | undefined;
    if (!current) throw new Error("申请不存在");
    const now = Date.now();
    db.prepare(
      `UPDATE applications SET status = ?, updated_at = ?,
        submitted_at = CASE WHEN ? = 'SUBMITTED' THEN ? ELSE submitted_at END,
        result_at = CASE WHEN ? IN ('ADMITTED', 'REJECTED') THEN ? ELSE result_at END
       WHERE id = ?`,
    ).run(toStatus, now, toStatus, now, toStatus, now, applicationId);
    db.prepare(
      `INSERT INTO application_events (id, application_id, from_status, to_status, reason, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), applicationId, current.status, toStatus, reason, user.id, now);
    writeAudit({
      userId: user.id,
      action: "APPLICATION_STATUS_CHANGED",
      entityType: "APPLICATION",
      entityId: applicationId,
      details: { from: current.status, to: toStatus, reason },
    }, db);
    return current.customerId;
  });
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
}

export async function toggleUserAction(formData: FormData) {
  const admin = await requireRole(["ADMIN"]);
  const userId = asText(formData.get("userId"));
  const active = formData.get("active") === "true";
  if (userId === admin.id && !active) throw new Error("不能停用当前管理员账号");
  const [target] = await db
    .select({ authProvider: users.authProvider })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (target?.authProvider === "WECOM") {
    throw new Error("企业微信账号请通过企业微信成员状态或部门权限管理");
  }
  withTransaction(sqlite, (db) => {
    db.prepare("UPDATE users SET active = ?, updated_at = ? WHERE id = ?").run(active ? 1 : 0, Date.now(), userId);
    writeAudit({
      userId: admin.id,
      action: active ? "USER_ENABLED" : "USER_DISABLED",
      entityType: "USER",
      entityId: userId,
    }, db);
  });
  revalidatePath("/admin/users");
}


function changedFields<T extends Record<string, unknown>>(
  oldValue: T | undefined,
  updates: Record<string, unknown>,
) {
  if (!oldValue) return Object.keys(updates).filter((key) => key !== "updatedAt");
  const changed: string[] = [];
  for (const [key, newVal] of Object.entries(updates)) {
    if (key === "updatedAt") continue;
    const oldVal = oldValue[key as keyof T];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changed.push(key);
    }
  }
  return changed;
}

function optionalFormText(formData: FormData, key: string) {
  return asText(formData.get(key)) || null;
}

function optionalFormNumber(formData: FormData, key: string) {
  const text = asText(formData.get(key));
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export async function updateSchoolAction(formData: FormData) {
  let schoolId: string | undefined;
  try {
    const user = await requirePermission("SCHOOL_EDIT_PUBLIC");
    const id = asText(formData.get("id"));
    if (!id) throw new Error("缺少学校ID");
    schoolId = id;

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

    const canVerify = user.role === "ADMIN" || user.role === "DATA_MANAGER";
    const updates: Record<string, unknown> = {
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
      ...(canVerify ? { reviewStatus: manualReviewState(formData, "schoolVerified").reviewStatus } : {}),
      updatedAt: new Date(),
    };
    const permittedUpdates = userHasPermission(user, "SCHOOL_EDIT_CONFIDENTIAL")
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
      await updateSingleProgram(user.id, formData, i, programId, id, canVerify);
    }
  } catch (e) {
    // redirect/notFound 错误让框架处理
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    const message = e instanceof Error ? e.message : "未知错误";
    console.error("updateSchoolAction error:", message, e);
    throw new Error(message);
  }

  if (schoolId) {
    revalidatePath(`/schools/${schoolId}`);
    revalidatePath("/schools");
    redirect(`/schools/${schoolId}`);
  }
}

async function updateSingleProgram(
  userId: string,
  formData: FormData,
  index: number,
  programId: string,
  expectedSchoolId: string,
  canVerify: boolean,
) {
  const name = asText(formData.get(`program_${index}_name`));
  const programType = asText(formData.get(`program_${index}_programType`));
  const teachingLanguage = asText(formData.get(`program_${index}_teachingLanguage`));
  if (!name || !programType || !teachingLanguage) {
    throw new Error(`项目 "${name || programId}"：项目名称、申请学历和授课语言不能为空`);
  }

  const majorText = asText(formData.get(`program_${index}_majorText`));
  const requirementsText = asText(formData.get(`program_${index}_requirementsText`));
  const applicationTimeText = asText(formData.get(`program_${index}_applicationTimeText`));
  const tuitionText = asText(formData.get(`program_${index}_tuitionText`));
  const deadlineDateText = asText(formData.get(`program_${index}_deadlineDate`));
  const firstYearCostMax = optionalFormNumber(formData, `program_${index}_firstYearCostMax`);
  const parsed = parseProgram({
    tuitionText,
    accommodationText: asText(formData.get(`program_${index}_accommodationText`)),
    insuranceText: asText(formData.get(`program_${index}_insuranceText`)),
    applicationFeeText: asText(formData.get(`program_${index}_applicationFeeText`)),
    requirementsText,
    applicationTimeText,
    majorText,
    programType,
  });
  const deadlineDate = deadlineDateText
    ? new Date(`${deadlineDateText}T23:59:59+08:00`)
    : parsed.deadlineDate;
  const validDeadlineDate = deadlineDate && Number.isFinite(deadlineDate.getTime())
    ? deadlineDate
    : null;

  const updates = {
    name,
    programType,
    teachingLanguage,
    majorText: majorText || null,
    requirementsText: requirementsText || null,
    tuitionText,
    tuitionMin: parsed.tuition.min,
    tuitionMax: parsed.tuition.max,
    tuitionPeriod: parsed.tuition.period,
    firstYearCostMax: firstYearCostMax ?? parsed.firstYearCostMax,
    costIncomplete: firstYearCostMax == null ? parsed.costIncomplete : false,
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
      ? validDeadlineDate.getTime() >= Date.now() ? "OPEN" : "EXPIRED"
      : parsed.deadlineStatus,
    introduction: optionalFormText(formData, `program_${index}_introduction`),
    duration: optionalFormText(formData, `program_${index}_duration`),
    applicationTimeText: applicationTimeText || null,
    scholarshipContent: optionalFormText(formData, `program_${index}_scholarshipContent`),
    parsedJson: JSON.stringify(parsed),
    ...(canVerify ? manualReviewState(formData, `program_${index}_verified`) : {}),
    updatedAt: new Date(),
  };

  const [oldProgram] = await db.select().from(programs).where(eq(programs.id, programId));
  if (!oldProgram || oldProgram.schoolId !== expectedSchoolId) {
    throw new Error(`项目 ${name} 不存在或不属于当前学校`);
  }
  await db.update(programs).set(updates).where(eq(programs.id, programId));
  await db.delete(programMajors).where(eq(programMajors.programId, programId));
  const majorValues = splitMajors(majorText).map((major) => ({
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
    details: { name: oldProgram.name, changed: changedFields(oldProgram, updates) },
  });
  invalidateMajorCatalog();
}

export async function updateProgramAction(formData: FormData) {
  const user = await requirePermission("SCHOOL_EDIT_PUBLIC");
  const id = asText(formData.get("id"));
  if (!id) throw new Error("缺少项目ID");

  const name = asText(formData.get("name"));
  const programType = asText(formData.get("programType"));
  const teachingLanguage = asText(formData.get("teachingLanguage"));
  if (!name || !programType || !teachingLanguage) {
    throw new Error("项目名称、申请学历和授课语言不能为空");
  }

  const tuitionText = asText(formData.get("tuitionText"));
  const majorText = asText(formData.get("majorText"));
  const requirementsText = asText(formData.get("requirementsText"));
  const applicationTimeText = asText(formData.get("applicationTimeText"));
  const deadlineDateText = asText(formData.get("deadlineDate"));
  const firstYearCostMax = optionalFormNumber(formData, "firstYearCostMax");
  const parsed = parseProgram({
    tuitionText,
    accommodationText: asText(formData.get("accommodationText")),
    insuranceText: asText(formData.get("insuranceText")),
    applicationFeeText: asText(formData.get("applicationFeeText")),
    requirementsText,
    applicationTimeText,
    majorText,
    programType,
  });
  const deadlineDate = deadlineDateText
    ? new Date(`${deadlineDateText}T23:59:59+08:00`)
    : parsed.deadlineDate;
  const validDeadlineDate = deadlineDate && Number.isFinite(deadlineDate.getTime())
    ? deadlineDate
    : null;

  const updates = {
    name,
    programType,
    teachingLanguage,
    majorText: majorText || null,
    requirementsText: requirementsText || null,
    tuitionText,
    tuitionMin: parsed.tuition.min,
    tuitionMax: parsed.tuition.max,
    tuitionPeriod: parsed.tuition.period,
    firstYearCostMax: firstYearCostMax ?? parsed.firstYearCostMax,
    costIncomplete: firstYearCostMax == null ? parsed.costIncomplete : false,
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
      ? validDeadlineDate.getTime() >= Date.now() ? "OPEN" : "EXPIRED"
      : parsed.deadlineStatus,
    introduction: optionalFormText(formData, "introduction"),
    duration: optionalFormText(formData, "duration"),
    applicationTimeText: applicationTimeText || null,
    scholarshipContent: optionalFormText(formData, "scholarshipContent"),
    parsedJson: JSON.stringify(parsed),
    ...(user.role === "ADMIN" || user.role === "DATA_MANAGER"
      ? manualReviewState(formData, "verified")
      : {}),
    updatedAt: new Date(),
  };

  const [oldProgram] = await db.select().from(programs).where(eq(programs.id, id));
  if (!oldProgram) throw new Error("项目不存在");
  await db.update(programs).set(updates).where(eq(programs.id, id));
  await db.delete(programMajors).where(eq(programMajors.programId, id));
  const majorValues = splitMajors(majorText).map((major) => ({
    id: newId(),
    programId: id,
    name: major,
    normalizedName: normalizeKeyword(major),
    category: null,
  }));
  if (majorValues.length) {
    await db.insert(programMajors).values(majorValues);
  }
  await writeAudit({
    userId: user.id,
    action: "PROGRAM_UPDATED",
    entityType: "PROGRAM",
    entityId: id,
    details: { name: oldProgram.name, changed: changedFields(oldProgram, updates) },
  });
  invalidateMajorCatalog();
  revalidatePath(`/schools/${oldProgram.schoolId}`);
}

export async function setProgramVerificationAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "DATA_MANAGER"]);
  const programId = asText(formData.get("programId"));
  const manuallyVerified = formData.get("verified") === "true";
  if (!programId) throw new Error("缺少项目ID");
  const [program] = await db
    .select({
      schoolId: programs.schoolId,
      name: programs.name,
      manuallyVerified: programs.manuallyVerified,
    })
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.archived, false)))
    .limit(1);
  if (!program) throw new Error("项目不存在或已归档");
  await db
    .update(programs)
    .set({
      manuallyVerified,
      reviewStatus: manuallyVerified ? "VERIFIED" : "NEEDS_REVIEW",
      updatedAt: new Date(),
    })
    .where(eq(programs.id, programId));
  await writeAudit({
    userId: user.id,
    action: "PROGRAM_VERIFICATION_CHANGED",
    entityType: "PROGRAM",
    entityId: programId,
    details: {
      name: program.name,
      from: program.manuallyVerified,
      to: manuallyVerified,
    },
  });
  revalidatePath(`/schools/${program.schoolId}`);
  revalidatePath("/schools");
  revalidatePath("/ai-screening");
}

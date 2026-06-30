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
  USER_ROLES,
} from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { destroySession, requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  applications,
  applicationEvents,
  customers,
  followUps,
  programs,
  programMajors,
  schools,
  recommendationItems,
  recommendations,
  users,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { parseProgram, splitMajors } from "@/lib/program-parser";
import { asText, newId, normalizeKeyword, parseDateInput } from "@/lib/utils";

export async function logoutAction() {
  const user = await requireUser();
  await writeAudit({
    userId: user.id,
    action: "LOGOUT",
    entityType: "USER",
    entityId: user.id,
  });
  await destroySession();
  redirect("/login");
}

export async function addFollowUpAction(formData: FormData) {
  const user = await requireUser();
  const customerId = asText(formData.get("customerId"));
  const content = asText(formData.get("content"));
  if (!customerId || !content) throw new Error("客户和沟通内容不能为空");
  const nextFollowUpAt = parseDateInput(formData.get("nextFollowUpAt"));
  const id = newId();
  await db.insert(followUps).values({
    id,
    customerId,
    authorId: user.id,
    channel: asText(formData.get("channel")) || "其他",
    content,
    nextFollowUpAt,
  });
  if (nextFollowUpAt) {
    await db
      .update(customers)
      .set({ nextFollowUpAt, updatedAt: new Date() })
      .where(eq(customers.id, customerId));
  }
  await writeAudit({
    userId: user.id,
    action: "FOLLOW_UP_ADDED",
    entityType: "CUSTOMER",
    entityId: customerId,
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function updateCustomerManagementAction(formData: FormData) {
  const user = await requireUser();
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

  await db
    .update(customers)
    .set({ ownerId, contractStatus, updatedAt: new Date() })
    .where(eq(customers.id, customerId));
  await writeAudit({
    userId: user.id,
    action: "CUSTOMER_MANAGEMENT_UPDATED",
    entityType: "CUSTOMER",
    entityId: customerId,
    details: { ownerId, contractStatus },
  });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}
export async function archiveCustomerAction(formData: FormData) {
  const user = await requireUser();
  const customerId = asText(formData.get("customerId"));
  await db
    .update(customers)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(customers.id, customerId));
  await writeAudit({
    userId: user.id,
    action: "CUSTOMER_ARCHIVED",
    entityType: "CUSTOMER",
    entityId: customerId,
  });
  redirect("/customers");
}

export async function createApplicationAction(formData: FormData) {
  const user = await requireUser();
  const customerId = asText(formData.get("customerId"));
  const programId = asText(formData.get("programId"));
  if (!customerId || !programId) throw new Error("客户和项目不能为空");
  const id = newId();
  await db.insert(applications).values({
    id,
    customerId,
    programId,
    ownerId: user.id,
    status: "MATERIAL_PREPARATION",
    notes: asText(formData.get("notes")) || null,
  });
  await db.insert(applicationEvents).values({
    id: newId(),
    applicationId: id,
    fromStatus: null,
    toStatus: "MATERIAL_PREPARATION",
    reason: "创建申请",
    actorId: user.id,
  });
  await writeAudit({
    userId: user.id,
    action: "APPLICATION_CREATED",
    entityType: "APPLICATION",
    entityId: id,
  });
  redirect(`/applications/${id}`);
}

export async function updateApplicationStatusAction(formData: FormData) {
  const user = await requireUser();
  const applicationId = asText(formData.get("applicationId"));
  const toStatus = asText(formData.get("toStatus")) as ApplicationStatus;
  const reason = asText(formData.get("reason"));
  if (!APPLICATION_STATUSES.includes(toStatus) || !reason) {
    throw new Error("状态和调整原因不能为空");
  }
  const [current] = await db
    .select({ status: applications.status, customerId: applications.customerId })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!current) throw new Error("申请不存在");
  await db
    .update(applications)
    .set({
      status: toStatus,
      updatedAt: new Date(),
      submittedAt: toStatus === "SUBMITTED" ? new Date() : undefined,
      resultAt:
        toStatus === "ADMITTED" || toStatus === "REJECTED"
          ? new Date()
          : undefined,
    })
    .where(eq(applications.id, applicationId));
  await db.insert(applicationEvents).values({
    id: newId(),
    applicationId,
    fromStatus: current.status,
    toStatus,
    reason,
    actorId: user.id,
  });
  await writeAudit({
    userId: user.id,
    action: "APPLICATION_STATUS_CHANGED",
    entityType: "APPLICATION",
    entityId: applicationId,
    details: { from: current.status, to: toStatus, reason },
  });
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
  revalidatePath("/customers");
  revalidatePath(`/customers/${current.customerId}`);
}

export async function createUserAction(formData: FormData) {
  const admin = await requireRole(["ADMIN"]);
  const username = asText(formData.get("username")).toLowerCase();
  const displayName = asText(formData.get("displayName"));
  const password = asText(formData.get("password"));
  const role = asText(formData.get("role"));
  if (!username || !displayName || !USER_ROLES.includes(role as never)) {
    throw new Error("账号信息不完整");
  }
  const id = newId();
  await db.insert(users).values({
    id,
    username,
    displayName,
    passwordHash: await hashPassword(password),
    role: role as (typeof USER_ROLES)[number],
  });
  await writeAudit({
    userId: admin.id,
    action: "USER_CREATED",
    entityType: "USER",
    entityId: id,
    details: { username, role },
  });
  revalidatePath("/admin/users");
}

export async function toggleUserAction(formData: FormData) {
  const admin = await requireRole(["ADMIN"]);
  const userId = asText(formData.get("userId"));
  const active = formData.get("active") === "true";
  if (userId === admin.id && !active) throw new Error("不能停用当前管理员账号");
  await db
    .update(users)
    .set({ active, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await writeAudit({
    userId: admin.id,
    action: active ? "USER_ENABLED" : "USER_DISABLED",
    entityType: "USER",
    entityId: userId,
  });
  revalidatePath("/admin/users");
}

export async function verifyProgramAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "DATA_MANAGER"]);
  const programId = asText(formData.get("programId"));
  await db
    .update(programs)
    .set({
      reviewStatus: "VERIFIED",
      manuallyVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(programs.id, programId));
  await writeAudit({
    userId: user.id,
    action: "PROGRAM_VERIFIED",
    entityType: "PROGRAM",
    entityId: programId,
  });
  revalidatePath("/programs");
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
  const user = await requireRole(["ADMIN", "DATA_MANAGER"]);
  const id = asText(formData.get("id"));
  if (!id) throw new Error("缺少学校ID");

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
    province: optionalFormText(formData, "province"),
    city: optionalFormText(formData, "city"),
    website: optionalFormText(formData, "website"),
    partnershipRating,
    cscaStatus: cscaStatus as (typeof RULE_STATUSES)[number],
    qsRanking: optionalFormNumber(formData, "qsRanking"),
    description: optionalFormText(formData, "description"),
    tags: optionalFormText(formData, "tags"),
    reviewStatus: "VERIFIED" as const,
    updatedAt: new Date(),
  };

  const [oldSchool] = await db.select().from(schools).where(eq(schools.id, id));
  if (!oldSchool) throw new Error("学校不存在");
  await db.update(schools).set(updates).where(eq(schools.id, id));
  await writeAudit({
    userId: user.id,
    action: "SCHOOL_UPDATED",
    entityType: "SCHOOL",
    entityId: id,
    details: { changed: changedFields(oldSchool, updates) },
  });
  revalidatePath(`/schools/${id}`);
  revalidatePath("/schools");
  redirect(`/schools/${id}`);
}

export async function updateProgramAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "DATA_MANAGER"]);
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
    reviewStatus: "VERIFIED" as const,
    manuallyVerified: true,
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
    details: { changed: changedFields(oldProgram, updates) },
  });
  revalidatePath(`/schools/${oldProgram.schoolId}`);
  revalidatePath("/programs");
}
export async function saveRecommendationAction(formData: FormData) {
  const user = await requireUser();
  const customerId = asText(formData.get("customerId"));
  const title = asText(formData.get("title"));
  const criteriaJson = asText(formData.get("criteriaJson"));
  const selectedIds = formData.getAll("programIds").map(asText).filter(Boolean);
  if (!customerId || !title || !selectedIds.length) {
    throw new Error("客户、方案名称和项目不能为空");
  }
  const id = newId();
  await db.insert(recommendations).values({
    id,
    customerId,
    createdBy: user.id,
    title,
    criteriaJson,
    notes: asText(formData.get("notes")) || null,
  });
  const selectedPrograms = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.archived, false));
  const valid = new Set(selectedPrograms.map((item) => item.id));
  await db.insert(recommendationItems).values(
    selectedIds
      .filter((programId) => valid.has(programId))
      .map((programId, index) => ({
        id: newId(),
        recommendationId: id,
        programId,
        rank: index + 1,
        fitLevel: asText(formData.get(`fit_${programId}`)) || "UNKNOWN",
        reason: asText(formData.get(`reason_${programId}`)) || null,
        evidenceJson: asText(formData.get(`evidence_${programId}`)) || "[]",
      })),
  );
  await writeAudit({
    userId: user.id,
    action: "RECOMMENDATION_SAVED",
    entityType: "RECOMMENDATION",
    entityId: id,
    details: { customerId, itemCount: selectedIds.length },
  });
  redirect(`/recommendations/${id}/print`);
}

import {
  and,
  asc,
  count,
  desc,
  eq,
  like,
  lte,
  or,
} from "drizzle-orm";

import { db } from "@/lib/db";
import {
  applications,
  applicationEvents,
  auditLogs,
  customers,
  documents,
  followUps,
  importBatches,
  programs,
  recommendationItems,
  recommendations,
  schools,
  users,
} from "@/lib/db/schema";

export async function getDashboardData() {
  const today = new Date();
  const thirtyDays = new Date(today.getTime() + 30 * 86400000);
  const [schoolCount] = await db.select({ value: count() }).from(schools).where(eq(schools.archived, false));
  const [programCount] = await db.select({ value: count() }).from(programs).where(eq(programs.archived, false));
  const [customerCount] = await db.select({ value: count() }).from(customers).where(eq(customers.archived, false));
  const [reviewCount] = await db
    .select({ value: count() })
    .from(programs)
    .where(eq(programs.reviewStatus, "NEEDS_REVIEW"));
  const dueCustomers = await db
    .select({
      id: customers.id,
      customerNo: customers.customerNo,
      name: customers.name,
      nextFollowUpAt: customers.nextFollowUpAt,
    })
    .from(customers)
    .where(
      and(
        eq(customers.archived, false),
        lte(customers.nextFollowUpAt, new Date(today.getTime() + 7 * 86400000)),
      ),
    )
    .orderBy(asc(customers.nextFollowUpAt))
    .limit(8);
  const deadlines = await db
    .select({
      id: programs.id,
      name: programs.name,
      deadlineDate: programs.deadlineDate,
      schoolName: schools.nameZh,
    })
    .from(programs)
    .innerJoin(schools, eq(schools.id, programs.schoolId))
    .where(
      and(
        eq(programs.deadlineStatus, "OPEN"),
        lte(programs.deadlineDate, thirtyDays),
      ),
    )
    .orderBy(asc(programs.deadlineDate))
    .limit(8);
  const supplementApplications = await db
    .select({
      id: applications.id,
      customerName: customers.name,
      programName: programs.name,
    })
    .from(applications)
    .innerJoin(customers, eq(customers.id, applications.customerId))
    .innerJoin(programs, eq(programs.id, applications.programId))
    .where(
      and(
        eq(applications.status, "SUPPLEMENT_REQUIRED"),
        eq(applications.archived, false),
      ),
    )
    .limit(8);
  const recentAudit = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      createdAt: auditLogs.createdAt,
      displayName: users.displayName,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  return {
    counts: {
      schools: schoolCount.value,
      programs: programCount.value,
      customers: customerCount.value,
      needsReview: reviewCount.value,
    },
    dueCustomers,
    deadlines,
    supplementApplications,
    recentAudit,
  };
}

export async function listSchools(query = "") {
  return db
    .select({
      id: schools.id,
      nameZh: schools.nameZh,
      province: schools.province,
      city: schools.city,
      qsRanking: schools.qsRanking,
      partnershipRating: schools.partnershipRating,
      cscaStatus: schools.cscaStatus,
      reviewStatus: schools.reviewStatus,
      programCount: count(programs.id),
    })
    .from(schools)
    .leftJoin(
      programs,
      and(eq(programs.schoolId, schools.id), eq(programs.archived, false)),
    )
    .where(
      and(
        eq(schools.archived, false),
        query
          ? or(
              like(schools.nameZh, `%${query}%`),
              like(schools.province, `%${query}%`),
              like(schools.city, `%${query}%`),
            )
          : undefined,
      ),
    )
    .groupBy(schools.id)
    .orderBy(desc(schools.partnershipRating), asc(schools.nameZh));
}

export async function listPrograms(filters: {
  query?: string;
  programType?: string;
  language?: string;
  reviewStatus?: string;
}) {
  return db
    .select({
      id: programs.id,
      name: programs.name,
      schoolName: schools.nameZh,
      programType: programs.programType,
      teachingLanguage: programs.teachingLanguage,
      tuitionText: programs.tuitionText,
      firstYearCostMax: programs.firstYearCostMax,
      cscaStatus: programs.cscaStatus,
      deadlineDate: programs.deadlineDate,
      deadlineStatus: programs.deadlineStatus,
      majorText: programs.majorText,
      reviewStatus: programs.reviewStatus,
    })
    .from(programs)
    .innerJoin(schools, eq(schools.id, programs.schoolId))
    .where(
      and(
        eq(programs.archived, false),
        filters.programType ? eq(programs.programType, filters.programType) : undefined,
        filters.language
          ? eq(programs.teachingLanguage, filters.language)
          : undefined,
        filters.reviewStatus
          ? eq(programs.reviewStatus, filters.reviewStatus as "AUTO_PARSED" | "VERIFIED" | "NEEDS_REVIEW")
          : undefined,
        filters.query
          ? or(
              like(schools.nameZh, `%${filters.query}%`),
              like(programs.majorText, `%${filters.query}%`),
              like(programs.introduction, `%${filters.query}%`),
            )
          : undefined,
      ),
    )
    .orderBy(
      asc(programs.deadlineStatus),
      desc(schools.partnershipRating),
      asc(schools.nameZh),
    )
    .limit(300);
}

export async function getProgramsForScreening() {
  return db
    .select({
      id: programs.id,
      schoolId: schools.id,
      schoolName: schools.nameZh,
      programName: programs.name,
      programType: programs.programType,
      teachingLanguage: programs.teachingLanguage,
      majorText: programs.majorText,
      requirementsText: programs.requirementsText,
      semesterText: programs.semesterText,
      applicationTimeText: programs.applicationTimeText,
      accommodationText: programs.accommodationText,
      firstYearCostMax: programs.firstYearCostMax,
      costIncomplete: programs.costIncomplete,
      cscaStatus: programs.cscaStatus,
      gpaMin: programs.gpaMin,
      gpaScale: programs.gpaScale,
      hskLevelMin: programs.hskLevelMin,
      hskScoreMin: programs.hskScoreMin,
      ieltsMin: programs.ieltsMin,
      toeflMin: programs.toeflMin,
      duolingoMin: programs.duolingoMin,
      minAge: programs.minAge,
      maxAge: programs.maxAge,
      deadlineDate: programs.deadlineDate,
      deadlineStatus: programs.deadlineStatus,
      scholarshipCategory: programs.scholarshipCategory,
      province: schools.province,
      city: schools.city,
      partnershipRating: schools.partnershipRating,
      qsRanking: schools.qsRanking,
      reviewStatus: programs.reviewStatus,
    })
    .from(programs)
    .innerJoin(schools, eq(schools.id, programs.schoolId))
    .where(eq(programs.archived, false));
}

export async function getSchoolDetails(id: string) {
  const [school] = await db
    .select()
    .from(schools)
    .where(and(eq(schools.id, id), eq(schools.archived, false)))
    .limit(1);
  if (!school) return null;

  const schoolPrograms = await db
    .select({
      id: programs.id,
      name: programs.name,
      programType: programs.programType,
      teachingLanguage: programs.teachingLanguage,
      majorText: programs.majorText,
      requirementsText: programs.requirementsText,
      tuitionText: programs.tuitionText,
      firstYearCostMax: programs.firstYearCostMax,
      costIncomplete: programs.costIncomplete,
      deadlineDate: programs.deadlineDate,
      deadlineStatus: programs.deadlineStatus,
      scholarshipCategory: programs.scholarshipCategory,
      scholarshipContent: programs.scholarshipContent,
      accommodationText: programs.accommodationText,
      applicationTimeText: programs.applicationTimeText,
      reviewStatus: programs.reviewStatus,
    })
    .from(programs)
    .where(and(eq(programs.schoolId, id), eq(programs.archived, false)))
    .orderBy(asc(programs.programType), asc(programs.teachingLanguage));

  return { school, programs: schoolPrograms };
}
export async function listCustomers(query = "") {
  return db
    .select({
      id: customers.id,
      customerNo: customers.customerNo,
      name: customers.name,
      nationality: customers.nationality,
      targetDegree: customers.targetDegree,
      targetMajor: customers.targetMajor,
      ownerName: users.displayName,
      nextFollowUpAt: customers.nextFollowUpAt,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.ownerId))
    .where(
      and(
        eq(customers.archived, false),
        query
          ? or(
              like(customers.name, `%${query}%`),
              like(customers.customerNo, `%${query}%`),
              like(customers.phone, `%${query}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(customers.updatedAt));
}

export async function getCustomer(id: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!customer) return null;
  const [followUpRows, applicationRows, documentRows, recommendationRows] =
    await Promise.all([
      db
        .select({
          id: followUps.id,
          channel: followUps.channel,
          content: followUps.content,
          nextFollowUpAt: followUps.nextFollowUpAt,
          createdAt: followUps.createdAt,
          authorName: users.displayName,
        })
        .from(followUps)
        .innerJoin(users, eq(users.id, followUps.authorId))
        .where(eq(followUps.customerId, id))
        .orderBy(desc(followUps.createdAt)),
      db
        .select({
          id: applications.id,
          status: applications.status,
          notes: applications.notes,
          updatedAt: applications.updatedAt,
          programName: programs.name,
          schoolName: schools.nameZh,
        })
        .from(applications)
        .innerJoin(programs, eq(programs.id, applications.programId))
        .innerJoin(schools, eq(schools.id, programs.schoolId))
        .where(
          and(eq(applications.customerId, id), eq(applications.archived, false)),
        )
        .orderBy(desc(applications.updatedAt)),
      db
        .select()
        .from(documents)
        .where(
          and(eq(documents.customerId, id), eq(documents.archived, false)),
        )
        .orderBy(desc(documents.createdAt)),
      db
        .select({
          id: recommendations.id,
          title: recommendations.title,
          notes: recommendations.notes,
          createdAt: recommendations.createdAt,
          itemCount: count(recommendationItems.id),
        })
        .from(recommendations)
        .leftJoin(
          recommendationItems,
          eq(recommendationItems.recommendationId, recommendations.id),
        )
        .where(eq(recommendations.customerId, id))
        .groupBy(recommendations.id)
        .orderBy(desc(recommendations.createdAt)),
    ]);
  return {
    customer,
    followUps: followUpRows,
    applications: applicationRows,
    documents: documentRows,
    recommendations: recommendationRows,
  };
}

export async function listApplications(status = "") {
  return db
    .select({
      id: applications.id,
      status: applications.status,
      customerId: customers.id,
      customerNo: customers.customerNo,
      customerName: customers.name,
      programName: programs.name,
      schoolName: schools.nameZh,
      updatedAt: applications.updatedAt,
      ownerName: users.displayName,
    })
    .from(applications)
    .innerJoin(customers, eq(customers.id, applications.customerId))
    .innerJoin(programs, eq(programs.id, applications.programId))
    .innerJoin(schools, eq(schools.id, programs.schoolId))
    .leftJoin(users, eq(users.id, applications.ownerId))
    .where(
      and(
        eq(applications.archived, false),
        status ? eq(applications.status, status) : undefined,
      ),
    )
    .orderBy(desc(applications.updatedAt));
}

export async function getApplication(id: string) {
  const [application] = await db
    .select({
      id: applications.id,
      status: applications.status,
      notes: applications.notes,
      customerId: customers.id,
      customerName: customers.name,
      customerNo: customers.customerNo,
      programName: programs.name,
      schoolName: schools.nameZh,
      requirementsText: programs.requirementsText,
      deadlineDate: programs.deadlineDate,
    })
    .from(applications)
    .innerJoin(customers, eq(customers.id, applications.customerId))
    .innerJoin(programs, eq(programs.id, applications.programId))
    .innerJoin(schools, eq(schools.id, programs.schoolId))
    .where(eq(applications.id, id))
    .limit(1);
  if (!application) return null;
  const events = await db
    .select({
      id: applicationEvents.id,
      fromStatus: applicationEvents.fromStatus,
      toStatus: applicationEvents.toStatus,
      reason: applicationEvents.reason,
      createdAt: applicationEvents.createdAt,
      actorName: users.displayName,
    })
    .from(applicationEvents)
    .innerJoin(users, eq(users.id, applicationEvents.actorId))
    .where(eq(applicationEvents.applicationId, id))
    .orderBy(desc(applicationEvents.createdAt));
  return { application, events };
}

export async function listUsers() {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      active: users.active,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(asc(users.displayName));
}

export async function listImports() {
  return db
    .select()
    .from(importBatches)
    .orderBy(desc(importBatches.createdAt))
    .limit(30);
}

export async function listAuditLogs() {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      detailsJson: auditLogs.detailsJson,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      displayName: users.displayName,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);
}

export async function listCustomerOptions() {
  return db
    .select({ id: customers.id, name: customers.name, customerNo: customers.customerNo })
    .from(customers)
    .where(eq(customers.archived, false))
    .orderBy(asc(customers.name));
}





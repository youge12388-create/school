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

import { db, sqlite } from "@/lib/db";
import { deriveAdmissionStatus } from "@/lib/customer-status";
import type { AdmissionStatus, ContractStatus } from "@/lib/constants";
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
  const rows = sqlite
    .prepare(
      `SELECT
        p.id AS id,
        s.id AS schoolId,
        s.name_zh AS schoolName,
        p.name AS programName,
        p.program_type AS programType,
        p.teaching_language AS teachingLanguage,
        p.major_text AS majorText,
        p.requirements_text AS requirementsText,
        TRIM(
          COALESCE(p.requirements_text, '') || ' ' ||
          COALESCE(p.introduction, '') || ' ' ||
          COALESCE(p.direction_text, '') || ' ' ||
          COALESCE(p.scholarship_content, '') || ' ' ||
          COALESCE(p.scholarship_note, '') || ' ' ||
          COALESCE(p.fee_note, '') || ' ' ||
          COALESCE(p.raw_json, '')
        ) AS sourceText,
        p.semester_text AS semesterText,
        p.application_time_text AS applicationTimeText,
        p.accommodation_text AS accommodationText,
        p.first_year_cost_max AS firstYearCostMax,
        p.cost_incomplete AS costIncomplete,
        p.csca_status AS cscaStatus,
        p.gpa_min AS gpaMin,
        p.gpa_scale AS gpaScale,
        p.hsk_level_min AS hskLevelMin,
        p.hsk_score_min AS hskScoreMin,
        p.ielts_min AS ieltsMin,
        p.toefl_min AS toeflMin,
        p.duolingo_min AS duolingoMin,
        p.min_age AS minAge,
        p.max_age AS maxAge,
        p.deadline_date AS deadlineDate,
        p.deadline_status AS deadlineStatus,
        p.scholarship_category AS scholarshipCategory,
        s.province AS province,
        s.city AS city,
        s.partnership_rating AS partnershipRating,
        s.qs_ranking AS qsRanking,
        p.review_status AS reviewStatus
      FROM programs p
      INNER JOIN schools s ON s.id = p.school_id
      WHERE p.archived = 0 AND s.archived = 0`,
    )
    .all() as Array<{
      id: string;
      schoolId: string;
      schoolName: string;
      programName: string;
      programType: string;
      teachingLanguage: string;
      majorText: string | null;
      requirementsText: string | null;
      sourceText: string | null;
      semesterText: string | null;
      applicationTimeText: string | null;
      accommodationText: string | null;
      firstYearCostMax: number | null;
      costIncomplete: number;
      cscaStatus: "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN";
      gpaMin: number | null;
      gpaScale: number | null;
      hskLevelMin: number | null;
      hskScoreMin: number | null;
      ieltsMin: number | null;
      toeflMin: number | null;
      duolingoMin: number | null;
      minAge: number | null;
      maxAge: number | null;
      deadlineDate: number | null;
      deadlineStatus: string;
      scholarshipCategory: string | null;
      province: string | null;
      city: string | null;
      partnershipRating: number;
      qsRanking: number | null;
      reviewStatus: string;
    }>;

  return rows.map((row) => ({
    ...row,
    costIncomplete: Boolean(row.costIncomplete),
    deadlineDate:
      row.deadlineDate == null || !Number.isFinite(row.deadlineDate)
        ? null
        : new Date(row.deadlineDate),
  }));
}
export async function getSchoolDetails(id: string) {
  const [school] = await db
    .select()
    .from(schools)
    .where(and(eq(schools.id, id), eq(schools.archived, false)))
    .limit(1);
  if (!school) return null;

  const schoolPrograms = await db
    .select()
    .from(programs)
    .where(and(eq(programs.schoolId, id), eq(programs.archived, false)))
    .orderBy(asc(programs.programType), asc(programs.teachingLanguage));
  return { school, programs: schoolPrograms };
}
export type CustomerListFilters = {
  query?: string;
  ownerId?: string;
  contractStatus?: ContractStatus | "";
  admissionStatus?: AdmissionStatus | "";
};

export async function listCustomers(filters: CustomerListFilters = {}) {
  const where = ["c.archived = 0"];
  const params: string[] = [];

  if (filters.query) {
    where.push("(c.name LIKE ? OR c.customer_no LIKE ? OR c.phone LIKE ?)");
    const query = `%${filters.query}%`;
    params.push(query, query, query);
  }
  if (filters.ownerId) {
    where.push("c.owner_id = ?");
    params.push(filters.ownerId);
  }
  if (filters.contractStatus) {
    where.push("c.contract_status = ?");
    params.push(filters.contractStatus);
  }

  const admitted = `EXISTS (
    SELECT 1 FROM applications admission
    WHERE admission.customer_id = c.id
      AND admission.archived = 0
      AND admission.status IN ('ADMITTED', 'VISA_PROCESSING', 'ENROLLED')
  )`;
  const inProgress = `EXISTS (
    SELECT 1 FROM applications active_application
    WHERE active_application.customer_id = c.id
      AND active_application.archived = 0
      AND active_application.status IN (
        'MATERIAL_PREPARATION', 'SUBMITTED', 'UNDER_REVIEW', 'SUPPLEMENT_REQUIRED'
      )
  )`;
  const rejected = `EXISTS (
    SELECT 1 FROM applications rejected_application
    WHERE rejected_application.customer_id = c.id
      AND rejected_application.archived = 0
      AND rejected_application.status = 'REJECTED'
  )`;
  const closed = `EXISTS (
    SELECT 1 FROM applications closed_application
    WHERE closed_application.customer_id = c.id
      AND closed_application.archived = 0
      AND closed_application.status = 'CLOSED'
  )`;

  if (filters.admissionStatus === "NO_APPLICATION") {
    where.push(`NOT EXISTS (
      SELECT 1 FROM applications application
      WHERE application.customer_id = c.id AND application.archived = 0
    )`);
  } else if (filters.admissionStatus === "ADMITTED") {
    where.push(admitted);
  } else if (filters.admissionStatus === "IN_PROGRESS") {
    where.push(`NOT ${admitted} AND ${inProgress}`);
  } else if (filters.admissionStatus === "REJECTED") {
    where.push(`NOT ${admitted} AND NOT ${inProgress} AND ${rejected}`);
  } else if (filters.admissionStatus === "CLOSED") {
    where.push(
      `NOT ${admitted} AND NOT ${inProgress} AND NOT ${rejected} AND ${closed}`,
    );
  }

  const rows = sqlite.prepare(`SELECT
      c.id AS id,
      c.customer_no AS customerNo,
      c.name AS name,
      c.nationality AS nationality,
      c.target_degree AS targetDegree,
      c.target_major AS targetMajor,
      c.owner_id AS ownerId,
      u.display_name AS ownerName,
      c.contract_status AS contractStatus,
      c.next_follow_up_at AS nextFollowUpAt,
      c.created_at AS createdAt,
      (
        SELECT follow_up.content
        FROM follow_ups follow_up
        WHERE follow_up.customer_id = c.id
        ORDER BY follow_up.created_at DESC
        LIMIT 1
      ) AS latestFollowUpContent,
      (
        SELECT follow_up.channel
        FROM follow_ups follow_up
        WHERE follow_up.customer_id = c.id
        ORDER BY follow_up.created_at DESC
        LIMIT 1
      ) AS latestFollowUpChannel,
      (
        SELECT follow_up.created_at
        FROM follow_ups follow_up
        WHERE follow_up.customer_id = c.id
        ORDER BY follow_up.created_at DESC
        LIMIT 1
      ) AS latestFollowUpAt,
      (
        SELECT GROUP_CONCAT(application.status, '|')
        FROM applications application
        WHERE application.customer_id = c.id AND application.archived = 0
      ) AS applicationStatuses
    FROM customers c
    LEFT JOIN users u ON u.id = c.owner_id
    WHERE ${where.join(" AND ")}
    ORDER BY c.updated_at DESC`).all(...params) as Array<{
      id: string;
      customerNo: string;
      name: string;
      nationality: string | null;
      targetDegree: string | null;
      targetMajor: string | null;
      ownerId: string | null;
      ownerName: string | null;
      contractStatus: ContractStatus;
      nextFollowUpAt: number | null;
      createdAt: number;
      latestFollowUpContent: string | null;
      latestFollowUpChannel: string | null;
      latestFollowUpAt: number | null;
      applicationStatuses: string | null;
    }>;

  return rows.map(({ applicationStatuses, ...row }) => ({
    ...row,
    admissionStatus: deriveAdmissionStatus(
      applicationStatuses?.split("|").filter(Boolean) ?? [],
    ),
  }));
}

export function listCustomerOwners() {
  return sqlite
    .prepare(`SELECT id, display_name AS displayName
      FROM users
      WHERE active = 1
      ORDER BY display_name ASC`)
    .all() as Array<{ id: string; displayName: string }>;
}
export async function getCustomer(id: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!customer) return null;
  const [owner] = customer.ownerId
    ? await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, customer.ownerId))
        .limit(1)
    : [];
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
    customer: { ...customer, ownerName: owner?.displayName ?? null },
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

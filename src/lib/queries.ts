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
import { categorizeMajors, splitMajorText } from "@/lib/major-categories";
import { parseCscaStatus, parseDeadline } from "@/lib/program-parser";
import type { AdmissionStatus, ContractStatus } from "@/lib/constants";
import type {
  SchoolUpdateAttachment,
  SchoolUpdateRow,
} from "@/lib/school-updates";
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
  const schoolCountRow = sqlite.prepare(`SELECT COUNT(*) as cnt FROM schools WHERE archived = 0`).get() as { cnt: number };
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
      schools: schoolCountRow.cnt,
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

const SCHOOL_PAGE_SIZE = 20;

export async function listSchools(query = "", page = 1, pageSize = SCHOOL_PAGE_SIZE) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const whereClause = query
    ? `AND (s.name_zh LIKE ? OR s.province LIKE ? OR s.city LIKE ?)`
    : "";
  const params = query
    ? [`%${query}%`, `%${query}%`, `%${query}%`, String(pageSize), String(offset)]
    : [String(pageSize), String(offset)];

  const rows = sqlite.prepare(`SELECT
      s.id AS id,
      s.name_zh AS nameZh,
      s.province AS province,
      s.city AS city,
      s.info_note AS infoNote,
      s.qs_ranking AS qsRanking,
      s.partnership_rating AS partnershipRating,
      s.csca_status AS cscaStatus,
      s.review_status AS reviewStatus,
      COUNT(p.id) AS programCount
    FROM schools s
    LEFT JOIN programs p ON p.school_id = s.id AND p.archived = 0
    WHERE s.archived = 0 ${whereClause}
    GROUP BY s.id
    ORDER BY s.partnership_rating DESC, s.name_zh ASC
    LIMIT ? OFFSET ?`).all(...params) as Array<{
      id: string;
      nameZh: string;
      province: string | null;
      city: string | null;
      infoNote: string | null;
      qsRanking: number | null;
      partnershipRating: string | null;
      cscaStatus: string;
      reviewStatus: string;
      programCount: number;
    }>;

  const countParams = query
    ? [`%${query}%`, `%${query}%`, `%${query}%`]
    : [];
  const totalRow = sqlite
    .prepare(`SELECT COUNT(*) AS cnt FROM schools s WHERE s.archived = 0 ${whereClause}`)
    .get(...countParams) as { cnt: number };

  return { rows, total: totalRow.cnt, page: Math.max(1, page), pageSize };
}

export const NOTED_SCHOOL_SCOPES = [
  "all",
  "info",
  "cooperation",
  "recruitment",
  "assessment",
  "special",
] as const;

export type NotedSchoolScope = (typeof NOTED_SCHOOL_SCOPES)[number];

type NotedSchoolScopeCounts = Record<NotedSchoolScope, number>;

function buildNotedSchoolWhere(includeConfidential: boolean) {
  const hasValue = (column: string) =>
    `(${column} IS NOT NULL AND TRIM(${column}) != '')`;
  const info = hasValue("s.info_note");
  const cooperation = [
    "s.group_application_account",
    "s.scholarship_disbursement_text",
    "s.collection_service_text",
    "s.cooperation_deadline_text",
    "s.cooperation_note",
  ].map(hasValue).join("\n        OR ");
  const recruitment = [
    "s.company_recruitment_quota_text",
    "s.school_recruitment_plan_text",
    "s.recruitment_preference_text",
    "s.application_update_frequency",
  ].map(hasValue).join("\n        OR ");
  const assessment = [
    "s.language_student_assessment_text",
    "s.degree_student_assessment_text",
  ].map(hasValue).join("\n        OR ");
  const special = hasValue("s.special_case_note");
  const all = includeConfidential
    ? `(\n        ${info}\n        OR ${cooperation}\n        OR ${recruitment}\n        OR ${assessment}\n        OR ${special}\n      )`
    : info;

  return { all, info, cooperation: `(${cooperation})`, recruitment: `(${recruitment})`, assessment: `(${assessment})`, special };
}

function notedSchoolScopeWhere(
  scope: NotedSchoolScope,
  includeConfidential: boolean,
) {
  const where = buildNotedSchoolWhere(includeConfidential);
  if (scope === "all" || scope === "info") return where[scope];
  return includeConfidential ? where[scope] : "0 = 1";
}

function notedSchoolSearchWhere(query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return { clause: "", params: [] as string[] };
  }

  const keyword = `%${normalizedQuery}%`;
  return {
    clause: "AND (s.name_zh LIKE ? OR s.province LIKE ? OR s.city LIKE ?)",
    params: [keyword, keyword, keyword],
  };
}

export async function getNotedSchoolScopeCounts(
  includeConfidential = false,
  query = "",
): Promise<NotedSchoolScopeCounts> {
  const where = buildNotedSchoolWhere(includeConfidential);
  const searchWhere = notedSchoolSearchWhere(query);
  const row = sqlite.prepare(`
    SELECT
      SUM(CASE WHEN ${where.info} THEN 1 ELSE 0 END) AS info,
      SUM(CASE WHEN ${includeConfidential ? where.cooperation : "0 = 1"} THEN 1 ELSE 0 END) AS cooperation,
      SUM(CASE WHEN ${includeConfidential ? where.recruitment : "0 = 1"} THEN 1 ELSE 0 END) AS recruitment,
      SUM(CASE WHEN ${includeConfidential ? where.assessment : "0 = 1"} THEN 1 ELSE 0 END) AS assessment,
      SUM(CASE WHEN ${includeConfidential ? where.special : "0 = 1"} THEN 1 ELSE 0 END) AS special,
      SUM(CASE WHEN ${where.all} THEN 1 ELSE 0 END) AS allCount
    FROM schools s
    WHERE s.archived = 0
      ${searchWhere.clause}
  `).get(...searchWhere.params) as Partial<Record<NotedSchoolScope, number | null>> & { allCount?: number | null };

  return {
    all: Number(row.allCount ?? 0),
    info: Number(row.info ?? 0),
    cooperation: Number(row.cooperation ?? 0),
    recruitment: Number(row.recruitment ?? 0),
    assessment: Number(row.assessment ?? 0),
    special: Number(row.special ?? 0),
  };
}

export async function listNotedSchools(
  page = 1,
  pageSize = SCHOOL_PAGE_SIZE,
  includeConfidential = false,
  scope: NotedSchoolScope = "all",
  query = "",
) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const scopeWhere = notedSchoolScopeWhere(scope, includeConfidential);
  const searchWhere = notedSchoolSearchWhere(query);
  const confidentialSelect = includeConfidential
    ? `
      s.group_application_account AS groupApplicationAccount,
      s.scholarship_disbursement_text AS scholarshipDisbursementText,
      s.collection_service_text AS collectionServiceText,
      s.cooperation_deadline_text AS cooperationDeadlineText,
      s.company_recruitment_quota_text AS companyRecruitmentQuotaText,
      s.school_recruitment_plan_text AS schoolRecruitmentPlanText,
      s.recruitment_preference_text AS recruitmentPreferenceText,
      s.language_student_assessment_text AS languageStudentAssessmentText,
      s.degree_student_assessment_text AS degreeStudentAssessmentText,
      s.cooperation_note AS cooperationNote,
      s.special_case_note AS specialCaseNote,
      s.application_update_frequency AS applicationUpdateFrequency`
    : `
      NULL AS groupApplicationAccount,
      NULL AS scholarshipDisbursementText,
      NULL AS collectionServiceText,
      NULL AS cooperationDeadlineText,
      NULL AS companyRecruitmentQuotaText,
      NULL AS schoolRecruitmentPlanText,
      NULL AS recruitmentPreferenceText,
      NULL AS languageStudentAssessmentText,
      NULL AS degreeStudentAssessmentText,
      NULL AS cooperationNote,
      NULL AS specialCaseNote,
      NULL AS applicationUpdateFrequency`;
  const rows = sqlite.prepare(`
    SELECT
      s.id AS id,
      s.name_zh AS nameZh,
      s.province AS province,
      s.city AS city,
      s.updated_at AS updatedAt,
      s.info_note AS infoNote,
      ${confidentialSelect}
    FROM schools s
    WHERE s.archived = 0
      AND ${scopeWhere}
      ${searchWhere.clause}
    ORDER BY s.updated_at DESC, s.name_zh ASC
    LIMIT ? OFFSET ?
  `).all(...searchWhere.params, String(pageSize), String(offset)) as Array<{
    id: string;
    nameZh: string;
    province: string | null;
    city: string | null;
    updatedAt: string | Date;
    infoNote: string | null;
    groupApplicationAccount: string | null;
    scholarshipDisbursementText: string | null;
    collectionServiceText: string | null;
    cooperationDeadlineText: string | null;
    companyRecruitmentQuotaText: string | null;
    schoolRecruitmentPlanText: string | null;
    languageStudentAssessmentText: string | null;
    degreeStudentAssessmentText: string | null;
    cooperationNote: string | null;
    specialCaseNote: string | null;
    recruitmentPreferenceText: string | null;
    applicationUpdateFrequency: string | null;
  }>;

  const totalRow = sqlite.prepare(`
    SELECT COUNT(*) AS cnt FROM schools s
    WHERE s.archived = 0
      AND ${scopeWhere}
      ${searchWhere.clause}
  `).get(...searchWhere.params) as { cnt: number };

  return { rows, total: totalRow.cnt, page: Math.max(1, page), pageSize };
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

let majorCatalogCache: ReturnType<typeof categorizeMajors> | null = null;

export function invalidateMajorCatalog() {
  majorCatalogCache = null;
}

export async function getMajorCatalog() {
  if (majorCatalogCache) return majorCatalogCache;

  const rows = sqlite
    .prepare(
      "SELECT p.major_text AS majorText FROM programs p INNER JOIN schools s ON s.id = p.school_id WHERE p.archived = 0 AND s.archived = 0 AND p.major_text IS NOT NULL",
    )
    .all() as Array<{ majorText: string | null }>;

  majorCatalogCache = categorizeMajors(rows.flatMap((row) => splitMajorText(row.majorText)));
  return majorCatalogCache;
}
export async function getProgramsForScreening() {
  const rows = sqlite
    .prepare(
      `SELECT
        p.id AS id,
        s.id AS schoolId,
        s.name_zh AS schoolName,
        s.tags AS schoolTags,
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
          COALESCE(p.raw_json, '') || ' ' ||
          COALESCE(s.recruitment_preference_text, '')
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
        p.scholarship_content AS scholarshipContent,
        p.tuition_text AS tuitionText,
        s.company_recruitment_quota_text AS companyRecruitmentQuotaText,
        s.school_recruitment_plan_text AS schoolRecruitmentPlanText,
        s.language_student_assessment_text AS languageAssessmentText,
        s.degree_student_assessment_text AS degreeAssessmentText,
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
      schoolTags: string | null;
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
      scholarshipContent: string | null;
      tuitionText: string;
      companyRecruitmentQuotaText: string | null;
      schoolRecruitmentPlanText: string | null;
      languageAssessmentText: string | null;
      degreeAssessmentText: string | null;
      province: string | null;
      city: string | null;
      partnershipRating: number;
      qsRanking: number | null;
      reviewStatus: string;
    }>;

  return rows.map((row) => {
    // 从 applicationTimeText 实时解析 deadline，处理无年份日期的自动翻年
    let deadlineDate: Date | null = null;
    let deadlineStatus = row.deadlineStatus;
    if (row.applicationTimeText) {
      const parsed = parseDeadline(row.applicationTimeText);
      if (parsed.date) {
        deadlineDate = parsed.date;
        deadlineStatus = parsed.status;
      }
    }
    // 回退：实时解析失败时使用存储值
    if (!deadlineDate && row.deadlineDate != null && Number.isFinite(row.deadlineDate)) {
      deadlineDate = new Date(row.deadlineDate);
    }

    return {
      ...row,
      cscaStatus: parseCscaStatus(row.requirementsText, row.programType),
      costIncomplete: Boolean(row.costIncomplete),
      deadlineDate,
      deadlineStatus,
    };
  });
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
  page?: number;
  pageSize?: number;
};

const CUSTOMER_PAGE_SIZE = 20;

export async function listCustomers(filters: CustomerListFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? CUSTOMER_PAGE_SIZE;
  const offset = (page - 1) * pageSize;
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
    ORDER BY c.updated_at DESC
    LIMIT ? OFFSET ?`).all(...params, String(pageSize), String(offset)) as Array<{
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

  const totalRow = sqlite
    .prepare(`SELECT COUNT(*) AS cnt FROM customers c WHERE ${where.join(" AND ")}`)
    .get(...params) as { cnt: number };

  const mapped = rows.map(({ applicationStatuses, ...row }) => ({
    ...row,
    admissionStatus: deriveAdmissionStatus(
      applicationStatuses?.split("|").filter(Boolean) ?? [],
    ),
  }));

  return { rows: mapped, total: totalRow.cnt, page, pageSize };
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

const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(page = 1, pageSize = AUDIT_PAGE_SIZE) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const rows = sqlite.prepare(`SELECT
      a.id AS id,
      a.action AS action,
      a.entity_type AS entityType,
      a.entity_id AS entityId,
      a.details_json AS detailsJson,
      a.ip_address AS ipAddress,
      a.created_at AS createdAt,
      u.display_name AS displayName
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?`).all(String(pageSize), String(offset)) as Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      detailsJson: string | null;
      ipAddress: string | null;
      createdAt: number;
      displayName: string | null;
    }>;

  const totalRow = sqlite
    .prepare(`SELECT COUNT(*) AS cnt FROM audit_logs`)
    .get() as { cnt: number };

  return { rows, total: totalRow.cnt, page: Math.max(1, page), pageSize };
}

export async function listCustomerOptions() {
  return db
    .select({ id: customers.id, name: customers.name, customerNo: customers.customerNo })
    .from(customers)
    .where(eq(customers.archived, false))
    .orderBy(asc(customers.name));
}

export async function getSchoolUpdates(schoolId: string) {
  const updates = sqlite
    .prepare(
      `SELECT
         id, external_id AS externalId, school_id AS schoolId, title,
         submitter, submitted_at AS submittedAt,
         public_content AS publicContent, public_url AS publicUrl,
         public_operator AS publicOperator, public_updated_at AS publicUpdatedAt,
         secret_content AS secretContent, secret_url AS secretUrl,
         secret_operator AS secretOperator, secret_updated_at AS secretUpdatedAt,
         archived, created_at AS createdAt, updated_at AS updatedAt
       FROM school_updates
       WHERE school_id = ? AND archived = 0
       ORDER BY COALESCE(submitted_at, created_at) DESC, created_at DESC`,
    )
    .all(schoolId) as SchoolUpdateRow[];

  const ids = updates.map((update) => update.id);
  const attachments = ids.length
    ? (sqlite
        .prepare(
          `SELECT
             id, school_update_id AS schoolUpdateId, group_name AS groupName,
             original_name AS originalName, mime_type AS mimeType, size,
             created_at AS createdAt
           FROM school_update_attachments
           WHERE school_update_id IN (${ids.map(() => "?").join(",")})
             AND archived = 0
           ORDER BY created_at ASC`,
        )
        .all(...ids) as SchoolUpdateAttachment[])
    : [];
  const byUpdate = new Map<string, SchoolUpdateAttachment[]>();
  for (const attachment of attachments) {
    const list = byUpdate.get(attachment.schoolUpdateId) ?? [];
    list.push(attachment);
    byUpdate.set(attachment.schoolUpdateId, list);
  }
  return updates.map((update) => ({
    update,
    attachments: byUpdate.get(update.id) ?? [],
  }));
}


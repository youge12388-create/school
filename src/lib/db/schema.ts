import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["ADMIN", "ADVISOR", "DATA_MANAGER"] })
      .notNull()
      .default("ADVISOR"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_username_unique").on(table.username)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    detailsJson: text("details_json"),
    ipAddress: text("ip_address"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  sourceName: text("source_name").notNull(),
  sourceHash: text("source_hash").notNull(),
  status: text("status").notNull(),
  summaryJson: text("summary_json"),
  previewPath: text("preview_path"),
  importedBy: text("imported_by").references(() => users.id),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  ...timestamps,
});

export const schools = sqliteTable(
  "schools",
  {
    id: text("id").primaryKey(),
    externalId: text("external_id"),
    nameZh: text("name_zh").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    province: text("province"),
    city: text("city"),
    website: text("website"),
    qsRanking: integer("qs_ranking"),
    rankingInfo: text("ranking_info"),
    partnershipRating: integer("partnership_rating").notNull().default(0),
    cscaStatus: text("csca_status", {
      enum: ["REQUIRED", "NOT_REQUIRED", "UNKNOWN"],
    })
      .notNull()
      .default("UNKNOWN"),
    tags: text("tags"),
    description: text("description"),
    cooperationPrograms: text("cooperation_programs"),
    rawJson: text("raw_json"),
    sourceBatchId: text("source_batch_id").references(() => importBatches.id),
    reviewStatus: text("review_status", {
      enum: ["AUTO_PARSED", "VERIFIED", "NEEDS_REVIEW"],
    })
      .notNull()
      .default("AUTO_PARSED"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex("schools_name_zh_unique").on(table.nameZh)],
);

export const programs = sqliteTable(
  "programs",
  {
    id: text("id").primaryKey(),
    externalId: text("external_id"),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id),
    name: text("name").notNull(),
    programType: text("program_type").notNull(),
    teachingLanguage: text("teaching_language").notNull(),
    tags: text("tags"),
    introduction: text("introduction"),
    duration: text("duration"),
    durationNote: text("duration_note"),
    majorText: text("major_text"),
    directionText: text("direction_text"),
    requirementsText: text("requirements_text"),
    semesterText: text("semester_text"),
    applicationTimeText: text("application_time_text"),
    scholarshipCategory: text("scholarship_category"),
    scholarshipContent: text("scholarship_content"),
    scholarshipNote: text("scholarship_note"),
    scholarshipDeadlineText: text("scholarship_deadline_text"),
    accommodationText: text("accommodation_text"),
    insuranceText: text("insurance_text"),
    applicationFeeText: text("application_fee_text"),
    scholarshipApplicationFeeText: text("scholarship_application_fee_text"),
    feeNote: text("fee_note"),
    tuitionText: text("tuition_text").notNull(),
    tuitionMin: real("tuition_min"),
    tuitionMax: real("tuition_max"),
    tuitionPeriod: text("tuition_period"),
    accommodationMin: real("accommodation_min"),
    accommodationMax: real("accommodation_max"),
    insuranceMax: real("insurance_max"),
    applicationFeeMax: real("application_fee_max"),
    firstYearCostMax: real("first_year_cost_max"),
    costIncomplete: integer("cost_incomplete", { mode: "boolean" })
      .notNull()
      .default(true),
    cscaStatus: text("csca_status", {
      enum: ["REQUIRED", "NOT_REQUIRED", "UNKNOWN"],
    })
      .notNull()
      .default("UNKNOWN"),
    hskLevelMin: integer("hsk_level_min"),
    hskScoreMin: integer("hsk_score_min"),
    ieltsMin: real("ielts_min"),
    toeflMin: integer("toefl_min"),
    duolingoMin: integer("duolingo_min"),
    gpaMin: real("gpa_min"),
    gpaScale: real("gpa_scale"),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    deadlineDate: integer("deadline_date", { mode: "timestamp_ms" }),
    deadlineStatus: text("deadline_status").notNull().default("UNKNOWN"),
    parsedJson: text("parsed_json"),
    rawJson: text("raw_json"),
    sourceBatchId: text("source_batch_id").references(() => importBatches.id),
    reviewStatus: text("review_status", {
      enum: ["AUTO_PARSED", "VERIFIED", "NEEDS_REVIEW"],
    })
      .notNull()
      .default("AUTO_PARSED"),
    manuallyVerified: integer("manually_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("programs_school_idx").on(table.schoolId),
    index("programs_filter_idx").on(
      table.programType,
      table.teachingLanguage,
      table.archived,
    ),
  ],
);

export const programMajors = sqliteTable(
  "program_majors",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    category: text("category"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("program_major_unique").on(table.programId, table.name),
    index("program_major_normalized_idx").on(table.normalizedName),
  ],
);

export const majorSynonyms = sqliteTable(
  "major_synonyms",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull(),
    keyword: text("keyword").notNull(),
    createdBy: text("created_by").references(() => users.id),
    ...timestamps,
  },
  (table) => [uniqueIndex("major_synonym_unique").on(table.category, table.keyword)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    customerNo: text("customer_no").notNull(),
    name: text("name").notNull(),
    nationality: text("nationality"),
    phone: text("phone"),
    email: text("email"),
    wechat: text("wechat"),
    currentEducation: text("current_education"),
    schoolBackground: text("school_background"),
    gpa: real("gpa"),
    gpaScale: real("gpa_scale"),
    hskLevel: integer("hsk_level"),
    hskScore: integer("hsk_score"),
    ielts: real("ielts"),
    toefl: integer("toefl"),
    duolingo: integer("duolingo"),
    hasCsca: integer("has_csca", { mode: "boolean" }),
    targetDegree: text("target_degree"),
    targetMajor: text("target_major"),
    teachingLanguage: text("teaching_language"),
    intakeYear: integer("intake_year"),
    firstYearBudget: real("first_year_budget"),
    preferredProvince: text("preferred_province"),
    preferredCity: text("preferred_city"),
    scholarshipRequired: integer("scholarship_required", { mode: "boolean" }),
    accommodationRequired: integer("accommodation_required", { mode: "boolean" }),
    dateOfBirth: integer("date_of_birth", { mode: "timestamp_ms" }),
    ownerId: text("owner_id").references(() => users.id),
    contractStatus: text("contract_status", {
      enum: ["UNKNOWN", "NOT_SIGNED", "SIGNED"],
    })
      .notNull()
      .default("UNKNOWN"),
    notes: text("notes"),
    nextFollowUpAt: integer("next_follow_up_at", { mode: "timestamp_ms" }),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customers_no_unique").on(table.customerNo),
    index("customers_owner_idx").on(table.ownerId, table.archived),
    index("customers_followup_idx").on(table.nextFollowUpAt),
  ],
);

export const followUps = sqliteTable(
  "follow_ups",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    channel: text("channel").notNull(),
    content: text("content").notNull(),
    nextFollowUpAt: integer("next_follow_up_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("followups_customer_idx").on(table.customerId, table.createdAt)],
);

export const recommendations = sqliteTable(
  "recommendations",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    criteriaJson: text("criteria_json").notNull(),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("recommendations_customer_idx").on(table.customerId)],
);

export const recommendationItems = sqliteTable(
  "recommendation_items",
  {
    id: text("id").primaryKey(),
    recommendationId: text("recommendation_id")
      .notNull()
      .references(() => recommendations.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    rank: integer("rank").notNull(),
    fitLevel: text("fit_level").notNull(),
    reason: text("reason"),
    evidenceJson: text("evidence_json").notNull(),
  },
  (table) => [
    uniqueIndex("recommendation_item_unique").on(
      table.recommendationId,
      table.programId,
    ),
  ],
);

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    ownerId: text("owner_id").references(() => users.id),
    status: text("status").notNull().default("MATERIAL_PREPARATION"),
    notes: text("notes"),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    resultAt: integer("result_at", { mode: "timestamp_ms" }),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("applications_status_idx").on(table.status, table.archived),
    index("applications_customer_idx").on(table.customerId),
  ],
);

export const applicationEvents = sqliteTable(
  "application_events",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("application_events_app_idx").on(table.applicationId, table.createdAt),
  ],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    applicationId: text("application_id").references(() => applications.id),
    category: text("category").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storagePath: text("storage_path").notNull(),
    encryptionIv: text("encryption_iv").notNull(),
    encryptionTag: text("encryption_tag").notNull(),
    checksum: text("checksum").notNull(),
    version: integer("version").notNull().default(1),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("documents_customer_idx").on(table.customerId, table.archived),
    index("documents_application_idx").on(table.applicationId),
  ],
);

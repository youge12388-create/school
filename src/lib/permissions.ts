import type { UserRole } from "@/lib/constants";

export const SCHOOL_EDITOR_ROLES: readonly UserRole[] = [
  "ADMIN",
  "DATA_MANAGER",
  "CHANNEL_RESOURCE",
];

export const IMPORT_ROLES: readonly UserRole[] = [
  "ADMIN",
  "DATA_MANAGER",
  "CHANNEL_RESOURCE",
];

export const AUDIT_ROLES: readonly UserRole[] = ["ADMIN", "DATA_MANAGER"];

export const USER_MANAGER_ROLES: readonly UserRole[] = ["ADMIN"];

// 院校信息更新：机密人员 = 高级管理员 + 数据管理员，可查看/上传机密更新与人员字段。
export const SCHOOL_UPDATE_MANAGER_ROLES: readonly UserRole[] = [
  "ADMIN",
  "DATA_MANAGER",
];

// 学校机密字段：仅高级管理员（ADMIN）可查看和修改。
export const CONFIDENTIAL_SCHOOL_FIELDS: readonly string[] = [
  "groupApplicationAccount",
  "scholarshipDisbursementText",
  "collectionServiceText",
  "cooperationDeadlineText",
  "companyRecruitmentQuotaText",
  "schoolRecruitmentPlanText",
  "recruitmentPreferenceText",
  "languageStudentAssessmentText",
  "degreeStudentAssessmentText",
  "cooperationNote",
  "specialCaseNote",
  "applicationUpdateFrequency",
] as const;

// Excel 原始行/维护模板里的机密列名，导入与导出时按这些键清洗。
export const CONFIDENTIAL_RAW_KEYS: readonly string[] = [
  "团体申请账号",
  "奖学金发放形式",
  "奖学金发放形式\noffer是否标明",
  "是否可代收",
  "合作截止日期",
  "截止日期",
  "公司招生名额",
  "学校招生计划",
  "招生偏向",
  "语言生考核",
  "语言生是否面试、笔试",
  "学历生考核",
  "学历生是否面试、笔试",
  "合作备注",
  "特殊情况备注",
  "申请更新频率",
  "学校申请更新频率",
] as const;

export const CONFIDENTIAL_TEMPLATE_HEADERS: readonly string[] = [
  "团体申请账号",
  "奖学金发放形式\noffer是否标明",
  "是否可代收",
  "截止日期",
  "公司招生名额",
  "学校招生计划",
  "招生偏向",
  "语言生是否面试、笔试",
  "学历生是否面试、笔试",
  "合作备注",
  "特殊情况备注",
  "学校申请更新频率",
] as const;

// 市场经理只读可见的院校字段。
export const MARKET_MANAGER_SCHOOL_FIELDS = [
  "学校中文名",
  "学校名称",
  "省份",
  "城市",
  "信息备注",
] as const;

export const MARKET_MANAGER_PROGRAM_CORE_FIELDS = ["学费", "住宿费"] as const;

export const MARKET_MANAGER_PROGRAM_LONG_FIELDS = ["专业列表"] as const;

export function canEditSchool(role: UserRole) {
  return SCHOOL_EDITOR_ROLES.includes(role);
}

export function canManageImports(role: UserRole) {
  return IMPORT_ROLES.includes(role);
}

export function canViewAudit(role: UserRole) {
  return AUDIT_ROLES.includes(role);
}

export function canManageUsers(role: UserRole) {
  return USER_MANAGER_ROLES.includes(role);
}

export function canViewConfidentialSchoolFields(role: UserRole) {
  return role === "ADMIN";
}

export function canManageSchoolUpdates(role: UserRole) {
  return SCHOOL_UPDATE_MANAGER_ROLES.includes(role);
}

export function canViewSchoolUpdateSecret(role: UserRole) {
  return canManageSchoolUpdates(role);
}

export function isMarketManager(role: UserRole) {
  return role === "MARKET_MANAGER";
}

export function stripConfidentialSchoolUpdates<
  T extends Record<string, unknown>,
>(updates: T): T {
  const copy = { ...updates };
  for (const key of CONFIDENTIAL_SCHOOL_FIELDS) {
    delete copy[key];
  }
  return copy;
}

export function stripConfidentialSchoolData<
  T extends Record<string, unknown>,
>(row: T): T {
  const copy = stripConfidentialSchoolUpdates(row);
  const record = copy as unknown as Record<string, unknown>;
  if (typeof record.rawJson === "string") {
    try {
      const raw = JSON.parse(record.rawJson) as Record<string, unknown>;
      for (const key of CONFIDENTIAL_RAW_KEYS) {
        delete raw[key];
      }
      record.rawJson = JSON.stringify(raw);
    } catch {
      // rawJson 不是合法 JSON 时保持原样，避免破坏原始数据。
    }
  }
  return copy;
}

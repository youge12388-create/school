import { USER_ROLES, type UserRole } from "@/lib/constants";

export const PERMISSION_KEYS = [
  "WORKSPACE_VIEW",
  "SCREENING_VIEW",
  "SCHOOL_VIEW_PUBLIC",
  "SCHOOL_EDIT_PUBLIC",
  "SCHOOL_VIEW_CONFIDENTIAL",
  "SCHOOL_EDIT_CONFIDENTIAL",
  "DATA_IMPORT",
  "SCHOOL_UPDATE_MANAGE",
  "CUSTOMER_VIEW",
  "CUSTOMER_EDIT",
  "FOLLOW_UP_MANAGE",
  "APPLICATION_MANAGE",
  "RECOMMENDATION_MANAGE",
  "DOCUMENT_UPLOAD",
  "DOCUMENT_DOWNLOAD",
  "AUDIT_VIEW",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionSource = "TEMPLATE" | "CUSTOM";

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  WORKSPACE_VIEW: "工作台访问",
  SCREENING_VIEW: "学校筛查",
  SCHOOL_VIEW_PUBLIC: "学校公开信息查看",
  SCHOOL_EDIT_PUBLIC: "学校公开信息编辑",
  SCHOOL_VIEW_CONFIDENTIAL: "院校机密查看",
  SCHOOL_EDIT_CONFIDENTIAL: "院校机密编辑",
  DATA_IMPORT: "数据导入",
  SCHOOL_UPDATE_MANAGE: "院校动态维护",
  CUSTOMER_VIEW: "客户查看",
  CUSTOMER_EDIT: "客户编辑",
  FOLLOW_UP_MANAGE: "跟进维护",
  APPLICATION_MANAGE: "申请维护",
  RECOMMENDATION_MANAGE: "推荐方案维护",
  DOCUMENT_UPLOAD: "材料上传",
  DOCUMENT_DOWNLOAD: "材料下载",
  AUDIT_VIEW: "操作审计查看",
};

export const PERMISSION_GROUPS: Array<{
  label: string;
  keys: readonly PermissionKey[];
}> = [
  {
    label: "基础访问",
    keys: ["WORKSPACE_VIEW", "SCREENING_VIEW", "SCHOOL_VIEW_PUBLIC"],
  },
  {
    label: "学校资料",
    keys: [
      "SCHOOL_EDIT_PUBLIC",
      "SCHOOL_VIEW_CONFIDENTIAL",
      "SCHOOL_EDIT_CONFIDENTIAL",
      "DATA_IMPORT",
      "SCHOOL_UPDATE_MANAGE",
    ],
  },
  {
    label: "客户与申请",
    keys: [
      "CUSTOMER_VIEW",
      "CUSTOMER_EDIT",
      "FOLLOW_UP_MANAGE",
      "APPLICATION_MANAGE",
      "RECOMMENDATION_MANAGE",
      "DOCUMENT_UPLOAD",
      "DOCUMENT_DOWNLOAD",
    ],
  },
  {
    label: "系统记录",
    keys: ["AUDIT_VIEW"],
  },
];

const COMMON_PERMISSIONS: readonly PermissionKey[] = [
  "WORKSPACE_VIEW",
  "SCREENING_VIEW",
  "SCHOOL_VIEW_PUBLIC",
  "CUSTOMER_VIEW",
];

const CUSTOMER_CASE_PERMISSIONS: readonly PermissionKey[] = [
  "CUSTOMER_EDIT",
  "FOLLOW_UP_MANAGE",
  "APPLICATION_MANAGE",
  "RECOMMENDATION_MANAGE",
  "DOCUMENT_UPLOAD",
  "DOCUMENT_DOWNLOAD",
];

function uniquePermissions(keys: readonly PermissionKey[]) {
  return [...new Set(keys)] as PermissionKey[];
}

export const ROLE_PERMISSION_TEMPLATES: Record<UserRole, readonly PermissionKey[]> = {
  ADVISOR: uniquePermissions([
    ...COMMON_PERMISSIONS,
    ...CUSTOMER_CASE_PERMISSIONS,
    "AUDIT_VIEW",
  ]),
  DATA_MANAGER: uniquePermissions([
    ...COMMON_PERMISSIONS,
    ...CUSTOMER_CASE_PERMISSIONS,
    "SCHOOL_EDIT_PUBLIC",
    "SCHOOL_VIEW_CONFIDENTIAL",
    "DATA_IMPORT",
    "SCHOOL_UPDATE_MANAGE",
    "AUDIT_VIEW",
  ]),
  CHANNEL_RESOURCE: uniquePermissions([
    ...COMMON_PERMISSIONS,
    "SCHOOL_EDIT_PUBLIC",
    "DATA_IMPORT",
    "AUDIT_VIEW",
  ]),
  MARKET_MANAGER: uniquePermissions(COMMON_PERMISSIONS),
  ADMIN: [...PERMISSION_KEYS],
};

export function defaultPermissionsForRole(role: UserRole): PermissionKey[] {
  return [...ROLE_PERMISSION_TEMPLATES[role]];
}

export function normalizePermissionSet(input: readonly string[]): PermissionKey[] {
  const unknown = input.filter(
    (key): key is string => !PERMISSION_KEYS.includes(key as PermissionKey),
  );
  if (unknown.length) {
    throw new Error(`权限标识无效：${unknown.join("、")}`);
  }
  const selected = new Set(input as PermissionKey[]);
  if (!selected.has("WORKSPACE_VIEW")) {
    throw new Error("可登录成员必须保留工作台访问权限");
  }
  return PERMISSION_KEYS.filter((key) => selected.has(key));
}

export function parsePermissionSet(value: string | null | undefined): PermissionKey[] | null {
  if (value == null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      return null;
    }
    return normalizePermissionSet(parsed);
  } catch {
    // 老数据或手工损坏的数据回退到角色模板，避免错误 JSON 造成越权。
    return null;
  }
}

export function roleHasPermission(role: UserRole, permission: PermissionKey) {
  return ROLE_PERMISSION_TEMPLATES[role].includes(permission);
}

export function hasPermission(
  permissions: readonly PermissionKey[],
  permission: PermissionKey,
) {
  return permissions.includes(permission);
}

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

export const AUDIT_ROLES: readonly UserRole[] = [
  "ADMIN",
  "ADVISOR",
  "DATA_MANAGER",
  "CHANNEL_RESOURCE",
];

// 客户域敏感操作（材料上传/下载、跟进、改派、归档、申请状态、推荐方案）：
// 客户资料全员可读（团队共享），但写/下载操作仅限顾问与管理类角色。
export const CUSTOMER_CASE_ROLES: readonly UserRole[] = [
  "ADMIN",
  "ADVISOR",
  "DATA_MANAGER",
];

export const USER_MANAGER_ROLES: readonly UserRole[] = ["ADMIN"];

// 院校信息更新：机密人员 = 高级管理员 + 数据管理员，可查看/上传机密更新与人员字段。
export const SCHOOL_UPDATE_MANAGER_ROLES: readonly UserRole[] = [
  "ADMIN",
  "DATA_MANAGER",
];

// 学校机密字段：高级管理员和数据管理员可查看；仅高级管理员可修改或导入。
export const CONFIDENTIAL_SCHOOL_VIEWER_ROLES: readonly UserRole[] = [
  "ADMIN",
  "DATA_MANAGER",
];

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
  "cooperationFeeText",
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
  "合作收费",
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
  "合作收费",
] as const;

// 市场经理只读可见的院校字段。
export const MARKET_MANAGER_SCHOOL_FIELDS = [
  "学校中文名",
  "学校名称",
  "省份",
  "城市",
] as const;

export const MARKET_MANAGER_PROGRAM_CORE_FIELDS = ["学费", "住宿费"] as const;

export const MARKET_MANAGER_PROGRAM_LONG_FIELDS = ["专业列表"] as const;

export function canEditSchool(role: UserRole) {
  return SCHOOL_EDITOR_ROLES.includes(role);
}

// 普通备注是全员协作信息：任一已登录、启用的角色均可维护。
export function canEditSchoolNote(role: UserRole) {
  return USER_ROLES.includes(role);
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

export function canHandleCustomerCases(role: UserRole) {
  return CUSTOMER_CASE_ROLES.includes(role);
}

export function canViewConfidentialSchoolFields(role: UserRole) {
  return CONFIDENTIAL_SCHOOL_VIEWER_ROLES.includes(role);
}

export function canEditConfidentialSchoolFields(role: UserRole) {
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

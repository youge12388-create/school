export const USER_ROLES = ["ADMIN", "ADVISOR", "DATA_MANAGER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REVIEW_STATUSES = [
  "AUTO_PARSED",
  "VERIFIED",
  "NEEDS_REVIEW",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const RULE_STATUSES = ["REQUIRED", "NOT_REQUIRED", "UNKNOWN"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "MATERIAL_PREPARATION",
  "SUBMITTED",
  "UNDER_REVIEW",
  "SUPPLEMENT_REQUIRED",
  "ADMITTED",
  "REJECTED",
  "VISA_PROCESSING",
  "ENROLLED",
  "CLOSED",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  MATERIAL_PREPARATION: "材料准备",
  SUBMITTED: "已提交",
  UNDER_REVIEW: "审核中",
  SUPPLEMENT_REQUIRED: "补件",
  ADMITTED: "录取",
  REJECTED: "拒绝",
  VISA_PROCESSING: "签证办理",
  ENROLLED: "已入学",
  CLOSED: "关闭",
};

export const CONTRACT_STATUSES = ["UNKNOWN", "NOT_SIGNED", "SIGNED"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  UNKNOWN: "未确认",
  NOT_SIGNED: "未签约",
  SIGNED: "已签约",
};

export const ADMISSION_STATUSES = [
  "NO_APPLICATION",
  "IN_PROGRESS",
  "ADMITTED",
  "REJECTED",
  "CLOSED",
] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

export const ADMISSION_STATUS_LABELS: Record<AdmissionStatus, string> = {
  NO_APPLICATION: "暂无申请",
  IN_PROGRESS: "申请进行中",
  ADMITTED: "已录取 / 已入学",
  REJECTED: "未录取",
  CLOSED: "申请已关闭",
};
export const PROGRAM_TYPE_LABELS: Record<string, string> = {
  UG: "本科",
  MASTER: "硕士",
  PHD: "博士",
  LONG_TERM: "长期进修",
  SHORT_TERM: "短期项目",
};

export const LANGUAGE_LABELS: Record<string, string> = {
  CHINESE: "中文",
  ENGLISH: "英文",
  FRENCH: "法文",
};

export const ALLOWED_DOCUMENT_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".docx",
  ],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlsx",
  ],
]);

export const DEFAULT_MAJOR_SYNONYMS: Record<string, string[]> = {
  计算机: ["计算机", "软件", "人工智能", "数据科学", "大数据", "信息技术", "CS"],
  商科: ["工商管理", "金融", "会计", "经济", "国际贸易", "市场营销", "商务"],
  工程: ["工程", "机械", "土木", "自动化", "材料", "电气", "电子"],
  医学: ["医学", "临床", "药学", "护理", "口腔", "公共卫生"],
  汉语言: ["汉语言", "中文", "国际中文教育", "汉语国际教育"],
  艺术设计: ["艺术", "设计", "音乐", "舞蹈", "美术", "表演"],
  法学: ["法学", "法律"],
  教育心理: ["教育", "心理", "学前教育"],
};

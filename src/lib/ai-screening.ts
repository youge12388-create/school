import { z } from "zod";
import { splitMajorText } from "@/lib/major-categories";
import { normalizeKeyword, dateInShanghai as shanghaiDate } from "@/lib/utils";
import { classifyScholarshipText, evaluateProgram, splitMajorQueries, type MatchProgram, type ScreeningCriteria } from "@/lib/matcher";
import { DEFAULT_DISPLAY_SCHOOL_COUNT } from "@/lib/recommendation-profile";
import {
  isJuniorCollegeOrSecondarySchool,
  matchesTargetSchoolPool,
  rebalancePoolTiers,
  scoreCandidate,
  type AdmissionTier,
  type ScoreBreakdown,
} from "@/lib/screening-ranking";
import {
  evaluateAdmissionRules,
  evaluateSchoolAgainstRules,
  type AdmissionDiagnostic,
} from "@/lib/admission-rule-engine";

const stringListSchema = (itemMax: number, maxItems: number) =>
  z.array(z.string().trim().min(1).max(itemMax)).max(maxItems).nullable().optional();

export const criteriaSchema = z.object({
  programType: z.enum(["UG", "MASTER", "PHD", "LONG_TERM", "SHORT_TERM"]).nullable().optional(),
  teachingLanguage: z.enum(["CHINESE", "ENGLISH"]).nullable().optional(),
  targetMajor: z.string().max(120).nullable().optional(),
  targetMajors: stringListSchema(60, 10),
  strictMajor: z.boolean().nullable().optional(),
  budget: z.number().min(0).max(100000000).nullable().optional(),
  intakeYear: z.number().int().min(2020).max(2100).nullable().optional(),
  intakeSeason: z.enum(["SPRING", "SUMMER", "AUTUMN", "WINTER"]).nullable().optional(),
  gpa: z.number().min(0).max(100).nullable().optional(),
  gpaScale: z.number().positive().max(100).nullable().optional(),
  gradeSystem: z.enum(["CN_100", "GPA_4", "GPA_5", "FR_20", "UK_HONOURS", "DE_REVERSE", "CUSTOM"]).nullable().optional(),
  academicLevel: z.enum(["EXCELLENT", "GOOD", "MEDIUM", "WEAK", "POOR"]).nullable().optional(),
  failedCourseCount: z.number().int().min(0).max(50).nullable().optional(),
  hskLevel: z.number().int().min(1).max(9).nullable().optional(),
  hskScore: z.number().min(0).max(300).nullable().optional(),
  hskVersion: z.enum(["2.0", "3.0"]).nullable().optional(),
  hasHskk: z.boolean().nullable().optional(),
  ielts: z.number().min(0).max(9).nullable().optional(),
  toefl: z.number().min(0).max(120).nullable().optional(),
  duolingo: z.number().min(0).max(160).nullable().optional(),
  languageStatus: z.enum(["HAS_SCORE", "CONFIRMED_NONE", "NATIVE_6", "MOI_ONLY", "UNSPECIFIED"]).nullable().optional(),
  hasMoiCertificate: z.boolean().nullable().optional(),
  hasCsca: z.boolean().nullable().optional(),
  cscaRequirement: z.enum(["NOT_REQUIRED", "REQUIRED"]).nullable().optional(),
  cscaScore: z.number().min(0).max(200).nullable().optional(),
  cscaMathScore: z.number().min(0).max(100).nullable().optional(),
  cscaPhysicsScore: z.number().min(0).max(100).nullable().optional(),
  cscaChineseScore: z.number().min(0).max(100).nullable().optional(),
  cscaMinSubjectScore: z.number().min(0).max(100).nullable().optional(),
  scholarshipType: z.enum(["full", "any"]).nullable().optional(),
  excludeSelfFunded: z.boolean().nullable().optional(),
  scholarshipPreferences: stringListSchema(40, 8),
  accommodationRequired: z.boolean().nullable().optional(),
  age: z.number().int().min(1).max(120).nullable().optional(),
  city: z.string().max(40).nullable().optional(),
  cities: stringListSchema(30, 10),
  fallbackCities: stringListSchema(30, 10),
  province: z.string().max(30).nullable().optional(),
  targetSchools: stringListSchema(60, 15),
  publicOnly: z.boolean().nullable().optional(),
  noFoundation: z.boolean().nullable().optional(),
  nationality: z.string().max(40).nullable().optional(),
  isChineseOrigin: z.boolean().nullable().optional(),
  chineseOriginCompliant: z.boolean().nullable().optional(),
  highestEducation: z.enum(["HIGH_SCHOOL", "VOCATIONAL_HS", "ASSOCIATE", "BACHELOR_DEGREE", "BACHELOR_NO_DEGREE", "MASTER", "BELOW_HS"]).nullable().optional(),
  associateWorkYears: z.number().min(0).max(40).nullable().optional(),
  degreeBackground: z.string().max(180).nullable().optional(),
  plannedExams: z.string().max(260).nullable().optional(),
  wantTiering: z.boolean().nullable().optional(),
  customQuestions: stringListSchema(200, 8),
  complianceFlags: stringListSchema(40, 8),
  mbbsSubjectScores: z.object({
    physics: z.number().min(0).max(100).nullable().optional(),
    chemistry: z.number().min(0).max(100).nullable().optional(),
    biology: z.number().min(0).max(100).nullable().optional(),
  }).nullable().optional(),
  consultationMonth: z.number().int().min(1).max(12).nullable().optional(),
}).strict();
export type ChatCriteria = z.infer<typeof criteriaSchema>;

export function hasCriteriaValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export type ListRow = { name: string; row: number; sheet?: string; yellow: boolean; fields: string[]; rawFields?: string[]; image: boolean; noCooperation: boolean };
export type PartnerEntry = { name: string; status: "confirmed" | "not_cooperating" | "unknown"; programIds?: string[]; note?: string };
export type SchoolInfo = { id: string; name: string; website?: string | null; preference: string | null; updatedAt?: number | null; internalNotes?: { source: string; text: string | null }[] };
export type EvidencePoint = { label: string; level: "PASS" | "NEED" | "UNKNOWN"; text: string; source?: string };
export type DataFreshness = "current" | "historical" | "unknown";
export type ProjectFacts = { tuition: number | null; tuitionStatus: "known" | "unknown" | "conflict"; teachingLanguage: "CHINESE" | "ENGLISH" | "UNKNOWN"; gpaMin?: number | null; gpaScale?: number | null; ielts: number | null; toefl: number | null; duolingo: number | null; hskLevel: number | null; hskScore: number | null; scholarship: "full" | "available" | "unknown"; scholarshipText?: string | null; sourceYear?: number | null; feeFreshness?: DataFreshness };
export type ResultCard = { name: string; schoolKey?: string; schoolId?: string; programId?: string; program: string; fit: string; quality?: "candidate" | "insufficient"; cooperation: "listed" | "project_confirmed" | "not_cooperating" | "unknown"; evidence: string[]; points: EvidencePoint[]; kind: "project" | "school"; sources: string[]; warning: string[]; yellow: boolean; image: boolean; comparableCost?: number | null; facts?: ProjectFacts; verified?: boolean; score?: number; tier?: AdmissionTier; tierReason?: string; scoreBreakdown?: ScoreBreakdown; cityLabel?: string | null; schoolTags?: string | null; qsRanking?: number | null; officialUrl?: string | null };
type SearchProgress = { onPartnerSearchComplete?: (state: { confirmed: number; pending: number; searchingOthers: boolean }) => void };
type SearchProgram = MatchProgram & { attentionText?: string | null };
export type ResultExclusions = { schoolKeys?: Iterable<string>; programIds?: Iterable<string> };

export function schoolKey(name: string) {
  return name.normalize("NFKC").replace(/\s+/g, "").trim();
}

// Strip only status annotations that do not identify a campus. Campus names such as
// “山东大学（威海）” must remain distinct.
export function schoolIdentityKey(name: string) {
  return schoolKey(name).replace(/\((?:公办|民办|公办本科|民办本科|普通本科|本科院校|本科)\)$/u, "");
}

const clearPatterns: Partial<Record<keyof ChatCriteria, RegExp>> = {
  programType: /(?:学历|学位|本科|硕士|博士)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)|(?:不限|取消)[^。！？；;]{0,4}(?:学历|学位)/u,
  teachingLanguage: /(?:授课语言|语言)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)|(?:不限|取消)[^。！？；;]{0,4}(?:授课语言)/u,
  targetMajor: /(?:专业|方向)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)|(?:不限|不看|取消)[^。！？；;]{0,4}(?:专业|方向)/u,
  targetMajors: /(?:专业|方向)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)|(?:不限|不看|取消)[^。！？；;]{0,4}(?:专业|方向)/u,
  budget: /(?:预算|费用)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不用|不需要|取消)|(?:不限|不看|取消)[^。！？；;]{0,4}(?:预算|费用)/u,
  intakeYear: /(?:入学|批次|年份|季节)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)|(?:不限|取消)[^。！？；;]{0,4}(?:入学|批次|年份|季节)/u,
  intakeSeason: /(?:入学|批次|年份|季节)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)|(?:不限|取消)[^。！？；;]{0,4}(?:入学|批次|年份|季节)/u,
  gpa: /(?:GPA|绩点|平均分)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  gpaScale: /(?:GPA|绩点|平均分)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  academicLevel: /(?:成绩|绩点|平均分)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  hskLevel: /(?:HSK|汉语水平)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  hskScore: /(?:HSK|汉语水平)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  ielts: /(?:雅思|IELTS)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  toefl: /(?:托福|TOEFL)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  duolingo: /(?:多邻国|Duolingo)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  hasCsca: /CSCA[^。！？；;]{0,10}(?:不限|都可以|无所谓|不用|不需要|取消)/iu,
  cscaRequirement: /CSCA[^。！？；;]{0,10}(?:不限|都可以|无所谓|不用|不需要|取消)/iu,
  scholarshipType: /(?:奖学金|全奖)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  excludeSelfFunded: /(?:自费|奖学金)[^。！？；;]{0,8}(?:不限|都可以|无所谓|取消)/u,
  scholarshipPreferences: /(?:奖学金)[^。！？；;]{0,8}(?:不限|都可以|无所谓|取消)/u,
  accommodationRequired: /(?:住宿)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  age: /(?:年龄)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  city: /(?:城市|地区)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  cities: /(?:城市|地区)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  fallbackCities: /(?:城市|地区)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  province: /(?:省份|地区)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  targetSchools: /(?:院校|学校|参考池)[^。！？；;]{0,8}(?:不限|都可以|无所谓|取消)/u,
  publicOnly: /(?:公立|民办|公办)[^。！？；;]{0,8}(?:不限|都可以|无所谓|取消)/u,
};

// The model may return null for fields it did not hear about. Keep the previous
// value unless the user explicitly asked to clear that condition.
export function mergeCriteria(previous: ChatCriteria, next: ChatCriteria, message: string): ChatCriteria {
  const merged: ChatCriteria = { ...previous, ...next };
  for (const key of Object.keys(next) as (keyof ChatCriteria)[]) {
    const value = next[key];
    const previousValue = previous[key];
    const isEmpty = value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (isEmpty && hasCriteriaValue(previousValue) && !clearPatterns[key]?.test(message)) {
      (merged as Record<string, unknown>)[key] = previousValue;
    }
  }
  const hasMajor = Boolean(merged.targetMajor || merged.targetMajors?.length);
  if (!hasMajor || (merged.targetMajor !== previous.targetMajor && next.strictMajor == null)) delete merged.strictMajor;
  return merged;
}

// Sensitive source text is never sent to the model and is only returned after role checks.
const sensitive = /国籍|国别|生源|南亚|东南亚|非洲|欧美|欧裔|非裔|亚裔|中东|孟加拉|尼日利亚|巴基斯坦|穆斯林|伊斯兰|种族|人种|族裔|肤色|皮肤|肤白|肤黑|白皙|浅肤|深肤|白皮|黑皮|黑人|白人|宗教|不招|不收|仅招|只招|限制|招生偏向/iu;
export function sensitiveSnippets(text: string): string[] {
  return text.split(/[\n。；;]+/u).map((part) => part.trim()).filter((part) => part && sensitive.test(part));
}
export function redactSensitiveSource(text: string): string {
  return text.split(/(\r?\n|[。；;])/u).map((part) => sensitive.test(part) ? "涉及招生限制，需内部核实" : part).join("");
}
export function redactPreferenceSource(text: string): string {
  return !text.trim() || /^(?:无|暂无|不限|无特殊要求|无特别偏好|无偏好)$/u.test(text.trim()) ? text : "有内部招生注意事项，需人工核实";
}
function hideContacts(text: string) { return text.replace(/(?:\b1[3-9]\d{9}\b)|(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g, "[联系方式已隐藏]"); }
function safeText(text: string) { return /DISPIMG\(/i.test(text) ? "图片内容待核实" : sensitive.test(text) ? "涉及招生限制，需内部核实" : hideContacts(text); }

const degreeLabels: Record<string, string> = { UG: "本科", MASTER: "硕士", PHD: "博士", LONG_TERM: "长期进修", SHORT_TERM: "短期项目" };
const seasonLabels = { SPRING: "春季", SUMMER: "夏季", AUTUMN: "秋季", WINTER: "冬季" } as const;
const seasonPatterns = { SPRING: /春季|春学期|\bspring\b/iu, SUMMER: /夏季|夏学期|\bsummer\b/iu, AUTUMN: /秋季|秋学期|\bautumn\b|\bfall\b|9月/iu, WINTER: /冬季|冬学期|\bwinter\b/iu } as const;

function seasonEvidence(program: MatchProgram, criteria: ChatCriteria) {
  if (!criteria.intakeSeason) return null;
  const text = program.semesterText?.trim() ?? "";
  if (!text) return { label: "入学季", level: "UNKNOWN" as const, detail: "入学季信息不足，需核实" };
  const years = [...new Set(text.match(/20\d{2}/g) ?? [])];
  if (criteria.intakeYear != null && years.length > 0 && !years.includes(String(criteria.intakeYear))) {
    return { label: "入学季", level: "UNKNOWN" as const, detail: "目标年份的入学季尚未确认" };
  }
  const scoped = criteria.intakeYear != null && years.length > 1
    ? text.split(/(?=20\d{2})/u).filter((part) => part.startsWith(String(criteria.intakeYear))).join(" ")
    : text;
  const mentioned = (Object.keys(seasonPatterns) as Array<keyof typeof seasonPatterns>).filter((season) => seasonPatterns[season].test(scoped));
  if (!mentioned.length) return { label: "入学季", level: "UNKNOWN" as const, detail: "目标年份的入学季尚未确认" };
  if (mentioned.includes(criteria.intakeSeason)) {
    if (criteria.intakeYear != null && years.length === 0) {
      return { label: "入学季", level: "UNKNOWN" as const, detail: `项目常规含${seasonLabels[criteria.intakeSeason]}入学，${criteria.intakeYear} 年批次需核实` };
    }
    return { label: "入学季", level: "PASS" as const, detail: `项目资料列有${seasonLabels[criteria.intakeSeason]}入学` };
  }
  if (criteria.intakeYear == null || years.length === 0) return { label: "入学季", level: "UNKNOWN" as const, detail: "目标年份的入学季尚未确认" };
  return { label: "入学季", level: "FAIL" as const, detail: `项目资料未列出${seasonLabels[criteria.intakeSeason]}入学` };
}

function annualTuition(text: string): number | null {
  const normalized = text.normalize("NFKC").replace(/[\s,，]/gu, "");
  const match = normalized.match(/^(?:(?:本科|硕士|博士)(?:学费)?[:：]?|学费(?:标准)?[:：]?)?(?:人民币|RMB|¥)?(\d+(?:\.\d+)?)(万)?(?:元)?(?:\/年|每年|\/学年|每学年|年)$/iu)
    ?? normalized.match(/^(?:(?:本科|硕士|博士)?学费[:：]?)?(?:每年|每学年)(?:人民币|RMB|¥)?(\d+(?:\.\d+)?)(万)?(?:元)?$/iu);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] ? 10000 : 1);
  return Number.isFinite(value) && value <= 100000000 ? value : null;
}

function explicitDeadline(text: string): string | null {
  const match = text.normalize("NFKC").trim().match(/^(?:申请截止(?:日期)?[:：]?|截止(?:日期)?[:：]?|截至)?\s*(20\d{2})[年.\/-](\d{1,2})[月.\/-](\d{1,2})(?:日|号)?(?:截止|前)?$/u);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function programYears(program: MatchProgram): number[] {
  const text = [program.semesterText, program.applicationTimeText].filter(Boolean).join(" ");
  return [...new Set((text.match(/20\d{2}/gu) ?? []).map(Number))].sort((a, b) => a - b);
}

export function sourceYearFor(program: MatchProgram): number | null {
  const years = programYears(program);
  return years.length ? years[years.length - 1] : null;
}

export function feeFreshnessFor(program: MatchProgram, intakeYear: number | null | undefined, now = new Date()): DataFreshness {
  const years = programYears(program);
  if (!years.length) return "unknown";
  const target = intakeYear ?? Number(shanghaiDate(now).slice(0, 4));
  if (years.includes(target)) return "current";
  if (years.every((year) => year < target)) return "historical";
  return "unknown";
}

function feeTimingConcern(program: MatchProgram, intakeYear: number | null | undefined, freshness: DataFreshness, hasCurrentListFee: boolean) {
  const sourceYear = sourceYearFor(program);
  const target = intakeYear != null ? `${intakeYear} 年` : "目标批次";
  const listed = hasCurrentListFee ? "名单列有当期学费；" : "";
  if (freshness === "historical") {
    return listed
      ? `${listed}知识库首年总费用来自 ${sourceYear ?? "较早年份"} 年资料，需核实 ${target}完整费用`
      : `资料为 ${sourceYear ?? "较早年份"} 年资料，约 ${program.firstYearCostMax?.toLocaleString("zh-CN")} 元，需核实 ${target}收费`;
  }
  if (sourceYear != null) {
    return `${listed}知识库费用资料年份为 ${sourceYear} 年，与 ${target}不一致，需核实完整费用`;
  }
  return listed
    ? `${listed}知识库首年总费用未注明适用年份，需核实 ${target}完整费用`
    : `知识库首年费用未注明适用年份，约 ${program.firstYearCostMax?.toLocaleString("zh-CN")} 元，需核实 ${target}收费`;
}

function safeSchoolWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(trimmed) ? `https://${trimmed}` : "";
  if (!withScheme) return null;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function projectFacts(program: MatchProgram, tuition: number | null, tuitionStatus: ProjectFacts["tuitionStatus"], feeFreshness: DataFreshness): ProjectFacts {
  const valid = (value: number | null) => value != null && Number.isFinite(value) && value >= 0 ? value : null;
  const scholarshipText = program.scholarshipCategory?.trim() ?? "";
  const hasNegatedFull = /(?:不提供|无|非|不含).{0,6}(?:全额|全奖|奖学金)/u.test(scholarshipText);
  const classified = hasNegatedFull ? "unknown" : classifyScholarshipText(scholarshipText);
  const scholarship = classified === "full" ? "full" : classified === "available" ? "available" : "unknown";
  return {
    tuition,
    tuitionStatus,
    teachingLanguage: program.teachingLanguage === "CHINESE" || program.teachingLanguage === "ENGLISH" ? program.teachingLanguage : "UNKNOWN",
    gpaMin: valid(program.gpaMin),
    gpaScale: valid(program.gpaScale),
    ielts: valid(program.ieltsMin),
    toefl: valid(program.toeflMin),
    duolingo: valid(program.duolingoMin),
    hskLevel: valid(program.hskLevelMin),
    hskScore: valid(program.hskScoreMin),
    scholarship,
    scholarshipText: scholarshipText || null,
    sourceYear: sourceYearFor(program),
    feeFreshness,
  };
}

function candidateQuality(points: EvidencePoint[], criteria: ChatCriteria): "candidate" | "insufficient" {
  if (criteria.cscaRequirement && !points.some((point) => point.label === "学校 CSCA 要求" && point.level === "PASS")) return "insufficient";
  const hasMajorFilter = Boolean(criteria.targetMajor || criteria.targetMajors?.length);
  const hasLocationFilter = Boolean(criteria.city || criteria.province || criteria.cities?.length || criteria.fallbackCities?.length);
  const required = [criteria.programType && "申请学历", hasMajorFilter && "专业", hasLocationFilter && "地区"].filter(Boolean);
  if (required.some((label) => !points.some((point) => point.label === label && point.level !== "UNKNOWN"))) return "insufficient";
  if (required.length || !Object.values(criteria).some(hasCriteriaValue)) return "candidate";
  return points.some((point) => point.label !== "申请截止" && point.level !== "UNKNOWN") ? "candidate" : "insufficient";
}

function candidateRelevance(points: EvidencePoint[], quality: "candidate" | "insufficient") {
  return (quality === "candidate" ? 1000 : 0) + points.reduce((score, point) => {
    if (point.level === "UNKNOWN") return score - 2;
    if (point.level === "NEED") return score + (point.label === "专业" ? 10 : -1);
    if (point.label === "申请截止") return score;
    return score + (point.label === "专业" ? 50 : point.label === "申请学历" ? 20 : 10);
  }, 0);
}

function evidencePoint(item: { label: string; level: "PASS" | "NEED" | "UNKNOWN"; detail: string }, program: MatchProgram, criteria: ChatCriteria): EvidencePoint {
  const { label, level } = item;
  const exemptionSource = program.programType === "UG" ? "项目知识库 · 招生要求" : "项目知识库 · CSCA 适用学历";
  if (label === "学校 CSCA 要求") {
    if (level === "UNKNOWN") return { label, level, text: "学校是否要求 CSCA 尚未明确" };
    return { label, level, text: program.cscaStatus === "NOT_REQUIRED" ? (program.programType === "UG" ? "学校明确不要求 CSCA" : "项目学历不适用本科 CSCA") : "学校明确要求 CSCA", source: program.cscaStatus === "NOT_REQUIRED" ? exemptionSource : undefined };
  }
  if (label === "CSCA") {
    if (level === "UNKNOWN") return { label, level, text: "学校是否要求 CSCA 尚未明确" };
    if (level === "NEED") return { label, level, text: program.cscaStatus === "REQUIRED" && criteria.hasCsca === false ? "学校要求 CSCA，学生目前还没有" : "CSCA 条件还需要补充或核实" };
    return { label, level, text: program.cscaStatus === "NOT_REQUIRED" ? (program.programType === "UG" ? "学校明确不要求 CSCA" : "项目学历不适用本科 CSCA") : "学生已有 CSCA", source: program.cscaStatus === "NOT_REQUIRED" ? exemptionSource : undefined };
  }
  if (level === "UNKNOWN") return { label, level, text: label === "申请截止" ? "申请截止时间尚未确认" : `${label}信息不足，暂时无法判断` };
  if (level === "NEED") return { label, level, text: label === "专业" ? "找到可能相关的专业方向，需确认是否符合目标专业" : label === "首年预算" || label === "费用冲突" || label === "申请截止" ? safeText(item.detail) : `${label}还需要补充或核实` };
  if (label === "申请学历") return { label, level, text: `有${degreeLabels[program.programType] ?? "目标学历"}项目` };
  if (label === "授课语言") return { label, level, text: `项目为${program.teachingLanguage === "ENGLISH" ? "英文" : program.teachingLanguage === "CHINESE" ? "中文" : "目标语言"}授课` };
  if (label === "专业") {
    const majors = splitMajorQueries(criteria.targetMajor, criteria.targetMajors);
    if (item.detail.includes("命中“")) return { label, level, text: item.detail };
    return { label, level, text: majors.length ? `专业信息中包含“${majors.slice(0, 3).join(" / ")}”` : "专业信息与要求匹配" };
  }
  if (label === "奖学金") {
    const matched = item.detail.match(/（匹配：([^）]+)）/u)?.[1];
    if (matched) return { label, level, text: `项目列有可申请奖学金（匹配：${matched}），资格需核实` };
    return { label, level, text: criteria.scholarshipType === "full" ? "学校列有全额奖学金，申请资格需要确认" : "学校有奖学金信息，覆盖范围和申请资格需要确认" };
  }
  if (label === "住宿") return { label, level, text: "学校有住宿资料，房型和名额需要确认" };
  if (label === "申请截止") return { label, level, text: program.deadlineDate ? `库内截止日期为 ${program.deadlineDate.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}，需确认适用批次` : "申请时间需核实" };
  return { label, level, text: safeText(item.detail) };
}

function isNonDegreeExchangeProgram(programName: string) {
  return /(?:交换生|校际交流|visiting\s*student|exchange\s*program)/iu.test(programName)
    && !/(?:本科|硕士|博士|学士|degree|bachelor|master|phd)/iu.test(programName);
}

export function buildResults(rows: ListRow[], programs: SearchProgram[], schools: SchoolInfo[], partners: PartnerEntry[], criteria: ChatCriteria, privileged: boolean, showOther: boolean, progress?: SearchProgress, exclusions?: ResultExclusions, feedbackScores?: ReadonlyMap<string, number>, diagnosticInput?: AdmissionDiagnostic) {
  const diagnostic = diagnosticInput ?? evaluateAdmissionRules(criteria);
  if (diagnostic.state === "CIRCUIT_BREAKER") {
    const stopNotes = [
      ...diagnostic.gate1StopReasons,
      ...diagnostic.bottlenecks.filter((b) => b.severity === "STOP").map((b) => b.effect),
    ];
    progress?.onPartnerSearchComplete?.({ confirmed: 0, pending: 0, searchingOthers: false });
    return {
      confirmed: [],
      pending: [],
      other: [],
      otherHidden: true,
      excludedSchoolCount: 0,
      ...(stopNotes.length ? { eliminatedNotes: [...new Set(stopNotes)] } : {}),
    };
  }
  const rowGroups = new Map<string, ListRow[]>();
  for (const row of rows) rowGroups.set(schoolIdentityKey(row.name), [...(rowGroups.get(schoolIdentityKey(row.name)) ?? []), row]);
  const schoolByName = new Map(schools.map((school) => [schoolIdentityKey(school.name), school]));
  const partnerByName = new Map(partners.map((partner) => [schoolIdentityKey(partner.name), partner]));
  const groupedPrograms = new Map<string, SearchProgram[]>();
  for (const p of programs) groupedPrograms.set(schoolIdentityKey(p.schoolName), [...(groupedPrograms.get(schoolIdentityKey(p.schoolName)) ?? []), p]);
  const excludedSchoolKeys = new Set([...(exclusions?.schoolKeys ?? [])].map(schoolIdentityKey));
  const excludedProgramIds = new Set(exclusions?.programIds ?? []);
  const excludedKeys = new Set<string>();
  const eliminatedNotes: string[] = [];
  const isDegreeSearch = !criteria.programType || ["UG", "MASTER", "PHD"].includes(criteria.programType);
  const allowVocational = diagnostic.allowVocationalDiploma;
  const nonMatcherKeys = new Set([
    "cscaRequirement", "intakeSeason", "targetSchools", "degreeBackground", "plannedExams",
    "wantTiering", "customQuestions", "noFoundation", "failedCourseCount",
    "hskVersion", "hasHskk", "languageStatus", "hasMoiCertificate", "cscaScore",
    "cscaMathScore", "cscaPhysicsScore", "cscaChineseScore", "cscaMinSubjectScore",
    "isChineseOrigin", "chineseOriginCompliant", "highestEducation", "associateWorkYears",
    "complianceFlags", "mbbsSubjectScores", "consultationMonth",
  ]);
  const matchingCriteria = Object.fromEntries(
    Object.entries(criteria).filter(([key, value]) =>
      !nonMatcherKeys.has(key)
      && hasCriteriaValue(value),
    ),
  ) as ScreeningCriteria;
  type ScoredCard = ResultCard & { relevance: number };
  const confirmed: ScoredCard[] = [], pending: ScoredCard[] = [], other: ScoredCard[] = [];
  const strictMajor = criteria.strictMajor && criteria.targetMajor ? normalizeKeyword(criteria.targetMajor) : "";
  const evidenceFor = (p: MatchProgram, options?: { skipBudgetHardGate?: boolean }) => {
    const evaluated = evaluateProgram(p, matchingCriteria);
    const evidence = evaluated.evidence.map((item) => {
      if ((item.label === "申请学历" && p.programType === "UNKNOWN") || (item.label === "授课语言" && p.teachingLanguage === "UNKNOWN")) return { ...item, level: "UNKNOWN" as const, detail: "信息未知，需核实" };
      if (item.label === "申请学历" && item.level === "FAIL" && diagnostic.state === "DOWNGRADE_LOCK" && (p.programType === "LONG_TERM" || (allowVocational && isJuniorCollegeOrSecondarySchool(p.schoolName, p.schoolTags)))) {
        return { ...item, level: "PASS" as const, detail: p.programType === "LONG_TERM" ? "降级路径匹配：1年语言预科/汉语进修" : "降级路径匹配：高职大专承接" };
      }
      if (item.label === "奖学金" && !p.scholarshipCategory && !criteria.excludeSelfFunded) return { ...item, level: "UNKNOWN" as const, detail: "学校资料中未查到奖学金信息" };
      if (item.label === "入学年份" && criteria.intakeYear != null && !p.semesterText?.includes(String(criteria.intakeYear))) return { ...item, level: "UNKNOWN" as const, detail: "入学年份尚未确认" };
      return item;
    });
    if (strictMajor) {
      const major = evidence.find((item) => item.label === "专业");
      if (major && !splitMajorText(p.majorText).some((name) => normalizeKeyword(name) === strictMajor)) {
        major.level = "FAIL";
        major.detail = "项目专业未与指定名称确切匹配";
      }
    }
    const season = seasonEvidence(p, criteria);
    if (season) evidence.push(season);
    if (criteria.cscaRequirement) {
      evidence.push(p.cscaStatus === "UNKNOWN"
        ? { label: "学校 CSCA 要求", level: "UNKNOWN", detail: "学校是否要求 CSCA 尚未明确" }
        : p.cscaStatus === criteria.cscaRequirement
          ? { label: "学校 CSCA 要求", level: "PASS", detail: "符合学校 CSCA 要求筛选条件" }
          : { label: "学校 CSCA 要求", level: "FAIL", detail: "不符合学校 CSCA 要求筛选条件" });
    }
    // Stage 3 deterministic 10-dimensional hard filter (zero-escalation & pathway lock)
    const hardRule = evaluateSchoolAgainstRules(diagnostic, criteria, {
      schoolName: p.schoolName,
      schoolTags: p.schoolTags,
      qsRanking: p.qsRanking,
      programName: p.programName,
      programType: p.programType,
      teachingLanguage: p.teachingLanguage,
      firstYearCostMax: options?.skipBudgetHardGate ? null : p.firstYearCostMax,
      scholarshipSummary: p.scholarshipCategory,
      city: p.city,
    });
    if (!hardRule.eligible) {
      evidence.push({ label: "规则硬闸门", level: "FAIL", detail: hardRule.reasons[0] ?? "不符合确定性准入与档位规则" });
    }
    return { evidence, expired: evaluated.effectiveDeadlineStatus === "EXPIRED", hardRule };
  };
  const inferMajorMatchType = (evidence: { label: string; level: string; detail: string }[]): "exact" | "synonym" | "semantic" | "none" => {
    const major = evidence.find((e) => e.label === "专业");
    if (!major) return "none";
    if (major.level === "PASS") return "exact";
    if (major.level === "NEED") return major.detail.includes("语义召回") ? "semantic" : "synonym";
    return "none";
  };
  const cityLabelFor = (p: MatchProgram) => [p.province, p.city].filter(Boolean).join(" · ") || null;
  const makeWarnings = (list: ListRow[], school: SchoolInfo | undefined, partner: PartnerEntry | undefined, program?: SearchProgram) => {
    const updated = school?.updatedAt ? new Date(school.updatedAt) : null;
    const time = updated && !Number.isNaN(updated.getTime()) ? `学校资料更新于 ${updated.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}` : "学校资料更新时间未提供";
    const schoolNotes = [{ source: "学校内部信息", text: school?.preference ?? null, reviewAll: true }, ...(school?.internalNotes ?? []).map((note) => ({ ...note, reviewAll: false }))];
    const snippets = [
      ...list.flatMap((r) => (r.rawFields ?? r.fields).flatMap(sensitiveSnippets).map((text) => ({ text, source: `招生表 ${r.sheet ?? "Sheet1"} 第 ${r.row} 行（名单更新时间未提供）` }))),
      ...schoolNotes.flatMap((note) => (note.reviewAll ? (note.text ?? "").split(/[\n。；;]+/u).map((text) => text.trim()).filter((text) => text && !/^(?:无|暂无|不限|无特殊要求|无特别偏好|无偏好)$/u.test(text)) : sensitiveSnippets(note.text ?? "")).map((text) => ({ text, source: `${note.source}（${time}）` }))),
      ...sensitiveSnippets(partner?.note ?? "").map((text) => ({ text, source: "内部合作台账（台账更新时间未提供）" })),
      ...sensitiveSnippets(program?.requirementsText ?? "").map((text) => ({ text, source: "知识库项目要求（项目资料更新时间未提供）" })),
      ...sensitiveSnippets(program?.attentionText ?? "").map((text) => ({ text, source: "知识库项目资料（项目资料更新时间未提供）" })),
    ];
    if (!snippets.length) return [];
    if (!privileged) return ["有内部招生注意事项，请联系有权限的同事核实"];
    return [...new Set(snippets.map(({ text, source }) => `${source}：${hideContacts(text).slice(0, 200)}`))].map((s) => `敏感信息，需人工核实：${s}`);
  };
  for (const [key, list] of rowGroups) {
    if (excludedSchoolKeys.has(key)) { excludedKeys.add(key); continue; }
    const school = schoolByName.get(key), partner = partnerByName.get(key);
    const blocked = list.some((r) => r.noCooperation) || partner?.status === "not_cooperating";
    const isConfirmed = !blocked && partner?.status === "confirmed";
    const ps = (groupedPrograms.get(key) ?? [])
      .filter((program) => !excludedProgramIds.has(program.id))
      .filter((program) => !isDegreeSearch || ((allowVocational || !isJuniorCollegeOrSecondarySchool(program.schoolName, program.schoolTags)) && !isNonDegreeExchangeProgram(program.programName)));
    const applicable = ps.map((p) => {
      const feeColumn = p.programType === "UG" ? 10 : p.programType === "MASTER" ? 11 : p.programType === "PHD" ? 12 : null;
      const feeTexts = feeColumn == null ? [] : list.map((row) => row.fields[feeColumn]?.trim() ?? "").filter(Boolean);
      const fees = feeTexts.map(annualTuition);
      const uniqueFees = new Set(fees.filter((fee): fee is number => fee != null));
      const conflict = uniqueFees.size > 1 || (p.firstYearCostMax != null && !p.costIncomplete && fees.some((fee) => fee != null && fee > p.firstYearCostMax!));
      const feeUnclear = feeTexts.length > 0 && fees.some((fee) => fee == null);
      const result = evidenceFor(p, { skipBudgetHardGate: conflict || feeUnclear });
      const feeFreshness = feeFreshnessFor(p, criteria.intakeYear);
      const budget = result.evidence.find((item) => item.label === "首年预算");
      if ((conflict || feeUnclear) && budget && (budget.level === "PASS" || budget.level === "FAIL")) {
        budget.level = "NEED";
        budget.detail = conflict ? "招生表学费与知识库首年费用冲突，需核实" : "招生表费用口径不明确，需核实预算";
      } else if (conflict && !budget) result.evidence.push({ label: "费用冲突", level: "NEED", detail: "招生表学费与知识库首年费用冲突，需核实" });
      if (feeFreshness !== "current" && budget && budget.level === "PASS" && p.firstYearCostMax != null) {
        budget.level = "NEED";
        budget.detail = feeTimingConcern(p, criteria.intakeYear, feeFreshness, uniqueFees.size > 0);
      }
      const dateTexts = list.map((row) => row.fields[15]?.trim() ?? "").filter(Boolean);
      const dates = dateTexts.map(explicitDeadline);
      const deadline = result.evidence.find((item) => item.label === "申请截止");
      const differs = p.deadlineDate && Number.isFinite(p.deadlineDate.getTime()) && dates.some((date) => date != null && date !== shanghaiDate(p.deadlineDate!));
      const historicalDeadline = feeFreshness === "historical" && deadline?.level === "PASS";
      if (deadline && (differs || (dateTexts.length > 0 && dates.some((date) => date == null)) || result.expired || historicalDeadline)) {
        deadline.level = "NEED";
        deadline.detail = differs ? "招生表与知识库截止日期不一致，需核实批次" : result.expired ? "库内截止日期已过，需核实新的招生批次" : historicalDeadline ? `资料为 ${sourceYearFor(p) ?? "较早年份"} 年及以前，截止日期需确认适用于${criteria.intakeYear ? ` ${criteria.intakeYear} 年` : "当前"}批次` : "招生表申请时间尚未明确，需核实批次";
        result.expired = false;
      }
      const comparableCost = !conflict && !feeUnclear && !p.costIncomplete ? p.firstYearCostMax : null;
      const tuitionStatus = conflict ? "conflict" as const : !feeUnclear && uniqueFees.size === 1 ? "known" as const : "unknown" as const;
      const facts = projectFacts(p, tuitionStatus === "known" ? [...uniqueFees][0] : null, tuitionStatus, feeFreshness);
      return { p, result, comparableCost, facts };
    }).filter(({ p, result }) => {
      const gateFail = result.evidence.find((e) => (e.label === "GPA" || e.label === "规则硬闸门") && e.level === "FAIL");
      if (gateFail && (matchesTargetSchoolPool(p.schoolName, criteria.targetSchools) || gateFail.label === "规则硬闸门")) {
        eliminatedNotes.push(`${p.schoolName}：${gateFail.detail}`);
      }
      return !result.evidence.some((e) => e.level === "FAIL") && !result.expired;
    });
    const warnings = makeWarnings(list, school, partner);
    const sources = list.map((row) => `招生表 ${row.sheet ?? "Sheet1"} 第 ${row.row} 行`);
    const schoolOfficialUrl = safeSchoolWebsite(school?.website);
    const base = { name: list[0].name, schoolKey: key, schoolId: school?.id, sources, warning: warnings, yellow: list.some((r) => r.yellow), image: list.some((r) => r.image), ...(schoolOfficialUrl ? { officialUrl: schoolOfficialUrl } : {}) };
    const columns = { LONG_TERM: 7, SHORT_TERM: 7, UG: 10, MASTER: 11, PHD: 12 };
    const listEvidence = (type?: keyof typeof columns | null) => list.flatMap((row) => {
      const tuition = type ? row.fields[columns[type]] : "";
      const deadline = row.fields[15];
      if (!privileged) return tuition || deadline ? [`名单第 ${row.row} 行有招生资料，需核实`] : [];
      return [tuition && `名单第 ${row.row} 行招生信息（需核实）：${safeText(tuition).slice(0, 500)}`, deadline && `名单第 ${row.row} 行申请时间（需核实）：${safeText(deadline).slice(0, 500)}`].filter(Boolean);
    });
    const displayEvidence = (e: {label: string; detail: string; level: string}) => `${e.label}：${privileged ? safeText(e.detail) : ({ PASS: "符合已知条件", NEED: "需要补充或核实", UNKNOWN: "信息未知，需核实", FAIL: "不符合" }[e.level] ?? "需核实")}`;
    const cards: ScoredCard[] = applicable.map(({p, result, comparableCost, facts}) => {
      const validEvidence = result.evidence.filter((e): e is typeof e & {level: "PASS" | "NEED" | "UNKNOWN"} => e.level !== "FAIL");
      const points = validEvidence.map((e) => evidencePoint(e, p, criteria));
      const quality = candidateQuality(points, criteria);
      const cooperation = blocked ? "not_cooperating" as const : isConfirmed && partner?.programIds?.includes(p.id) ? "project_confirmed" as const : "listed" as const;
      const isFallbackCity = result.evidence.some((e) => e.label === "地区" && e.detail.startsWith("备选城市："));
      const breakdown = scoreCandidate({
        schoolName: list[0].name,
        schoolTags: p.schoolTags,
        qsRanking: p.qsRanking,
        partnershipRating: p.partnershipRating,
        cooperation,
        verified: Boolean(p.manuallyVerified && p.reviewStatus === "VERIFIED"),
        feeFreshness: facts.feeFreshness,
        scholarshipCategory: p.scholarshipCategory,
        scholarshipContent: p.scholarshipContent,
        majorMatchType: inferMajorMatchType(result.evidence),
        isFallbackCity,
        points,
        feedbackScore: feedbackScores?.get(p.id) ?? 0,
        program: p,
      }, criteria);
      const relevance = (quality === "candidate" ? 1000 : 0) + breakdown.total * 10 + candidateRelevance(points, quality) * 0.01;
      return { ...base, kind: "project", schoolId: p.schoolId, programId: p.id, quality, points, relevance, score: breakdown.total, tier: breakdown.tier, tierReason: breakdown.tierReason, scoreBreakdown: breakdown, cityLabel: cityLabelFor(p), schoolTags: p.schoolTags, qsRanking: p.qsRanking && p.qsRanking > 0 ? p.qsRanking : null, comparableCost, facts, verified: Boolean(p.manuallyVerified && p.reviewStatus === "VERIFIED"), warning: makeWarnings(list, school, partner, p), program: p.programName, cooperation, fit: result.evidence.some((e) => e.level !== "PASS") ? "条件待核实" : "已知条件符合", evidence: [...result.evidence.map(displayEvidence), ...listEvidence(p.programType as keyof typeof columns)] };
    });
    if (!cards.length) {
      const detail = ps.length ? "知识库未找到符合本次条件的项目，是否有其他合适项目需核实" : "知识库未找到同名项目，学历、费用和申请条件需核实";
      cards.push({ ...base, kind: "school", verified: false, points: [{ label: "项目", level: "UNKNOWN", text: detail }], relevance: -1000, program: "招生名单院校", cooperation: blocked ? "not_cooperating" : "listed", fit: "资料不足", evidence: [detail, ...listEvidence(criteria.programType), "申请时间需核实"] });
    }
    for (const card of cards) {
      const complete = card.fit === "已知条件符合";
      if (blocked) other.push({ ...card, fit: "名单标注不合作，需核实" });
      else if (card.kind === "project" && complete && card.quality !== "insufficient") confirmed.push(card);
      else pending.push(card);
    }
  }
  const partnerSchoolCount = new Set([...confirmed, ...pending]
    .filter((card) => card.kind === "project" && card.quality !== "insufficient" && card.cooperation !== "not_cooperating")
    .map((card) => card.schoolId ?? card.schoolKey ?? schoolIdentityKey(card.name))).size;
  const searchingOthers = confirmed.length === 0 || partnerSchoolCount < DEFAULT_DISPLAY_SCHOOL_COUNT || showOther || Boolean(criteria.targetSchools?.length);
  progress?.onPartnerSearchComplete?.({ confirmed: confirmed.length, pending: pending.length, searchingOthers });
  for (const [key, ps] of searchingOthers ? groupedPrograms : []) {
    if (rowGroups.has(key)) continue;
    if (excludedSchoolKeys.has(key)) { excludedKeys.add(key); continue; }
    const availablePrograms = ps
      .filter((program) => !excludedProgramIds.has(program.id))
      .filter((program) => !isDegreeSearch || ((allowVocational || !isJuniorCollegeOrSecondarySchool(program.schoolName, program.schoolTags)) && !isNonDegreeExchangeProgram(program.programName)));
    if (!availablePrograms.length) continue;
    const school = schoolByName.get(key);
    for (const p of availablePrograms) {
      const result = evidenceFor(p);
      const feeFreshness = feeFreshnessFor(p, criteria.intakeYear);
      const deadline = result.evidence.find((item) => item.label === "申请截止");
      if (deadline && (result.expired || (feeFreshness === "historical" && deadline.level === "PASS"))) {
        deadline.level = "NEED";
        deadline.detail = result.expired
          ? "库内截止日期已过，需核实新的招生批次"
          : `资料为 ${sourceYearFor(p) ?? "较早年份"} 年及以前，截止日期需确认适用于${criteria.intakeYear ? ` ${criteria.intakeYear} 年` : "当前"}批次`;
        result.expired = false;
      }
      if (result.expired) continue;
      const failItem = result.evidence.find((e) => e.level === "FAIL");
      if (failItem) {
        if ((failItem.label === "GPA" && matchesTargetSchoolPool(p.schoolName, criteria.targetSchools)) || failItem.label === "规则硬闸门") {
          eliminatedNotes.push(`${p.schoolName}：${failItem.detail}`);
        }
        continue;
      }
      const budget = result.evidence.find((item) => item.label === "首年预算");
      if (feeFreshness !== "current" && budget?.level === "PASS" && p.firstYearCostMax != null) {
        budget.level = "NEED";
        budget.detail = feeTimingConcern(p, criteria.intakeYear, feeFreshness, false);
      }
      const validEvidence = result.evidence.filter((e): e is typeof e & {level: "PASS" | "NEED" | "UNKNOWN"} => e.level !== "FAIL");
      const points = validEvidence.map((e) => evidencePoint(e, p, criteria));
      const quality = candidateQuality(points, criteria);
      const facts = projectFacts(p, null, "unknown", feeFreshness);
      const isFallbackCity = result.evidence.some((e) => e.label === "地区" && e.detail.startsWith("备选城市："));
      const breakdown = scoreCandidate({
        schoolName: p.schoolName,
        schoolTags: p.schoolTags,
        qsRanking: p.qsRanking,
        partnershipRating: p.partnershipRating,
        cooperation: "unknown",
        verified: Boolean(p.manuallyVerified && p.reviewStatus === "VERIFIED"),
        feeFreshness,
        scholarshipCategory: p.scholarshipCategory,
        scholarshipContent: p.scholarshipContent,
        majorMatchType: inferMajorMatchType(result.evidence),
        isFallbackCity,
        points,
        feedbackScore: feedbackScores?.get(p.id) ?? 0,
        program: p,
      }, criteria);
      const relevance = (quality === "candidate" ? 1000 : 0) + breakdown.total * 10 + candidateRelevance(points, quality) * 0.01;
      const otherOfficialUrl = safeSchoolWebsite(school?.website);
      other.push({ name: p.schoolName, schoolKey: key, schoolId: p.schoolId, programId: p.id, kind: "project", quality, points, relevance, score: breakdown.total, tier: breakdown.tier, tierReason: breakdown.tierReason, scoreBreakdown: breakdown, cityLabel: cityLabelFor(p), schoolTags: p.schoolTags, qsRanking: p.qsRanking && p.qsRanking > 0 ? p.qsRanking : null, comparableCost: p.costIncomplete ? null : p.firstYearCostMax, facts, verified: Boolean(p.manuallyVerified && p.reviewStatus === "VERIFIED"), program: p.programName, cooperation: "unknown", fit: result.evidence.some((e) => e.level !== "PASS") ? "条件待核实" : "已知条件符合", evidence: result.evidence.map((e) => `${e.label}：${privileged ? safeText(e.detail) : ({ PASS: "符合已知条件", NEED: "需要补充或核实", UNKNOWN: "信息未知，需核实", FAIL: "不符合" }[e.level])}`), sources: ["知识库项目"], warning: makeWarnings([], school, partnerByName.get(key), p), yellow: false, image: false, ...(otherOfficialUrl ? { officialUrl: otherOfficialUrl } : {}) });
    }
  }
  const sortByRelevance = (a: ScoredCard, b: ScoredCard) =>
    b.relevance - a.relevance
    || ((b.score ?? 0) - (a.score ?? 0))
    || a.name.localeCompare(b.name, "zh-CN");
  confirmed.sort(sortByRelevance); pending.sort(sortByRelevance); other.sort(sortByRelevance);

  const rebalancedSource = [...confirmed, ...pending, ...other]
    .filter((card) => card.kind === "project" && card.quality !== "insufficient" && card.scoreBreakdown);
  if (rebalancedSource.length > 0) {
    const rebalanced = rebalancePoolTiers(rebalancedSource, {
      schoolKeyOf: (card) => card.schoolId ?? card.schoolKey ?? schoolIdentityKey(card.name),
      schoolNameOf: (card) => card.name,
      schoolTagsOf: (card) => card.schoolTags,
      qsRankingOf: (card) => card.qsRanking,
      scoreOf: (card) => card.score,
      tierOf: (card) => card.tier,
      canSafeOf: (card) => card.scoreBreakdown?.canEnterSafe,
      gapBandsOf: (card) => card.scoreBreakdown?.gapBands,
      difficultyOf: (card) => card.scoreBreakdown?.difficultyIndex,
      applyTier: (card, tier, reason) => {
        card.tier = tier;
        card.tierReason = reason;
        if (card.scoreBreakdown) {
          card.scoreBreakdown.tier = tier;
          card.scoreBreakdown.tierReason = reason;
        }
        return card;
      },
    });
    void rebalanced;
  }

  const clean = (cards: ScoredCard[]): ResultCard[] => cards.map(({ name, schoolKey: key, schoolId, programId, program, fit, quality, cooperation, evidence, points, kind, sources, warning, yellow, image, comparableCost, facts, verified, score, tier, tierReason, scoreBreakdown, cityLabel, schoolTags, qsRanking, officialUrl }) => ({ name, schoolKey: key, schoolId, programId, program, fit, quality, cooperation, evidence, points, kind, sources, warning, yellow, image, comparableCost, facts, verified, score, tier, tierReason, scoreBreakdown, cityLabel, schoolTags, qsRanking, ...(officialUrl ? { officialUrl } : {}) }));
  const uniqueEliminated = [...new Set(eliminatedNotes)];
  return {
    confirmed: clean(confirmed),
    pending: clean(pending),
    other: searchingOthers ? clean(other) : [],
    otherHidden: !searchingOthers,
    excludedSchoolCount: excludedKeys.size,
    ...(uniqueEliminated.length ? { eliminatedNotes: uniqueEliminated } : {}),
  };
}

import { z } from "zod";
import { evaluateProgram, type MatchProgram, type ScreeningCriteria } from "@/lib/matcher";
import { RECOMMENDED_SCHOOL_COUNT } from "@/lib/recommendation-profile";

export const criteriaSchema = z.object({
  programType: z.enum(["UG", "MASTER", "PHD", "LONG_TERM", "SHORT_TERM"]).nullable().optional(),
  teachingLanguage: z.enum(["CHINESE", "ENGLISH"]).nullable().optional(),
  targetMajor: z.string().max(100).nullable().optional(),
  budget: z.number().min(0).max(100000000).nullable().optional(),
  intakeYear: z.number().int().min(2020).max(2100).nullable().optional(),
  intakeSeason: z.enum(["SPRING", "SUMMER", "AUTUMN", "WINTER"]).nullable().optional(),
  gpa: z.number().min(0).max(100).nullable().optional(),
  gpaScale: z.number().positive().max(100).nullable().optional(),
  hskLevel: z.number().int().min(1).max(9).nullable().optional(),
  hskScore: z.number().min(0).max(300).nullable().optional(),
  ielts: z.number().min(0).max(9).nullable().optional(),
  toefl: z.number().min(0).max(120).nullable().optional(),
  duolingo: z.number().min(0).max(160).nullable().optional(),
  hasCsca: z.boolean().nullable().optional(),
  cscaRequirement: z.enum(["NOT_REQUIRED", "REQUIRED"]).nullable().optional(),
  scholarshipType: z.enum(["full", "any"]).nullable().optional(),
  accommodationRequired: z.boolean().nullable().optional(),
  age: z.number().int().min(1).max(120).nullable().optional(),
  city: z.string().max(30).nullable().optional(),
  province: z.string().max(30).nullable().optional(),
}).strict();
export type ChatCriteria = z.infer<typeof criteriaSchema>;

export type ListRow = { name: string; row: number; sheet?: string; yellow: boolean; fields: string[]; rawFields?: string[]; image: boolean; noCooperation: boolean };
export type PartnerEntry = { name: string; status: "confirmed" | "not_cooperating" | "unknown"; programIds?: string[]; note?: string };
export type SchoolInfo = { id: string; name: string; preference: string | null; updatedAt?: number | null; internalNotes?: { source: string; text: string | null }[] };
export type EvidencePoint = { label: string; level: "PASS" | "NEED" | "UNKNOWN"; text: string };
export type DataFreshness = "current" | "historical" | "unknown";
export type ProjectFacts = { tuition: number | null; tuitionStatus: "known" | "unknown" | "conflict"; teachingLanguage: "CHINESE" | "ENGLISH" | "UNKNOWN"; ielts: number | null; toefl: number | null; duolingo: number | null; hskLevel: number | null; hskScore: number | null; scholarship: "full" | "available" | "unknown"; sourceYear?: number | null; feeFreshness?: DataFreshness };
export type ResultCard = { name: string; schoolKey?: string; schoolId?: string; programId?: string; program: string; fit: string; quality?: "candidate" | "insufficient"; cooperation: "listed" | "project_confirmed" | "not_cooperating" | "unknown"; evidence: string[]; points: EvidencePoint[]; kind: "project" | "school"; sources: string[]; warning: string[]; yellow: boolean; image: boolean; comparableCost?: number | null; facts?: ProjectFacts; verified?: boolean };
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
  budget: /(?:预算|费用)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不用|不需要|取消)|(?:不限|不看|取消)[^。！？；;]{0,4}(?:预算|费用)/u,
  intakeYear: /(?:入学|批次|年份|季节)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)|(?:不限|取消)[^。！？；;]{0,4}(?:入学|批次|年份|季节)/u,
  intakeSeason: /(?:入学|批次|年份|季节)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)|(?:不限|取消)[^。！？；;]{0,4}(?:入学|批次|季节)/u,
  gpa: /(?:GPA|绩点|平均分)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  gpaScale: /(?:GPA|绩点|平均分)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  hskLevel: /(?:HSK|汉语水平)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  hskScore: /(?:HSK|汉语水平)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  ielts: /(?:雅思|IELTS)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  toefl: /(?:托福|TOEFL)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  duolingo: /(?:多邻国|Duolingo)[^。！？；;]{0,8}(?:不限|都可以|无所谓|没有|不要求|取消|不看)/iu,
  hasCsca: /CSCA[^。！？；;]{0,10}(?:不限|都可以|无所谓|不用|不需要|取消)/iu,
  cscaRequirement: /CSCA[^。！？；;]{0,10}(?:不限|都可以|无所谓|不用|不需要|取消)/iu,
  scholarshipType: /(?:奖学金|全奖)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  accommodationRequired: /(?:住宿)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  age: /(?:年龄)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  city: /(?:城市)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
  province: /(?:省份|地区)[^。！？；;]{0,8}(?:不限|都可以|无所谓|不用|不需要|取消)/u,
};

// The model may return null for fields it did not hear about. Keep the previous
// value unless the user explicitly asked to clear that condition.
export function mergeCriteria(previous: ChatCriteria, next: ChatCriteria, message: string): ChatCriteria {
  const merged: ChatCriteria = { ...previous, ...next };
  for (const key of Object.keys(next) as (keyof ChatCriteria)[]) {
    const value = next[key];
    const previousValue = previous[key];
    if ((value === null || value === "") && previousValue != null && previousValue !== "" && !clearPatterns[key]?.test(message)) {
      (merged as Record<string, unknown>)[key] = previousValue;
    }
  }
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
const seasonPatterns = { SPRING: /春季|春学期|\bspring\b/iu, SUMMER: /夏季|夏学期|\bsummer\b/iu, AUTUMN: /秋季|秋学期|\bautumn\b|\bfall\b/iu, WINTER: /冬季|冬学期|\bwinter\b/iu } as const;

function seasonEvidence(program: MatchProgram, criteria: ChatCriteria) {
  if (!criteria.intakeSeason) return null;
  const text = program.semesterText?.trim() ?? "";
  if (!text) return { label: "入学季", level: "UNKNOWN" as const, detail: "入学季信息不足，需核实" };
  const years = [...new Set(text.match(/20\d{2}/g) ?? [])];
  if (criteria.intakeYear != null && !years.includes(String(criteria.intakeYear))) return { label: "入学季", level: "UNKNOWN" as const, detail: "目标年份的入学季尚未确认" };
  const scoped = criteria.intakeYear != null && years.length > 1
    ? text.split(/(?=20\d{2})/u).filter((part) => part.startsWith(String(criteria.intakeYear))).join(" ")
    : text;
  const mentioned = (Object.keys(seasonPatterns) as Array<keyof typeof seasonPatterns>).filter((season) => seasonPatterns[season].test(scoped));
  if (!mentioned.length) return { label: "入学季", level: "UNKNOWN" as const, detail: "目标年份的入学季尚未确认" };
  if (mentioned.includes(criteria.intakeSeason)) return { label: "入学季", level: "PASS" as const, detail: `项目资料列有${seasonLabels[criteria.intakeSeason]}入学` };
  if (criteria.intakeYear == null) return { label: "入学季", level: "UNKNOWN" as const, detail: "目标年份的入学季尚未确认" };
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
  const target = intakeYear ?? Number(dateInShanghai(now).slice(0, 4));
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

function projectFacts(program: MatchProgram, tuition: number | null, tuitionStatus: ProjectFacts["tuitionStatus"], feeFreshness: DataFreshness): ProjectFacts {
  const valid = (value: number | null) => value != null && Number.isFinite(value) && value >= 0 ? value : null;
  const scholarshipText = program.scholarshipCategory?.trim() ?? "";
  const scholarship = /^(?:全额|全奖|完全奖学金|全额奖学金|full|full scholarship)$/iu.test(scholarshipText) ? "full" : /^(?:部分|部分奖学金|奖学金|partial|partial scholarship)$/iu.test(scholarshipText) ? "available" : "unknown";
  return { tuition, tuitionStatus, teachingLanguage: program.teachingLanguage === "CHINESE" || program.teachingLanguage === "ENGLISH" ? program.teachingLanguage : "UNKNOWN", ielts: valid(program.ieltsMin), toefl: valid(program.toeflMin), duolingo: valid(program.duolingoMin), hskLevel: valid(program.hskLevelMin), hskScore: valid(program.hskScoreMin), scholarship, sourceYear: sourceYearFor(program), feeFreshness };
}

function candidateQuality(points: EvidencePoint[], criteria: ChatCriteria): "candidate" | "insufficient" {
  const required = [criteria.programType && "申请学历", criteria.targetMajor && "专业"].filter(Boolean);
  if (required.some((label) => !points.some((point) => point.label === label && point.level !== "UNKNOWN"))) return "insufficient";
  if (required.length || !Object.values(criteria).some((value) => value != null && value !== "")) return "candidate";
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

function dateInShanghai(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function evidencePoint(item: { label: string; level: "PASS" | "NEED" | "UNKNOWN"; detail: string }, program: MatchProgram, criteria: ChatCriteria): EvidencePoint {
  const { label, level } = item;
  if (label === "学校 CSCA 要求") {
    if (level === "UNKNOWN") return { label, level, text: "学校是否要求 CSCA 尚未明确" };
    return { label, level, text: program.cscaStatus === "NOT_REQUIRED" ? "学校明确不要求 CSCA" : "学校明确要求 CSCA" };
  }
  if (label === "CSCA") {
    if (level === "UNKNOWN") return { label, level, text: "学校是否要求 CSCA 尚未明确" };
    if (level === "NEED") return { label, level, text: program.cscaStatus === "REQUIRED" && criteria.hasCsca === false ? "学校要求 CSCA，学生目前还没有" : "CSCA 条件还需要补充或核实" };
    return { label, level, text: program.cscaStatus === "NOT_REQUIRED" ? "学校明确不要求 CSCA" : "学生已有 CSCA" };
  }
  if (level === "UNKNOWN") return { label, level, text: label === "申请截止" ? "申请截止时间尚未确认" : `${label}信息不足，暂时无法判断` };
  if (level === "NEED") return { label, level, text: label === "专业" ? "找到可能相关的专业方向，需确认是否符合目标专业" : label === "首年预算" || label === "费用冲突" || label === "申请截止" ? safeText(item.detail) : `${label}还需要补充或核实` };
  if (label === "申请学历") return { label, level, text: `有${degreeLabels[program.programType] ?? "目标学历"}项目` };
  if (label === "授课语言") return { label, level, text: `项目为${program.teachingLanguage === "ENGLISH" ? "英文" : program.teachingLanguage === "CHINESE" ? "中文" : "目标语言"}授课` };
  if (label === "专业") return { label, level, text: criteria.targetMajor ? `专业信息中包含“${criteria.targetMajor}”` : "专业信息与要求匹配" };
  if (label === "奖学金") return { label, level, text: criteria.scholarshipType === "full" ? "学校列有全额奖学金，申请资格需要确认" : "学校有奖学金信息，覆盖范围和申请资格需要确认" };
  if (label === "住宿") return { label, level, text: "学校有住宿资料，房型和名额需要确认" };
  if (label === "申请截止") return { label, level, text: program.deadlineDate ? `库内截止日期为 ${program.deadlineDate.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}，需确认适用批次` : "申请时间需核实" };
  return { label, level, text: safeText(item.detail) };
}

export function buildResults(rows: ListRow[], programs: SearchProgram[], schools: SchoolInfo[], partners: PartnerEntry[], criteria: ChatCriteria, privileged: boolean, showOther: boolean, progress?: SearchProgress, exclusions?: ResultExclusions, feedbackScores?: ReadonlyMap<string, number>) {
  const rowGroups = new Map<string, ListRow[]>();
  for (const row of rows) rowGroups.set(schoolIdentityKey(row.name), [...(rowGroups.get(schoolIdentityKey(row.name)) ?? []), row]);
  const schoolByName = new Map(schools.map((school) => [schoolIdentityKey(school.name), school]));
  const partnerByName = new Map(partners.map((partner) => [schoolIdentityKey(partner.name), partner]));
  const groupedPrograms = new Map<string, SearchProgram[]>();
  for (const p of programs) groupedPrograms.set(schoolIdentityKey(p.schoolName), [...(groupedPrograms.get(schoolIdentityKey(p.schoolName)) ?? []), p]);
  const excludedSchoolKeys = new Set([...(exclusions?.schoolKeys ?? [])].map(schoolIdentityKey));
  const excludedProgramIds = new Set(exclusions?.programIds ?? []);
  const excludedKeys = new Set<string>();
  const matchingCriteria = Object.fromEntries(Object.entries(criteria).filter(([key, value]) => key !== "cscaRequirement" && key !== "intakeSeason" && value != null)) as ScreeningCriteria;
  type ScoredCard = ResultCard & { relevance: number };
  const confirmed: ScoredCard[] = [], pending: ScoredCard[] = [], other: ScoredCard[] = [];
  const evidenceFor = (p: MatchProgram) => {
    const evaluated = evaluateProgram(p, matchingCriteria);
    const evidence = evaluated.evidence.map((item) => {
      if ((item.label === "申请学历" && p.programType === "UNKNOWN") || (item.label === "授课语言" && p.teachingLanguage === "UNKNOWN")) return { ...item, level: "UNKNOWN" as const, detail: "信息未知，需核实" };
      if (item.label === "奖学金" && !p.scholarshipCategory) return { ...item, level: "UNKNOWN" as const, detail: "学校资料中未查到奖学金信息" };
      if (item.label === "入学年份" && criteria.intakeYear != null && !p.semesterText?.includes(String(criteria.intakeYear))) return { ...item, level: "UNKNOWN" as const, detail: "入学年份尚未确认" };
      return item;
    });
    const season = seasonEvidence(p, criteria);
    if (season) evidence.push(season);
    if (criteria.cscaRequirement) {
      evidence.push(p.cscaStatus === "UNKNOWN"
        ? { label: "学校 CSCA 要求", level: "UNKNOWN", detail: "学校是否要求 CSCA 尚未明确" }
        : p.cscaStatus === criteria.cscaRequirement
          ? { label: "学校 CSCA 要求", level: "PASS", detail: "符合学校 CSCA 要求筛选条件" }
          : { label: "学校 CSCA 要求", level: "FAIL", detail: "不符合学校 CSCA 要求筛选条件" });
    }
    return { evidence, expired: evaluated.effectiveDeadlineStatus === "EXPIRED" };
  };
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
    const ps = (groupedPrograms.get(key) ?? []).filter((program) => !excludedProgramIds.has(program.id));
    const applicable = ps.map((p) => {
      const result = evidenceFor(p);
      const feeColumn = p.programType === "UG" ? 10 : p.programType === "MASTER" ? 11 : p.programType === "PHD" ? 12 : null;
      const feeTexts = feeColumn == null ? [] : list.map((row) => row.fields[feeColumn]?.trim() ?? "").filter(Boolean);
      const fees = feeTexts.map(annualTuition);
      const uniqueFees = new Set(fees.filter((fee): fee is number => fee != null));
      const conflict = uniqueFees.size > 1 || (p.firstYearCostMax != null && !p.costIncomplete && fees.some((fee) => fee != null && fee > p.firstYearCostMax!));
      const feeUnclear = feeTexts.length > 0 && fees.some((fee) => fee == null);
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
      const differs = p.deadlineDate && Number.isFinite(p.deadlineDate.getTime()) && dates.some((date) => date != null && date !== dateInShanghai(p.deadlineDate!));
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
    }).filter(({result}) => !result.evidence.some((e) => e.level === "FAIL") && !result.expired);
    const warnings = makeWarnings(list, school, partner);
    const sources = list.map((row) => `招生表 ${row.sheet ?? "Sheet1"} 第 ${row.row} 行`);
    const base = { name: list[0].name, schoolKey: key, schoolId: school?.id, sources, warning: warnings, yellow: list.some((r) => r.yellow), image: list.some((r) => r.image) };
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
      const relevance = candidateRelevance(points, quality);
      return { ...base, kind: "project", schoolId: p.schoolId, programId: p.id, quality, points, relevance, comparableCost, facts, verified: Boolean(p.manuallyVerified && p.reviewStatus === "VERIFIED"), warning: makeWarnings(list, school, partner, p), program: p.programName, cooperation: blocked ? "not_cooperating" : isConfirmed && partner?.programIds?.includes(p.id) ? "project_confirmed" : "listed", fit: result.evidence.some((e) => e.level !== "PASS") ? "条件待核实" : "已知条件符合", evidence: [...result.evidence.map(displayEvidence), ...listEvidence(p.programType as keyof typeof columns)] };
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
  const searchingOthers = confirmed.length === 0 || partnerSchoolCount < RECOMMENDED_SCHOOL_COUNT || showOther;
  progress?.onPartnerSearchComplete?.({ confirmed: confirmed.length, pending: pending.length, searchingOthers });
  for (const [key, ps] of searchingOthers ? groupedPrograms : []) {
    if (rowGroups.has(key)) continue;
    if (excludedSchoolKeys.has(key)) { excludedKeys.add(key); continue; }
    const availablePrograms = ps.filter((program) => !excludedProgramIds.has(program.id));
    if (!availablePrograms.length) continue;
    const school = schoolByName.get(key);
    for (const p of availablePrograms) {
      const result = evidenceFor(p);
      if (result.expired || result.evidence.some((e) => e.level === "FAIL")) continue;
      const feeFreshness = feeFreshnessFor(p, criteria.intakeYear);
      const budget = result.evidence.find((item) => item.label === "首年预算");
      if (feeFreshness !== "current" && budget?.level === "PASS" && p.firstYearCostMax != null) {
        budget.level = "NEED";
        budget.detail = feeTimingConcern(p, criteria.intakeYear, feeFreshness, false);
      }
      const deadline = result.evidence.find((item) => item.label === "申请截止");
      if (feeFreshness === "historical" && deadline?.level === "PASS") {
        deadline.level = "NEED";
        deadline.detail = `资料为 ${sourceYearFor(p) ?? "较早年份"} 年及以前，截止日期需确认适用于${criteria.intakeYear ? ` ${criteria.intakeYear} 年` : "当前"}批次`;
        result.expired = false;
      }
      const validEvidence = result.evidence.filter((e): e is typeof e & {level: "PASS" | "NEED" | "UNKNOWN"} => e.level !== "FAIL");
      const points = validEvidence.map((e) => evidencePoint(e, p, criteria));
      const quality = candidateQuality(points, criteria);
      const relevance = candidateRelevance(points, quality);
      other.push({ name: p.schoolName, schoolKey: key, schoolId: p.schoolId, programId: p.id, kind: "project", quality, points, relevance, comparableCost: p.costIncomplete ? null : p.firstYearCostMax, facts: projectFacts(p, null, "unknown", feeFreshness), verified: Boolean(p.manuallyVerified && p.reviewStatus === "VERIFIED"), program: p.programName, cooperation: "unknown", fit: result.evidence.some((e) => e.level !== "PASS") ? "条件待核实" : "已知条件符合", evidence: result.evidence.map((e) => `${e.label}：${privileged ? safeText(e.detail) : ({ PASS: "符合已知条件", NEED: "需要补充或核实", UNKNOWN: "信息未知，需核实", FAIL: "不符合" }[e.level])}`), sources: ["知识库项目"], warning: makeWarnings([], school, partnerByName.get(key), p), yellow: false, image: false });
    }
  }
  const feedbackScore = (card: ScoredCard) => card.programId ? (feedbackScores?.get(card.programId) ?? 0) * 15 : 0;
  const sortByRelevance = (a: ScoredCard, b: ScoredCard) => (b.relevance + feedbackScore(b)) - (a.relevance + feedbackScore(a)) || a.name.localeCompare(b.name, "zh-CN");
  confirmed.sort(sortByRelevance); pending.sort(sortByRelevance); other.sort(sortByRelevance);
  const clean = (cards: ScoredCard[]): ResultCard[] => cards.map(({ name, schoolKey: key, schoolId, programId, program, fit, quality, cooperation, evidence, points, kind, sources, warning, yellow, image, comparableCost, facts, verified }) => ({ name, schoolKey: key, schoolId, programId, program, fit, quality, cooperation, evidence, points, kind, sources, warning, yellow, image, comparableCost, facts, verified }));
  return { confirmed: clean(confirmed), pending: clean(pending), other: searchingOthers ? clean(other) : [], otherHidden: !searchingOthers, excludedSchoolCount: excludedKeys.size };
}

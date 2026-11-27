import { z } from "zod";
import { extractJsonObject, getAiProviderConfig, requestAiCompletion, type AiCompletionPayload } from "@/lib/ai-provider";
import {
  getCachedSearchHits,
  getSearchGovernanceConfig,
  reserveSearchQuota,
  setCachedSearchHits,
} from "@/lib/ai-search-governance";
import { schoolIdentityKey, type ChatCriteria } from "@/lib/ai-screening";
import { classifyScholarshipText, splitMajorQueries } from "@/lib/matcher";
import {
  classifyStudentAcademicBand,
  evaluateAcademicTierEligibility,
  getPartnerTierRank,
  isJuniorCollegeOrSecondarySchool,
  matchesTargetSchoolPool,
  rebalancePoolTiers,
  scoreCandidate,
  selectBalancedCandidates,
  type AdmissionTier,
  type ScoreBreakdown,
} from "@/lib/screening-ranking";
import {
  containsIllegalWorkSuggestion,
  evaluateAdmissionRules,
  evaluateSchoolAgainstRules,
  LEGAL_NO_ILLEGAL_WORK_NOTICE,
  type AdmissionDiagnostic,
} from "@/lib/admission-rule-engine";
import { filterUniversityFactDb, formatFactTuition, type FactDegreeLevel, type FilteredFactProgram } from "@/lib/university-fact-db";
import { verifyAndPersistExternalPrograms, type OfficialSchoolVerifyEvent } from "@/lib/official-page-verifier";

export type ExternalProgramItem = {
  schoolName: string;
  programName: string;
  city: string;
  schoolNature?: string | null;
  teachingLanguage: string;
  duration: string;
  scholarshipEligible: boolean;
  scholarshipSummary: string;
  deadline: string;
  languageRequirement: string;
  degreeAndExamNotes?: string | null;
  officialUrl?: string | null;
  sourceUrls: string[];
  tier: AdmissionTier;
  tierReason?: string;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
  fitReason: string;
  caution: string;
  groundedBySearch: boolean;
  inLocalDatabase?: boolean;
  // v3.1 extended fields (optional for backwards compatibility)
  dataYear?: number | null;
  windowStatus?: "open" | "upcoming" | "wait";
  tuitionText?: string | null;
  tuitionAmount?: number | null;
  tuitionBasis?: "per_year" | "total_program" | "per_semester" | "unknown";
  accommodationText?: string | null;
  supervisorLetter?: "required" | "optional" | "none" | "unknown";
  cscaRequired?: boolean | null;
  eligibilityStatus?: "eligible" | "conditional";
  evidenceGrade?: "A" | "B" | "C";
  officialVerified?: boolean;
  factDbStatus?: "fresh" | "historical" | "web_verified";
  isPartner?: boolean;
  partnerTier?: string | null;
  partnerBadge?: string | null;
  partnerNote?: string | null;
};

export type ExternalHistoricalItem = {
  schoolName: string;
  schoolNature?: string | null;
  programName: string;
  referenceYear: number;
  targetYear: number;
  preliminaryTier: string;
  historicalSummary: string;
  sourceUrl?: string | null;
  partnerTag?: string | null;
};

export type ExternalPolicyNote = {
  title: string;
  content: string;
  sourceUrls?: string[];
};

export type ExternalScreeningResult = {
  mode: "web_search" | "ai_knowledge";
  summary: string;
  programs: ExternalProgramItem[];
  historicalPrograms?: ExternalHistoricalItem[];
  excludedNotes?: string[];
  policyNotes: ExternalPolicyNote[];
  searchQueries?: string[];
  quotaLimited?: boolean;
  cacheHitCount?: number;
  persistedFactCount?: number;
  disclaimer: string;
};

const rawProgramSchema = z.object({
  schoolName: z.string().trim().min(1).max(120),
  programName: z.string().trim().min(1).max(200),
  city: z.string().trim().max(60).default("中国"),
  schoolNature: z.string().trim().max(100).nullable().optional(),
  teachingLanguage: z.string().trim().max(60).default("英文授课"),
  duration: z.string().trim().max(60).default("详见官网"),
  tuitionText: z.string().trim().max(120).nullable().optional(),
  tuitionAmount: z.number().nonnegative().nullable().optional(),
  tuitionBasis: z.enum(["per_year", "total_program", "per_semester", "unknown"]).optional(),
  accommodationText: z.string().trim().max(120).nullable().optional(),
  dataYear: z.number().int().min(2020).max(2035).nullable().optional(),
  windowStatus: z.enum(["open", "upcoming", "wait"]).optional(),
  supervisorLetter: z.enum(["required", "optional", "none", "unknown"]).optional(),
  cscaRequired: z.boolean().nullable().optional(),
  scholarshipEligible: z.boolean().default(true),
  scholarshipSummary: z.string().trim().max(400).default("奖学金信息需核实官网"),
  deadline: z.string().trim().max(180).default("以官网最新招生简章为准"),
  languageRequirement: z.string().trim().max(320).default("以官网最新语言要求为准"),
  degreeAndExamNotes: z.string().trim().max(400).nullable().optional(),
  officialUrl: z.string().trim().max(400).nullable().optional(),
  sourceUrls: z.array(z.string().trim().max(400)).max(8).optional(),
  tier: z.enum(["REACH", "TARGET", "SAFE"]).optional(),
  fitReason: z.string().trim().max(400).default(""),
  caution: z.string().trim().max(400).default("申请前请以目标年份官网招生简章核实"),
});

function truncateText(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
}

function normalizeTierValue(value: unknown): "REACH" | "TARGET" | "SAFE" | undefined {
  if (typeof value !== "string") return undefined;
  const upper = value.trim().toUpperCase();
  if (upper === "REACH" || upper === "TARGET" || upper === "SAFE") return upper;
  if (/冲刺/u.test(value)) return "REACH";
  if (/匹配|目标/u.test(value)) return "TARGET";
  if (/稳妥|保底/u.test(value)) return "SAFE";
  return undefined;
}

function parseExternalPayload(raw: unknown): {
  summary: string;
  programs: Array<z.infer<typeof rawProgramSchema>>;
  excludedNotes?: string[];
  policyNotes?: Array<{ title: string; content: string; sourceUrls?: string[] }>;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const summary = truncateText(record.summary, 600) ?? "";

  const programs: Array<z.infer<typeof rawProgramSchema>> = [];
  if (Array.isArray(record.programs)) {
    for (const item of record.programs.slice(0, 15)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const obj = item as Record<string, unknown>;
      const normalized = {
        schoolName: truncateText(obj.schoolName, 120),
        programName: truncateText(obj.programName, 200),
        city: truncateText(obj.city, 60) ?? "中国",
        schoolNature: truncateText(obj.schoolNature, 100) ?? null,
        teachingLanguage: truncateText(obj.teachingLanguage, 60) ?? "英文授课",
        duration: truncateText(obj.duration, 60) ?? "详见官网",
        tuitionText: truncateText(obj.tuitionText, 120) ?? null,
        tuitionAmount: typeof obj.tuitionAmount === "number" && Number.isFinite(obj.tuitionAmount) ? obj.tuitionAmount : null,
        tuitionBasis: (obj.tuitionBasis === "per_year" || obj.tuitionBasis === "total_program" || obj.tuitionBasis === "per_semester" || obj.tuitionBasis === "unknown") ? obj.tuitionBasis : undefined,
        accommodationText: truncateText(obj.accommodationText, 120) ?? null,
        dataYear: typeof obj.dataYear === "number" && Number.isInteger(obj.dataYear) ? obj.dataYear : null,
        windowStatus: (obj.windowStatus === "open" || obj.windowStatus === "upcoming" || obj.windowStatus === "wait") ? obj.windowStatus : undefined,
        supervisorLetter: (obj.supervisorLetter === "required" || obj.supervisorLetter === "optional" || obj.supervisorLetter === "none" || obj.supervisorLetter === "unknown") ? obj.supervisorLetter : undefined,
        cscaRequired: typeof obj.cscaRequired === "boolean" ? obj.cscaRequired : null,
        scholarshipEligible: typeof obj.scholarshipEligible === "boolean" ? obj.scholarshipEligible : true,
        scholarshipSummary: truncateText(obj.scholarshipSummary, 400) ?? "奖学金信息需核实官网",
        deadline: truncateText(obj.deadline, 180) ?? "以官网最新招生简章为准",
        languageRequirement: truncateText(obj.languageRequirement, 320) ?? "以官网最新语言要求为准",
        degreeAndExamNotes: truncateText(obj.degreeAndExamNotes, 400) ?? null,
        officialUrl: truncateText(obj.officialUrl, 400) ?? null,
        sourceUrls: Array.isArray(obj.sourceUrls)
          ? obj.sourceUrls.map((u) => truncateText(u, 400)).filter((u): u is string => Boolean(u)).slice(0, 8)
          : undefined,
        tier: normalizeTierValue(obj.tier),
        fitReason: truncateText(obj.fitReason, 400) ?? "",
        caution: truncateText(obj.caution, 400) ?? "申请前请以目标年份官网招生简章核实",
      };
      const parsedItem = rawProgramSchema.safeParse(normalized);
      if (parsedItem.success) programs.push(parsedItem.data);
    }
  }

  const excludedNotes = Array.isArray(record.excludedNotes)
    ? record.excludedNotes.map((item) => truncateText(item, 400)).filter((item): item is string => Boolean(item)).slice(0, 12)
    : undefined;

  const policyNotes = Array.isArray(record.policyNotes)
    ? record.policyNotes
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const p = item as Record<string, unknown>;
          const title = truncateText(p.title, 140);
          const content = truncateText(p.content, 1000);
          if (!title || !content) return null;
          const sourceUrls = Array.isArray(p.sourceUrls)
            ? p.sourceUrls.map((u) => truncateText(u, 400)).filter((u): u is string => Boolean(u)).slice(0, 5)
            : undefined;
          return { title, content, ...(sourceUrls?.length ? { sourceUrls } : {}) };
        })
        .filter((item): item is { title: string; content: string; sourceUrls?: string[] } => Boolean(item))
        .slice(0, 8)
    : undefined;

  if (!summary && programs.length === 0 && !policyNotes?.length && !excludedNotes?.length) {
    return null;
  }
  return { summary, programs, excludedNotes, policyNotes };
}

function sanitizeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const cleaned = url.trim().replace(/(?:#1)+$/u, "");
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function buildExternalSearchQueries(criteria: ChatCriteria, diagnosticInput?: AdmissionDiagnostic): string[] {
  const diagnostic = diagnosticInput ?? evaluateAdmissionRules(criteria);
  if (diagnostic.state === "CIRCUIT_BREAKER") return [];

  const queries: string[] = [];
  const degree = criteria.programType === "UG"
    ? "本科"
    : criteria.programType === "MASTER"
      ? "硕士"
      : criteria.programType === "PHD"
        ? "博士"
        : "";
  const lang = criteria.teachingLanguage === "ENGLISH"
    ? "英文授课"
    : criteria.teachingLanguage === "CHINESE"
      ? "中文授课"
      : "";
  const majors = splitMajorQueries(criteria.targetMajor, criteria.targetMajors).slice(0, 3).join(" ");
  const cities = [...(criteria.cities ?? []), ...(criteria.city ? [criteria.city] : [])].slice(0, 3).join(" ");
  const year = criteria.intakeYear ? `${criteria.intakeYear}` : "";
  const scholarship = diagnostic.scholarshipPolicy.govFullAllowed
    ? (criteria.scholarshipPreferences?.length
        ? criteria.scholarshipPreferences.slice(0, 3).join(" ")
        : criteria.excludeSelfFunded || criteria.scholarshipType
          ? "奖学金 CSC"
          : "")
    : "";

  // Special deterministic downgrade pathway queries (never pollute with elite/regular direct UG queries)
  if (diagnostic.state === "DOWNGRADE_LOCK") {
    if (diagnostic.pathwayLocks.includes("CHINESE_EQUIVALENT_MASTER")) {
      queries.push(`华侨大学 中文同等学力 硕士 国际学生 HSK5 招生简章 site:edu.cn`.slice(0, 128));
      return queries;
    }
    if (diagnostic.pathwayLocks.includes("WIDE_AGE_SELF_FUNDED_MASTER")) {
      queries.push(`${cities} 浙江科技大学 三亚学院 吉林外国语大学 ${majors} 硕士 留学生 年龄 学费 site:edu.cn`.replace(/\s+/g, " ").trim().slice(0, 128));
      return queries;
    }
    if (diagnostic.pathwayLocks.includes("FOUNDATION_1_PLUS_4") || diagnostic.pathwayLocks.includes("ZERO_BASE_CHINESE_UG")) {
      queries.push(`${cities} 国际学生 1年语言预科 本科衔接 零基础汉语言 ${majors} 学费 site:edu.cn`.replace(/\s+/g, " ").trim().slice(0, 128));
    }
    if (diagnostic.allowVocationalDiploma) {
      queries.push(`${cities} 职业技术学院 公办高职 专科 留学生 ${majors} 学费 住宿 site:edu.cn`.replace(/\s+/g, " ").trim().slice(0, 128));
    }
    if (queries.length) return [...new Set(queries)].slice(0, 4);
  }

  if (diagnostic.requireMoe43Mbbs) {
    queries.push(`${cities} 教育部 英文授课 临床医学 MBBS 国际学生 招生简章 学费 site:edu.cn`.replace(/\s+/g, " ").trim().slice(0, 128));
  }

  const studentBand = classifyStudentAcademicBand(criteria);
  const eligibleTargetSchools = (criteria.targetSchools ?? []).filter(
    (school) =>
      evaluateAcademicTierEligibility(criteria, { schoolName: school }).eligible
      && evaluateSchoolAgainstRules(diagnostic, criteria, { schoolName: school, programType: criteria.programType }).eligible,
  );
  if (eligibleTargetSchools.length) {
    const schoolsText = eligibleTargetSchools.slice(0, 5).join(" ");
    queries.push(`${schoolsText} ${majors} ${degree} ${lang} ${scholarship} 国际学生 官网`.replace(/\s+/g, " ").trim().slice(0, 120));
  }

  if (studentBand && studentBand.band <= 3) {
    if (criteria.programType === "MASTER" || criteria.programType === "PHD") {
      // Master/PhD low/medium band must only search degree-granting universities, never undergraduate-only private colleges.
      const degreeUniQuery = `${cities} 省属公办大学 理工大学 科技大学 工业大学 ${majors} ${degree} ${lang} ${scholarship} 留学生招生 site:edu.cn`.replace(/\s+/g, " ").trim().slice(0, 128);
      if (degreeUniQuery) queries.push(degreeUniQuery);
    } else {
      const industrySuffix = /(?:计算机|软件|电子|通信|机械|土木|建筑|工程)/u.test(majors)
        ? "工学院 工程学院 理工学院 科技学院 城市学院"
        : /(?:商|经济|金融|管理|贸易)/u.test(majors)
          ? "商学院 财经学院 金融学院 工商学院"
          : /(?:医|药|护理)/u.test(majors)
            ? "医学院 医药学院 药学院"
            : "师范学院 外国语学院 应用型本科";
      const collegeLabel = criteria.publicOnly ? `公办本科 ${industrySuffix}` : `${industrySuffix} 民办本科 职业本科`;
      const collegeQuery = `${cities} ${collegeLabel} ${majors} ${degree || "本科"} ${lang} ${scholarship} 留学生 site:edu.cn`.replace(/\s+/g, " ").trim().slice(0, 128);
      if (collegeQuery) queries.push(collegeQuery);
      if (studentBand.band === 3 && (diagnostic.academic.normPct == null || diagnostic.academic.normPct >= 65)) {
        const regularQuery = `${cities} 普通公办大学 ${majors} ${degree || "本科"} ${lang} ${scholarship} ${year} 留学生招生 site:edu.cn`.replace(/\s+/g, " ").trim().slice(0, 128);
        if (regularQuery) queries.push(regularQuery);
      }
    }
  } else {
    if (studentBand && studentBand.band >= 4) {
      const topQuery = `${cities} ${studentBand.band === 5 ? "985 双一流 211" : "211 双一流 省重点"} 大学 ${majors} ${degree} ${lang} ${scholarship} 留学生招生 site:edu.cn`.replace(/\s+/g, " ").trim().slice(0, 128);
      if (topQuery) queries.push(topQuery);
    }
    const general = `${cities} ${criteria.publicOnly ? "公立大学" : "大学"} ${majors} ${degree} ${lang} ${scholarship} ${year} 留学生招生 site:edu.cn`.replace(/\s+/g, " ").trim().slice(0, 128);
    if (general) queries.push(general);
  }

  if (criteria.customQuestions?.length || criteria.degreeBackground || criteria.scholarshipPreferences?.length) {
    const policyParts = [
      cities,
      criteria.degreeBackground ? "俄罗斯专家学位 学历认可" : "",
      ...(criteria.customQuestions ?? []).slice(0, 2),
      ...(criteria.scholarshipPreferences ?? []).slice(0, 2),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 120);
    if (policyParts) queries.push(policyParts);
  }
  return [...new Set(queries)].filter((q) => q.length >= 4).slice(0, 4);
}

function extractBuiltinSearchSources(payload: AiCompletionPayload): string[] {
  const msg = payload.choices?.[0]?.message;
  const urls: string[] = [];
  for (const annotation of msg?.annotations ?? []) {
    const url = sanitizeHttpUrl(typeof annotation?.url_citation?.url === "string" ? annotation.url_citation.url : null);
    if (url) urls.push(url);
  }
  for (const group of msg?.server_tool_calls ?? []) {
    for (const call of group?.calls ?? []) {
      for (const source of call?.sources ?? []) {
        const url = sanitizeHttpUrl(typeof source?.url === "string" ? source.url : null);
        if (url) urls.push(url);
      }
    }
  }
  return [...new Set(urls)];
}

export type VerifyWebSearchResult = {
  ok: boolean;
  message: string;
  resultCount?: number;
  latencyMs?: number;
};

/**
 * Verifies DeepSeek's built-in `deepseek_web_search` tool in Chat Completions
 * (no standalone search surcharge; uses model tokens only) without exposing credentials.
 */
export async function verifyDeepSeekWebSearch(
  options: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<VerifyWebSearchResult> {
  const current = getAiProviderConfig();
  const apiKey = options.apiKey ?? current.apiKey;
  const baseUrl = (options.baseUrl ?? current.baseUrl).replace(/\/+$/u, "");
  const model = options.model ?? current.model;
  if (!apiKey) {
    return { ok: false, message: "尚未配置 AI API 密钥，请先在上方保存密钥。" };
  }
  if (!/^https:\/\/api\.deepseek\.com(?:\/v1)?$/iu.test(baseUrl)) {
    return { ok: false, message: "当前 API 地址不是 DeepSeek 官方地址，选校时将自动使用 AI 知识拓展模式。" };
  }

  const startedAt = Date.now();
  try {
    const payload = await requestAiCompletion(
      { apiKey, baseUrl, model },
      [
        { role: "system", content: "请使用联网工具核查后，只返回 JSON：{\"ok\":true,\"url\":\"...\"}" },
        { role: "user", content: "清华大学 Global MBA 官网地址是什么？" },
      ],
      {
        timeoutMs: options.timeoutMs ?? 20_000,
        maxTokens: 200,
        retries: 0,
        signal: options.signal,
        fetchImpl: options.fetchImpl,
        tools: [{ type: "deepseek_web_search" }],
        responseFormat: "text",
      },
    );
    const sources = extractBuiltinSearchSources(payload);
    const toolCalls = payload.usage?.server_tool_use?.tool_search ?? 0;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return {
        ok: true,
        resultCount: sources.length || toolCalls,
        latencyMs: Date.now() - startedAt,
        message: sources.length
          ? `模型内置联网检索正常（本次引用 ${sources.length} 个网页来源，工具调用不另计费）。`
          : "模型内置联网检索接口连通正常。",
      };
    }
    return { ok: false, message: "联网搜索返回内容为空，请稍后重试。" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("密钥无效")) return { ok: false, message: "密钥无效或没有模型访问权限，请核对后重试。" };
    if (msg.includes("余额不足")) return { ok: false, message: "账户余额不足或请求受限，请检查 DeepSeek 账单状态。" };
    if (msg.includes("不支持")) {
      return { ok: false, message: "当前模型暂不支持内置 deepseek_web_search，选校时将自动降级为 AI 知识拓展。" };
    }
    return { ok: false, message: "暂时无法连接联网搜索服务，请稍后重试。" };
  }
}

export function shouldTriggerExternalScreening(
  criteria: ChatCriteria,
  localCandidateSchoolNames: readonly string[],
  otherRequested: boolean,
  targetDisplayCount = 9,
  localTierCounts?: Partial<Record<AdmissionTier, number>>,
): boolean {
  if (criteria.targetSchools?.length) {
    const anyTargetMissing = criteria.targetSchools.some(
      (target) => evaluateAcademicTierEligibility(criteria, { schoolName: target }).eligible
        && !localCandidateSchoolNames.some((local) => matchesTargetSchoolPool(local, [target])),
    );
    if (anyTargetMissing) return true;
  }
  if (
    criteria.customQuestions?.length
    || criteria.wantTiering
    || Boolean(criteria.degreeBackground)
    || Boolean(criteria.plannedExams)
    || criteria.excludeSelfFunded
    || criteria.publicOnly
    || (criteria.cities?.length ?? 0) > 1
    || (criteria.fallbackCities?.length ?? 0) > 0
    || (criteria.targetMajors?.length ?? 0) > 1
  ) {
    return true;
  }
  if (localTierCounts) {
    const perTierCap = Math.max(1, Math.floor(targetDisplayCount / 3));
    if (
      (localTierCounts.REACH ?? 0) < perTierCap
      || (localTierCounts.TARGET ?? 0) < perTierCap
      || (localTierCounts.SAFE ?? 0) < perTierCap
    ) {
      return true;
    }
  }
  if (otherRequested && localCandidateSchoolNames.length < targetDisplayCount) return true;
  if (localCandidateSchoolNames.length < 3) return true;
  return false;
}

function passesHardExternalFilters(
  item: z.infer<typeof rawProgramSchema>,
  criteria: ChatCriteria,
  diagnostic?: AdmissionDiagnostic,
): boolean {
  if (diagnostic?.state === "CIRCUIT_BREAKER") return false;
  const isDegreeSearch = !criteria.programType || ["UG", "MASTER", "PHD"].includes(criteria.programType);
  const allowVocational = Boolean(diagnostic?.allowVocationalDiploma);
  if (isDegreeSearch && !allowVocational && isJuniorCollegeOrSecondarySchool(item.schoolName, item.schoolNature)) {
    return false;
  }
  if (
    isDegreeSearch
    && /(?:交换生|校际交流|visiting\s*student|exchange\s*program)/iu.test(item.programName)
    && !/(?:本科|硕士|博士|学士|degree|bachelor|master|phd)/iu.test(item.programName)
  ) {
    return false;
  }
  const langText = item.teachingLanguage;
  if (criteria.teachingLanguage === "ENGLISH" && /中文|汉语/u.test(langText) && !/英文|英语|english/iu.test(langText)) {
    return false;
  }
  if (criteria.teachingLanguage === "CHINESE" && /英文|英语|english/iu.test(langText) && !/中文|汉语/u.test(langText)) {
    return false;
  }
  if (
    criteria.programType === "MASTER"
    && !diagnostic?.blockDirectDegree
    && /(?:本科|学士|语言研修|进修生|非学位|预科)/u.test(item.programName)
    && !/(?:硕士|MBA|Master|研究生)/iu.test(item.programName)
  ) {
    return false;
  }
  if (criteria.programType === "UG" && /(?:硕士|博士|MBA|Master|PhD)/iu.test(item.programName) && !/(?:本科|学士|Bachelor)/iu.test(item.programName)) {
    return false;
  }
  if (criteria.programType === "UG" && criteria.noFoundation && !diagnostic?.blockDirectDegree && /(?:预科|基础年|Foundation)/iu.test(item.programName) && !/(?:无预科|免预科|直入)/u.test(item.programName)) {
    return false;
  }
  if (criteria.excludeSelfFunded) {
    if (!item.scholarshipEligible) return false;
    if (classifyScholarshipText(item.scholarshipSummary) === "none") return false;
  }
  const titleText = `${item.programName} ${item.schoolNature ?? ""}`;
  if (criteria.publicOnly && /(?:民办|私立|独立学院|中外合作独立商学院)/u.test(titleText) && !/公立|公办|985|211|双一流/u.test(titleText)) {
    return false;
  }
  return true;
}

const EXTERNAL_SCREENING_SYSTEM_PROMPT = `你是中国来华留学风控型升学评估与选校顾问（遵循 v3.1 官网实证框架与五阶段“各得其位”确定性规则引擎），负责“内部库以外”或待核实高校的受限官网检索、语义排序与三态话术输出。
核心架构铁律：你的职责是在确定性规则引擎（输入中的 deterministicDiagnostic）锁定的合规档位与路径池内做检索、排序与话术表达，绝不允许凭预训练语料热度越级荐校或画全额奖学金大饼！

严格要求：
1. 只能输出一个合法 JSON 对象，不要输出任何额外解释或前后缀文字。
2. 绝对服从确定性引擎 deterministicDiagnostic 的三态与三道硬闸门：
   - 【硬熔断劝退态 CIRCUIT_BREAKER】：严禁返回任何院校，programs 必须为空数组 []！在 summary 与 policyNotes 中直白量化差距，给出 1 年期刷分/考证/攒资金计划。
   - 【降级纠偏态 DOWNGRADE_LOCK】：严禁推荐任何常规学历直录、双一流/985/211/公办一本或全额奖学金！只能推荐严格符合 deterministicDiagnostic.pathwayLocks 的项目（如 1 年预科+本科 1+4、零基础汉语言本科、公办高职大专、35–50 岁宽龄自费池或华侨大学中文同等学力硕特例），并在 summary 和 policyNotes 中给出“先降落、再跃迁”的闭环路径（如高职衔接南京林业大学/无锡学院国际生专转本/专升本）。
   - 【正常匹配态 NORMAL】：严格执行“上下 1 档”双向熔断（Match = finalTier，Reach 最多上浮 1 档，Safety 下浮 1 档）：既杜绝 T4/T5 看到 T1/T2，也防止 T1 学霸被错配到 T4/T5 兜底校。
3. 十维硬过滤红线（任一不符写进 excludedNotes，严禁放进 programs）：
   - 学术与木桶短板：不采用“高均分拉高差 CSCA/零语言/多挂科”的加权总分。均分 < 65% 或 GPA < 2.0 严禁双一流、公办一本及全额奖学金；CSCA < 50 锁 1+4 预科或免 CSCA 通道；CSCA < 70 禁用 CSC 全奖；1–2 门挂科拦截“零挂科”名校及政府奖，≥3 门挂科锁 T4/T5。
   - 跨国成绩与 MOI 英语豁免：严格按 deterministicDiagnostic.academic 的归一化档位（法语区 14/20、英国 2:1 65% 属优良，德国反向制 1.5 属顶尖，防高分误杀）；非美/英/加/澳/新/爱 6 国护照仅持本地 MOI 证明者，严禁推清华、上交、北理、南大等不认 MOI 的院校。
   - 学历与专业隔离：要求英文授课绝不返中文授课；无学士学位证申硕严禁常规硕士与 CSC（仅满足大专满2年/本科结业+HSK5≥180 时可提华侨大学中文同等学力特例）；申请英文 MBBS 强锁教育部 43 校白名单并核查理化生 60%–70%+；申请 CS/AI 提示收紧 1 档或转机械/土木/电气；非降级态申请本/硕/博绝不返专科/高职，硕博绝不编造无硕士点民办学院项目。
   - 年龄与预算：本科超 25 岁/硕士超 35 岁禁 CSC 与政府奖；未达全奖资格且超预算的高校严禁以“可申请全额奖学金覆盖学费”放行；须提醒真实首年账单（留位押金、4,400–17,100 元非学费前置费、银行存款证明、次年续奖年审风险如浙科大缺勤 20 课时或挂科取消下学期奖学金）。
   - 法律合规铁律：绝对禁止在任何字段中暗示或诱导学生通过校外打工/兼职覆盖留学费用（大一新生依法严禁校外勤工助学，非法打工面临 5,000–20,000 元罚款、5–15 日拘留直至遣返）。
4. 三档配额原则（3 冲 + 3 稳 + 3 保，绝不跨档凑数）：
   - 若某档确实没有符合硬性条件的院校，允许少于 3 所或留空，绝不强行凑数，也不输出任何数字录取概率或“稳录/保录”承诺。
5. 零虚构与真实官网链接（仅认 .edu.cn 或官方合作办学主站）：
   - 优先使用 site:edu.cn 核查最新国际教育学院/招生简章页面，绝不从 CUCAS/第三方网站抄学费或截止日期，官网未公布时务必明确标为“未公布，需向学校确认”，严禁用“约/大概/通常/参考XX元”估算学费。
   - 标明 dataYear、windowStatus（open/upcoming/wait）、tuitionBasis（per_year/total_program/per_semester/unknown）与 supervisorLetter（required/optional/none/unknown）。
6. 顾问视角、去废话、有理有据（关键输出要求）：
   - summary 用 1–2 句白话直接交代“输入条件在全网检索中的位置和命中情况”，禁止堆砌“正常匹配态/路径锁/双向±1档/守门”等内部系统术语。
   - fitReason 必须逐项对照学生条件写明具体依据（例如：成绩与该校定位是否匹配、学费是否在预算内、语言/专业/奖学金是否对口），拒绝泛泛套话。
   - policyNotes 仅当用户明确提出专项问题（如俄罗斯专家学位认可、GMAT/GRE、MBBS 白名单）或触发真实限制时才输出 1–2 条，常规查询严禁主动灌水写通用说明或无关说教。
   - programs 最多返回 9 条（每档最多 3 条）最契合项目，每个字段简明扼要，确保完整输出合法闭合 JSON。

返回 JSON 结构：
{
  "summary": "1–2 句白话总结学生条件在全网检索中的定位与匹配情况（禁用系统黑话）",
  "programs": [
    {
      "schoolName": "学校标准中文名",
      "programName": "项目名称（降级态必须标明 1年预科+本科 / 高职大专 / 宽龄自费硕 等真实类型）",
      "city": "城市名",
      "schoolNature": "公立 985 / 公立 211 / 公立本科 / 民办本科 / 职业本科 / 公办高职大专 等",
      "teachingLanguage": "英文授课 / 中文授课（零基础预科起步）",
      "duration": "2年 / 4年 / 1年预科+4年本科 / 3年大专 等",
      "tuitionText": "25,000 元/年 或 未公布，需向学校确认",
      "tuitionAmount": 25000,
      "tuitionBasis": "per_year | total_program | per_semester | unknown",
      "accommodationText": "宿舍费用说明（如无校内宿舍须明确标注）",
      "dataYear": 2027,
      "windowStatus": "open | upcoming | wait",
      "supervisorLetter": "none | required | optional | unknown",
      "cscaRequired": false,
      "scholarshipEligible": true,
      "scholarshipSummary": "可申请的奖学金类型（未达全奖门槛严禁推荐全奖）",
      "deadline": "申请截止日期（标明批次年份或写未公布，需向学校确认）",
      "languageRequirement": "硬性语言要求（涉 2027+ 中文项目提示 HSK 3.0 口语要求）",
      "degreeAndExamNotes": "前置学历认可、校考、CSCA/专升本衔接说明等（仅在相关时填写）",
      "officialUrl": "https://...edu.cn/...",
      "sourceUrls": ["https://...edu.cn/..."],
      "tier": "REACH | TARGET | SAFE",
      "fitReason": "逐项对照学生条件的具体推荐依据（如分数/预算/语言/专业/城市为何合适）",
      "caution": "这所学校真正需要核实的 1 项具体风险（无废话）"
    }
  ],
  "excludedNotes": ["因硬条件或档位淘汰的院校及具体原因"],
  "policyNotes": [
    { "title": "仅在用户明确追问专项政策或触发真实限制时填写", "content": "直白具体的核查结论与依据", "sourceUrls": ["https://..."] }
  ]
}`;

function buildExternalCacheKey(criteria: ChatCriteria, message: string): string {
  const canonical = JSON.stringify({
    programType: criteria.programType ?? null,
    teachingLanguage: criteria.teachingLanguage ?? null,
    targetMajors: criteria.targetMajors ?? (criteria.targetMajor ? [criteria.targetMajor] : []),
    cities: criteria.cities ?? (criteria.city ? [criteria.city] : []),
    fallbackCities: criteria.fallbackCities ?? [],
    targetSchools: criteria.targetSchools ?? [],
    excludeSelfFunded: Boolean(criteria.excludeSelfFunded),
    publicOnly: Boolean(criteria.publicOnly),
    noFoundation: Boolean(criteria.noFoundation),
    intakeYear: criteria.intakeYear ?? null,
    intakeSeason: criteria.intakeSeason ?? null,
    gpa: criteria.gpa ?? null,
    gpaScale: criteria.gpaScale ?? null,
    gradeSystem: criteria.gradeSystem ?? null,
    academicLevel: criteria.academicLevel ?? null,
    failedCourseCount: criteria.failedCourseCount ?? null,
    cscaMinSubjectScore: criteria.cscaMinSubjectScore ?? criteria.cscaScore ?? null,
    highestEducation: criteria.highestEducation ?? null,
    age: criteria.age ?? null,
    budget: criteria.budget ?? null,
    languageStatus: criteria.languageStatus ?? null,
    hasMoiCertificate: criteria.hasMoiCertificate ?? null,
    complianceFlags: criteria.complianceFlags ?? [],
    ielts: criteria.ielts ?? null,
    toefl: criteria.toefl ?? null,
    duolingo: criteria.duolingo ?? null,
    hskLevel: criteria.hskLevel ?? null,
    msgHint: message.slice(0, 200),
  });
  return `external_screening:${canonical}`;
}

function mapCriteriaFactLevel(programType?: string | null): FactDegreeLevel | undefined {
  if (programType === "UG") return "bachelor";
  if (programType === "MASTER") return "master";
  if (programType === "PHD") return "phd";
  if (programType === "LONG_TERM" || programType === "SHORT_TERM") return "language";
  return undefined;
}

function factProgramToExternalItem(
  fact: FilteredFactProgram,
  criteria: ChatCriteria,
  localKeySet: Set<string>,
): ExternalProgramItem | null {
  const eligibility = evaluateAcademicTierEligibility(criteria, {
    schoolName: fact.school,
    schoolTags: fact.tier ?? null,
  });
  if (!eligibility.eligible) return null;

  const scholarshipEntries = Object.entries(fact.scholarships ?? {});
  const hasFull = scholarshipEntries.some(([, v]) => v?.type === "full");
  const hasAny = scholarshipEntries.length > 0;
  if (criteria.excludeSelfFunded && !hasAny) return null;
  if (criteria.scholarshipType === "full" && !hasFull) return null;

  const isEng = fact.language.toLowerCase().includes("eng") || fact.language.includes("英");
  const langLabel = isEng ? "英文授课" : "中文授课";
  const schSummary = hasAny
    ? scholarshipEntries.map(([k, v]) => (v?.note ? `${k}（${v.note}）` : k)).join("；")
    : "未收录全额奖学金信息，请核实官网";

  const breakdown = scoreCandidate({
    schoolName: fact.school,
    schoolTags: fact.tier ?? null,
    cooperation: "unknown",
    verified: fact.verification_status === "verified",
    feeFreshness: fact.candidate_status === "fresh" ? "current" : "historical",
    scholarshipCategory: schSummary,
    majorMatchType: "synonym",
    points: [
      { label: "专业", level: "PASS", text: fact.major },
      { label: "授课语言", level: "PASS", text: langLabel },
      { label: "申请学历", level: "PASS", text: fact.degrees.join("/") },
      ...(fact.city ? [{ label: "地区", level: "PASS" as const, text: fact.city }] : []),
      ...(hasAny ? [{ label: "奖学金", level: "PASS" as const, text: schSummary }] : []),
    ],
    supervisorNeed: fact.supervisor_letter === "required",
  }, criteria);

  const langRaw = String((fact.official_requirements?.language as { raw_text?: string } | undefined)?.raw_text ?? "").trim();
  const gpaRaw = String((fact.official_requirements?.gpa as { raw_text?: string } | undefined)?.raw_text ?? "").trim();
  const yearNum = typeof fact.data_year === "number" ? fact.data_year : Number(fact.data_year) || null;
  const deadlineStr = fact.deadline_note?.trim() || "截止时间未公布，需向学校确认";
  const windowStatus: "open" | "upcoming" | "wait" = /已截止|仅作.*参考/u.test(deadlineStr)
    ? "wait"
    : /即将开放|暂未开放|预计/u.test(deadlineStr)
      ? "upcoming"
      : "open";
  const tuitionStr = formatFactTuition(fact);
  const tier = breakdown.tier === "SAFE" && breakdown.canEnterSafe === false ? "TARGET" : breakdown.tier;
  const supNeed = fact.supervisor_letter === "required" || fact.supervisor_letter === "required-ish";
  const isCond = supNeed || (criteria.teachingLanguage === "ENGLISH" && criteria.ielts == null && criteria.toefl == null && criteria.duolingo == null && /雅思|IELTS|托福|TOEFL/iu.test(langRaw));

  return {
    schoolName: fact.school,
    programName: fact.major,
    city: fact.city || "中国",
    schoolNature: fact.tier || null,
    teachingLanguage: langLabel,
    duration: fact.duration || "详见官网",
    tuitionText: tuitionStr,
    tuitionAmount: fact.tuition ?? null,
    tuitionBasis: (fact.tuition_basis as ExternalProgramItem["tuitionBasis"]) ?? "unknown",
    dataYear: yearNum,
    windowStatus,
    supervisorLetter: (fact.supervisor_letter as ExternalProgramItem["supervisorLetter"]) ?? "unknown",
    cscaRequired: fact.degrees.includes("bachelor") ? /CSCA/i.test(JSON.stringify(fact.official_requirements ?? "")) : false,
    scholarshipEligible: hasAny,
    scholarshipSummary: schSummary,
    deadline: deadlineStr,
    languageRequirement: langRaw || "以官网最新语言要求为准",
    degreeAndExamNotes: [gpaRaw, fact.supervisor_letter === "required" ? "需导师预接收函" : ""].filter(Boolean).join("；") || null,
    officialUrl: fact.source_url ?? (fact.source_urls[0] || null),
    sourceUrls: fact.source_urls,
    tier,
    tierReason: breakdown.tierReason,
    score: breakdown.total,
    scoreBreakdown: breakdown,
    fitReason: `官网事实库已核实（${yearNum ?? "最新"}批次 · ${tuitionStr}）`,
    caution: fact.notes || fact.stale_reason || "请按目标入学批次核实官网简章",
    groundedBySearch: true,
    officialVerified: true,
    factDbStatus: fact.candidate_status === "fresh" ? "fresh" : "historical",
    eligibilityStatus: isCond ? "conditional" : "eligible",
    evidenceGrade: gpaRaw && !/未公布/u.test(gpaRaw) ? "A" : "B",
    inLocalDatabase: localKeySet.has(schoolIdentityKey(fact.school)),
  };
}

export async function generateExternalScreening(
  input: {
    sanitizedMessage: string;
    criteria: ChatCriteria;
    localSchoolNames: string[];
    localTierCounts?: Partial<Record<AdmissionTier, number>>;
    partnerMetaBySchool?: Record<string, { isPartner: boolean; partnerTier?: string | null; partnerBadge?: string | null; partnerNote?: string | null }>;
    diagnostic?: AdmissionDiagnostic;
  },
  options: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    onSearchStart?: (queries: string[]) => void;
    onFactDbChecked?: (info: { freshCount: number; historicalCount: number; urlCachedSchools: number }) => void;
    onWebResultParsed?: (info: { rawCount: number; mode: "web_search" | "ai_knowledge"; sourceCount: number }) => void;
    onVerifyStart?: (schools: string[]) => void;
    onVerifySchool?: (event: OfficialSchoolVerifyEvent) => void;
    enforceGovernance?: boolean;
    enableFactDb?: boolean;
    enableOfficialPageVerify?: boolean;
    factDbPath?: string;
  } = {},
): Promise<ExternalScreeningResult | null> {
  const diagnostic = input.diagnostic ?? evaluateAdmissionRules(input.criteria, input.sanitizedMessage);
  if (diagnostic.state === "CIRCUIT_BREAKER") {
    return null;
  }

  const current = getAiProviderConfig();
  const config = {
    apiKey: options.apiKey ?? current.apiKey,
    baseUrl: (options.baseUrl ?? current.baseUrl).replace(/\/+$/u, ""),
    model: options.model ?? current.model,
  };
  if (!config.apiKey) return null;

  const enforceGovernance = options.enforceGovernance ?? (process.env.NODE_ENV !== "test");
  const govConfig = enforceGovernance ? getSearchGovernanceConfig() : {
    externalEnabled: true,
    webSearchEnabled: true,
    dailySearchLimit: 300,
    cacheTtlHours: 24,
  };
  if (enforceGovernance && !govConfig.externalEnabled) {
    return null;
  }

  const searchQueries = buildExternalSearchQueries(input.criteria, diagnostic);
  options.onSearchStart?.(searchQueries);

  const cacheKey = buildExternalCacheKey(input.criteria, input.sanitizedMessage);
  if (enforceGovernance) {
    const cached = getCachedSearchHits<ExternalScreeningResult>(cacheKey);
    if (cached && cached.length > 0) {
      const hit = cached[0];
      return {
        ...hit,
        cacheHitCount: (hit.cacheHitCount ?? 0) + 1,
      };
    }
  }

  const isDeepSeekOfficial = /^https:\/\/api\.deepseek\.com(?:\/v1)?$/iu.test(config.baseUrl);
  let wantWebSearch = isDeepSeekOfficial && govConfig.webSearchEnabled;
  let skippedReason: "disabled" | "quota_exceeded" | "unsupported" | undefined =
    !isDeepSeekOfficial ? "unsupported" : !govConfig.webSearchEnabled ? "disabled" : undefined;

  let reservation: { allowed: boolean; commit: () => void; release: () => void } = {
    allowed: true,
    commit: () => {},
    release: () => {},
  };
  if (wantWebSearch && enforceGovernance) {
    reservation = reserveSearchQuota();
    if (!reservation.allowed) {
      wantWebSearch = false;
      skippedReason = "quota_exceeded";
    }
  }

  const studentBand = classifyStudentAcademicBand(input.criteria);
  const localKeySet = new Set(input.localSchoolNames.map(schoolIdentityKey));
  const useFactDb = options.enableFactDb ?? (process.env.NODE_ENV !== "test");
  const factHits = useFactDb
    ? filterUniversityFactDb({
        level: diagnostic.blockDirectDegree && input.criteria.programType === "UG"
          ? "language"
          : mapCriteriaFactLevel(input.criteria.programType),
        lang: input.criteria.teachingLanguage === "ENGLISH" ? "english" : input.criteria.teachingLanguage === "CHINESE" ? "chinese" : "both",
        majors: splitMajorQueries(input.criteria.targetMajor, input.criteria.targetMajors),
        matchMode: input.criteria.strictMajor ? "strict" : "fuzzy",
        nationality: input.criteria.nationality,
        budget: input.criteria.budget,
        blockFullScholarship: !diagnostic.scholarshipPolicy.govFullAllowed,
        targetYear: input.criteria.intakeYear ?? new Date().getFullYear(),
        cities: [...(input.criteria.cities ?? []), ...(input.criteria.city ? [input.criteria.city] : [])],
      }, options.factDbPath)
    : { fresh: [], historical: [], recheck: [], urlCachedSchools: 0 };

  const factFreshPrograms: ExternalProgramItem[] = [];
  const factExcludedNotes: string[] = [];
  for (const f of factHits.fresh) {
    const elig = evaluateAcademicTierEligibility(input.criteria, { schoolName: f.school, schoolTags: f.tier ?? null });
    if (!elig.eligible) {
      factExcludedNotes.push(`${f.school}：${elig.reason ?? "成绩档位不匹配"}`);
      continue;
    }
    const ruleCheck = evaluateSchoolAgainstRules(diagnostic, input.criteria, {
      schoolName: f.school,
      schoolTags: f.tier ?? null,
      programName: f.major,
      programType: input.criteria.programType,
      teachingLanguage: f.language,
      firstYearCostMax: f.tuition ?? null,
      city: f.city,
    });
    if (!ruleCheck.eligible) {
      factExcludedNotes.push(`${f.school}：${ruleCheck.reasons[0] ?? "触发十维规则硬过滤"}`);
      continue;
    }
    const item = factProgramToExternalItem(f, input.criteria, localKeySet);
    if (item) factFreshPrograms.push(item);
  }

  options.onFactDbChecked?.({
    freshCount: factFreshPrograms.length,
    historicalCount: factHits.historical.length,
    urlCachedSchools: factHits.urlCachedSchools,
  });

  const historicalPrograms: ExternalHistoricalItem[] = factHits.historical
    .filter((h) => evaluateAcademicTierEligibility(input.criteria, { schoolName: h.school, schoolTags: h.tier ?? null }).eligible)
    .slice(0, 10)
    .map((h) => {
      const refYear = typeof h.data_year === "number" ? h.data_year : Number(h.data_year) || 2026;
      const pMeta = input.partnerMetaBySchool?.[h.school];
      return {
        schoolName: h.school,
        schoolNature: h.tier || null,
        programName: h.major,
        referenceYear: refYear,
        targetYear: input.criteria.intakeYear ?? new Date().getFullYear(),
        preliminaryTier: h.stale_reason ? "待重核" : "冲~稳（待目标年份简章发布核实）",
        historicalSummary: `${refYear}官网：${h.duration || "学制详见官网"}，${formatFactTuition(h)}，${h.deadline_note || "截止待核"}`,
        sourceUrl: h.source_url ?? h.source_urls[0] ?? null,
        partnerTag: pMeta?.isPartner ? pMeta.partnerBadge ?? pMeta.partnerTier ?? null : null,
      };
    });

  const academicGuidance = studentBand
    ? {
        studentAcademicBand: studentBand.label,
        bandRank: studentBand.band,
        forbidElite985: studentBand.band <= 3,
        forbidKey211: studentBand.band <= 2,
        needCollegeTier: studentBand.band <= 3 && input.criteria.programType === "UG",
        guidance: studentBand.band <= 2
          ? (input.criteria.programType === "MASTER" || input.criteria.programType === "PHD"
            ? "学生成绩处于偏弱/弱档，严禁推荐任何 985 或 211 大学（不得进入冲层）；硕博申请必须限定在拥有真实硕博授权点的省属普通公办大学（理工/科技/工业大学等），严禁编造民办本科的硕士项目。"
            : "学生成绩处于偏弱/弱档，严禁推荐任何 985 或 211 大学（不得进入冲层）；请优先检索并推荐普通二本公办学院、民办本科或职业本科大学（不含只发专科的高职/中专），并在合格池内按相对竞争度分出冲稳保。")
          : studentBand.band === 3
            ? (input.criteria.programType === "MASTER" || input.criteria.programType === "PHD"
              ? "学生成绩处于中等档，严禁推荐 985 名校；请重点推荐普通公办本科大学硕士项目（可少量含 211 冲刺），切勿虚构无硕士点民办学院的硕士。"
              : "学生成绩处于中等档，严禁推荐 985 名校；请重点推荐普通公办本科大学及全日制本科学院（不含专科/高职），少量匹配 211 可作冲刺。")
            : "学生成绩处于优秀/良好档，可正常匹配 985/211/双一流及优质公办大学并形成冲稳保梯队。",
      }
    : null;

  const userContent = JSON.stringify({
    userRequest: input.sanitizedMessage.slice(0, 2500),
    structuredCriteria: input.criteria,
    academicGuidance,
    deterministicDiagnostic: {
      state: diagnostic.state,
      initialTier: diagnostic.initialTier,
      finalTier: diagnostic.finalTier,
      normalizedAcademic: diagnostic.academic,
      englishExemption: diagnostic.englishExemption,
      tierWindow: diagnostic.tierWindow,
      pathwayLocks: diagnostic.pathwayLocks,
      pathwayLockLabels: diagnostic.pathwayLockLabels,
      scholarshipPolicy: diagnostic.scholarshipPolicy,
      bottlenecks: diagnostic.bottlenecks.map((b) => ({ code: b.code, severity: b.severity, summary: b.summary, effect: b.effect })),
      modifiers: diagnostic.modifiers,
      curatedFallbacks: diagnostic.curatedFallbacks,
      legalComplianceNotice: LEGAL_NO_ILLEGAL_WORK_NOTICE,
    },
    localTierCounts: input.localTierCounts ?? null,
    factDbFreshMatches: factFreshPrograms.map((p) => `${p.schoolName}·${p.programName}`).slice(0, 6),
    targetQuotaPerTier: 3,
  });

  let payload: AiCompletionPayload;
  let usedWebSearch = false;
  try {
    if (wantWebSearch) {
      try {
        payload = await requestAiCompletion(
          config,
          [
            { role: "system", content: EXTERNAL_SCREENING_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          {
            timeoutMs: options.timeoutMs ?? 60_000,
            maxTokens: 8000,
            retries: 0,
            signal: options.signal,
            fetchImpl: options.fetchImpl,
            tools: [{ type: "deepseek_web_search" }],
            responseFormat: "text",
          },
        );
        usedWebSearch = true;
        reservation.commit();
      } catch (err) {
        reservation.release();
        const errMsg = err instanceof Error ? err.message : "";
        // If endpoint/model does not support deepseek_web_search, gracefully fall back to plain AI knowledge
        if (errMsg.includes("不支持")) {
          skippedReason = "unsupported";
          payload = await requestAiCompletion(
            config,
            [
              { role: "system", content: EXTERNAL_SCREENING_SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
            {
              timeoutMs: options.timeoutMs ?? 35_000,
              maxTokens: 2800,
              retries: 0,
              signal: options.signal,
              fetchImpl: options.fetchImpl,
            },
          );
        } else {
          throw err;
        }
      }
    } else {
      payload = await requestAiCompletion(
        config,
        [
          { role: "system", content: EXTERNAL_SCREENING_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        {
          timeoutMs: options.timeoutMs ?? 35_000,
          maxTokens: 2800,
          retries: 0,
          signal: options.signal,
          fetchImpl: options.fetchImpl,
        },
      );
    }
  } catch (err) {
    reservation.release();
    throw err;
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return null;

  let parsedJson: unknown;
  try {
    parsedJson = extractJsonObject(content);
  } catch {
    // Attempt recovery when a long web-search completion was truncated mid-JSON
    const start = content.indexOf("{");
    if (start >= 0) {
      let recovered: unknown = null;
      const body = content.slice(start);
      for (const suffix of ["]}", "]} }", "}]}", '"}]}', '"]}']) {
        const lastObjEnd = body.lastIndexOf("}");
        if (lastObjEnd > 0) {
          try {
            recovered = JSON.parse(`${body.slice(0, lastObjEnd + 1)}${suffix}`);
            break;
          } catch {
            // keep trying
          }
        }
      }
      parsedJson = recovered;
    }
    if (!parsedJson) {
      if (process.env.NODE_ENV !== "test") {
        console.warn("[ai-screening-external] extractJsonObject failed; finish_reason=", payload.choices?.[0]?.finish_reason, "len=", content.length);
      }
      return null;
    }
  }
  const parsed = parseExternalPayload(parsedJson);
  if (!parsed) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[ai-screening-external] parseExternalPayload returned null");
    }
    return null;
  }

  const builtinSources = usedWebSearch ? extractBuiltinSearchSources(payload) : [];
  const toolSearchCount = payload.usage?.server_tool_use?.tool_search ?? 0;
  const searchActive = usedWebSearch && (builtinSources.length > 0 || toolSearchCount > 0 || Boolean(payload.choices?.[0]?.message?.server_tool_calls?.length));
  const mode: ExternalScreeningResult["mode"] = searchActive ? "web_search" : "ai_knowledge";
  const sourceSet = new Set(builtinSources);
  options.onWebResultParsed?.({
    rawCount: parsed.programs.length,
    mode,
    sourceCount: builtinSources.length,
  });

  const seenPrograms = new Set<string>();
  const primaryCityNorms = new Set(
    [...(input.criteria.cities ?? []), ...(input.criteria.city ? [input.criteria.city] : [])]
      .map((c) => c.replace(/市$/u, "").trim())
      .filter(Boolean),
  );
  const fallbackCityNorms = new Set(
    (input.criteria.fallbackCities ?? []).map((c) => c.replace(/市$/u, "").trim()).filter(Boolean),
  );

  const autoExcludedNotes: string[] = [...factExcludedNotes];
  const programs: ExternalProgramItem[] = [];
  for (const factItem of factFreshPrograms) {
    const dedupKey = `${schoolIdentityKey(factItem.schoolName)}::${factItem.programName.toLowerCase()}`;
    if (!seenPrograms.has(dedupKey)) {
      seenPrograms.add(dedupKey);
      const pMeta = input.partnerMetaBySchool?.[factItem.schoolName];
      programs.push({
        ...factItem,
        ...(pMeta ? {
          isPartner: pMeta.isPartner,
          partnerTier: pMeta.partnerTier ?? null,
          partnerBadge: pMeta.partnerBadge ?? null,
          partnerNote: pMeta.partnerNote ?? null,
        } : {}),
      });
    }
  }

  for (const raw of parsed.programs) {
    if (!passesHardExternalFilters(raw, input.criteria, diagnostic)) continue;
    const academicEligibility = evaluateAcademicTierEligibility(input.criteria, {
      schoolName: raw.schoolName,
      schoolTags: raw.schoolNature ?? null,
    });
    if (!academicEligibility.eligible) {
      autoExcludedNotes.push(`${raw.schoolName}：${academicEligibility.reason ?? "成绩档位差距较大，不予推荐"}`);
      continue;
    }
    const hardRuleCheck = evaluateSchoolAgainstRules(diagnostic, input.criteria, {
      schoolName: raw.schoolName,
      schoolTags: raw.schoolNature ?? null,
      programName: raw.programName,
      programType: input.criteria.programType,
      teachingLanguage: raw.teachingLanguage,
      firstYearCostMax: raw.tuitionAmount ?? null,
      scholarshipSummary: raw.scholarshipSummary,
      city: raw.city,
      languageRequirement: raw.languageRequirement,
    });
    if (!hardRuleCheck.eligible) {
      autoExcludedNotes.push(`${raw.schoolName}：${hardRuleCheck.reasons[0] ?? "触发确定性硬闸门拦截"}`);
      continue;
    }
    const sanitizedScholarshipSummary = !diagnostic.scholarshipPolicy.govFullAllowed
      && /(?:全额奖学金|全奖|CSC|中国政府奖学金|商务部奖学金)/iu.test(raw.scholarshipSummary)
      ? "当前硬件未达政府全奖门槛，请按自费或校内小额减免口径核实官网"
      : raw.scholarshipSummary;
    const sanitizedFitReason = containsIllegalWorkSuggestion(raw.fitReason)
      ? `符合当前降级路径与合法资金口径（${LEGAL_NO_ILLEGAL_WORK_NOTICE}）`
      : raw.fitReason;
    const extraRuleWarn = hardRuleCheck.warnings.length ? `；${hardRuleCheck.warnings.join("；")}` : "";
    const sanitizedCaution = containsIllegalWorkSuggestion(raw.caution)
      ? `${LEGAL_NO_ILLEGAL_WORK_NOTICE}${extraRuleWarn}`
      : `${raw.caution}${extraRuleWarn}`;
    const dedupKey = `${schoolIdentityKey(raw.schoolName)}::${raw.programName.toLowerCase()}`;
    if (seenPrograms.has(dedupKey)) continue;
    seenPrograms.add(dedupKey);

    const safeSources = [...new Set((raw.sourceUrls ?? []).map(sanitizeHttpUrl).filter((u): u is string => Boolean(u)))];
    const safeOfficial = sanitizeHttpUrl(raw.officialUrl) ?? safeSources[0] ?? null;
    const groundedBySearch = mode === "web_search"
      && (safeSources.some((u) => sourceSet.has(u)) || (safeOfficial != null && sourceSet.has(safeOfficial)) || builtinSources.length > 0);

    const normalizedCity = raw.city.replace(/市$/u, "").trim();
    const isFallbackCity = primaryCityNorms.size > 0
      && !primaryCityNorms.has(normalizedCity)
      && fallbackCityNorms.has(normalizedCity);

    const requiresGmatOrGre = /(?:需|要求|必须).{0,8}(?:GMAT|GRE)/iu.test(raw.degreeAndExamNotes ?? "")
      && !/(?:无需|不要求|免|可选).{0,8}(?:GMAT|GRE)/iu.test(raw.degreeAndExamNotes ?? "");

    const partnerMeta = input.partnerMetaBySchool?.[raw.schoolName];
    const coopMode = partnerMeta?.isPartner ? "listed" as const : "unknown" as const;

    const syntheticPoints = [
      { label: "专业", level: "PASS" as const, text: raw.programName },
      { label: "授课语言", level: "PASS" as const, text: raw.teachingLanguage },
      { label: "申请学历", level: "PASS" as const, text: raw.programName },
      ...(raw.city ? [{ label: "地区", level: "PASS" as const, text: raw.city }] : []),
      ...(raw.scholarshipEligible ? [{ label: "奖学金", level: "PASS" as const, text: raw.scholarshipSummary }] : []),
    ];
    const breakdown = scoreCandidate({
      schoolName: raw.schoolName,
      schoolTags: raw.schoolNature ?? null,
      cooperation: coopMode,
      verified: groundedBySearch,
      feeFreshness: groundedBySearch ? "current" : "unknown",
      scholarshipCategory: raw.scholarshipSummary,
      majorMatchType: "exact",
      isFallbackCity,
      points: syntheticPoints,
      requiresGmatOrGre,
      supervisorNeed: raw.supervisorLetter === "required",
    }, input.criteria);

    const finalTier = raw.tier === "SAFE" && breakdown.canEnterSafe === false
      ? "TARGET"
      : (raw.tier ?? breakdown.tier);
    const tierReason = finalTier === "SAFE" && raw.tier === "SAFE"
      ? "满足已知主要申请条件且竞争相对友好，可作相对低风险保底（非录取保证）"
      : finalTier !== raw.tier && raw.tier === "SAFE"
        ? "存在需核实或补齐的前置条件，定位稳妥匹配档"
        : breakdown.tierReason;
    programs.push({
      schoolName: raw.schoolName,
      programName: raw.programName,
      city: raw.city,
      schoolNature: raw.schoolNature ?? null,
      teachingLanguage: raw.teachingLanguage,
      duration: raw.duration,
      tuitionText: raw.tuitionText ?? null,
      tuitionAmount: raw.tuitionAmount ?? null,
      tuitionBasis: raw.tuitionBasis,
      accommodationText: raw.accommodationText ?? null,
      dataYear: raw.dataYear ?? null,
      windowStatus: raw.windowStatus,
      supervisorLetter: raw.supervisorLetter,
      cscaRequired: raw.cscaRequired ?? null,
      scholarshipEligible: diagnostic.scholarshipPolicy.govFullAllowed ? raw.scholarshipEligible : (raw.scholarshipEligible && !/(?:全额奖学金|全奖|CSC)/iu.test(raw.scholarshipSummary)),
      scholarshipSummary: sanitizedScholarshipSummary,
      deadline: raw.deadline,
      languageRequirement: raw.languageRequirement,
      degreeAndExamNotes: raw.degreeAndExamNotes ?? null,
      officialUrl: safeOfficial,
      sourceUrls: safeSources.length ? safeSources : builtinSources.slice(0, 2),
      tier: finalTier,
      tierReason,
      score: breakdown.total,
      scoreBreakdown: { ...breakdown, tier: finalTier, tierReason },
      fitReason: sanitizedFitReason,
      caution: sanitizedCaution,
      groundedBySearch,
      factDbStatus: groundedBySearch ? "web_verified" : undefined,
      eligibilityStatus: raw.supervisorLetter === "required" || finalTier !== "SAFE" && breakdown.canEnterSafe === false ? "conditional" : "eligible",
      evidenceGrade: groundedBySearch && safeOfficial ? "A" : "C",
      inLocalDatabase: localKeySet.has(schoolIdentityKey(raw.schoolName)),
      ...(partnerMeta ? {
        isPartner: partnerMeta.isPartner,
        partnerTier: partnerMeta.partnerTier ?? null,
        partnerBadge: partnerMeta.partnerBadge ?? null,
        partnerNote: partnerMeta.partnerNote ?? null,
      } : {}),
    });
  }

  let persistedFactCount = 0;
  let verifiedPrograms = programs;
  const shouldVerifyOfficialPages = options.enableOfficialPageVerify ?? (process.env.NODE_ENV !== "test");
  if (shouldVerifyOfficialPages && programs.some((p) => p.factDbStatus !== "fresh")) {
    try {
      const freshOnes = programs.filter((p) => p.factDbStatus === "fresh");
      const toVerify = programs.filter((p) => p.factDbStatus !== "fresh");
      // Verification now covers every candidate school (one page fetch each),
      // so surface all of them instead of only the first six programs' schools.
      options.onVerifyStart?.([...new Set(toVerify.map((p) => p.schoolName))]);
      const verifyResult = await verifyAndPersistExternalPrograms(toVerify, input.criteria, {
        fetchImpl: options.fetchImpl,
        signal: options.signal,
        factDbPath: options.factDbPath,
        onSchoolVerify: options.onVerifySchool,
      });
      verifiedPrograms = [...freshOnes, ...verifyResult.verifiedPrograms];
      persistedFactCount = verifyResult.persistedPrograms;
    } catch {
      verifiedPrograms = programs;
    }
  }

  const rebalancedPrograms = verifiedPrograms.length >= 2
    ? rebalancePoolTiers(verifiedPrograms, {
        schoolKeyOf: (item) => schoolIdentityKey(item.schoolName),
        schoolNameOf: (item) => item.schoolName,
        schoolTagsOf: (item) => item.schoolNature ?? null,
        scoreOf: (item) => item.score,
        tierOf: (item) => item.tier,
        canSafeOf: (item) => item.scoreBreakdown?.canEnterSafe,
        gapBandsOf: (item) => item.scoreBreakdown?.gapBands,
        difficultyOf: (item) => item.scoreBreakdown?.difficultyIndex,
        applyTier: (item, tier, reason) => ({
          ...item,
          tier,
          tierReason: reason,
          scoreBreakdown: item.scoreBreakdown ? { ...item.scoreBreakdown, tier, tierReason: reason } : undefined,
        }),
      })
    : verifiedPrograms;

  const limitedPrograms = selectBalancedCandidates(
    rebalancedPrograms,
    {
      keyOf: (item) => schoolIdentityKey(item.schoolName),
      scoreOf: (item) =>
        item.score
        + (matchesTargetSchoolPool(item.schoolName, input.criteria.targetSchools) ? 20 : 0)
        + (item.isPartner ? getPartnerTierRank(item.partnerTier) * 4 : 0),
      tierOf: (item) => item.tier,
    },
    9,
    true,
    true,
  );

  const tierOrder: Record<AdmissionTier, number> = { REACH: 0, TARGET: 1, SAFE: 2 };
  const windowOrder: Record<string, number> = { open: 0, upcoming: 1, wait: 2 };
  limitedPrograms.sort((a, b) =>
    tierOrder[a.tier] - tierOrder[b.tier]
    || (windowOrder[a.windowStatus ?? "open"] ?? 2) - (windowOrder[b.windowStatus ?? "open"] ?? 2)
    || Number(Boolean(b.isPartner)) * getPartnerTierRank(b.partnerTier) - Number(Boolean(a.isPartner)) * getPartnerTierRank(a.partnerTier)
    || Number(matchesTargetSchoolPool(b.schoolName, input.criteria.targetSchools)) - Number(matchesTargetSchoolPool(a.schoolName, input.criteria.targetSchools))
    || b.score - a.score,
  );

  const policyNotes: ExternalPolicyNote[] = (parsed.policyNotes ?? []).map((note) => ({
    title: note.title,
    content: note.content,
    sourceUrls: (note.sourceUrls ?? []).map(sanitizeHttpUrl).filter((u): u is string => Boolean(u)),
  }));

  const mergedExcluded = [...new Set([...(parsed.excludedNotes ?? []).filter(Boolean), ...autoExcludedNotes])];

  if (!limitedPrograms.length && !historicalPrograms.length && !policyNotes.length && !parsed.summary && !mergedExcluded.length) return null;

  const disclaimer = mode === "web_search"
    ? "库外项目已通过模型内置联网检索实时核查官网；具体截止日期、语言门槛及奖学金名额仍请以学校官网最新简章为准。"
    : skippedReason === "disabled"
      ? "管理员已在后台关闭实时联网搜索，当前库外项目来自 AI 公开知识整理，请人工核实官网。"
      : skippedReason === "quota_exceeded"
        ? "今日实时联网搜索次数已达后台设定上限，已自动切换为 AI 公开知识整理，请人工核实官网。"
        : "当前未获取到实时联网结果，库外项目来自 AI 公开知识整理，官网链接、截止日期及奖学金政策请务必人工核实。";

  const finalResult: ExternalScreeningResult = {
    mode,
    summary: parsed.summary || `已基于${mode === "web_search" ? "模型内置实时联网检索" : "AI 公开知识拓展"}整理 ${limitedPrograms.length} 个库外参考项目。`,
    programs: limitedPrograms,
    ...(historicalPrograms.length ? { historicalPrograms } : {}),
    excludedNotes: mergedExcluded.length ? mergedExcluded : undefined,
    policyNotes,
    searchQueries,
    quotaLimited: skippedReason === "quota_exceeded" || undefined,
    ...(persistedFactCount > 0 ? { persistedFactCount } : {}),
    disclaimer,
  };

  if (enforceGovernance && limitedPrograms.length > 0 && options.enableOfficialPageVerify === undefined) {
    setCachedSearchHits(cacheKey, [finalResult]);
  }
  return finalResult;
}

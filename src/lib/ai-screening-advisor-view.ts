import { schoolIdentityKey, type ChatCriteria, type EvidencePoint, type ResultCard } from "@/lib/ai-screening";
import type { ScreeningResponse } from "@/lib/ai-screening-events";
import type { ExternalHistoricalItem, ExternalPolicyNote, ExternalProgramItem } from "@/lib/ai-screening-external";
import { admissionListLabel, displayProgramName, isCandidate, resultSchoolKey, summarizePoints } from "@/lib/ai-screening-presentation";
import type { PartnerSearchResultItem } from "@/lib/partner-school-engine";
import { classifyStudentAcademicBand, inferSchoolAdmissionBand, type AdmissionTier } from "@/lib/screening-ranking";
import type { AdmissionDiagnostic, CuratedFallbackRecommendation } from "@/lib/admission-rule-engine";

export type CitationKind = "official" | "kb" | "web" | "list" | "partner";

export type AdvisorCitation = {
  id: number;
  kind: CitationKind;
  title: string;
  href: string | null;
  domain?: string;
  detail?: string;
  isExternal: boolean;
  schoolHref?: string;
};

export type AdvisorConditionStatus = "good" | "match" | "tight" | "limit" | "info";

export type AdvisorConditionCheck = {
  dimension: string;
  input: string;
  verdict: string;
  status: AdvisorConditionStatus;
};

export type AdvisorEvidenceLine = {
  label: string;
  text: string;
  citationIds: number[];
};

export type AdvisorKeyFact = {
  label: string;
  value: string;
  citationIds?: number[];
};

export type AdvisorSchoolMatch = {
  key: string;
  schoolName: string;
  schoolId?: string;
  programId?: string;
  schoolHref?: string;
  programName: string;
  cityLabel?: string;
  schoolNature?: string;
  tier?: AdmissionTier;
  score?: number;
  isPartner: boolean;
  partnerLabel?: string;
  notCooperating: boolean;
  sourceKindLabel: string;
  sourceTone: "partner" | "web" | "kb" | "ai";
  verified: boolean;
  officialUrl?: string | null;
  reasons: AdvisorEvidenceLine[];
  cautions: AdvisorEvidenceLine[];
  keyFacts: AdvisorKeyFact[];
  warnings: string[];
  localCard?: ResultCard;
  primaryCitationIds: number[];
};

export type AdvisorHistoricalItem = {
  schoolName: string;
  programName: string;
  referenceYear: string;
  targetYear: string;
  summary: string;
  partnerTag?: string;
  citationIds: number[];
};

export type AdvisorPolicyItem = {
  title: string;
  content: string;
  citationIds: number[];
};

export type AdvisorFollowUpView = {
  lead: string;
  leadCitationIds: number[];
  details: Array<{ text: string; citationIds: number[] }>;
  note?: string;
};

export type AdvisorView = {
  mode: "screening" | "circuit_breaker" | "partner_quick" | "follow_up" | "conversation";
  headline: string;
  subline?: string;
  headlineCitationIds: number[];
  conditionChecks: AdvisorConditionCheck[];
  schools: AdvisorSchoolMatch[];
  eliminatedNotes: string[];
  downgradeLockBanner?: {
    title: string;
    reason: string;
    pathways: string[];
    actions: string[];
    fallbacks: CuratedFallbackRecommendation[];
    legalNotice?: string;
  };
  circuitBreakerBanner?: {
    title: string;
    reason: string;
    actions: string[];
    legalNotice: string;
  };
  nonPartnerWarnings: Array<{ school: string; warning: string }>;
  blockedPartners: Array<{ school: string; partnerTier: string; reason: string }>;
  policyNotes: AdvisorPolicyItem[];
  historicalItems: AdvisorHistoricalItem[];
  followUp?: AdvisorFollowUpView;
  citations: AdvisorCitation[];
  nextHint?: string;
  counts: {
    total: number;
    partner: number;
    official: number;
    kb: number;
    reach: number;
    target: number;
    safe: number;
  };
};

const DEGREE_LABELS: Record<string, string> = {
  UG: "本科",
  MASTER: "硕士",
  PHD: "博士",
  LONG_TERM: "长期语言",
  SHORT_TERM: "短期项目",
};

const SEASON_LABELS: Record<string, string> = {
  SPRING: "春季",
  SUMMER: "夏季",
  AUTUMN: "秋季",
  WINTER: "冬季",
};

const ACADEMIC_LEVEL_LABELS: Record<string, string> = {
  EXCELLENT: "成绩优秀",
  GOOD: "成绩良好",
  MEDIUM: "成绩中等",
  WEAK: "成绩偏弱",
  POOR: "成绩较弱",
};

const TIER_ORDER: Record<AdmissionTier, number> = {
  REACH: 0,
  TARGET: 1,
  SAFE: 2,
};

function formatAdvisorConcern(point: EvidencePoint, criteria: ChatCriteria): string {
  if (point.label === "入学年份" || point.label === "入学季") {
    const year = criteria.intakeYear != null ? `${criteria.intakeYear} 年` : "目标年份的";
    const season = ({ SPRING: "春季", SUMMER: "夏季", AUTUMN: "秋季", WINTER: "冬季" } as const)[criteria.intakeSeason ?? "SPRING"];
    return `${year}${criteria.intakeSeason ? season : ""}是否开班还没有确认`;
  }
  if (point.text.includes("招生表费用口径不明确")) return "名单中的费用口径还不明确，预算是否足够需要核实";
  if (point.text.includes("费用冲突")) return "名单和知识库的费用有冲突，需要先核对";
  if (point.text.includes("截止日期已过")) return "知识库里的截止时间已过，新批次尚待核实";
  if (point.label === "首年预算" && point.level === "NEED" && /名单列有当期学费/u.test(point.text)) return "名单有当期学费，但完整首年费用仍来自旧年或未注明年份的知识库，需要核实";
  if (point.label === "首年预算" && point.level === "NEED" && /未注明适用年份|资料年份为/u.test(point.text)) return "知识库费用的适用年份尚未确认，预算是否足够需要核实";
  if (point.label === "申请截止" && point.text.includes("需确认适用批次")) return "现有截止日期需要确认是否适用于目标批次";
  if (point.label === "申请截止" && point.level === "UNKNOWN") return "申请截止时间还没有确认";
  if (point.label === "首年预算" && point.level === "UNKNOWN") return "项目首年费用资料不足，暂时无法判断是否在预算内";
  if (point.label === "英语" && point.level === "UNKNOWN") return "项目的英语成绩要求尚未明确";
  if (point.label.startsWith("HSK") && point.level === "UNKNOWN") return "项目的 HSK 要求尚未明确";
  if (point.label === "GPA" && point.level === "UNKNOWN") return "项目的 GPA 要求尚未明确";
  if (point.label === "授课语言" && point.level === "UNKNOWN") return "项目授课语言尚未确认";
  if (point.label === "专业" && point.level === "NEED") return "专业方向可能相关，还需向学校确认是否有目标专业";
  return point.text.replace(/[。；;]+$/u, "");
}

function cleanTrailingPunct(text: string): string {
  return text.trim().replace(/[。；;，,]+$/u, "");
}

function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function urlDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return undefined;
  }
}

function buildSchoolArchiveHref(schoolId?: string, programId?: string): string | undefined {
  if (!schoolId) return undefined;
  const base = `/schools/${encodeURIComponent(schoolId)}`;
  return programId
    ? `${base}?from=screening&programId=${encodeURIComponent(programId)}`
    : base;
}

class CitationRegistry {
  private items: AdvisorCitation[] = [];
  private keyMap = new Map<string, number>();

  register(input: Omit<AdvisorCitation, "id">, dedupeKey: string): number {
    const existing = this.keyMap.get(dedupeKey);
    if (existing != null) {
      // Enrich existing entry if we later get a better title/href
      const current = this.items[existing - 1];
      if (current && !current.schoolHref && input.schoolHref) {
        current.schoolHref = input.schoolHref;
      }
      return existing;
    }
    const id = this.items.length + 1;
    this.items.push({ id, ...input });
    this.keyMap.set(dedupeKey, id);
    return id;
  }

  registerUrl(
    url: string | null | undefined,
    title: string,
    kind: "official" | "web" = "official",
    detail?: string,
  ): number | null {
    const safe = safeHttpUrl(url);
    if (!safe) return null;
    const normalizedKey = `url:${safe.replace(/\/+$/u, "").toLowerCase()}`;
    return this.register(
      {
        kind,
        title,
        href: safe,
        domain: urlDomain(safe),
        detail,
        isExternal: true,
      },
      normalizedKey,
    );
  }

  registerKb(
    schoolName: string,
    schoolId: string | undefined,
    programId: string | undefined,
    verified?: boolean,
  ): number | null {
    const href = buildSchoolArchiveHref(schoolId, programId);
    if (!href) return null;
    const key = `kb:${schoolId}:${programId ?? "school"}`;
    return this.register(
      {
        kind: "kb",
        title: `${schoolName} · 校内院校项目档案`,
        href,
        detail: verified ? "已人工核实" : "校内知识库档案",
        isExternal: false,
      },
      key,
    );
  }

  registerList(
    schoolName: string,
    listLabel: string,
    sourceText: string,
    schoolHref?: string,
  ): number {
    const cleanSource = sourceText.trim();
    const key = `list:${schoolIdentityKey(schoolName)}:${cleanSource}`;
    return this.register(
      {
        kind: "list",
        title: `${schoolName} · ${listLabel}`,
        href: null,
        detail: cleanSource,
        isExternal: false,
        schoolHref,
      },
      key,
    );
  }

  registerPartnerLedger(
    schoolName: string,
    detail: string,
    schoolHref?: string,
  ): number {
    const key = `partner:${schoolIdentityKey(schoolName)}`;
    return this.register(
      {
        kind: "partner",
        title: `${schoolName} · 内部合作院校台账`,
        href: schoolHref ?? null,
        detail,
        isExternal: false,
        schoolHref,
      },
      key,
    );
  }

  all(): AdvisorCitation[] {
    return this.items;
  }
}

function uniqueIds(ids: Array<number | null | undefined>): number[] {
  return [...new Set(ids.filter((id): id is number => typeof id === "number" && id > 0))];
}

function formatGpaInput(criteria: ChatCriteria): string | null {
  if (criteria.gpa != null && Number.isFinite(criteria.gpa)) {
    const scale = criteria.gpaScale ?? (criteria.gpa <= 4 ? 4 : criteria.gpa <= 5 ? 5 : 100);
    if (criteria.gradeSystem === "UK_HONOURS") return `英制 ${criteria.gpa}%`;
    if (criteria.gradeSystem === "FR_20") return `法制 ${criteria.gpa}/20`;
    if (criteria.gradeSystem === "DE_REVERSE") return `德制 ${criteria.gpa}`;
    return scale === 100 ? `均分 ${criteria.gpa}%` : `GPA ${criteria.gpa}/${scale}`;
  }
  if (criteria.academicLevel) return ACADEMIC_LEVEL_LABELS[criteria.academicLevel] ?? null;
  return null;
}

function formatLanguageInput(criteria: ChatCriteria): string | null {
  const parts: string[] = [];
  if (criteria.teachingLanguage === "ENGLISH") parts.push("英文授课");
  else if (criteria.teachingLanguage === "CHINESE") parts.push("中文授课");
  if (criteria.ielts != null) parts.push(`雅思 ${criteria.ielts}`);
  if (criteria.toefl != null) parts.push(`托福 ${criteria.toefl}`);
  if (criteria.duolingo != null) parts.push(`多邻国 ${criteria.duolingo}`);
  if (criteria.hskLevel != null) parts.push(`HSK ${criteria.hskLevel}级${criteria.hskScore != null ? ` ${criteria.hskScore}分` : ""}`);
  else if (criteria.hskScore != null) parts.push(`HSK ${criteria.hskScore}分`);
  if (criteria.languageStatus === "CONFIRMED_NONE" && parts.length <= 1) parts.push("暂无语言成绩");
  if (criteria.languageStatus === "MOI_ONLY" || criteria.hasMoiCertificate) parts.push("仅持英文授课证明(MOI)");
  if (criteria.plannedExams) parts.push(`计划考：${criteria.plannedExams}`);
  return parts.length ? parts.join(" · ") : null;
}

function extractNumberAfter(text: string, regex: RegExp): number | null {
  const match = text.match(regex);
  if (!match?.[1]) return null;
  const val = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(val) ? val : null;
}

function parseExternalTuitionRange(item: ExternalProgramItem): { amount: number | null; display: string | null } {
  if (item.tuitionAmount != null && Number.isFinite(item.tuitionAmount) && item.tuitionAmount > 0) {
    const unit = item.tuitionBasis === "total_program" ? "元（全程）" : item.tuitionBasis === "per_semester" ? "元/学期" : "元/年";
    return { amount: item.tuitionAmount, display: `${item.tuitionAmount.toLocaleString("zh-CN")} ${unit}` };
  }
  const raw = item.tuitionText?.trim();
  if (!raw || /^(?:未公布|待核|未知)/u.test(raw)) return { amount: null, display: null };
  const amount = extractNumberAfter(raw, /([\d,]+(?:\.\d+)?)\s*(?:元|RMB)/iu);
  return { amount, display: raw };
}

function isKnownText(value: string | null | undefined): boolean {
  const s = String(value ?? "").trim();
  if (!s) return false;
  return !/^(?:未公布|未公开|待核|待确认|以官网|详见官网|未知|无|—|-|暂无)/u.test(s);
}

function isRedundantBoilerplateReason(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^官网事实库已核实/u.test(trimmed)) return true;
  if (/^(?:正常匹配|双向|锁池|路径锁|守门)/u.test(trimmed)) return true;
  return false;
}

function buildSchoolReasonsAndCautions(params: {
  schoolName: string;
  programName: string;
  cityLabel?: string;
  schoolNature?: string;
  tier?: AdmissionTier;
  criteria: ChatCriteria;
  diagnostic?: AdmissionDiagnostic | null;
  localCard?: ResultCard;
  extItem?: ExternalProgramItem;
  kbCitations: number[];
  officialCitations: number[];
  listCitations: number[];
  allCitations: number[];
}): { reasons: AdvisorEvidenceLine[]; cautions: AdvisorEvidenceLine[]; keyFacts: AdvisorKeyFact[] } {
  const {
    schoolName,
    programName,
    cityLabel,
    schoolNature,
    tier,
    criteria,
    diagnostic,
    localCard,
    extItem,
    kbCitations,
    officialCitations,
    listCitations,
    allCitations,
  } = params;

  const reasons: AdvisorEvidenceLine[] = [];
  const cautions: AdvisorEvidenceLine[] = [];
  const keyFacts: AdvisorKeyFact[] = [];

  const primaryCites = officialCitations.length
    ? uniqueIds([officialCitations[0], kbCitations[0]])
    : kbCitations.length
      ? uniqueIds([kbCitations[0], listCitations[0]])
      : uniqueIds([allCitations[0]]);
  const factCites = officialCitations.length ? [officialCitations[0]] : primaryCites;
  const kbOrListCites = uniqueIds([kbCitations[0], listCitations[0], officialCitations[0]]);

  const addReason = (label: string, text: string, citationIds: number[]) => {
    const cleaned = cleanTrailingPunct(text);
    if (!cleaned) return;
    if (reasons.some((r) => r.label === label)) return;
    reasons.push({ label, text: cleaned, citationIds: uniqueIds(citationIds) });
  };

  const addCaution = (label: string, text: string, citationIds: number[]) => {
    const cleaned = cleanTrailingPunct(text);
    if (!cleaned) return;
    if (cautions.some((c) => c.text === cleaned || (c.label === label && label !== "提醒"))) return;
    cautions.push({ label, text: cleaned, citationIds: uniqueIds(citationIds) });
  };

  const localSummary = localCard ? summarizePoints(localCard.points) : { matches: [] as EvidencePoint[], concerns: [] as EvidencePoint[] };
  const schoolBand = inferSchoolAdmissionBand(schoolName, schoolNature ?? localCard?.schoolTags, localCard?.qsRanking);
  const studentBand = classifyStudentAcademicBand(criteria);
  const gpaInput = formatGpaInput(criteria);

  // 1. 分数 / 成绩匹配依据
  const localGpaPass = localSummary.matches.find((p) => p.label === "GPA");
  const localGpaMin = localCard?.facts?.gpaMin;
  const localGpaScale = localCard?.facts?.gpaScale;
  if (gpaInput) {
    if (localGpaMin != null && localGpaScale != null && criteria.gpa != null && criteria.gpaScale === localGpaScale && criteria.gpa >= localGpaMin) {
      addReason(
        "分数",
        `你的 ${gpaInput} 达到该项目要求的 ${localGpaMin}/${localGpaScale}，与该校「${schoolNature || schoolBand.label}」层次匹配`,
        kbOrListCites,
      );
    } else if (localGpaPass && /\d/u.test(localGpaPass.text)) {
      addReason("分数", `${localGpaPass.text}（院校层次：${schoolNature || schoolBand.label}）`, kbOrListCites);
    } else if (studentBand) {
      const tierHint =
        tier === "REACH"
          ? "院校竞争略高，适合作为冲刺志愿"
          : tier === "SAFE"
            ? "门槛相对友好，可作稳妥保底选择"
            : "与该校常规录取档位契合，适合作为主申";
      const pctNote = diagnostic?.academic.normPct != null ? `（等效约 ${diagnostic.academic.normPct}%）` : "";
      addReason(
        "分数",
        `你的 ${gpaInput}${pctNote}属${studentBand.label}档，对应「${schoolNature || schoolBand.label}」${tierHint}`,
        primaryCites,
      );
    }
  } else if (schoolNature) {
    addReason("层次", `院校层次为「${schoolNature}」，适合纳入本轮对比`, primaryCites);
  }

  // 2. 预算 / 费用依据
  const extTuition = extItem ? parseExternalTuitionRange(extItem) : { amount: null, display: null };
  const localTuition = localCard?.facts?.tuitionStatus === "known" && localCard.facts.tuition != null ? localCard.facts.tuition : null;
  const localCost = localCard?.comparableCost ?? null;
  const effectiveCost = extTuition.amount ?? localCost ?? localTuition;
  const feeFreshness = localCard?.facts?.feeFreshness;
  const sourceYear = extItem?.dataYear ?? localCard?.facts?.sourceYear;
  const budgetPoint = localCard?.points.find((p) => p.label === "首年预算" || p.label === "费用冲突");

  if (criteria.budget != null) {
    const budgetStr = `${criteria.budget.toLocaleString("zh-CN")} 元`;
    if (extTuition.amount != null && extTuition.amount <= criteria.budget) {
      const margin = criteria.budget - extTuition.amount;
      const marginText = margin >= criteria.budget * 0.25 ? `，留有约 ${margin.toLocaleString("zh-CN")} 元余量` : "，在预算范围内";
      addReason("预算", `学费 ${extTuition.display}，低于你的 ${budgetStr} 预算${marginText}`, factCites);
    } else if (localCost != null && localCost <= criteria.budget) {
      const margin = criteria.budget - localCost;
      const costDetail = localTuition != null
        ? `首年参考约 ${localCost.toLocaleString("zh-CN")} 元（学费 ${localTuition.toLocaleString("zh-CN")} 元/年）`
        : `首年参考约 ${localCost.toLocaleString("zh-CN")} 元`;
      const freshnessHint =
        feeFreshness === "historical"
          ? `（${sourceYear ?? "往年"}归档，需复核当年收费）`
          : feeFreshness === "unknown"
            ? "（未注明年份，需复核当年收费）"
            : margin >= criteria.budget * 0.25
              ? `，余量约 ${margin.toLocaleString("zh-CN")} 元`
              : "";
      addReason("预算", `${costDetail}，在你的 ${budgetStr} 预算内${freshnessHint}`, kbOrListCites);
    } else if (budgetPoint && budgetPoint.level !== "PASS") {
      addCaution("费用", formatAdvisorConcern(budgetPoint, criteria), kbOrListCites);
    } else if (effectiveCost == null) {
      addCaution("费用", `该项目未公布明确首年费用，申请前需联系学校确认是否在你的 ${budgetStr} 预算内`, primaryCites);
    }
  }

  // 3. 语言 / 成绩依据
  const langLabel =
    extItem?.teachingLanguage
    ?? (localCard?.facts?.teachingLanguage === "ENGLISH"
      ? "英文授课"
      : localCard?.facts?.teachingLanguage === "CHINESE"
        ? "中文授课"
        : null);
  const extLangReq = extItem?.languageRequirement && isKnownText(extItem.languageRequirement) ? extItem.languageRequirement : null;
  const reqIelts = localCard?.facts?.ielts ?? (extLangReq ? extractNumberAfter(extLangReq, /(?:雅思|IELTS)\s*[^\d]{0,6}(\d(?:\.\d)?)/iu) : null);
  const reqToefl = localCard?.facts?.toefl ?? (extLangReq ? extractNumberAfter(extLangReq, /(?:托福|TOEFL)\s*[^\d]{0,6}(\d{2,3})/iu) : null);
  const reqDuolingo = localCard?.facts?.duolingo ?? (extLangReq ? extractNumberAfter(extLangReq, /(?:多邻国|Duolingo)\s*[^\d]{0,6}(\d{2,3})/iu) : null);
  const reqHsk = localCard?.facts?.hskLevel ?? (extLangReq ? extractNumberAfter(extLangReq, /HSK\s*(\d)/iu) : null);

  let languageHandled = false;
  if (criteria.ielts != null && reqIelts != null) {
    if (criteria.ielts >= reqIelts) {
      addReason("语言", `你的雅思 ${criteria.ielts} 达到该项目 ${reqIelts} 分要求${langLabel ? `（${langLabel}）` : ""}`, factCites);
    } else {
      addCaution("语言", `该项目要求雅思 ${reqIelts}，你当前雅思 ${criteria.ielts} 尚有差距，需提分或确认豁免`, factCites);
    }
    languageHandled = true;
  } else if (criteria.toefl != null && reqToefl != null) {
    if (criteria.toefl >= reqToefl) {
      addReason("语言", `你的托福 ${criteria.toefl} 达到该项目 ${reqToefl} 分要求${langLabel ? `（${langLabel}）` : ""}`, factCites);
    } else {
      addCaution("语言", `该项目要求托福 ${reqToefl}，你当前托福 ${criteria.toefl} 尚有差距`, factCites);
    }
    languageHandled = true;
  } else if (criteria.duolingo != null && reqDuolingo != null) {
    if (criteria.duolingo >= reqDuolingo) {
      addReason("语言", `你的多邻国 ${criteria.duolingo} 达到该项目 ${reqDuolingo} 分要求`, factCites);
    } else {
      addCaution("语言", `该项目要求多邻国 ${reqDuolingo}，当前 ${criteria.duolingo} 分尚有差距`, factCites);
    }
    languageHandled = true;
  } else if (criteria.hskLevel != null && reqHsk != null) {
    if (criteria.hskLevel >= reqHsk) {
      addReason("语言", `你的 HSK ${criteria.hskLevel} 级达到该项目 HSK ${reqHsk} 级门槛`, factCites);
    } else {
      addCaution("语言", `该项目要求 HSK ${reqHsk} 级，你当前为 HSK ${criteria.hskLevel} 级，需补考或走预科衔接`, factCites);
    }
    languageHandled = true;
  }

  if (!languageHandled) {
    const localEngPass = localSummary.matches.find((p) => p.label === "英语" || p.label.startsWith("HSK"));
    if (localEngPass) {
      const userScoreStr = formatLanguageInput(criteria);
      addReason("语言", `${userScoreStr ? `${userScoreStr}，` : ""}${localEngPass.text}`, kbOrListCites);
    } else if (criteria.teachingLanguage && langLabel) {
      const reqPart = extLangReq ? `（语言要求：${cleanTrailingPunct(extLangReq)}）` : "";
      addReason("语言", `提供${langLabel}，符合你的授课语言要求${reqPart}`, factCites);
      const missingScoreForEng = criteria.teachingLanguage === "ENGLISH"
        && criteria.ielts == null && criteria.toefl == null && criteria.duolingo == null
        && diagnostic?.englishExemption !== "NATIVE_EXEMPT";
      const missingScoreForZh = criteria.teachingLanguage === "CHINESE" && criteria.hskLevel == null;
      if (missingScoreForEng && (reqIelts != null || reqToefl != null || extLangReq)) {
        addCaution("语言", `当前未提供标准化英语成绩，该项目要求「${extLangReq ?? (reqIelts ? `雅思 ${reqIelts}` : `托福 ${reqToefl}`)}」，申请前需补考或核实豁免`, factCites);
      } else if (missingScoreForZh && (reqHsk != null || extLangReq)) {
        addCaution("语言", `当前未提供 HSK 成绩，该项目要求「${extLangReq ?? `HSK ${reqHsk} 级`}」`, factCites);
      }
    }
  }

  // 4. 专业 & 学历对口依据
  const majorWanted = criteria.targetMajors?.length ? criteria.targetMajors.slice(0, 3).join(" / ") : criteria.targetMajor;
  const localMajorPoint = localCard?.points.find((p) => p.label === "专业");
  if (majorWanted) {
    if (localMajorPoint?.level === "NEED") {
      addReason("专业", `开设「${programName}」，方向与「${majorWanted}」相近（建议核对具体课程与专业目录）`, primaryCites);
    } else {
      addReason("专业", `开设「${programName}」，直接匹配你的「${majorWanted}」申请方向`, primaryCites);
    }
  } else if (criteria.programType) {
    addReason("项目", `开设「${programName}」，符合${DEGREE_LABELS[criteria.programType] ?? "目标学历"}申请要求`, primaryCites);
  }

  // 5. 奖学金依据
  const wantsScholarship = Boolean(criteria.excludeSelfFunded || criteria.scholarshipType || criteria.scholarshipPreferences?.length);
  const extSchSummary = extItem?.scholarshipEligible && isKnownText(extItem.scholarshipSummary) ? extItem.scholarshipSummary : null;
  const localSchText = localCard?.facts?.scholarshipText?.trim() || null;
  const localSchPoint = localSummary.matches.find((p) => p.label === "奖学金");
  if (extSchSummary && (wantsScholarship || /奖学金|CSC|政府/u.test(extSchSummary))) {
    addReason("奖学金", `可申请：${cleanTrailingPunct(extSchSummary)}`, factCites);
  } else if (localSchText && localCard?.facts?.scholarship !== "unknown" && (wantsScholarship || reasons.length < 4)) {
    addReason("奖学金", `项目列有：${cleanTrailingPunct(localSchText)}（具体覆盖范围与名额需确认）`, kbOrListCites);
  } else if (localSchPoint && wantsScholarship) {
    addReason("奖学金", localSchPoint.text, kbOrListCites);
  }

  // 6. 城市 / 合作 / CSCA / 考试等补充依据
  const preferredCities = [...(criteria.cities ?? []), ...(criteria.city ? [criteria.city] : [])];
  if (preferredCities.length && cityLabel) {
    const hitPrimary = preferredCities.some((c) => cityLabel.includes(c.replace(/市$/u, "")));
    const hitFallback = (criteria.fallbackCities ?? []).some((c) => cityLabel.includes(c.replace(/市$/u, "")));
    if (hitPrimary) {
      addReason("地区", `位于你的目标城市「${cityLabel}」`, primaryCites);
    } else if (hitFallback) {
      addReason("地区", `位于备选城市「${cityLabel}」`, primaryCites);
    }
  }

  const cscaPoint = localCard?.points.find((p) => (p.label === "CSCA" || p.label === "学校 CSCA 要求") && p.level === "PASS");
  if (cscaPoint) {
    addReason("CSCA", cscaPoint.text, kbOrListCites);
  } else if (extItem?.cscaRequired === false && (criteria.cscaRequirement === "NOT_REQUIRED" || criteria.hasCsca === false)) {
    addReason("CSCA", "官网未提及强制要求 CSCA", factCites);
  }

  if ((localCard && (localCard.cooperation === "project_confirmed" || localCard.cooperation === "listed")) || extItem?.isPartner) {
    const partnerDesc = extItem?.partnerBadge
      ? `校内合作院校（${extItem.partnerBadge}），可直接走合作通道对接核实`
      : localCard?.cooperation === "project_confirmed"
        ? "该项目已确认在合作范围内，可直接走合作通道对接"
        : "学校在合作招生名单内，可优先对接核实当年名额";
    addReason("合作", partnerDesc, uniqueIds([listCitations[0], kbCitations[0], primaryCites[0]]));
  }

  // 如果外部项目有具体有价值的 fitReason（非样板废话），且当前依据条数较少，补充进来
  if (extItem?.fitReason && !isRedundantBoilerplateReason(extItem.fitReason) && reasons.length < 4) {
    addReason("亮点", extItem.fitReason, factCites);
  }

  // 补充学位/考试专项说明（例如俄罗斯专家学位、GMAT/GRE、导师函等）
  if (extItem?.degreeAndExamNotes && isKnownText(extItem.degreeAndExamNotes)) {
    if (/需|要求|必须|笔试|GMAT|GRE|导师/u.test(extItem.degreeAndExamNotes)) {
      addCaution("考试/材料", extItem.degreeAndExamNotes, factCites);
    } else if (reasons.length < 5) {
      addReason("资格", extItem.degreeAndExamNotes, factCites);
    }
  }

  // 收集真正关键的需核实事项（精选最多 2 条，避免废话）
  if (extItem?.caution && isKnownText(extItem.caution) && !/^申请前请以目标年份官网招生简章核实$/u.test(extItem.caution.trim())) {
    addCaution("需核实", extItem.caution, factCites);
  }
  if (localCard) {
    for (const concern of localSummary.concerns) {
      if (cautions.length >= 2) break;
      if (concern.label === "入学年份" || concern.label === "入学季") {
        if (criteria.intakeYear != null || criteria.intakeSeason != null) {
          addCaution("批次", formatAdvisorConcern(concern, criteria), kbOrListCites);
        }
        continue;
      }
      if (concern.label === "申请截止" && /已过|不一致|冲突/u.test(concern.text)) {
        addCaution("截止", formatAdvisorConcern(concern, criteria), kbOrListCites);
        continue;
      }
      if (concern.label === "首年预算" || concern.label === "费用冲突") {
        if (criteria.budget != null || /冲突/u.test(concern.text)) {
          addCaution("费用", formatAdvisorConcern(concern, criteria), kbOrListCites);
        }
        continue;
      }
      if (concern.label === "CSCA" && concern.level === "NEED") {
        addCaution("CSCA", formatAdvisorConcern(concern, criteria), kbOrListCites);
        continue;
      }
    }
    if (localCard.cooperation === "not_cooperating") {
      addCaution("合作状态", "名单标注该校目前不合作，仅作参考，勿按合作通道承诺", uniqueIds([listCitations[0], kbCitations[0]]));
    }
  }

  // 核心参数一行速览
  const tuitionFact =
    extTuition.display
    ?? (localTuition != null
      ? `${localTuition.toLocaleString("zh-CN")} 元/年`
      : localCost != null
        ? `首年约 ${localCost.toLocaleString("zh-CN")} 元`
        : null);
  if (tuitionFact) keyFacts.push({ label: "费用", value: tuitionFact, citationIds: factCites });

  if (extItem?.duration && isKnownText(extItem.duration)) {
    keyFacts.push({ label: "学制", value: extItem.duration });
  }

  const langSummaryParts: string[] = [];
  if (langLabel) langSummaryParts.push(langLabel);
  if (reqIelts != null) langSummaryParts.push(`雅思 ${reqIelts}`);
  else if (reqToefl != null) langSummaryParts.push(`托福 ${reqToefl}`);
  else if (reqHsk != null) langSummaryParts.push(`HSK ${reqHsk}级`);
  else if (extLangReq && extLangReq.length <= 28) langSummaryParts.push(extLangReq);
  if (langSummaryParts.length) keyFacts.push({ label: "语言", value: langSummaryParts.join(" · ") });

  const deadlineVal = extItem?.deadline && isKnownText(extItem.deadline)
    ? extItem.deadline
    : (() => {
        const dp = localCard?.points.find((p) => p.label === "申请截止" && p.level !== "UNKNOWN");
        if (!dp) return null;
        const m = dp.text.match(/20\d{2}[/-]\d{1,2}[/-]\d{1,2}/u);
        return m ? `${m[0]}（核实新批次）` : null;
      })();
  if (deadlineVal) keyFacts.push({ label: "截止", value: deadlineVal });

  const schFact = extSchSummary
    ? extSchSummary.slice(0, 32) + (extSchSummary.length > 32 ? "…" : "")
    : localSchText
      ? localSchText.slice(0, 32) + (localSchText.length > 32 ? "…" : "")
      : null;
  if (schFact) keyFacts.push({ label: "奖学金", value: schFact });

  return {
    reasons: reasons.slice(0, 5),
    cautions: cautions.slice(0, 2),
    keyFacts: keyFacts.slice(0, 5),
  };
}

function buildConditionChecks(
  criteria: ChatCriteria,
  diagnostic: AdmissionDiagnostic | null | undefined,
  schools: AdvisorSchoolMatch[],
  eliminatedCount: number,
): AdvisorConditionCheck[] {
  const checks: AdvisorConditionCheck[] = [];
  const studentBand = classifyStudentAcademicBand(criteria);

  // 1. 学历与专业
  const degreeText = criteria.programType ? DEGREE_LABELS[criteria.programType] : null;
  const majorText = criteria.targetMajors?.length ? criteria.targetMajors.join(" / ") : criteria.targetMajor;
  if (degreeText || majorText) {
    const input = [degreeText, majorText && (criteria.strictMajor ? `仅限 ${majorText}` : majorText)].filter(Boolean).join(" · ");
    const verdict = schools.length > 0
      ? `命中 ${schools.length} 所对应院校项目${criteria.strictMajor ? "（已按严格专业名称过滤）" : ""}`
      : "当前组合下暂未检索到完全匹配的院校，可尝试放宽专业或城市范围";
    checks.push({
      dimension: "目标方向",
      input,
      verdict,
      status: schools.length > 0 ? "good" : "tight",
    });
  }

  // 2. 分数 / GPA 定位
  const gpaText = formatGpaInput(criteria);
  if (gpaText) {
    const normPct = diagnostic?.academic.normPct;
    const finalTier = diagnostic?.finalTier;
    const isLow = normPct != null && normPct < 65;
    let verdict: string;
    if (isLow) {
      verdict = `等效均分约 ${normPct}%（低于 65% 红线），已自动屏蔽双一流/公办一本及全额奖学金，聚焦可稳妥落地的承接院校`;
    } else if (studentBand) {
      const bandGuide: Record<number, string> = {
        5: "处于优秀档，具备冲刺 985/顶尖名校及主申双一流的竞争力",
        4: "处于良好档，适合主申 211/双一流与省重点高校，可小幅冲刺顶尖校",
        3: "处于中等档，主申普通公办本科院校，已过滤门槛过高的 985 名校",
        2: "处于偏弱档，聚焦公办应用型本科与适配院校，已过滤超档名校",
        1: "处于较弱档，已锁定适配门槛的院校，避免越级盲申",
      };
      verdict = `${normPct != null ? `等效约 ${normPct}%，` : ""}${bandGuide[studentBand.band] ?? `定档 ${finalTier ?? studentBand.label}`}${eliminatedCount > 0 ? `（已筛除 ${eliminatedCount} 所不匹配院校）` : ""}`;
    } else {
      verdict = `已按 ${gpaText} 匹配对应层次院校`;
    }
    checks.push({
      dimension: "分数成绩",
      input: gpaText,
      verdict,
      status: isLow ? "limit" : studentBand && studentBand.band >= 4 ? "good" : "match",
    });
  }

  // 3. 语言条件
  const langInput = formatLanguageInput(criteria);
  if (langInput) {
    const langLock = diagnostic?.bottlenecks.find((b) => b.code === "LANGUAGE_LOCK");
    const moiRisk = diagnostic?.englishExemption === "MOI_HIGH_RISK";
    const nativeExempt = diagnostic?.englishExemption === "NATIVE_EXEMPT";
    const hsk30 = diagnostic?.bottlenecks.find((b) => b.code === "HSK_30_ORAL_ALERT");
    let verdict: string;
    let status: AdvisorConditionStatus = "match";
    if (langLock) {
      verdict = "未达到本科直录语言线（HSK4 或雅思 5.5/托福 70），已关闭常规直录，自动切换为预科/零基础/高职衔接通道";
      status = "limit";
    } else if (nativeExempt) {
      verdict = "符合英语母语 6 国护照语言豁免条件，可直接匹配英文授课项目";
      status = "good";
    } else if (moiRisk) {
      verdict = "仅持英文授课证明（MOI）属于高风控个案审查，已自动屏蔽明确不认 MOI 的重点高校（如清华/上交/北理/南大）";
      status = "tight";
    } else if (criteria.ielts != null || criteria.toefl != null || criteria.duolingo != null || criteria.hskLevel != null) {
      const strong =
        (criteria.ielts != null && criteria.ielts >= 6.5)
        || (criteria.toefl != null && criteria.toefl >= 90)
        || (criteria.hskLevel != null && criteria.hskLevel >= 5);
      verdict = strong
        ? "语言成绩有竞争力，可覆盖大部分常规项目门槛"
        : "已按当前语言成绩筛选，具体单科或口语要求请对照各校依据核实";
      if (hsk30) verdict += "（2027 起 HSK 3.0 捆绑口语考核，需同步准备）";
      status = strong ? "good" : "match";
    } else {
      verdict = criteria.languageStatus === "CONFIRMED_NONE"
        ? "目前尚无标准化语言成绩，以下项目申请前需补考达标或确认校方豁免口径"
        : `已限定${criteria.teachingLanguage === "ENGLISH" ? "英文授课" : "中文授课"}项目；提供语言分数后可进一步精确筛除超线项目`;
      status = criteria.languageStatus === "CONFIRMED_NONE" ? "tight" : "info";
    }
    checks.push({ dimension: "语言要求", input: langInput, verdict, status });
  }

  // 4. 预算与奖学金
  if (criteria.budget != null || criteria.excludeSelfFunded || criteria.scholarshipType || criteria.scholarshipPreferences?.length) {
    const inputParts = [
      criteria.budget != null ? `首年预算 ${criteria.budget.toLocaleString("zh-CN")} 元` : null,
      criteria.excludeSelfFunded ? "仅看可申奖学金" : criteria.scholarshipType === "full" ? "目标全额奖学金" : criteria.scholarshipType === "any" ? "需要奖学金" : null,
      criteria.scholarshipPreferences?.length ? criteria.scholarshipPreferences.slice(0, 2).join("/") : null,
    ].filter(Boolean);

    const budgetStop = diagnostic?.bottlenecks.find((b) => b.code === "BUDGET_BELOW_12400_STOP");
    const budgetNiche = diagnostic?.bottlenecks.find((b) => b.code === "BUDGET_12400_20000_NICHE");
    const govBlocked = diagnostic && !diagnostic.scholarshipPolicy.govFullAllowed && (criteria.scholarshipType === "full" || criteria.excludeSelfFunded);

    // 统计匹配结果中已知费用区间
    const knownCosts: number[] = [];
    for (const s of schools) {
      if (s.localCard?.comparableCost != null) knownCosts.push(s.localCard.comparableCost);
      else if (s.localCard?.facts?.tuition != null) knownCosts.push(s.localCard.facts.tuition);
      else {
        const feeFact = s.keyFacts.find((f) => f.label === "费用")?.value;
        const parsed = feeFact ? extractNumberAfter(feeFact, /([\d,]+)/u) : null;
        if (parsed != null) knownCosts.push(parsed);
      }
    }

    let verdict: string;
    let status: AdvisorConditionStatus = "match";
    if (budgetStop) {
      verdict = `低于免学费后最低生活+医保自理线（12,400 元/年），且未达全奖门槛，已暂停荐校`;
      status = "limit";
    } else if (budgetNiche) {
      verdict = "处于 12,400–20,000 元低预算区间，已过滤高学费普本，精准锁定免学费住宿高职或首年半奖承接校";
      status = "tight";
    } else if (govBlocked) {
      verdict = `${diagnostic!.scholarshipPolicy.reasons[0] || "当前硬件暂未达到政府全额奖学金门槛"}，已改按自费或校内部分奖学金口径筛选`;
      status = "tight";
    } else if (criteria.budget != null && knownCosts.length > 0) {
      const minC = Math.min(...knownCosts);
      const maxC = Math.max(...knownCosts);
      const rangeStr = minC === maxC ? `约 ${minC.toLocaleString("zh-CN")} 元` : `${minC.toLocaleString("zh-CN")}–${maxC.toLocaleString("zh-CN")} 元`;
      verdict = `已匹配院校中已知费用在 ${rangeStr}，在你的预算范围内${criteria.excludeSelfFunded ? "（已过滤纯自费项目）" : ""}`;
      status = "good";
    } else if (criteria.excludeSelfFunded) {
      verdict = "已按要求过滤纯自费项目，仅展示列有可申请奖学金通道的院校";
      status = "good";
    } else {
      verdict = "已按预算与奖学金偏好筛选，各校最新收费标准请点击尾部链接核实";
      status = "info";
    }
    checks.push({ dimension: "预算/奖学金", input: inputParts.join(" · "), verdict, status });
  }

  // 5. 城市 / 地区
  const cityList = [...(criteria.cities ?? []), ...(criteria.city ? [criteria.city] : [])];
  if (cityList.length || criteria.province) {
    const input = [
      criteria.province,
      cityList.length ? cityList.join(" / ") : null,
      criteria.fallbackCities?.length ? `备选：${criteria.fallbackCities.join("/")}` : null,
    ].filter(Boolean).join(" · ");
    const hitPrimary = schools.filter((s) =>
      cityList.some((c) => (s.cityLabel ?? "").includes(c.replace(/市$/u, "")))
      || (criteria.province && (s.cityLabel ?? "").includes(criteria.province.replace(/省|市$/u, ""))),
    ).length;
    const verdict = hitPrimary > 0
      ? `匹配结果中有 ${hitPrimary} 所位于你指定的目标地区`
      : schools.length > 0
        ? "目标城市直配候选偏少，已结合备选地区补充"
        : "指定地区下暂无满足全部硬条件的项目，可考虑放宽城市范围";
    checks.push({
      dimension: "目标地区",
      input,
      verdict,
      status: hitPrimary > 0 ? "good" : "tight",
    });
  }

  // 6. 入学时间
  if (criteria.intakeYear != null || criteria.intakeSeason) {
    const input = `${criteria.intakeYear ?? ""}${criteria.intakeYear ? "年" : ""}${criteria.intakeSeason ? SEASON_LABELS[criteria.intakeSeason] : ""}入学`;
    const unconfirmedCount = schools.filter((s) => s.cautions.some((c) => c.label === "批次" || /开班|新批次/u.test(c.text))).length;
    const verdict = unconfirmedCount > 0
      ? `部分院校（${unconfirmedCount} 所）目标批次简章尚未发布或需确认开班，已在各校条目单独标出`
      : "已按目标入学批次核查开放与截止状态";
    checks.push({
      dimension: "入学批次",
      input,
      verdict,
      status: unconfirmedCount > 0 ? "info" : "match",
    });
  }

  // 7. 仅在用户输入或触发真实硬限制时才展示：年龄 / CSCA / 挂科 / 前置学历 / 热门专业收紧
  if (criteria.age != null) {
    const ageHit = diagnostic?.bottlenecks.find((b) => b.code.startsWith("AGE_"));
    checks.push({
      dimension: "年龄限制",
      input: `${criteria.age} 岁`,
      verdict: ageHit ? ageHit.effect : "在常规学位项目与奖学金年龄范围内",
      status: ageHit ? (ageHit.severity === "LOCK" ? "limit" : "tight") : "good",
    });
  }

  const minCsca = criteria.cscaMinSubjectScore ?? criteria.cscaScore;
  if (minCsca != null || criteria.hasCsca != null || criteria.cscaRequirement) {
    const cscaHit = diagnostic?.bottlenecks.find((b) => b.code.startsWith("CSCA_"));
    const input = minCsca != null
      ? `CSCA ${minCsca} 分`
      : criteria.cscaRequirement === "NOT_REQUIRED"
        ? "只看不要求 CSCA"
        : criteria.hasCsca
          ? "已有 CSCA"
          : "暂无 CSCA";
    checks.push({
      dimension: "CSCA 考试",
      input,
      verdict: cscaHit ? cscaHit.effect : criteria.cscaRequirement === "NOT_REQUIRED" ? "已仅保留明确不要求 CSCA 的项目" : "已按 CSCA 要求核验",
      status: cscaHit ? (cscaHit.severity === "LOCK" ? "limit" : "tight") : "match",
    });
  }

  if ((criteria.failedCourseCount ?? 0) > 0) {
    const failHit = diagnostic?.bottlenecks.find((b) => b.code.startsWith("FAILED_COURSES"));
    checks.push({
      dimension: "挂科记录",
      input: `${criteria.failedCourseCount} 门挂科`,
      verdict: failHit?.effect ?? "已自动屏蔽要求零挂科的重点高校与政府奖学金",
      status: (criteria.failedCourseCount ?? 0) >= 3 ? "limit" : "tight",
    });
  }

  const degHit = diagnostic?.bottlenecks.find((b) => b.code === "NO_BACHELOR_DEGREE_MASTER" || b.code === "VOCATIONAL_HS_LOCK");
  if (degHit) {
    checks.push({
      dimension: "前置学历",
      input: degHit.summary.replace(/（[^）]*）/gu, ""),
      verdict: degHit.effect,
      status: "limit",
    });
  }

  // 8. 仅当有实质性专业/轮次偏移（MBBS 43 校 / CS 热门收紧 / MBA 高学费）时，以 1 条简明提示呈现
  for (const mod of diagnostic?.modifiers ?? []) {
    if (mod.type === "ENGLISH_MBBS_43") {
      checks.push({ dimension: "医学白名单", input: "英文 MBBS", verdict: mod.action, status: "tight" });
    } else if (mod.type === "CS_AI_TIGHTEN" && criteria.gpa != null) {
      checks.push({ dimension: "专业竞争", input: "CS / AI 热门方向", verdict: "该方向竞争偏热，冲刺校按更严格标准筛选；若求稳可同步考虑电子/机械/自动化等工科", status: "info" });
    } else if (mod.type === "MBA_FINANCE_HIGH_FEE") {
      checks.push({ dimension: "商科费用", input: "MBA / 金融", verdict: "商科英文硕士学费通常较高（6–30 万/全程），且多数不参与 CSC 全奖，请按项目总费用核对", status: "info" });
    }
  }

  return checks;
}

function buildPartnerQuickMatches(
  items: PartnerSearchResultItem[],
  criteria: ChatCriteria,
  registry: CitationRegistry,
): AdvisorSchoolMatch[] {
  return items.map((item) => {
    const citeId = registry.registerPartnerLedger(
      item.schoolName,
      `${item.partnerBadgeText} · ${item.matchedLevelLabel}${item.city ? ` · ${item.city}` : ""}`,
    );
    const reasons: AdvisorEvidenceLine[] = [];
    const cautions: AdvisorEvidenceLine[] = [];
    const keyFacts: AdvisorKeyFact[] = [];

    if (item.majorMatchTag && !/仅列特定方向/u.test(item.majorMatchTag)) {
      reasons.push({ label: "专业", text: item.majorMatchTag, citationIds: [citeId] });
    } else if (item.majorMatchTag) {
      cautions.push({ label: "专业", text: item.majorMatchTag.replace(/^⚠️\s*/u, ""), citationIds: [citeId] });
      reasons.push({ label: "学历", text: `开设${item.matchedLevelLabel}项目（${item.schoolLevelLabel}）`, citationIds: [citeId] });
    } else {
      reasons.push({ label: "学历", text: `开设${item.matchedLevelLabel}项目（${item.schoolLevelLabel}）`, citationIds: [citeId] });
    }
    if (item.tuitionText && !/未录入|未公布|待核|未知/u.test(item.tuitionText)) {
      const budgetSuffix = criteria.budget != null && item.minYearlyRmb != null && item.minYearlyRmb <= criteria.budget
        ? `，在你的 ${criteria.budget.toLocaleString("zh-CN")} 元预算内`
        : "";
      reasons.push({ label: "费用", text: `学费参考 ${item.tuitionText}${budgetSuffix}`, citationIds: [citeId] });
      keyFacts.push({ label: "学费", value: item.tuitionText, citationIds: [citeId] });
    } else if (item.tuitionText) {
      cautions.push({ label: "费用", text: `${item.tuitionText}，申请前需确认收费标准`, citationIds: [citeId] });
    }
    if (item.scholarshipSummary && isKnownText(item.scholarshipSummary)) {
      reasons.push({ label: "奖学金", text: item.scholarshipSummary, citationIds: [citeId] });
      keyFacts.push({ label: "奖学金", value: item.scholarshipSummary.slice(0, 30) });
    }
    if (item.nationalityTag) {
      reasons.push({ label: "生源", text: item.nationalityTag, citationIds: [citeId] });
    }
    if (item.requirementsSummary) {
      reasons.push({ label: "要求", text: item.requirementsSummary.slice(0, 140), citationIds: [citeId] });
    }
    if (item.budgetNote) cautions.push({ label: "预算", text: item.budgetNote, citationIds: [citeId] });
    if (item.partnerNote) cautions.push({ label: "台账备注", text: item.partnerNote, citationIds: [citeId] });
    if (item.deadlineSummary) keyFacts.push({ label: "截止", value: item.deadlineSummary });
    if (item.languages.length) keyFacts.push({ label: "语言", value: item.languages.join("/") });

    return {
      key: `partner:${schoolIdentityKey(item.schoolName)}:${item.matchedLevel}`,
      schoolName: item.schoolName,
      programName: `${item.matchedLevelLabel}${item.nameEn ? ` · ${item.nameEn}` : ""}`,
      cityLabel: item.city || undefined,
      schoolNature: item.schoolLevelLabel,
      isPartner: true,
      partnerLabel: item.partnerBadgeText,
      notCooperating: false,
      sourceKindLabel: item.spring2027Status === "published_27_spring" ? "合作库 · 27春已出" : "内部合作库",
      sourceTone: "partner",
      verified: true,
      reasons: reasons.slice(0, 5),
      cautions: cautions.slice(0, 2),
      keyFacts: keyFacts.slice(0, 4),
      warnings: [],
      primaryCitationIds: [citeId],
    };
  });
}

function buildFollowUpView(result: ScreeningResponse, registry: CitationRegistry): AdvisorFollowUpView {
  const answer = result.answer!;
  const allCards = [...result.results.confirmed, ...result.results.pending, ...result.results.other];
  const extPrograms = result.external?.programs ?? [];
  const listName = admissionListLabel(result.source);

  const citationsForText = (text: string, fallbackSchool?: string | null): number[] => {
    const ids: number[] = [];
    for (const card of allCards) {
      if (text.includes(card.name) || (fallbackSchool && card.name === fallbackSchool)) {
        const kbId = registry.registerKb(card.name, card.schoolId, card.programId, card.verified);
        const offId = registry.registerUrl(card.officialUrl, `${card.name}官网`, "official");
        if (kbId) ids.push(kbId);
        if (offId) ids.push(offId);
        if (!kbId && !offId && card.sources.length) {
          ids.push(registry.registerList(card.name, listName, card.sources[0], buildSchoolArchiveHref(card.schoolId, card.programId)));
        }
      }
    }
    for (const ext of extPrograms) {
      if (text.includes(ext.schoolName) || (fallbackSchool && ext.schoolName === fallbackSchool)) {
        const offId = registry.registerUrl(ext.officialUrl ?? ext.sourceUrls[0], `${ext.schoolName}国际学生招生官网`, ext.officialVerified ? "official" : "web");
        if (offId) ids.push(offId);
      }
    }
    return uniqueIds(ids);
  };

  const leadIds = citationsForText(answer.lead, answer.school ?? result.focusSchool);
  const details = answer.details.map((text) => ({
    text,
    citationIds: citationsForText(text, answer.school ?? result.focusSchool),
  }));
  // 如果某条 detail 没单独匹配校名但 lead 有归属学校，挂上 lead 的主要溯源
  const normalizedDetails = details.map((d) => ({
    text: d.text,
    citationIds: d.citationIds.length ? d.citationIds : leadIds.slice(0, 2),
  }));

  return {
    lead: answer.lead,
    leadCitationIds: leadIds,
    details: normalizedDetails,
    note: answer.note,
  };
}

export function buildAdvisorView(result: ScreeningResponse): AdvisorView {
  const registry = new CitationRegistry();
  const criteria = result.criteria;
  const diagnostic = result.diagnostic ?? null;
  const listName = admissionListLabel(result.source);

  // 1. 纯闲聊对话
  if (result.conversation && result.answer) {
    return {
      mode: "conversation",
      headline: result.answer.lead,
      headlineCitationIds: [],
      conditionChecks: [],
      schools: [],
      eliminatedNotes: [],
      nonPartnerWarnings: [],
      blockedPartners: [],
      policyNotes: [],
      historicalItems: [],
      followUp: { lead: result.answer.lead, leadCitationIds: [], details: [] },
      citations: [],
      counts: { total: 0, partner: 0, official: 0, kb: 0, reach: 0, target: 0, safe: 0 },
    };
  }

  // 2. 硬熔断劝退态（说人话直指卡点与补齐动作）
  if (diagnostic?.state === "CIRCUIT_BREAKER") {
    const conditionChecks = buildConditionChecks(criteria, diagnostic, [], 0);
    return {
      mode: "circuit_breaker",
      headline: "当前条件暂不满足直接申请要求，建议先补齐关键短板后再启动选校",
      headlineCitationIds: [],
      conditionChecks,
      schools: [],
      eliminatedNotes: result.results.eliminatedNotes ?? [],
      circuitBreakerBanner: {
        title: "暂不建议直接递交申请",
        reason: diagnostic.advisory.diagnosisParagraph,
        actions: diagnostic.advisory.actionPlan,
        legalNotice: diagnostic.advisory.legalComplianceNotice,
      },
      nonPartnerWarnings: [],
      blockedPartners: [],
      policyNotes: [],
      historicalItems: [],
      citations: [],
      counts: { total: 0, partner: 0, official: 0, kb: 0, reach: 0, target: 0, safe: 0 },
    };
  }

  // 3. 模式三 · 合作库快检
  if (result.partnerQuick) {
    const pq = result.partnerQuick;
    const schools = buildPartnerQuickMatches(pq.results, criteria, registry);
    const blockedPartners = [...pq.blockedByPolicy, ...pq.blockedByGpaBand];
    const conditionChecks = buildConditionChecks(criteria, diagnostic, schools, blockedPartners.length);
    const headline = pq.totalMatched > 0
      ? `内部合作库共匹配到 ${pq.totalMatched} 所合作院校${blockedPartners.length > 0 ? `（已按条件筛除 ${blockedPartners.length} 所受限院校）` : ""}。`
      : "按当前条件在内部合作库中未找到完全匹配的院校，建议放宽条件或切换「合作优先+全网」补充官网检索。";

    return {
      mode: "partner_quick",
      headline,
      headlineCitationIds: [],
      conditionChecks,
      schools,
      eliminatedNotes: [],
      nonPartnerWarnings: pq.nonPartnerWarnings,
      blockedPartners,
      policyNotes: [],
      historicalItems: [],
      citations: registry.all(),
      counts: {
        total: schools.length,
        partner: schools.length,
        official: 0,
        kb: 0,
        reach: 0,
        target: schools.length,
        safe: 0,
      },
    };
  }

  // 4. 追问回答（如单校学费/截止/语言/推荐理由/比价）
  if (result.answer) {
    const followUp = buildFollowUpView(result, registry);
    return {
      mode: "follow_up",
      headline: followUp.lead,
      headlineCitationIds: followUp.leadCitationIds,
      conditionChecks: [],
      schools: [],
      eliminatedNotes: [],
      nonPartnerWarnings: [],
      blockedPartners: [],
      policyNotes: [],
      historicalItems: [],
      followUp,
      citations: registry.all(),
      counts: { total: 0, partner: 0, official: 0, kb: 0, reach: 0, target: 0, safe: 0 },
    };
  }

  // 5. 常规与降级选校检索：统一合并校内库候选 + 库外官网核验项目
  const allLocalCards = [...result.results.confirmed, ...result.results.pending, ...result.results.other];
  const cardByProgram = new Map<string, ResultCard>();
  const cardBySchool = new Map<string, ResultCard>();
  for (const card of allLocalCards) {
    if (card.programId) cardByProgram.set(card.programId, card);
    const key = resultSchoolKey(card);
    if (!cardBySchool.has(key)) cardBySchool.set(key, card);
  }

  // 选取本轮实际展示的校内候选
  const selectedLocalCards: Array<{ card: ResultCard; group: "partner" | "other" }> = [];
  const seenLocalKeys = new Set<string>();
  const highlights = result.narrative?.highlights ?? [];
  if (highlights.length > 0) {
    for (const h of highlights) {
      const card = (h.programId ? cardByProgram.get(h.programId) : undefined)
        ?? allLocalCards.find((c) => schoolIdentityKey(c.name) === schoolIdentityKey(h.name) && isCandidate(c));
      if (!card) continue;
      const sk = schoolIdentityKey(card.name);
      if (seenLocalKeys.has(sk)) continue;
      seenLocalKeys.add(sk);
      selectedLocalCards.push({ card, group: h.group });
    }
  } else {
    for (const card of allLocalCards.filter(isCandidate)) {
      const sk = schoolIdentityKey(card.name);
      if (seenLocalKeys.has(sk)) continue;
      seenLocalKeys.add(sk);
      const group = card.cooperation === "listed" || card.cooperation === "project_confirmed" ? "partner" : "other";
      selectedLocalCards.push({ card, group });
      if (selectedLocalCards.length >= 9) break;
    }
  }

  // 按 schoolIdentityKey 合并校内候选与库外项目，同一所学校合并展示 + 双重溯源
  type MergeEntry = {
    schoolKey: string;
    schoolName: string;
    localCard?: ResultCard;
    localGroup?: "partner" | "other";
    extItem?: ExternalProgramItem;
  };
  const mergedMap = new Map<string, MergeEntry>();

  for (const { card, group } of selectedLocalCards) {
    const sk = schoolIdentityKey(card.name);
    mergedMap.set(sk, { schoolKey: sk, schoolName: card.name, localCard: card, localGroup: group });
  }
  for (const extItem of result.external?.programs ?? []) {
    const sk = schoolIdentityKey(extItem.schoolName);
    const existing = mergedMap.get(sk);
    if (existing) {
      existing.extItem = extItem;
    } else {
      // 如果全网命中的院校在本地知识库中已有对应有效候选，顺便关联以提供「校内档案溯源」与「加入方案」
      const fallbackLocal = allLocalCards.find(
        (c) => schoolIdentityKey(c.name) === sk && isCandidate(c),
      );
      const localGroup = fallbackLocal
        ? (fallbackLocal.cooperation === "listed" || fallbackLocal.cooperation === "project_confirmed" ? "partner" : "other")
        : undefined;
      mergedMap.set(sk, {
        schoolKey: sk,
        schoolName: extItem.schoolName,
        ...(fallbackLocal ? { localCard: fallbackLocal, localGroup } : {}),
        extItem,
      });
    }
  }

  // 排序：不合作放最后 → 按冲/稳/保 → 合作优先 → 评分
  const mergedEntries = [...mergedMap.values()].sort((a, b) => {
    const aBlocked = Number(a.localCard?.cooperation === "not_cooperating");
    const bBlocked = Number(b.localCard?.cooperation === "not_cooperating");
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    const aTier = TIER_ORDER[a.extItem?.tier ?? a.localCard?.tier ?? "TARGET"];
    const bTier = TIER_ORDER[b.extItem?.tier ?? b.localCard?.tier ?? "TARGET"];
    if (aTier !== bTier) return aTier - bTier;
    const aPartner = Number(a.localGroup === "partner" || Boolean(a.extItem?.isPartner));
    const bPartner = Number(b.localGroup === "partner" || Boolean(b.extItem?.isPartner));
    if (aPartner !== bPartner && result.runMode !== "standard_all") return bPartner - aPartner;
    const aScore = Math.max(a.extItem?.score ?? 0, a.localCard?.score ?? 0);
    const bScore = Math.max(b.extItem?.score ?? 0, b.localCard?.score ?? 0);
    return bScore - aScore;
  });

  const schools: AdvisorSchoolMatch[] = mergedEntries.map((entry) => {
    const { localCard, localGroup, extItem, schoolName } = entry;
    const schoolHref = buildSchoolArchiveHref(localCard?.schoolId, localCard?.programId);

    // 注册真实溯源链接
    const officialCitations: number[] = [];
    const kbCitations: number[] = [];
    const listCitations: number[] = [];

    const mainOfficialUrl = extItem?.officialUrl ?? extItem?.sourceUrls[0] ?? localCard?.officialUrl ?? null;
    if (mainOfficialUrl) {
      const id = registry.registerUrl(
        mainOfficialUrl,
        `${schoolName}${extItem ? "国际学生招生官网" : "官网"}`,
        extItem?.officialVerified || localCard?.officialUrl ? "official" : "web",
        extItem?.officialVerified ? "官网直连核实" : extItem?.groundedBySearch ? "联网检索来源" : "高校官网",
      );
      if (id) officialCitations.push(id);
    }
    for (const extraUrl of (extItem?.sourceUrls ?? []).slice(0, 2)) {
      if (extraUrl === mainOfficialUrl) continue;
      const id = registry.registerUrl(extraUrl, `${schoolName}参考网页`, "web", "联网参考");
      if (id) officialCitations.push(id);
    }

    if (localCard?.schoolId) {
      const kbId = registry.registerKb(schoolName, localCard.schoolId, localCard.programId, localCard.verified);
      if (kbId) kbCitations.push(kbId);
    }
    if (localCard?.sources.length) {
      const listRow = localCard.sources.find((s) => s.startsWith("招生表") || s.includes("名单"));
      if (listRow) {
        listCitations.push(registry.registerList(schoolName, listName, listRow, schoolHref));
      } else if (!kbCitations.length && !officialCitations.length) {
        listCitations.push(registry.registerList(schoolName, "校内知识库", localCard.sources[0], schoolHref));
      }
    }
    if (!officialCitations.length && !kbCitations.length && !listCitations.length && extItem) {
      listCitations.push(
        registry.register(
          {
            kind: "web",
            title: `${schoolName} · 公开招生信息（待人工核实官网）`,
            href: null,
            detail: "暂未获取到可直连官网 URL，申请前请人工查阅该校国际教育学院官网",
            isExternal: false,
          },
          `unlinked:${schoolIdentityKey(schoolName)}`,
        ),
      );
    }

    const allCitations = uniqueIds([...officialCitations, ...kbCitations, ...listCitations]);
    const programName = extItem?.programName
      ?? (localCard ? displayProgramName(localCard.name, localCard.program) : schoolName);
    const cityLabel = extItem?.city || localCard?.cityLabel || undefined;
    const schoolNature = extItem?.schoolNature || localCard?.schoolTags || undefined;
    const tier = extItem?.tier ?? localCard?.tier;
    const score = extItem?.score ?? localCard?.score;
    const notCooperating = localCard?.cooperation === "not_cooperating";
    const isPartner = !notCooperating && (localGroup === "partner" || Boolean(extItem?.isPartner));

    const { reasons, cautions, keyFacts } = buildSchoolReasonsAndCautions({
      schoolName,
      programName,
      cityLabel,
      schoolNature,
      tier,
      criteria,
      diagnostic,
      localCard,
      extItem,
      kbCitations,
      officialCitations,
      listCitations,
      allCitations,
    });

    let sourceKindLabel: string;
    let sourceTone: AdvisorSchoolMatch["sourceTone"];
    if (notCooperating) {
      sourceKindLabel = "标注不合作";
      sourceTone = "ai";
    } else if (isPartner && extItem?.officialVerified) {
      sourceKindLabel = "合作院校 · 官网核实";
      sourceTone = "partner";
    } else if (isPartner) {
      sourceKindLabel = extItem?.partnerBadge ? `合作 · ${extItem.partnerBadge}` : "合作院校";
      sourceTone = "partner";
    } else if (extItem?.officialVerified) {
      sourceKindLabel = "官网核实";
      sourceTone = "web";
    } else if (extItem?.groundedBySearch) {
      sourceKindLabel = "联网参考";
      sourceTone = "web";
    } else if (localCard) {
      sourceKindLabel = localCard.verified ? "校内已核档案" : "校内知识库";
      sourceTone = "kb";
    } else {
      sourceKindLabel = "公开信息（待核官网）";
      sourceTone = "ai";
    }

    return {
      key: entry.schoolKey,
      schoolName,
      schoolId: localCard?.schoolId,
      programId: localCard?.programId,
      schoolHref,
      programName,
      cityLabel,
      schoolNature,
      tier,
      score,
      isPartner,
      partnerLabel: extItem?.partnerBadge ?? undefined,
      notCooperating,
      sourceKindLabel,
      sourceTone,
      verified: Boolean(extItem?.officialVerified || localCard?.verified),
      officialUrl: mainOfficialUrl,
      reasons,
      cautions,
      keyFacts,
      warnings: localCard?.warning ?? [],
      localCard,
      primaryCitationIds: allCitations.slice(0, 2),
    };
  });

  // 合并淘汰说明（去重）
  const eliminatedNotes = [...new Set([
    ...(result.results.eliminatedNotes ?? []),
    ...(result.external?.excludedNotes ?? []),
  ])];

  // 条件检索表现（只说用户输入或触发的条件）
  const conditionChecks = buildConditionChecks(criteria, diagnostic, schools, eliminatedNotes.length);

  // 统计分布
  const counts = {
    total: schools.length,
    partner: schools.filter((s) => s.isPartner).length,
    official: schools.filter((s) => !s.isPartner && s.sourceTone === "web").length,
    kb: schools.filter((s) => !s.isPartner && s.sourceTone === "kb").length,
    reach: schools.filter((s) => s.tier === "REACH").length,
    target: schools.filter((s) => (s.tier ?? "TARGET") === "TARGET").length,
    safe: schools.filter((s) => s.tier === "SAFE").length,
  };

  // 生成一句人话检索总结论（无工程术语）
  let headline: string;
  let subline: string | undefined;
  const tierSummary = [
    counts.reach > 0 ? `冲刺 ${counts.reach} 所` : null,
    counts.target > 0 ? `稳妥 ${counts.target} 所` : null,
    counts.safe > 0 ? `保底 ${counts.safe} 所` : null,
  ].filter(Boolean).join(" · ");

  if (counts.total > 0) {
    const sourceParts = [
      counts.partner > 0 ? `合作院校 ${counts.partner} 所` : null,
      counts.official > 0 ? `官网核验 ${counts.official} 所` : null,
      counts.kb > 0 ? `校内库 ${counts.kb} 所` : null,
    ].filter(Boolean);
    headline = `按你的条件共匹配到 ${counts.total} 所可申请院校${tierSummary ? `（${tierSummary}）` : ""}。`;
    const subParts: string[] = [];
    if (sourceParts.length) subParts.push(`来源：${sourceParts.join("，")}`);
    if ((result.results.excludedSchoolCount ?? 0) > 0) subParts.push(`已排除前几轮展示过的 ${result.results.excludedSchoolCount} 所院校`);
    if (eliminatedNotes.length > 0) subParts.push(`已筛除 ${eliminatedNotes.length} 条不符条件的记录`);
    if (subParts.length) subline = `${subParts.join("；")}。`;
  } else {
    headline = "按当前条件暂未匹配到可直接推荐的院校，建议放宽专业、城市或预算后重试。";
    if (eliminatedNotes.length > 0) {
      subline = `共有 ${eliminatedNotes.length} 所院校因成绩档位或硬性门槛未通过筛选。`;
    }
  }

  // 降级锁：仅在真正触发时清晰说明卡点和替代路径
  let downgradeLockBanner: AdvisorView["downgradeLockBanner"];
  if (diagnostic?.state === "DOWNGRADE_LOCK") {
    const lockReasons = diagnostic.bottlenecks
      .filter((b) => b.severity === "LOCK")
      .map((b) => b.summary)
      .join("、");
    const isLowBudget = diagnostic.bottlenecks.some((b) => b.code === "BUDGET_12400_20000_NICHE");
    downgradeLockBanner = {
      title: `当前条件受限（${lockReasons || "存在关键硬门槛"}），已切换为更稳妥的衔接路径`,
      reason: `常规直录或政府全奖暂不满足条件，以下优先匹配「${diagnostic.pathwayLockLabels.join(" / ")}」方向的可落地院校。`,
      pathways: diagnostic.pathwayLockLabels,
      actions: diagnostic.advisory.actionPlan
        .slice(0, 3)
        .map((line) => line.replace(/按锁死路径推进/gu, "按当前可行路径推进")),
      fallbacks: diagnostic.curatedFallbacks,
      ...(isLowBudget ? { legalNotice: diagnostic.advisory.legalComplianceNotice } : {}),
    };
  }

  // 专项政策说明：过滤掉与本次无直接关系的重复法律/账单说教，仅保留真正针对用户特殊问题的说明
  const hasExplicitPolicyNeed = Boolean(
    criteria.customQuestions?.length
    || criteria.degreeBackground
    || diagnostic?.requireMoe43Mbbs,
  );
  const policyNotes: AdvisorPolicyItem[] = (result.external?.policyNotes ?? [])
    .filter((note: ExternalPolicyNote) => {
      if (/(?:非法打工|法律红线|合规红线)/u.test(`${note.title} ${note.content}`)) {
        return false;
      }
      if (!hasExplicitPolicyNeed && /(?:真实首年账单|续奖年审|降级跃迁路径)/u.test(note.title)) {
        return false;
      }
      return true;
    })
    .slice(0, 3)
    .map((note) => {
      const ids = uniqueIds(
        (note.sourceUrls ?? []).map((u) => registry.registerUrl(u, note.title, "web", "政策参考")),
      );
      return { title: note.title, content: note.content, citationIds: ids };
    });

  // 历史年份预匹配（目标批次未发布简章时）
  const rawHistorical: ExternalHistoricalItem[] = result.external?.historicalPrograms ?? [];
  const historicalItems: AdvisorHistoricalItem[] = rawHistorical.map((h) => {
    const id = registry.registerUrl(h.sourceUrl, `${h.schoolName} ${h.referenceYear} 往年简章`, "official", "往年参考");
    return {
      schoolName: h.schoolName,
      programName: h.programName,
      referenceYear: String(h.referenceYear),
      targetYear: String(h.targetYear),
      summary: h.historicalSummary,
      partnerTag: h.partnerTag ?? undefined,
      citationIds: uniqueIds([id]),
    };
  });

  // 如仅来自 AI 知识拓展（未联网也未查到本地库），简短提醒
  const nextHint = result.narrative?.next
    ?? (counts.total === 0 ? "可以告诉我学生的学历、目标专业、成绩或预算，我再帮你缩小范围。" : undefined);

  return {
    mode: "screening",
    headline,
    subline,
    headlineCitationIds: [],
    conditionChecks,
    schools,
    eliminatedNotes,
    downgradeLockBanner,
    nonPartnerWarnings: [],
    blockedPartners: [],
    policyNotes,
    historicalItems,
    citations: registry.all(),
    nextHint,
    counts,
  };
}

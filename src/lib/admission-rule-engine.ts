import {
  CURATED_SCHOOL_POLICIES,
  inferSchoolPolicyMetadata,
  rankToTier,
  tierToRank,
  type PathwayType,
  type SchoolPolicyMetadata,
  type SchoolTierCode,
} from "@/data/school-policy-metadata";
import type { ChatCriteria } from "@/lib/ai-screening";

export type EngineState = "NORMAL" | "DOWNGRADE_LOCK" | "CIRCUIT_BREAKER";
export type EnglishExemptionLevel = "NATIVE_EXEMPT" | "MOI_HIGH_RISK" | "NONE";

export type NormalizedAcademicResult = {
  normPct: number | null;
  initialTier: SchoolTierCode | null;
  systemLabel: string;
  explanation: string;
  source: "numeric" | "qualitative" | "missing";
};

export type SlotAuditResult = {
  filledCount: number;
  totalCount: number;
  missingCriticalSlots: string[];
  explicitAssumptions: string[];
};

export type BottleneckRuleHit = {
  code:
    | "COMPLIANCE_STOP"
    | "NO_BACHELOR_DEGREE_MASTER"
    | "CSCA_BELOW_50"
    | "CSCA_BELOW_70"
    | "LANGUAGE_LOCK"
    | "VOCATIONAL_HS_LOCK"
    | "FAILED_COURSES_1_2"
    | "FAILED_COURSES_3_PLUS"
    | "AGE_UG_OVER_25"
    | "AGE_UG_OVER_30"
    | "AGE_UG_OVER_35"
    | "AGE_MASTER_OVER_35"
    | "BUDGET_BELOW_12400_STOP"
    | "BUDGET_12400_20000_NICHE"
    | "ACADEMIC_BELOW_65"
    | "HSK_30_ORAL_ALERT"
    | "MOI_HIGH_RISK";
  gate: "GATE_1_COMPLIANCE" | "GATE_2_BOTTLENECK" | "GATE_3_MODIFIER";
  severity: "STOP" | "LOCK" | "WARN";
  summary: string;
  effect: string;
};

export type DynamicModifierNote = {
  type: "CS_AI_TIGHTEN" | "ENGLISH_MBBS_43" | "MBA_FINANCE_HIGH_FEE" | "T1_LATE_ROUND";
  summary: string;
  action: string;
};

export type CuratedFallbackRecommendation = {
  schoolName: string;
  city: string;
  tier: SchoolTierCode;
  pathway: PathwayType;
  pathwayLabel: string;
  estimatedFirstYearCost: string;
  reason: string;
  caution: string;
};

export type AdmissionDiagnostic = {
  state: EngineState;
  stateLabel: string;
  initialTier: SchoolTierCode | null;
  finalTier: SchoolTierCode | null;
  academic: NormalizedAcademicResult;
  englishExemption: EnglishExemptionLevel;
  englishExemptionNote: string;
  slotAudit: SlotAuditResult;
  /** Bidirectional +/- 1 tier lock window (Match = X, Reach = X-1, Safety = X+1). */
  tierWindow: {
    reachTier: SchoolTierCode | null;
    matchTier: SchoolTierCode | null;
    safetyTier: SchoolTierCode | null;
    reachRestrictedToDowngradePath: boolean;
  };
  pathwayLocks: PathwayType[];
  pathwayLockLabels: string[];
  scholarshipPolicy: {
    cscAllowed: boolean;
    govFullAllowed: boolean;
    schoolScholarshipAllowed: boolean;
    reasons: string[];
  };
  gate1StopReasons: string[];
  bottlenecks: BottleneckRuleHit[];
  modifiers: DynamicModifierNote[];
  /** True when standard bachelor/master direct admission is strictly barred. */
  blockDirectDegree: boolean;
  /** True when junior colleges / vocational diplomas are legally allowed as downgrade targets. */
  allowVocationalDiploma: boolean;
  /** True when English MBBS MOE-43 whitelist must be strictly enforced. */
  requireMoe43Mbbs: boolean;
  /** True when applicant has failed courses and must be blocked from zero-fail institutions. */
  hasFailedCourses: boolean;
  /** Curated deterministic fallback schools for special承接池 (low budget niche / wide age / Chinese equiv master / vocational). */
  curatedFallbacks: CuratedFallbackRecommendation[];
  /** Three-state structured advisor script & financial/legal guardrails. */
  advisory: {
    headline: string;
    diagnosisParagraph: string;
    actionPlan: string[];
    firstYearCostChecklist: string[];
    legalComplianceNotice: string;
  };
};

export type SchoolHardFilterDecision = {
  eligible: boolean;
  assignedBucket: "REACH" | "TARGET" | "SAFE" | null;
  reasons: string[];
  warnings: string[];
  policy: SchoolPolicyMetadata;
};

export const MIN_ANNUAL_SELF_SUPPORT_RMB = 12_400;
export const LOW_BUDGET_NICHE_MAX_RMB = 20_000;
export const FIRST_YEAR_PRE_ARRIVAL_FEES_RANGE = "4,400–17,100 元";

export const LEGAL_NO_ILLEGAL_WORK_NOTICE =
  "合规红线：严禁以校外打工覆盖留学费用。依据中国出入境及高校管理规定，大一新生依法严禁校外勤工助学；非法打工面临 5,000–20,000 元罚款、5–15 日拘留直至遣返出境。";

const NATIVE_ENGLISH_SIX_COUNTRIES = new Set([
  "美国", "英国", "加拿大", "澳大利亚", "澳洲", "新西兰", "爱尔兰",
  "usa", "us", "united states", "uk", "united kingdom", "britain", "england",
  "canada", "australia", "new zealand", "ireland",
]);

const HIGH_RISK_MOI_COUNTRIES =
  /巴基斯坦|印度|孟加拉|尼泊尔|斯里兰卡|越南|泰国|印尼|印度尼西亚|马来西亚|菲律宾|缅甸|老挝|柬埔寨|尼日利亚|加纳|肯尼亚|埃塞俄比亚|坦桑尼亚|乌干达|喀麦隆|津巴布韦|赞比亚|卢旺达|苏丹|摩洛哥|埃及|非洲|南亚|东南亚|pakistan|india|bangladesh|nepal|nigeria|ghana|kenya|ethiopia|africa|south asia|southeast asia/iu;

export const PATHWAY_LABELS: Record<PathwayType, string> = {
  DIRECT_DEGREE: "常规学历直录",
  FOUNDATION_1_PLUS_4: "1年预科 + 本科（1+4）",
  ZERO_BASE_CHINESE_UG: "零基础汉语言本科",
  VOCATIONAL_DIPLOMA: "高职大专（可衔接专升本/专转本）",
  VOCATIONAL_UG: "全日制职业本科",
  TOP_UP_UPGRADE: "国际生专转本/专升本衔接",
  NON_DEGREE_LANGUAGE: "非学历语言进修",
  CHINESE_EQUIVALENT_MASTER: "中文同等学力硕士特例（如华侨大学）",
  WIDE_AGE_SELF_FUNDED_MASTER: "宽龄自费硕士池（45–50岁）",
};

export function classifyEnglishExemption(
  criteria: Pick<ChatCriteria, "nationality" | "languageStatus" | "hasMoiCertificate">,
  rawMessage = "",
): { level: EnglishExemptionLevel; note: string } {
  const nat = String(criteria.nationality ?? "").trim().toLowerCase();
  const isNativeSix =
    criteria.languageStatus === "NATIVE_6"
    || [...NATIVE_ENGLISH_SIX_COUNTRIES].some((token) => nat === token || (token.length >= 2 && nat.includes(token)));
  if (isNativeSix) {
    return {
      level: "NATIVE_EXEMPT",
      note: "持美/英/加/澳/新/爱 6 国护照，符合英文授课绝对语言豁免条件。",
    };
  }
  const hasMoi =
    criteria.languageStatus === "MOI_ONLY"
    || Boolean(criteria.hasMoiCertificate)
    || /\bMOI\b|英文授课证明|英语授课证明|medium\s+of\s+instruction/iu.test(rawMessage);
  if (hasMoi) {
    const highRiskOrigin = HIGH_RISK_MOI_COUNTRIES.test(criteria.nationality ?? "") || HIGH_RISK_MOI_COUNTRIES.test(rawMessage);
    return {
      level: "MOI_HIGH_RISK",
      note: highRiskOrigin
        ? "非 6 国英语母语护照且仅持本地英文授课证明（MOI），标为高风控个案审查；清华、上交、北理、南大等明确不认 MOI 的高校已自动拦截。"
        : "仅持英文授课证明（MOI），属于个案审查材料；明确不认可 MOI 的重点高校已自动拦截。",
    };
  }
  return {
    level: "NONE",
    note: "不享有英语母语护照豁免，须核验标准化语言成绩（HSK / 雅思 / 托福 / 多邻国）。",
  };
}

/**
 * Stage 1: Cross-national grade normalization to unified Chinese 100-point equivalent (T1–T5).
 * Prevents false downgrades of French 14/20, UK 2:1 (65%), and German reverse 1.5.
 */
export function normalizeInternationalScore(
  criteria: Pick<ChatCriteria, "gpa" | "gpaScale" | "gradeSystem" | "academicLevel" | "degreeBackground">,
  rawMessage = "",
): NormalizedAcademicResult {
  const msg = `${rawMessage} ${criteria.degreeBackground ?? ""}`;
  const gpa = criteria.gpa != null && Number.isFinite(criteria.gpa) && criteria.gpa > 0 ? criteria.gpa : null;
  let scale = criteria.gpaScale != null && Number.isFinite(criteria.gpaScale) && criteria.gpaScale > 0 ? criteria.gpaScale : null;
  let system = criteria.gradeSystem ?? null;

  // Detect international grade systems from message or scale if not explicitly set
  if (!system) {
    if (scale === 20 || /法语区|法国|摩洛哥|突尼斯|阿尔及利亚|\b\d{1,2}(?:\.\d+)?\s*\/\s*20\b/iu.test(msg)) {
      if (scale === 20 || (gpa != null && gpa <= 20 && /\/\s*20|20\s*分制|法语/iu.test(msg))) {
        system = "FR_20";
        scale = 20;
      }
    }
    if (!system && (/德国|德制|反向制|german\s*gpa|bavarian/iu.test(msg) && gpa != null && gpa <= 5.0)) {
      system = "DE_REVERSE";
      scale = 5;
    }
    if (!system && (/\b2\s*:\s*1\b|upper\s*second|二等一|英国(?:本科|学位|荣誉)|uk\s*(?:honours|degree|2:1|2:2|first)/iu.test(msg))) {
      system = "UK_HONOURS";
      scale = 100;
    }
  }

  const pctToTier = (pct: number): SchoolTierCode =>
    pct >= 85 ? "T1" : pct >= 75 ? "T2" : pct >= 65 ? "T3" : pct >= 55 ? "T4" : "T5";

  if (system === "FR_20" && gpa != null) {
    // French 20-point scale: 14/20 = Bien (75-80%, GPA ~3.0-3.3 -> T2 优良)
    let normPct: number;
    if (gpa >= 16) normPct = Math.min(98, 88 + (gpa - 16) * 2.5);
    else if (gpa >= 14) normPct = 77 + (gpa - 14) * 5; // 14/20 -> 77% (T2)
    else if (gpa >= 12) normPct = 68 + (gpa - 12) * 4;
    else if (gpa >= 10) normPct = 59 + (gpa - 10) * 4;
    else normPct = Math.max(40, gpa * 5.2);
    const rounded = Math.round(normPct * 10) / 10;
    return {
      normPct: rounded,
      initialTier: pctToTier(rounded),
      systemLabel: "法语区 20 分制",
      explanation: `法语区 ${gpa}/20 换算等效中国百分制约 ${rounded}%（${gpa >= 14 ? "优良档，防误杀" : "常规等效"}）`,
      source: "numeric",
    };
  }

  if (system === "DE_REVERSE" && gpa != null) {
    // German reverse scale: 1.0 = best, 4.0 = pass, 1.5 = top (~90%, T1)
    let normPct: number;
    if (gpa <= 1.5) normPct = 95 - (gpa - 1.0) * 10; // 1.0->95, 1.5->90 (T1)
    else if (gpa <= 2.3) normPct = 89 - (gpa - 1.5) * 12; // 2.0->83 (T2)
    else if (gpa <= 3.0) normPct = 79 - (gpa - 2.3) * 14; // 3.0->69 (T3)
    else if (gpa <= 4.0) normPct = 66 - (gpa - 3.0) * 12; // 4.0->54 (T5)
    else normPct = 45;
    const rounded = Math.round(Math.max(40, Math.min(99, normPct)) * 10) / 10;
    return {
      normPct: rounded,
      initialTier: pctToTier(rounded),
      systemLabel: "德国反向 1.0–5.0 制",
      explanation: `德国反向制 ${gpa} 分（数值越小越优）换算等效中国百分制约 ${rounded}%（${gpa <= 1.5 ? "顶尖 T1，防误杀" : "等效换算"}）`,
      source: "numeric",
    };
  }

  if (system === "UK_HONOURS") {
    let normPct: number;
    if (gpa != null) {
      // UK 70%+ First -> 88%+, 60-69% (2:1, e.g. 65%) -> 78-84% (T2 优良), 50-59% (2:2) -> 68-74% (T3)
      if (gpa >= 70) normPct = Math.min(96, 86 + (gpa - 70) * 0.5);
      else if (gpa >= 60) normPct = 76 + (gpa - 60) * 0.85; // 65% -> 80.3% (T2)
      else if (gpa >= 50) normPct = 66 + (gpa - 50) * 0.8;
      else if (gpa >= 40) normPct = 56 + (gpa - 40) * 0.8;
      else normPct = Math.max(40, gpa);
    } else if (/first\s*class|一等学位/iu.test(msg)) {
      normPct = 89;
    } else if (/2\s*:\s*1|upper\s*second|二等一/iu.test(msg)) {
      normPct = 80;
    } else if (/2\s*:\s*2|lower\s*second|二等二/iu.test(msg)) {
      normPct = 70;
    } else {
      normPct = 60;
    }
    const rounded = Math.round(normPct * 10) / 10;
    return {
      normPct: rounded,
      initialTier: pctToTier(rounded),
      systemLabel: "英国本科荣誉学位制",
      explanation: `英国学位制${gpa != null ? ` ${gpa}%` : ""}（2:1=优良）换算等效中国百分制约 ${rounded}%（防误杀为普通 65%）`,
      source: gpa != null ? "numeric" : "qualitative",
    };
  }

  if (gpa != null) {
    const inferredScale = scale ?? (gpa <= 4.0 ? 4 : gpa <= 5.0 ? 5 : 100);
    if (inferredScale === 4) {
      let normPct: number;
      if (gpa >= 3.5) normPct = 85 + (gpa - 3.5) * 24;
      else if (gpa >= 3.0) normPct = 75 + (gpa - 3.0) * 20;
      else if (gpa >= 2.5) normPct = 65 + (gpa - 2.5) * 20;
      else if (gpa >= 2.0) normPct = 55 + (gpa - 2.0) * 20;
      else normPct = Math.max(40, gpa * 27);
      const rounded = Math.round(Math.min(99, normPct) * 10) / 10;
      return {
        normPct: rounded,
        initialTier: pctToTier(rounded),
        systemLabel: "4.0 分制 GPA",
        explanation: `原始 GPA ${gpa}/4.0，等效中国百分制约 ${rounded}%`,
        source: "numeric",
      };
    }
    if (inferredScale === 5) {
      let normPct: number;
      if (gpa >= 4.3) normPct = 85 + (gpa - 4.3) * 18;
      else if (gpa >= 3.8) normPct = 75 + (gpa - 3.8) * 20;
      else if (gpa >= 3.2) normPct = 65 + (gpa - 3.2) * 16.5;
      else if (gpa >= 2.6) normPct = 55 + (gpa - 2.6) * 16.5;
      else normPct = Math.max(40, gpa * 20);
      const rounded = Math.round(Math.min(99, normPct) * 10) / 10;
      return {
        normPct: rounded,
        initialTier: pctToTier(rounded),
        systemLabel: "5.0 分制 GPA",
        explanation: `原始 GPA ${gpa}/5.0，等效中国百分制约 ${rounded}%`,
        source: "numeric",
      };
    }
    if (inferredScale === 100) {
      const rounded = Math.round(gpa * 10) / 10;
      return {
        normPct: rounded,
        initialTier: pctToTier(rounded),
        systemLabel: "中国百分制",
        explanation: `原始百分制均分 ${rounded}%`,
        source: "numeric",
      };
    }
    const ratioPct = Math.round(Math.max(0, Math.min(100, (gpa / inferredScale) * 100)) * 10) / 10;
    return {
      normPct: ratioPct,
      initialTier: pctToTier(ratioPct),
      systemLabel: `${inferredScale} 分制`,
      explanation: `原始成绩 ${gpa}/${inferredScale}，按比例等效约 ${ratioPct}%`,
      source: "numeric",
    };
  }

  if (criteria.academicLevel) {
    const map: Record<NonNullable<ChatCriteria["academicLevel"]>, { pct: number; tier: SchoolTierCode; label: string }> = {
      EXCELLENT: { pct: 90, tier: "T1", label: "优秀" },
      GOOD: { pct: 80, tier: "T2", label: "良好" },
      MEDIUM: { pct: 70, tier: "T3", label: "中等" },
      WEAK: { pct: 60, tier: "T4", label: "偏弱" },
      POOR: { pct: 50, tier: "T5", label: "较弱" },
    };
    const hit = map[criteria.academicLevel];
    return {
      normPct: hit.pct,
      initialTier: hit.tier,
      systemLabel: "定性成绩评估",
      explanation: `按定性描述【${hit.label}】定初始档 ${hit.tier}（约等效 ${hit.pct}%）`,
      source: "qualitative",
    };
  }

  return {
    normPct: null,
    initialTier: null,
    systemLabel: "未提供成绩",
    explanation: "尚未提供原始成绩或均分，严禁脑补高分条件",
    source: "missing",
  };
}

function auditSlots(criteria: ChatCriteria, rawMessage: string): SlotAuditResult {
  const missingCriticalSlots: string[] = [];
  const explicitAssumptions: string[] = [];

  const slots: Array<{ name: string; filled: boolean; critical?: boolean; assumption?: string }> = [
    { name: "国籍及华裔背景", filled: Boolean(criteria.nationality), assumption: "未指定国籍：暂按普通外籍生评估，涉华裔须核验“四年两年”规则" },
    {
      name: "最高学历与学位证状态",
      filled: Boolean(criteria.highestEducation || criteria.degreeBackground || criteria.programType),
      critical: !criteria.programType,
    },
    {
      name: "原始成绩体系与均分",
      filled: criteria.gpa != null || Boolean(criteria.academicLevel),
      critical: true,
      assumption: "未提供均分/GPA：严禁假定为高分，不得默认推荐 T1 名校及全额奖学金",
    },
    {
      name: "挂科门数",
      filled: criteria.failedCourseCount != null || /无挂科|零挂科|没有挂科|全科合格/u.test(rawMessage),
      assumption: "未说明挂科情况：按待核查成绩单处理，报“零挂科”名校前须确认全科合格",
    },
    {
      name: "CSCA 分数或考期",
      filled: criteria.programType !== "UG" || criteria.cscaMinSubjectScore != null || criteria.cscaScore != null || criteria.hasCsca != null || criteria.cscaRequirement != null || /CSCA/iu.test(criteria.plannedExams ?? ""),
      assumption: criteria.programType === "UG" ? "未提供本科 CSCA 成绩：公办主流院校须核验 CSCA 要求或考期" : undefined,
    },
    {
      name: "语言成绩及 HSK 版本",
      filled:
        criteria.hskLevel != null
        || criteria.ielts != null
        || criteria.toefl != null
        || criteria.duolingo != null
        || (criteria.languageStatus != null && criteria.languageStatus !== "UNSPECIFIED")
        || Boolean(criteria.plannedExams),
      critical: true,
      assumption: "未确认现有语言成绩：申请直录前必须核验 HSK（注意 2026-12-13 后 HSK 3.0 捆绑口语）或雅思/托福",
    },
    {
      name: "申请时年龄",
      filled: criteria.age != null,
      assumption: "未提供年龄：政府奖学金通常限本科≤25岁、硕士≤35岁，须按护照出生日期核实",
    },
    {
      name: "年度预算与奖学金诉求",
      filled: criteria.budget != null || criteria.scholarshipType != null || Boolean(criteria.excludeSelfFunded),
      assumption: "未提供年度预算：须确认是否能承担自费学费+最低 12,400 元/年生活医保自理线及首年非学费前置费",
    },
    {
      name: "目标专业与咨询月份",
      filled: Boolean(criteria.targetMajor || criteria.targetMajors?.length),
    },
  ];

  let filledCount = 0;
  for (const s of slots) {
    if (s.filled) filledCount += 1;
    else {
      if (s.critical) missingCriticalSlots.push(s.name);
      if (s.assumption) explicitAssumptions.push(s.assumption);
    }
  }
  return {
    filledCount,
    totalCount: slots.length,
    missingCriticalSlots,
    explicitAssumptions,
  };
}

function effectiveCscaScore(criteria: ChatCriteria): number | null {
  const vals = [
    criteria.cscaMinSubjectScore,
    criteria.cscaScore,
    criteria.cscaMathScore,
    criteria.cscaPhysicsScore,
    criteria.cscaChineseScore,
  ].filter((v): v is number => v != null && Number.isFinite(v));
  return vals.length ? Math.min(...vals) : null;
}

function hasQualifiedDirectUgLanguage(criteria: ChatCriteria, exemption: EnglishExemptionLevel): boolean {
  if (exemption === "NATIVE_EXEMPT") return true;
  if (criteria.hskLevel != null && criteria.hskLevel >= 4) return true;
  if (criteria.ielts != null && criteria.ielts >= 5.5) return true;
  if (criteria.toefl != null && criteria.toefl >= 70) return true;
  if (criteria.duolingo != null && criteria.duolingo >= 100) return true;
  return false;
}

function isExplicitlyBelowUgLanguage(criteria: ChatCriteria, exemption: EnglishExemptionLevel): boolean {
  if (exemption === "NATIVE_EXEMPT") return false;
  if (hasQualifiedDirectUgLanguage(criteria, exemption)) return false;
  if (criteria.languageStatus === "CONFIRMED_NONE") return true;
  if (criteria.hskLevel != null && criteria.hskLevel < 4) return true;
  if (criteria.ielts != null && criteria.ielts < 5.5) return true;
  if (criteria.toefl != null && criteria.toefl < 70) return true;
  if (criteria.duolingo != null && criteria.duolingo < 100) return true;
  return false;
}

function buildCuratedFallbacks(
  criteria: ChatCriteria,
  pathwayLocks: PathwayType[],
  finalTier: SchoolTierCode | null,
): CuratedFallbackRecommendation[] {
  const candidates: CuratedFallbackRecommendation[] = [];
  const budget = criteria.budget ?? null;
  const age = criteria.age ?? null;

  const pushSchool = (name: string, pathway: PathwayType, reason: string, caution: string) => {
    if (candidates.some((c) => c.schoolName === name)) return;
    const meta = inferSchoolPolicyMetadata(name);
    candidates.push({
      schoolName: name,
      city: meta.city || "中国",
      tier: meta.tier,
      pathway,
      pathwayLabel: PATHWAY_LABELS[pathway],
      estimatedFirstYearCost: meta.firstYearMinCostRmb != null
        ? `约 ${meta.firstYearMinCostRmb.toLocaleString("zh-CN")} 元/年起（官网核实为准）`
        : "以官网最新简章为准",
      reason,
      caution,
    });
  };

  if (pathwayLocks.includes("CHINESE_EQUIVALENT_MASTER")) {
    pushSchool(
      "华侨大学",
      "CHINESE_EQUIVALENT_MASTER",
      "极少数支持“高职高专毕业满2年或本科结业 + HSK5≥180分”中文同等学力申硕特例的公办高校",
      "须严格核实当年度研究生院同等学力加试及报考专业范围，不可作为普通硕博路径外推",
    );
  }

  if (pathwayLocks.includes("WIDE_AGE_SELF_FUNDED_MASTER")) {
    for (const name of ["浙江科技大学", "三亚学院", "吉林外国语大学"]) {
      const meta = inferSchoolPolicyMetadata(name);
      if (age != null && age > meta.maxAgeSelfFundedMaster) continue;
      if (budget != null && meta.firstYearMinCostRmb != null && meta.firstYearMinCostRmb > budget + 15000) continue;
      pushSchool(
        name,
        "WIDE_AGE_SELF_FUNDED_MASTER",
        `支持 ${meta.maxAgeSelfFundedMaster} 岁以内宽龄自费硕士申请，契合超 35 岁自费升硕定位`,
        meta.scholarshipRenewalRisk || "超 35 岁无法申请政府奖学金，按全额自费预算规划",
      );
    }
  }

  if (budget != null && budget >= MIN_ANNUAL_SELF_SUPPORT_RMB && budget <= LOW_BUDGET_NICHE_MAX_RMB && criteria.programType === "UG") {
    pushSchool(
      "广西工商职业技术学院",
      "VOCATIONAL_DIPLOMA",
      "合作低成本洼地：首年提供免学费住宿通道，将自理成本压至 12,400–20,000 元可控区间",
      "须自理生活费、医保及首年 4,400–17,100 元非学费前置费；后续可衔接专升本/专转本（如南京林业大学/无锡学院）",
    );
    pushSchool(
      "红河学院",
      "FOUNDATION_1_PLUS_4",
      "提供首年半奖减免，支持 1 年语言预科+本科及 35 岁内宽龄自费承接",
      "次年续奖须满足出勤与全科合格要求，申请前核实目标批次简章",
    );
  }

  if (criteria.programType === "UG" && age != null && age > 30) {
    if (age <= 35) {
      for (const name of ["浙江科技大学", "红河学院", "海南外国语职业学院"]) {
        const meta = inferSchoolPolicyMetadata(name);
        const path: PathwayType = meta.pathwayTypes.includes("VOCATIONAL_DIPLOMA") ? "VOCATIONAL_DIPLOMA" : "FOUNDATION_1_PLUS_4";
        pushSchool(
          name,
          path,
          `支持 35 岁以内宽龄自费承接，避开 25/30 岁常规限龄拦截`,
          meta.scholarshipRenewalRisk || "超 25 岁自动排除 CSC 政府全奖，按自费路径推进",
        );
      }
    } else if (age <= 40) {
      pushSchool(
        "吉林外国语大学",
        "FOUNDATION_1_PLUS_4",
        "极少数支持 40 岁以内本科自费承接的民办外语高校",
        "超 35 岁仅余极少数宽龄民办校或非学历语言进修，须逐一核实当年外事与签证政策",
      );
    }
  }

  if (
    candidates.length === 0
    && (pathwayLocks.includes("VOCATIONAL_DIPLOMA") || pathwayLocks.includes("FOUNDATION_1_PLUS_4"))
    && (finalTier === "T4" || finalTier === "T5")
  ) {
    for (const [name, p] of Object.entries(CURATED_SCHOOL_POLICIES)) {
      if (candidates.length >= 4) break;
      const meta = inferSchoolPolicyMetadata(name);
      if (age != null && age > meta.maxAgeSelfFundedUg) continue;
      if (!meta.hasOnCampusDorm && budget != null && budget <= 25000) continue;
      if (budget != null && meta.firstYearMinCostRmb != null && meta.firstYearMinCostRmb > budget + 3000) continue;
      const hitPath = pathwayLocks.find((lock) => meta.pathwayTypes.includes(lock));
      if (!hitPath) continue;
      if (criteria.highestEducation === "VOCATIONAL_HS" && !meta.acceptVocationalHs) continue;
      pushSchool(
        name,
        hitPath,
        `符合当前降级路径【${PATHWAY_LABELS[hitPath]}】与档位承接要求（${p.city ?? "中国"}）`,
        meta.scholarshipRenewalRisk || "先通过预科/高职稳妥落地，达标后再衔接普通本科或专升本（如南京林业大学/无锡学院）",
      );
    }
  }

  return candidates.slice(0, 5);
}

/**
 * Stage 1 + Stage 2 Deterministic Admission Rule Engine.
 * Strictly follows "worst-bottleneck wins" (no weighted compensation of weak CSCA/language by high GPA).
 */
export function evaluateAdmissionRules(
  criteria: ChatCriteria,
  rawMessage = "",
  now = new Date(),
): AdmissionDiagnostic {
  const academic = normalizeInternationalScore(criteria, rawMessage);
  const englishExemptionObj = classifyEnglishExemption(criteria, rawMessage);
  const slotAudit = auditSlots(criteria, rawMessage);
  const bottlenecks: BottleneckRuleHit[] = [];
  const modifiers: DynamicModifierNote[] = [];
  const gate1StopReasons: string[] = [];

  const isUg = criteria.programType === "UG";
  const isMaster = criteria.programType === "MASTER";
  const isPhd = criteria.programType === "PHD";
  const isDegree = isUg || isMaster || isPhd;

  let currentRank = academic.initialTier ? tierToRank(academic.initialTier) : null;
  const downgradeToAtLeast = (targetTier: SchoolTierCode) => {
    const targetRank = tierToRank(targetTier);
    currentRank = currentRank == null ? targetRank : Math.max(currentRank, targetRank);
  };

  let cscAllowed = true;
  let govFullAllowed = true;
  let schoolScholarshipAllowed = true;
  const scholarshipReasons: string[] = [];
  const blockCsc = (reason: string) => {
    cscAllowed = false;
    if (!scholarshipReasons.includes(reason)) scholarshipReasons.push(reason);
  };
  const blockGovFull = (reason: string) => {
    cscAllowed = false;
    govFullAllowed = false;
    if (!scholarshipReasons.includes(reason)) scholarshipReasons.push(reason);
  };

  // =========================================================================
  // Gate 1: Statutory Compliance Veto (STOP)
  // =========================================================================
  const flags = new Set(criteria.complianceFlags ?? []);
  if (criteria.isChineseOrigin && criteria.chineseOriginCompliant === false) {
    flags.add("UNDER_FOUR_TWO_RULE");
  }
  if (isUg && criteria.highestEducation === "BELOW_HS") {
    flags.add("NO_HS_DIPLOMA");
  }
  const flagMessages: Record<string, string> = {
    UNDER_FOUR_TWO_RULE: "华裔/原中国籍申请人未满足教育部“四年两年”外籍认定规则（入籍须满4年且近4年境外实际居住满2年），依法不得以外籍生身份报读中国高校学历项目。",
    NO_HS_DIPLOMA: "无高中毕业证或同等学力证明，不符合来华本科法定前置学历底线。",
    TB_ACTIVE: "存在活动性肺结核等出入境法定禁忌传染病，无法通过来华签证体检及居留许可审批。",
    MENTAL_DISORDER: "存在严重精神障碍法定体检受限情形，无法办理常规来华留学签证。",
    CRIMINAL_RECORD: "存在违法犯罪记录，无法满足来华高校无犯罪记录证明与签证合规要求。",
    DRUG_HISTORY: "存在涉毒记录，触发来华留学与出入境合规一票否决红线。",
    DOC_FRAUD: "存在学历/成绩单/语言材料造假史，触发零容忍一票否决红线。",
  };
  for (const flag of flags) {
    const msg = flagMessages[flag] ?? `触发法定合规红线（${flag}），终止选校推荐。`;
    gate1StopReasons.push(msg);
    bottlenecks.push({
      code: "COMPLIANCE_STOP",
      gate: "GATE_1_COMPLIANCE",
      severity: "STOP",
      summary: "法定合规一票否决",
      effect: msg,
    });
  }

  let pathwayLocks: PathwayType[] = [];
  let forceDowngradeLock = false;
  let blockDirectDegree = false;
  let allowVocationalDiploma = false;

  // Gate 1b: Master without Bachelor Degree Certificate
  if (
    (isMaster || isPhd)
    && (criteria.highestEducation === "BACHELOR_NO_DEGREE" || criteria.highestEducation === "ASSOCIATE")
  ) {
    blockDirectDegree = true;
    forceDowngradeLock = true;
    blockGovFull("无学士学位证，依法关闭常规硕士及 CSC 政府奖学金通道");
    downgradeToAtLeast("T4");
    const meetsChineseEquiv =
      isMaster
      && (
        criteria.highestEducation === "BACHELOR_NO_DEGREE"
        || (criteria.highestEducation === "ASSOCIATE" && (criteria.associateWorkYears ?? 0) >= 2)
      )
      && criteria.hskLevel != null && criteria.hskLevel >= 5
      && (criteria.hskScore == null || criteria.hskScore >= 180);

    if (meetsChineseEquiv) {
      pathwayLocks.push("CHINESE_EQUIVALENT_MASTER");
      bottlenecks.push({
        code: "NO_BACHELOR_DEGREE_MASTER",
        gate: "GATE_1_COMPLIANCE",
        severity: "LOCK",
        summary: "无学士学位证申硕（触发同等学力特例锁）",
        effect: "常规硕士与 CSC 已全部关闭；因满足“大专满2年/本科结业 + HSK5≥180分”，仅开放华侨大学等极个别中文同等学力硕士特例。",
      });
    } else {
      pathwayLocks.push("DIRECT_DEGREE", "NON_DEGREE_LANGUAGE");
      bottlenecks.push({
        code: "NO_BACHELOR_DEGREE_MASTER",
        gate: "GATE_1_COMPLIANCE",
        severity: "LOCK",
        summary: "无学士学位证申硕（关闭常规硕士与 CSC）",
        effect: "仅有毕业证/结业证或大专且不满足中文同等学力线（HSK5≥180），严禁推荐常规硕士及 CSC；建议改走重读本科或非学历语言进修。",
      });
    }
  }

  // =========================================================================
  // Gate 2: Worst-Bottleneck Downgrade & Pathway Locks
  // =========================================================================

  // 2.1 Academic < 65% redline (aligns with China 100-pt equivalent < 65%)
  if (academic.normPct != null && academic.normPct < 65) {
    downgradeToAtLeast(academic.normPct < 55 ? "T5" : "T4");
    blockGovFull(`归一化等效成绩 ${academic.normPct}%（低于 65% 红线），严禁推荐双一流、公办一本及全额奖学金`);
    if (isUg) allowVocationalDiploma = true;
    bottlenecks.push({
      code: "ACADEMIC_BELOW_65",
      gate: "GATE_2_BOTTLENECK",
      severity: "LOCK",
      summary: `学术均分低于 65% 红线（等效 ${academic.normPct}%）`,
      effect: "锁定至 T4/T5 池，严禁推荐 T1/T2（985/211/双一流）、公办一本及全额奖学金。",
    });
  } else if (academic.normPct == null && isDegree) {
    // Missing score: never assume high score or full scholarship
    blockGovFull("未提供具体成绩/均分，不得默认推荐 T1 名校及全额奖学金");
  }

  // 2.2 CSCA Lock (UG)
  const minCsca = effectiveCscaScore(criteria);
  if (isUg && minCsca != null) {
    if (minCsca < 50) {
      downgradeToAtLeast("T4");
      forceDowngradeLock = true;
      blockDirectDegree = true;
      allowVocationalDiploma = true;
      blockGovFull(`CSCA 必考科 ${minCsca} 分（<50分红线），禁用 CSC 全奖并关闭常规本科直录`);
      pathwayLocks = ["FOUNDATION_1_PLUS_4", "VOCATIONAL_DIPLOMA"];
      bottlenecks.push({
        code: "CSCA_BELOW_50",
        gate: "GATE_2_BOTTLENECK",
        severity: "LOCK",
        summary: `CSCA 短板熔断（单科 ${minCsca} 分 < 50 分）`,
        effect: "木桶短板生效（不可用高高中均分拉高）：强制降档至 T4 并锁死“1年预科（1+4）”或免 CSCA 通道，严禁推主流公办本科直录及 CSC 全奖。",
      });
    } else if (minCsca < 70) {
      blockCsc(`CSCA ${minCsca} 分低于 70 分门槛，锁死禁用 CSC 全奖志愿`);
      bottlenecks.push({
        code: "CSCA_BELOW_70",
        gate: "GATE_2_BOTTLENECK",
        severity: "WARN",
        summary: `CSCA 成绩偏低（${minCsca} 分 < 70 分）`,
        effect: "锁死禁用 CSC 全奖志愿，建议主攻校考弹性校或自费/校奖本科。",
      });
    }
  }

  // 2.3 Language Lock (UG) + HSK 3.0 Oral Binding Alert
  if (isUg && isExplicitlyBelowUgLanguage(criteria, englishExemptionObj.level)) {
    downgradeToAtLeast("T4");
    forceDowngradeLock = true;
    blockDirectDegree = true;
    allowVocationalDiploma = true;
    blockGovFull("本科无 HSK4 且无雅思 5.5/托福 70/多邻国 100（且非 6 国英语母语），严禁常规本科直录及全奖");
    const langPaths: PathwayType[] = ["FOUNDATION_1_PLUS_4", "ZERO_BASE_CHINESE_UG", "VOCATIONAL_DIPLOMA"];
    pathwayLocks = pathwayLocks.length
      ? pathwayLocks.filter((p) => langPaths.includes(p))
      : langPaths;
    if (!pathwayLocks.length) pathwayLocks = langPaths;
    bottlenecks.push({
      code: "LANGUAGE_LOCK",
      gate: "GATE_2_BOTTLENECK",
      severity: "LOCK",
      summary: "本科语言硬闸门触发（未达 HSK4 或 雅思5.5/托福70/多邻国100）",
      effect: "强制降至 T4/T5 并锁死“1年预科+本科 / 零基础汉语言本科 / HSK3或面试准入高职”三选一，严禁推荐常规本科直录。",
    });
  }

  if (
    criteria.hskVersion === "3.0"
    || (criteria.teachingLanguage === "CHINESE" && (criteria.intakeYear ?? 2027) >= 2027 && criteria.hasHskk === false)
  ) {
    bottlenecks.push({
      code: "HSK_30_ORAL_ALERT",
      gate: "GATE_2_BOTTLENECK",
      severity: "WARN",
      summary: "HSK 3.0 口语捆绑提醒（2026年12月13日开考）",
      effect: "HSK 3.0 的 3–6 级捆绑口语考核，准备 2027 年起中文授课项目须同步备考口语/HSKK。",
    });
  }

  if (englishExemptionObj.level === "MOI_HIGH_RISK") {
    bottlenecks.push({
      code: "MOI_HIGH_RISK",
      gate: "GATE_2_BOTTLENECK",
      severity: "WARN",
      summary: "MOI 本地英文授课证明高风控个案审查",
      effect: englishExemptionObj.note,
    });
  }

  // 2.4 Vocational HS & Failed Course Locks
  if (isUg && criteria.highestEducation === "VOCATIONAL_HS") {
    downgradeToAtLeast("T4");
    forceDowngradeLock = true;
    allowVocationalDiploma = true;
    blockGovFull("中专/职高学历拦截普高限定本科与 CSC 全奖");
    const vocPaths: PathwayType[] = ["VOCATIONAL_DIPLOMA", "FOUNDATION_1_PLUS_4", "VOCATIONAL_UG"];
    pathwayLocks = pathwayLocks.length
      ? pathwayLocks.filter((p) => vocPaths.includes(p))
      : vocPaths;
    if (!pathwayLocks.length) pathwayLocks = ["VOCATIONAL_DIPLOMA", "FOUNDATION_1_PLUS_4"];
    bottlenecks.push({
      code: "VOCATIONAL_HS_LOCK",
      gate: "GATE_2_BOTTLENECK",
      severity: "LOCK",
      summary: "中专/职高前置学历锁",
      effect: "自动拦截普高限定本科，锁死明文接收中专的公办高职（衔接专升本）或承认同等学力的 T4 宽进校。",
    });
  }

  const failedCount = criteria.failedCourseCount ?? 0;
  if (failedCount >= 3) {
    downgradeToAtLeast("T4");
    forceDowngradeLock = true;
    allowVocationalDiploma = isUg;
    blockGovFull(`存在 ${failedCount} 门核心课挂科（≥3门），强制降至 T4/T5 且禁用政府奖学金`);
    bottlenecks.push({
      code: "FAILED_COURSES_3_PLUS",
      gate: "GATE_2_BOTTLENECK",
      severity: "LOCK",
      summary: `多门挂科短板（${failedCount} 门 ≥ 3 门）`,
      effect: "强制降至 T4/T5，拦截“零挂科”名校及所有省/国家政府奖学金。",
    });
  } else if (failedCount >= 1) {
    blockGovFull(`存在 ${failedCount} 门挂科，拦截“零挂科”名校及省/国家政府奖学金`);
    bottlenecks.push({
      code: "FAILED_COURSES_1_2",
      gate: "GATE_2_BOTTLENECK",
      severity: "WARN",
      summary: `存在 ${failedCount} 门挂科记录`,
      effect: "自动拦截要求全科合格（零挂科）的名校及省/国家政府奖学金，仅可考虑对补考/重修包容度较高的院校自费或小额校奖。",
    });
  }

  // 2.5 Age Ladder Lock
  const age = criteria.age ?? null;
  if (age != null) {
    if (isUg) {
      if (age > 35) {
        downgradeToAtLeast("T5");
        forceDowngradeLock = true;
        blockDirectDegree = true;
        allowVocationalDiploma = true;
        blockGovFull(`本科申请人 ${age} 岁（>35岁），排除常规公办本科与全部政府奖`);
        pathwayLocks = ["FOUNDATION_1_PLUS_4", "NON_DEGREE_LANGUAGE"];
        bottlenecks.push({
          code: "AGE_UG_OVER_35",
          gate: "GATE_2_BOTTLENECK",
          severity: "LOCK",
          summary: `本科严重超龄锁（${age} 岁 > 35 岁）`,
          effect: "仅锁入极少数 40 岁宽龄民办校（如吉林外国语大学）或非学历语言进修。",
        });
      } else if (age > 30) {
        downgradeToAtLeast("T4");
        forceDowngradeLock = true;
        allowVocationalDiploma = true;
        blockGovFull(`本科申请人 ${age} 岁（>30岁），自动剔除 CSC 及 25/30 岁限龄校`);
        if (!pathwayLocks.length) pathwayLocks = ["FOUNDATION_1_PLUS_4", "VOCATIONAL_DIPLOMA", "DIRECT_DEGREE"];
        bottlenecks.push({
          code: "AGE_UG_OVER_30",
          gate: "GATE_2_BOTTLENECK",
          severity: "LOCK",
          summary: `本科超 30 岁宽龄自费锁（${age} 岁）`,
          effect: "自动剔除 CSC 及 25/30 岁限龄校，锁入 35 岁宽龄自费承接池（如浙江科技大学、红河学院、海南外国语职业学院）。",
        });
      } else if (age > 25) {
        blockGovFull(`本科申请人 ${age} 岁（>25岁），自动剔除 CSC 及 25 岁限龄校`);
        bottlenecks.push({
          code: "AGE_UG_OVER_25",
          gate: "GATE_2_BOTTLENECK",
          severity: "WARN",
          summary: `本科超 25 岁限龄（${age} 岁）`,
          effect: "自动剔除 CSC 全奖及 25 岁限龄本科项目，仅匹配 28–35 岁宽龄自费本科。",
        });
      }
    } else if (isMaster && age > 35) {
      forceDowngradeLock = true;
      blockGovFull(`硕士申请人 ${age} 岁（>35岁），依法剔除全部政府奖学金`);
      if (!pathwayLocks.includes("CHINESE_EQUIVALENT_MASTER")) {
        pathwayLocks = ["WIDE_AGE_SELF_FUNDED_MASTER"];
      }
      downgradeToAtLeast("T3");
      bottlenecks.push({
        code: "AGE_MASTER_OVER_35",
        gate: "GATE_2_BOTTLENECK",
        severity: "LOCK",
        summary: `硕士超 35 岁宽龄自费锁（${age} 岁）`,
        effect: "自动剔除全部政府奖学金，精准转入 45–50 岁自费宽龄硕士池（如浙江科技大学、三亚学院、吉林外国语大学）。",
      });
    }
  }

  // 2.6 Budget & Full-Scholarship Inversion Lock
  const fullScholarshipQualified =
    govFullAllowed
    && academic.initialTier != null
    && tierToRank(academic.initialTier) <= 2
    && failedCount === 0
    && !blockDirectDegree
    && (minCsca == null || minCsca >= 70);

  if (!fullScholarshipQualified) {
    blockGovFull(
      scholarshipReasons[0] ?? "全奖仅占在华国际生约 8%，当前硬件尚未达到全额奖学金竞争门槛",
    );
  }

  let budgetCircuitBreaker = false;
  const budget = criteria.budget ?? null;
  if (budget != null && !fullScholarshipQualified) {
    if (budget < MIN_ANNUAL_SELF_SUPPORT_RMB) {
      budgetCircuitBreaker = true;
      schoolScholarshipAllowed = false;
      bottlenecks.push({
        code: "BUDGET_BELOW_12400_STOP",
        gate: "GATE_2_BOTTLENECK",
        severity: "STOP",
        summary: `预算低于生存底线熔断（${budget.toLocaleString("zh-CN")} 元/年 < 12,400 元/年）`,
        effect: `未达全奖门槛（全奖仅占国际生约 8%）且年度预算低于免学费住宿后的最低生活+医保自理线（12,400 元/年，尚未计入首年 ${FIRST_YEAR_PRE_ARRIVAL_FEES_RANGE} 非学费前置费），直接触发硬熔断劝退/延期。`,
      });
    } else if (budget <= LOW_BUDGET_NICHE_MAX_RMB) {
      forceDowngradeLock = true;
      allowVocationalDiploma = true;
      downgradeToAtLeast("T4");
      if (isUg && !pathwayLocks.length) {
        pathwayLocks = ["VOCATIONAL_DIPLOMA", "FOUNDATION_1_PLUS_4"];
      }
      bottlenecks.push({
        code: "BUDGET_12400_20000_NICHE",
        gate: "GATE_2_BOTTLENECK",
        severity: "LOCK",
        summary: `低预算精准洼地纠偏（${budget.toLocaleString("zh-CN")} 元/年处于 12,400–20,000 元区间）`,
        effect: "不搞一刀切劝退：关闭高学费普本与全奖幻想，精准导向“首年免学费住宿高职（如广西工商职业技术学院）”或“红河学院首年半奖”等真实低成本承接池。",
      });
    }
  }

  // =========================================================================
  // Gate 3: Major & Round Dynamic Modifiers
  // =========================================================================
  const majorBlob = [criteria.targetMajor, ...(criteria.targetMajors ?? []), rawMessage].filter(Boolean).join(" ");
  if (isDegree && /(?:计算机|软件工程|人工智能|\bAI\b|\bCS\b|computer\s*science|data\s*science)/iu.test(majorBlob)) {
    modifiers.push({
      type: "CS_AI_TIGHTEN",
      summary: "CS / AI 热门竞争专业收紧 1 档核验",
      action: "计算机/AI 申请拥挤，冲刺校按收紧 1 档口径核验；若处于档位下沿，建议同步考虑机械、土木、电气、自动化等传统工科以显著提高录奖胜率。",
    });
  }

  const isEnglishMbbs =
    /(?:\bMBBS\b|临床医学|clinical\s*medicine)/iu.test(majorBlob)
    && (criteria.teachingLanguage === "ENGLISH" || /\bMBBS\b|英文.*医学|英语.*临床/iu.test(majorBlob));
  if (isEnglishMbbs) {
    const scores = criteria.mbbsSubjectScores;
    const lowSubjects: string[] = [];
    if (scores?.physics != null && scores.physics < 65) lowSubjects.push(`物理 ${scores.physics}%`);
    if (scores?.chemistry != null && scores.chemistry < 65) lowSubjects.push(`化学 ${scores.chemistry}%`);
    if (scores?.biology != null && scores.biology < 65) lowSubjects.push(`生物 ${scores.biology}%`);
    modifiers.push({
      type: "ENGLISH_MBBS_43",
      summary: "英文授课 MBBS 强锁教育部 43 校（2,790 席）白名单",
      action: lowSubjects.length
        ? `检测到理化生单科偏低（${lowSubjects.join("、")}，常规要求均达 60%–70%+），且 MBBS 为 6 年长学制高预算项目，须逐校核查白名单与 6 年总费用。`
        : "已锁定教育部 43 所英文 MBBS 白名单；申请前须逐科核查高中物理/化学/生物均达 60%–70% 以上，并做好 6 年长学制总预算评估。",
    });
  }

  if (/(?:\bMBA\b|金融硕士|master\s+of\s+finance|金融学)/iu.test(majorBlob) && (isMaster || !criteria.programType)) {
    modifiers.push({
      type: "MBA_FINANCE_HIGH_FEE",
      summary: "MBA / 金融硕士自动切换高学费预算校验",
      action: "英文 MBA 及重点院校金融硕士学费普遍偏高（常见 6–30 万元/全程），且多数商学院项目不参与 CSC 全奖，请以项目总学费口径复核预算。",
    });
  }

  const consultMonth = criteria.consultationMonth ?? (now.getMonth() + 1);
  if (consultMonth > 3 && consultMonth <= 8 && (currentRank == null || currentRank <= 2)) {
    modifiers.push({
      type: "T1_LATE_ROUND",
      summary: `当前咨询月份（${consultMonth} 月）已晚于 T1 顶尖校首轮奖学金窗口`,
      action: "清华、北大、复旦等 T1 名校大部分奖学金预算在 2 月前第一轮即已耗尽；建议下调当年 T1 全奖预期，改走自费通道、转向 T2/T3 院校或提前筹备次年秋季首轮。",
    });
  }

  // =========================================================================
  // Final State & Bidirectional +/- 1 Tier Window
  // =========================================================================
  const isCircuitBreaker = gate1StopReasons.length > 0 || budgetCircuitBreaker;
  const state: EngineState = isCircuitBreaker
    ? "CIRCUIT_BREAKER"
    : forceDowngradeLock
      ? "DOWNGRADE_LOCK"
      : "NORMAL";

  const finalTier: SchoolTierCode | null = currentRank != null ? rankToTier(currentRank) : null;

  if (!pathwayLocks.length) {
    if (isCircuitBreaker) {
      pathwayLocks = [];
    } else if (criteria.programType === "LONG_TERM" || criteria.programType === "SHORT_TERM") {
      pathwayLocks = ["NON_DEGREE_LANGUAGE"];
    } else {
      pathwayLocks = ["DIRECT_DEGREE"];
    }
  }

  const tierWindow = (() => {
    if (isCircuitBreaker || finalTier == null) {
      return {
        reachTier: null,
        matchTier: finalTier,
        safetyTier: null,
        reachRestrictedToDowngradePath: false,
      };
    }
    const r = tierToRank(finalTier);
    // Bidirectional +/- 1 tier lock: Match = X, Reach = X-1 (if not T1), Safety = X+1 (if not T5)
    // Special rule: if academic < 65% or severe bottleneck (T4/T5), Reach NEVER touches T1/T2!
    let reachRank = r > 1 ? r - 1 : 1;
    if (academic.normPct != null && academic.normPct < 65) {
      reachRank = Math.max(reachRank, 4); // T4/T5 low-score never climbs into T1/T2/T3 public tier-1
    }
    if (r >= 4 && forceDowngradeLock && blockDirectDegree) {
      // Under pathway lock, Reach may reach X-1 ONLY for foundation/downgrade path, never T1/T2 direct
      reachRank = Math.max(3, r - 1);
    }
    const safetyRank = r < 5 ? r + 1 : 5;
    return {
      reachTier: rankToTier(reachRank),
      matchTier: finalTier,
      safetyTier: rankToTier(safetyRank),
      reachRestrictedToDowngradePath: forceDowngradeLock && blockDirectDegree,
    };
  })();

  const curatedFallbacks = isCircuitBreaker
    ? []
    : buildCuratedFallbacks(criteria, pathwayLocks, finalTier);

  // =========================================================================
  // Three-State Structured Advisor Scripts & Real Cost Breakdown
  // =========================================================================
  const firstYearCostChecklist = [
    `非学费前置开销：体检公证、签证保险、居留许可、机票及初期安置合计约 ${FIRST_YEAR_PRE_ARRIVAL_FEES_RANGE}（不含学费与住宿）。`,
    `自理底线：即使获得免学费住宿通道，仍须自备至少 ${MIN_ANNUAL_SELF_SUPPORT_RMB.toLocaleString("zh-CN")} 元/年的基本生活费与来华保险（800元/年）。`,
    "资金与留位要求：多数高校录取前需缴纳留位押金（1,000–5,000元不等），并须准备覆盖首年费用的银行存款证明。",
    "次年续奖年审风险：各类奖学金均须参加年度综合评审（例如浙江科技大学单学期缺勤满 20 课时或挂科即取消下学期奖学金）。",
  ];

  const stateLabels: Record<EngineState, string> = {
    NORMAL: "正常匹配态 · NORMAL",
    DOWNGRADE_LOCK: "降级纠偏态 · DOWNGRADE_LOCK",
    CIRCUIT_BREAKER: "硬熔断劝退态 · CIRCUIT_BREAKER",
  };

  let advisory: AdmissionDiagnostic["advisory"];
  if (state === "CIRCUIT_BREAKER") {
    const gapText = budget != null && budget < MIN_ANNUAL_SELF_SUPPORT_RMB
      ? `当前年度预算 ${budget.toLocaleString("zh-CN")} 元，与免学费住宿后的最低生活+医保自理底线（${MIN_ANNUAL_SELF_SUPPORT_RMB.toLocaleString("zh-CN")} 元/年）存在至少 ${(MIN_ANNUAL_SELF_SUPPORT_RMB - budget).toLocaleString("zh-CN")} 元硬缺口（尚未计入首年 ${FIRST_YEAR_PRE_ARRIVAL_FEES_RANGE} 非学费前置费）；且当前硬件尚未达到仅占国际生约 8% 的全额奖学金竞争门槛。`
      : gate1StopReasons.join(" ");
    advisory = {
      headline: "【硬熔断劝退】当前条件触发刚性红线，已隐藏院校推荐列表",
      diagnosisParagraph: `${gapText} 盲目递交只会浪费申请费与时间，系统已自动终止选校推荐。`,
      actionPlan: [
        "【1 年期提升计划】先利用 6–12 个月在母国集中刷高核心成绩/补考清零挂科，并考出 HSK4（注意 2026年12月13日起 HSK 3.0 捆绑口语）或雅思 6.0+ / CSCA 70+。",
        `【资金准备】至少攒齐 ${MIN_ANNUAL_SELF_SUPPORT_RMB.toLocaleString("zh-CN")} 元/年基本自理生活费 + 首年 ${FIRST_YEAR_PRE_ARRIVAL_FEES_RANGE} 前置费用后再启动申请，或待语言与学术达标后再冲刺全奖。`,
        "【合规复核】如涉及法定体检/华裔“四年两年”/学历真伪问题，须先依法解决前置资格后方可重评。",
      ],
      firstYearCostChecklist,
      legalComplianceNotice: LEGAL_NO_ILLEGAL_WORK_NOTICE,
    };
  } else if (state === "DOWNGRADE_LOCK") {
    const keyCards = bottlenecks.filter((b) => b.severity === "LOCK").map((b) => b.summary).join("；");
    const pathDesc = pathwayLocks.map((p) => PATHWAY_LABELS[p]).join(" / ");
    advisory = {
      headline: `【降级纠偏 · 路径已锁死】已拦截越级推荐，切换至「${pathDesc}」`,
      diagnosisParagraph: `客观卡点：${keyCards || "存在硬性短板"}。按“木桶短板”规则已将目标档位锁定在 ${finalTier ?? "T4"}，严格屏蔽超纲名校、违规直录与不可达全额奖学金，改走有据可查的“先降落、再跃迁”闭环路径。`,
      actionPlan: [
        `优先按锁死路径推进：${pathDesc}（不建议抱侥幸心理盲申常规直录或 CSC 全奖）。`,
        ...(allowVocationalDiploma
          ? ["跃迁通道：选择低学费公办高职（如广西工商职业技术学院等）稳妥落地后，在华达标 HSK 与专业课成绩，可衔接南京林业大学、无锡学院等国际生专转本/专升本通道。"]
          : []),
        ...(pathwayLocks.includes("FOUNDATION_1_PLUS_4")
          ? ["预科转正要求：1 年语言预科期间须考过 HSK4（180分+）并通过预科结业考核，方可升入本科一年级正课。"]
          : []),
        ...(pathwayLocks.includes("WIDE_AGE_SELF_FUNDED_MASTER")
          ? ["超 35 岁自费硕：全额自费推进 45–50 岁宽龄承接院校（如浙江科技大学、三亚学院、吉林外国语大学），申请前逐一核实当年外事年龄口径。"]
          : []),
      ],
      firstYearCostChecklist,
      legalComplianceNotice: LEGAL_NO_ILLEGAL_WORK_NOTICE,
    };
  } else {
    advisory = {
      headline: `【正常匹配 · 定档 ${finalTier ?? "待定"}】按双向“上下 1 档”锁池精准匹配`,
      diagnosisParagraph: `${academic.explanation}${academic.initialTier && finalTier && academic.initialTier !== finalTier ? `；经短板核验后最终定档 ${finalTier}` : finalTier ? `，最终定档 ${finalTier}` : ""}。稳妥池（Match）锁定 ${tierWindow.matchTier ?? "同档"}，冲刺池（Reach）最高上浮 1 档至 ${tierWindow.reachTier ?? "同档"}，保底池（Safety）下浮 1 档至 ${tierWindow.safetyTier ?? "同档"}，既防越级也防高分误配兜底校。`,
      actionPlan: [
        ...modifiers.map((m) => `${m.summary}：${m.action}`),
        ...slotAudit.explicitAssumptions.slice(0, 2),
      ],
      firstYearCostChecklist,
      legalComplianceNotice: LEGAL_NO_ILLEGAL_WORK_NOTICE,
    };
  }

  return {
    state,
    stateLabel: stateLabels[state],
    initialTier: academic.initialTier,
    finalTier,
    academic,
    englishExemption: englishExemptionObj.level,
    englishExemptionNote: englishExemptionObj.note,
    slotAudit,
    tierWindow,
    pathwayLocks,
    pathwayLockLabels: pathwayLocks.map((p) => PATHWAY_LABELS[p]),
    scholarshipPolicy: {
      cscAllowed,
      govFullAllowed,
      schoolScholarshipAllowed,
      reasons: scholarshipReasons,
    },
    gate1StopReasons,
    bottlenecks,
    modifiers,
    blockDirectDegree,
    allowVocationalDiploma,
    requireMoe43Mbbs: isEnglishMbbs,
    hasFailedCourses: failedCount > 0,
    curatedFallbacks,
    advisory,
  };
}

/**
 * Stage 3: 10-Dimensional Structural Hard Filter + Bidirectional +/- 1 Tier Circuit Breaker.
 * Evaluates whether a specific school/program may enter the candidate pool before LLM ranking.
 */
export function evaluateSchoolAgainstRules(
  diagnostic: AdmissionDiagnostic,
  criteria: ChatCriteria,
  candidate: {
    schoolName: string;
    schoolTags?: string | null;
    qsRanking?: number | null;
    programName?: string | null;
    programType?: string | null;
    teachingLanguage?: string | null;
    firstYearCostMax?: number | null;
    scholarshipSummary?: string | null;
    city?: string | null;
    languageRequirement?: string | null;
  },
): SchoolHardFilterDecision {
  const policy = inferSchoolPolicyMetadata(candidate.schoolName, {
    schoolTags: candidate.schoolTags,
    qsRanking: candidate.qsRanking,
    firstYearCostMax: candidate.firstYearCostMax,
    programName: candidate.programName,
    programType: candidate.programType,
    city: candidate.city,
  });
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (diagnostic.state === "CIRCUIT_BREAKER") {
    return {
      eligible: false,
      assignedBucket: null,
      reasons: ["触发硬熔断劝退态（CIRCUIT_BREAKER），彻底禁止推荐任何院校"],
      warnings,
      policy,
    };
  }

  const progName = String(candidate.programName ?? "");
  const isFoundationProg = /预科|1\+4|基础年|foundation/iu.test(progName) || candidate.programType === "LONG_TERM";
  const isZeroBaseChineseUg =
    /(?:零基础|免\s*HSK).{0,8}(?:本科|汉语言)/u.test(progName)
    || (/汉语言(?:本科|文学|专业)?/u.test(progName) && !/计算机|软件|工程|医学|金融|经济|管理|商科|中文授课|商务汉语.*高阶/u.test(progName));
  const isDiplomaProg = policy.tier === "T5" && policy.pathwayTypes.includes("VOCATIONAL_DIPLOMA") && !/本科|硕士|博士/u.test(progName);
  const isNonDegreeProg = candidate.programType === "LONG_TERM" || candidate.programType === "SHORT_TERM" || /语言进修|汉语进修|非学历/u.test(progName);
  const isDirectDegreeProg = !isFoundationProg && !isDiplomaProg && !isNonDegreeProg;

  const allowedChineseEquiv =
    diagnostic.pathwayLocks.includes("CHINESE_EQUIVALENT_MASTER")
    && Boolean(policy.acceptsChineseEquivalentMaster)
    && (candidate.teachingLanguage === "CHINESE" || !/英文|english/iu.test(String(candidate.teachingLanguage ?? "")));
  const allowedZeroBase =
    diagnostic.pathwayLocks.includes("ZERO_BASE_CHINESE_UG")
    && isZeroBaseChineseUg;
  const allowedWideAgeMaster =
    diagnostic.pathwayLocks.includes("WIDE_AGE_SELF_FUNDED_MASTER")
    && policy.pathwayTypes.includes("WIDE_AGE_SELF_FUNDED_MASTER");
  const allowedRetakeUg =
    criteria.programType === "MASTER"
    && (criteria.highestEducation === "BACHELOR_NO_DEGREE" || criteria.highestEducation === "ASSOCIATE")
    && (candidate.programType === "UG" || /本科/u.test(progName));
  const hasApprovedSpecialPath = allowedChineseEquiv || allowedZeroBase || allowedWideAgeMaster || allowedRetakeUg;

  // 1. Bidirectional +/- 1 Tier Fuse
  let assignedBucket: "REACH" | "TARGET" | "SAFE" = "TARGET";
  if (diagnostic.finalTier) {
    const studentRank = tierToRank(diagnostic.finalTier);
    const schoolRank = tierToRank(policy.tier);
    const diff = studentRank - schoolRank; // positive means school is HIGHER tier than student

    // Academic < 65% hard ceiling: never T1 / T2 / T3 public tier-1 (unless explicit channel override)
    if (
      diagnostic.academic.normPct != null
      && diagnostic.academic.normPct < 65
      && schoolRank <= 3
      && !policy.channelOverride?.overrideMinNormPct
      && !(diagnostic.pathwayLocks.includes("FOUNDATION_1_PLUS_4") && isFoundationProg && schoolRank === 3)
      && !(diagnostic.pathwayLocks.includes("ZERO_BASE_CHINESE_UG") && isZeroBaseChineseUg && schoolRank === 3)
    ) {
      reasons.push(`学术均分 ${diagnostic.academic.normPct}%（<65%红线），严禁越级推荐 ${policy.tier} 重点/公办一本院校`);
    } else if (diff >= 2) {
      // Prevent T4/T5 from seeing T1/T2, and T3 from seeing T1
      reasons.push(`双向档位熔断：学生最终档位 ${diagnostic.finalTier}，禁止向上越级 ≥2 档推荐 ${policy.tier} 院校`);
    } else if (diff <= -2 && diagnostic.state === "NORMAL" && studentRank <= 2) {
      // Prevent T1/T2 top students from being mismatched to T4/T5 fallback schools
      reasons.push(`防高分错配熔断：学生为 ${diagnostic.finalTier} 档，不应错配至 ${policy.tier} 兜底院校`);
    } else if (diff === 1) {
      if (diagnostic.tierWindow.reachRestrictedToDowngradePath && isDirectDegreeProg && !hasApprovedSpecialPath) {
        reasons.push(`路径锁死态下，向上冲刺 1 档仅限预科/衔接通道，禁止推荐 ${policy.tier} 常规直录`);
      } else {
        assignedBucket = "REACH";
      }
    } else if (diff === 0) {
      assignedBucket = "TARGET";
    } else {
      assignedBucket = "SAFE";
    }
  }

  // 2. Pathway Lock Check
  if (diagnostic.blockDirectDegree && isDirectDegreeProg) {
    if (!hasApprovedSpecialPath) {
      reasons.push(`路径锁死拦截：当前仅允许【${diagnostic.pathwayLockLabels.join(" / ")}】，严禁推荐常规学历直录项目`);
    }
  }

  // Master without degree: block regular master unless Chinese equivalent exception
  if (
    (criteria.programType === "MASTER" || criteria.programType === "PHD")
    && (criteria.highestEducation === "BACHELOR_NO_DEGREE" || criteria.highestEducation === "ASSOCIATE")
  ) {
    const isMasterProgram = candidate.programType === "MASTER" || candidate.programType === "PHD" || /硕士|博士|master|phd|mba/iu.test(progName);
    if (isMasterProgram) {
      if (!(diagnostic.pathwayLocks.includes("CHINESE_EQUIVALENT_MASTER") && policy.acceptsChineseEquivalentMaster)) {
        reasons.push("无学士学位证禁止申请常规硕博项目（仅极个别中文同等学力特例校在达标 HSK5≥180 时可报）");
      }
    }
  }

  // 3. CSCA Hard Score Check
  const minCsca = effectiveCscaScore(criteria);
  if (criteria.programType === "UG" && minCsca != null && isDirectDegreeProg) {
    if (policy.cscaPolicy !== "EXEMPT" && policy.minCscaScore != null && minCsca < policy.minCscaScore) {
      reasons.push(`CSCA 成绩 ${minCsca} 分低于该校底线（${policy.minCscaScore} 分）`);
    }
  }

  // 4. Strong School Exam Warning / Guard
  if (policy.requiresSchoolExam) {
    warnings.push(policy.schoolExamNote ?? "该校设强校考（数理笔试/禁计算器考核），请核实学生竞赛与数理笔试基础");
  }

  // 5. Zero-Fail Requirement Check
  if (diagnostic.hasFailedCourses && policy.zeroFailRequired) {
    reasons.push(`该校要求全科合格（零挂科），学生存在 ${criteria.failedCourseCount} 门挂科记录，自动拦截`);
  }

  // 6. Vocational High School Acceptance Check
  if (criteria.programType === "UG" && criteria.highestEducation === "VOCATIONAL_HS" && !policy.acceptVocationalHs && isDirectDegreeProg) {
    reasons.push("该校限定普通高中学历，不接收中专/职高背景直录本科");
  }

  // 7. Age Ceiling Check
  if (criteria.age != null) {
    if (criteria.programType === "UG" && criteria.age > policy.maxAgeSelfFundedUg && !isNonDegreeProg) {
      reasons.push(`申请人 ${criteria.age} 岁超过该校本科自费年龄上限（${policy.maxAgeSelfFundedUg} 岁）`);
    }
    if (criteria.programType === "MASTER" && criteria.age > policy.maxAgeSelfFundedMaster && !isNonDegreeProg) {
      reasons.push(`申请人 ${criteria.age} 岁超过该校硕士自费年龄上限（${policy.maxAgeSelfFundedMaster} 岁）`);
    }
  }

  // 8. MOI Strict Rejection Check
  const isEnglishProg =
    candidate.teachingLanguage === "ENGLISH"
    || /英文|英语|english/iu.test(String(candidate.teachingLanguage ?? ""));
  if (
    isEnglishProg
    && diagnostic.englishExemption === "MOI_HIGH_RISK"
    && criteria.ielts == null && criteria.toefl == null && criteria.duolingo == null
    && !policy.moiAccepted
  ) {
    reasons.push(policy.moiNote ?? "该校明确不认可本地英文授课证明（MOI），须提交标准化雅思/托福成绩");
  }

  // 9. English MBBS MOE-43 Whitelist Check
  if (diagnostic.requireMoe43Mbbs && isEnglishProg && !policy.isMoe43Mbbs) {
    reasons.push("英文授课 MBBS 强锁教育部 43 校白名单，该校不在英文 MBBS 白名单内");
  }

  // 10. Budget & Dormitory & Full-Scholarship Check
  const effectiveCost = candidate.firstYearCostMax ?? policy.firstYearMinCostRmb;
  if (
    criteria.budget != null
    && effectiveCost != null
    && effectiveCost > criteria.budget
    && !diagnostic.scholarshipPolicy.govFullAllowed
  ) {
    const waiverCovers = policy.firstYearWaiverType === "FULL_TUITION_AND_DORM" && criteria.budget >= MIN_ANNUAL_SELF_SUPPORT_RMB;
    if (!waiverCovers) {
      reasons.push(
        `首年最低费用（约 ${effectiveCost.toLocaleString("zh-CN")} 元）超出预算（${criteria.budget.toLocaleString("zh-CN")} 元），且学生未达全额奖学金门槛，严禁以全奖名义放行`,
      );
    }
  }
  if (!policy.hasOnCampusDorm) {
    warnings.push(policy.dormNote ?? "该校部分项目不提供校内宿舍，须校外租房，首年实际支出将显著增加");
  }
  if (policy.scholarshipRenewalRisk) {
    warnings.push(`续奖年审风险：${policy.scholarshipRenewalRisk}`);
  }

  return {
    eligible: reasons.length === 0,
    assignedBucket: reasons.length === 0 ? assignedBucket : null,
    reasons,
    warnings,
    policy,
  };
}

/**
 * Compliance filter stripping/flagging any illegal off-campus work hints from LLM prose.
 */
export function containsIllegalWorkSuggestion(text: string): boolean {
  return /(?:校外打工|打工赚学费|兼职覆盖学费|一边打工一边读书|校外兼职补贴|合法打工赚钱|半工半读覆盖)/u.test(text);
}

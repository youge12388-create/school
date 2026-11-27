import { classifyScholarshipText, type MatchProgram } from "@/lib/matcher";
import { normalizeKeyword } from "@/lib/utils";

export type AdmissionTier = "REACH" | "TARGET" | "SAFE";
export type AcademicLevel = "EXCELLENT" | "GOOD" | "MEDIUM" | "WEAK" | "POOR";
export type AcademicBand = 1 | 2 | 3 | 4 | 5;

export type StudentAcademicProfile = {
  band: AcademicBand;
  label: "优秀" | "良好" | "中等" | "偏弱" | "弱";
  source: "gpa" | "qualitative";
  scaleUsed: number | null;
};

export type SchoolAdmissionProfile = {
  admissionBand: AcademicBand;
  label: string;
  isPrivateOrIndependent: boolean;
  isCollege: boolean;
  isJuniorCollege: boolean;
};

export type AcademicTierEligibility = {
  eligible: boolean;
  gapBands: number;
  studentBand: StudentAcademicProfile | null;
  schoolBand: SchoolAdmissionProfile;
  reason?: string;
};

export type ScoreBreakdown = {
  total: number;
  fitScore: number;
  prestigeScore: number;
  readinessScore: number;
  coopScore: number;
  tier: AdmissionTier;
  tierReason: string;
  highlights: string[];
  canEnterSafe?: boolean;
  gapBands?: number;
  difficultyIndex?: number;
};

export type RankingCriteria = {
  programType?: string | null;
  teachingLanguage?: string | null;
  targetMajor?: string | null;
  targetMajors?: string[] | null;
  targetSchools?: string[] | null;
  cities?: string[] | null;
  fallbackCities?: string[] | null;
  city?: string | null;
  province?: string | null;
  gpa?: number | null;
  gpaScale?: number | null;
  gradeSystem?: "CN_100" | "GPA_4" | "GPA_5" | "FR_20" | "UK_HONOURS" | "DE_REVERSE" | "CUSTOM" | null;
  academicLevel?: AcademicLevel | null;
  ielts?: number | null;
  toefl?: number | null;
  duolingo?: number | null;
  hskLevel?: number | null;
  hasCsca?: boolean | null;
  plannedExams?: string | null;
  scholarshipType?: string | null;
  excludeSelfFunded?: boolean | null;
  scholarshipPreferences?: string[] | null;
  hasPaperPatent?: string | null;
};

export type RankingEvidencePoint = {
  label: string;
  level: "PASS" | "NEED" | "UNKNOWN";
  text: string;
};

export type RankingProgramContext = {
  schoolName: string;
  schoolTags?: string | null;
  qsRanking?: number | null;
  partnershipRating?: number;
  cooperation: "listed" | "project_confirmed" | "not_cooperating" | "unknown";
  verified?: boolean;
  feeFreshness?: "current" | "historical" | "unknown";
  scholarshipCategory?: string | null;
  scholarshipContent?: string | null;
  majorMatchType?: "exact" | "synonym" | "semantic" | "none";
  isFallbackCity?: boolean;
  points: RankingEvidencePoint[];
  feedbackScore?: number;
  program?: Partial<MatchProgram>;
  requiresGmatOrGre?: boolean;
  supervisorNeed?: boolean;
};

// Authoritative Chinese university classification dictionaries aligned with v3.1 generate_report.py.
// Used when local SQLite tags or external LLM tags are missing/inaccurate so elite universities
// are never misclassified as regular schools and pushed to low-GPA candidates.
export const PROJECT_985_SCHOOLS = new Set([
  "北京大学", "中国人民大学", "清华大学", "北京航空航天大学", "北京理工大学",
  "中国农业大学", "北京师范大学", "中央民族大学", "南开大学", "天津大学",
  "大连理工大学", "东北大学", "吉林大学", "哈尔滨工业大学", "复旦大学",
  "同济大学", "上海交通大学", "华东师范大学", "南京大学", "东南大学",
  "浙江大学", "中国科学技术大学", "厦门大学", "山东大学", "中国海洋大学",
  "武汉大学", "华中科技大学", "湖南大学", "中南大学", "国防科技大学",
  "中山大学", "华南理工大学", "四川大学", "电子科技大学", "重庆大学",
  "西安交通大学", "西北工业大学", "西北农林科技大学", "兰州大学",
]);

export const PROJECT_211_ONLY_SCHOOLS = new Set([
  "北京交通大学", "北京工业大学", "北京科技大学", "北京化工大学", "北京邮电大学",
  "北京林业大学", "北京中医药大学", "北京外国语大学", "中国传媒大学", "中央财经大学",
  "对外经济贸易大学", "北京体育大学", "中央音乐学院", "中国政法大学", "华北电力大学",
  "中国矿业大学", "中国石油大学", "中国地质大学", "北京协和医学院", "河北工业大学",
  "天津医科大学", "太原理工大学", "内蒙古大学", "辽宁大学", "大连海事大学",
  "延边大学", "东北师范大学", "哈尔滨工程大学", "东北农业大学", "东北林业大学",
  "华东理工大学", "东华大学", "上海海洋大学", "上海中医药大学", "上海外国语大学",
  "上海财经大学", "上海大学", "海军军医大学", "第二军医大学", "苏州大学",
  "南京航空航天大学", "南京理工大学", "河海大学", "江南大学", "南京农业大学",
  "中国药科大学", "南京师范大学", "安徽大学", "合肥工业大学", "福州大学",
  "南昌大学", "郑州大学", "武汉理工大学", "华中农业大学", "华中师范大学",
  "中南财经政法大学", "湖南师范大学", "暨南大学", "华南师范大学", "广西大学",
  "海南大学", "西南大学", "西南交通大学", "四川农业大学", "西南财经大学",
  "贵州大学", "云南大学", "西藏大学", "西北大学", "西安电子科技大学",
  "长安大学", "陕西师范大学", "空军军医大学", "第四军医大学", "青海大学",
  "宁夏大学", "新疆大学", "石河子大学",
]);

export const DOUBLE_FIRST_CLASS_EXTRA_SCHOOLS = new Set([
  "中国科学院大学", "南方科技大学", "上海科技大学", "南京信息工程大学", "南京邮电大学",
  "宁波大学", "河南大学", "湘潭大学", "燕山大学", "山西大学", "外交学院",
  "中国社会科学院大学", "广州医科大学", "成都理工大学", "西南石油大学",
  "首都师范大学", "天津工业大学", "天津中医药大学", "上海体育大学", "上海音乐学院",
  "南京林业大学", "南京中医药大学", "中国美术学院", "华南农业大学", "上海纽约大学",
]);

const ELITE_TIER_1 = new Set([
  "清华大学", "北京大学", "复旦大学", "上海交通大学", "浙江大学", "中国科学技术大学",
  "南京大学", "中欧国际工商学院", "CEIBS", "中国人民大学",
]);

const STRONG_985_TIER_2 = new Set([
  ...PROJECT_985_SCHOOLS,
  "北京外国语大学", "外交学院", "中国政法大学", "对外经济贸易大学", "上海财经大学", "中央财经大学",
]);

const STRONG_211_TIER_3 = new Set([
  ...PROJECT_211_ONLY_SCHOOLS,
  "华东政法大学", "上海对外经贸大学", "深圳大学", "北京语言大学", "北京建筑大学",
  "浙江工业大学", "宁波诺丁汉大学", "西交利物浦大学", "上海纽约大学",
]);

const KNOWN_NON_COLLEGE_EXCEPTIONS = [
  "中欧国际工商学院", "外交学院", "中国科学院大学", "中国社会科学院大学",
  "清华大学深圳国际研究生院",
];

const KNOWN_PRIVATE_UNDERGRAD_MARKERS = [
  "西亚斯", "武昌理工", "广州工商", "广州商学院", "南国商学院", "北京城市学院",
  "沈阳城市建设学院", "武汉工程科技学院", "黄河科技学院",
];

export const PARTNER_TIER_RANKS: Record<string, number> = {
  SS: 6,
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  UNRATED: 0.5,
};

export function getPartnerTierRank(tier?: string | null): number {
  const key = String(tier ?? "").trim().toUpperCase();
  if (!key) return 0;
  return PARTNER_TIER_RANKS[key] ?? 0.5;
}

/**
 * Strips parenthetical campus/location suffixes (e.g. "中国石油大学（华东）" -> "中国石油大学")
 * and known branch labels for dictionary lookup while preserving full name elsewhere.
 */
export function normalizeSchoolBaseName(schoolName: string): string {
  const stripped = String(schoolName ?? "")
    .normalize("NFKC")
    .replace(/（[^）]*）|\([^)]*\)/gu, "")
    .replace(/(?:深圳国际研究生院|研究生院|威海校区|珠海校区|深圳校区|苏州校区)$/u, "")
    .replace(/\s+/gu, "")
    .trim();
  return stripped || String(schoolName ?? "").trim();
}

export function isTestPlaceholderSchool(schoolName: string): boolean {
  return /^测试(?:大学|学校|院校)?$/u.test(String(schoolName ?? "").trim());
}

const SCHOOL_ALIAS_GROUPS: string[][] = [
  ["清华大学", "清华", "Tsinghua"],
  ["北京大学", "北大", "Peking University", "PKU"],
  ["复旦大学", "复旦", "Fudan"],
  ["上海交通大学", "上交", "上海交大", "SJTU"],
  ["同济大学", "同济", "Tongji"],
  ["浙江大学", "浙大", "ZJU"],
  ["中欧国际工商学院", "中欧", "中欧CEIBS", "CEIBS"],
  ["华东政法大学", "华政", "ECUPL"],
  ["华东师范大学", "华师大", "ECNU"],
  ["上海外国语大学", "上外", "SISU"],
  ["上海大学", "上大", "SHU"],
  ["上海财经大学", "上财", "SUFE"],
  ["对外经济贸易大学", "对外经贸", "UIBE"],
  ["北京师范大学", "北师大", "BNU"],
  ["北京航空航天大学", "北航", "BUAA"],
  ["北京理工大学", "北理", "BIT"],
  ["北京建筑大学", "北建大", "BUCEA"],
];

function splitSchoolTagTokens(schoolTags?: string | null): Set<string> {
  return new Set(
    (schoolTags ?? "")
      .split(/[，,、；;\s]+/u)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

export function matchesTargetSchoolPool(schoolName: string, targetSchools?: string[] | null): boolean {
  if (!targetSchools?.length) return false;
  const normSchool = normalizeKeyword(schoolName);
  if (!normSchool) return false;
  for (const target of targetSchools) {
    const normTarget = normalizeKeyword(target);
    if (!normTarget) continue;
    if (normSchool.includes(normTarget) || normTarget.includes(normSchool)) return true;
    for (const group of SCHOOL_ALIAS_GROUPS) {
      const normalizedGroup = group.map(normalizeKeyword);
      const schoolHit = normalizedGroup.some((alias) => normSchool.includes(alias) || alias.includes(normSchool));
      const targetHit = normalizedGroup.some((alias) => normTarget.includes(alias) || alias.includes(normTarget));
      if (schoolHit && targetHit) return true;
    }
  }
  return false;
}

/**
 * Excludes vocational/junior colleges and secondary schools when matching
 * Bachelor/Master/PhD degree programs.
 */
export function isJuniorCollegeOrSecondarySchool(schoolName: string, schoolTags?: string | null): boolean {
  const name = schoolName.trim();
  const tags = schoolTags ?? "";
  if (/(?:专科|高职|中专|中职)/u.test(tags)) return true;
  if (/(?:职业技术学院|职业学院|高等专科学校|幼师高等专科|专科学校|技师学院|中等专业学校|职业技术学校|职业学校|旅游学校|工业学校|卫生学校|高级中学|实验中学|中学$)/u.test(name)) {
    return true;
  }
  if (/上海市工商外国语学院|上海市工商外国语学校/u.test(name)) return true;
  if (/外国语学校$/u.test(name) && !/大学/u.test(name)) return true;
  // Undergraduate-level vocational universities ("职业技术大学" / "职业大学") without junior-college tags stay eligible.
  if (/(?:职业技术大学|职业大学)/u.test(name)) return false;
  return false;
}

/**
 * Identifies full-time undergraduate "学院" style institutions (public second-tier
 * colleges, private undergraduate colleges, independent/applied colleges).
 */
export function isUndergraduateCollegeStyle(schoolName: string, schoolTags?: string | null): boolean {
  if (isJuniorCollegeOrSecondarySchool(schoolName, schoolTags)) return false;
  const name = schoolName.trim();
  if (KNOWN_NON_COLLEGE_EXCEPTIONS.some((item) => name.includes(item))) return false;
  const tags = schoolTags ?? "";
  if (/(?:民办|独立学院|应用型|二本)/u.test(tags)) return true;
  if (/学院(?:$|（|\()/u.test(name) && !/大学/u.test(name)) return true;
  return KNOWN_PRIVATE_UNDERGRAD_MARKERS.some((marker) => name.includes(marker));
}

/**
 * Classifies a student's academic band (1=弱 .. 5=优秀) strictly within the
 * student's original grading scale without cross-scale linear conversion.
 */
export function classifyStudentAcademicBand(criteria: Pick<
  RankingCriteria,
  "gpa" | "gpaScale" | "gradeSystem" | "academicLevel" | "programType" | "hasPaperPatent"
>): StudentAcademicProfile | null {
  const labels: Record<AcademicBand, StudentAcademicProfile["label"]> = {
    5: "优秀",
    4: "良好",
    3: "中等",
    2: "偏弱",
    1: "弱",
  };
  let band: AcademicBand | null = null;
  let source: StudentAcademicProfile["source"] = "qualitative";
  let scaleUsed: number | null = null;

  if (criteria.gpa != null && Number.isFinite(criteria.gpa) && criteria.gpa > 0) {
    const gpa = criteria.gpa;
    const rawScale = criteria.gpaScale != null && Number.isFinite(criteria.gpaScale) && criteria.gpaScale > 0
      ? criteria.gpaScale
      : null;
    const scale = rawScale ?? (gpa <= 4.0 ? 4.0 : gpa <= 5.0 ? 5.0 : 100);
    scaleUsed = scale;
    source = "gpa";

    if (criteria.gradeSystem === "DE_REVERSE") {
      // German reverse scale: 1.0 best -> 5.0 fail (1.5 is top T1 / Band 5)
      band = gpa <= 1.5 ? 5 : gpa <= 2.3 ? 4 : gpa <= 3.0 ? 3 : gpa <= 3.7 ? 2 : 1;
    } else if (criteria.gradeSystem === "FR_20" || scale === 20) {
      // French 20-point scale: 14/20 = Bien -> Band 4 (良好)
      band = gpa >= 16 ? 5 : gpa >= 14 ? 4 : gpa >= 12 ? 3 : gpa >= 10 ? 2 : 1;
    } else if (criteria.gradeSystem === "UK_HONOURS") {
      // UK honours: 70%+ First -> Band 5, 60-69% (2:1) -> Band 4
      band = gpa >= 70 ? 5 : gpa >= 60 ? 4 : gpa >= 50 ? 3 : gpa >= 40 ? 2 : 1;
    } else if (scale === 4) {
      band = gpa >= 3.5 ? 5 : gpa >= 3.0 ? 4 : gpa >= 2.5 ? 3 : gpa >= 2.0 ? 2 : 1;
    } else if (scale === 5) {
      band = gpa >= 4.3 ? 5 : gpa >= 3.8 ? 4 : gpa >= 3.2 ? 3 : gpa >= 2.6 ? 2 : 1;
    } else if (scale === 100) {
      band = gpa >= 85 ? 5 : gpa >= 75 ? 4 : gpa >= 65 ? 3 : gpa >= 55 ? 2 : 1;
    } else {
      const ratio = gpa / scale;
      band = ratio >= 0.85 ? 5 : ratio >= 0.75 ? 4 : ratio >= 0.625 ? 3 : ratio >= 0.50 ? 2 : 1;
    }
  } else if (criteria.academicLevel) {
    const map: Record<AcademicLevel, AcademicBand> = {
      EXCELLENT: 5,
      GOOD: 4,
      MEDIUM: 3,
      WEAK: 2,
      POOR: 1,
    };
    band = map[criteria.academicLevel] ?? null;
    source = "qualitative";
  }

  if (band == null) return null;
  if (criteria.programType === "PHD" && criteria.hasPaperPatent === "sci_ei" && band < 5) {
    band = (band + 1) as AcademicBand;
  }
  return { band, label: labels[band], source, scaleUsed };
}

/**
 * Estimates a university's internal admission competitiveness band (1..5, C-grade advisory)
 * for hard mismatch filtering without forging official GPA thresholds.
 */
export function inferSchoolAdmissionBand(
  schoolName: string,
  schoolTags?: string | null,
  qsRanking?: number | null,
): SchoolAdmissionProfile {
  const baseName = normalizeSchoolBaseName(schoolName);
  const tagTokens = splitSchoolTagTokens(schoolTags);
  const tags = schoolTags ?? "";
  const validQs = qsRanking != null && Number.isFinite(qsRanking) && qsRanking > 0 ? qsRanking : null;
  const is985 = tagTokens.has("985") || PROJECT_985_SCHOOLS.has(baseName);
  const is211 = !is985 && (tagTokens.has("211") || PROJECT_211_ONLY_SCHOOLS.has(baseName));
  const isDoubleFirst = tagTokens.has("双一流") || DOUBLE_FIRST_CLASS_EXTRA_SCHOOLS.has(baseName);
  const isJuniorCollege = isJuniorCollegeOrSecondarySchool(schoolName, schoolTags);
  const isCollege = isUndergraduateCollegeStyle(schoolName, schoolTags);
  const isPrivateOrIndependent = /(?:民办|独立学院)/u.test(tags)
    || /(?:民办|独立学院)/u.test(schoolName)
    || KNOWN_PRIVATE_UNDERGRAD_MARKERS.some((marker) => schoolName.includes(marker));
  const isCeibs = /\bceibs\b/i.test(schoolName) || baseName.includes("中欧国际工商学院");

  if (
    ELITE_TIER_1.has(baseName)
    || isCeibs
    || STRONG_985_TIER_2.has(baseName)
    || is985
    || (validQs != null && validQs <= 250)
  ) {
    return { admissionBand: 5, label: "985 / 顶尖名校", isPrivateOrIndependent: false, isCollege: false, isJuniorCollege };
  }
  if (
    STRONG_211_TIER_3.has(baseName)
    || is211
    || isDoubleFirst
    || (validQs != null && validQs <= 600)
  ) {
    return { admissionBand: 4, label: is211 ? "211 / 双一流重点" : "双一流 / 重点高校", isPrivateOrIndependent: false, isCollege: false, isJuniorCollege };
  }
  if (isPrivateOrIndependent) {
    return { admissionBand: 1, label: "民办本科 / 独立应用型院校", isPrivateOrIndependent: true, isCollege: true, isJuniorCollege };
  }
  if (isCollege) {
    return { admissionBand: 2, label: "公办本科院校（学院）", isPrivateOrIndependent: false, isCollege: true, isJuniorCollege };
  }
  return { admissionBand: 3, label: "普通公办本科大学", isPrivateOrIndependent: false, isCollege: false, isJuniorCollege };
}

/**
 * Hard academic-band filter: students whose academic band is >= 2 bands below a
 * school's admission band are eliminated outright and never pushed into Reach.
 */
export function evaluateAcademicTierEligibility(
  criteria: RankingCriteria,
  school: { schoolName: string; schoolTags?: string | null; qsRanking?: number | null },
): AcademicTierEligibility {
  const schoolBand = inferSchoolAdmissionBand(school.schoolName, school.schoolTags, school.qsRanking);
  if (criteria.programType === "LONG_TERM" || criteria.programType === "SHORT_TERM") {
    return { eligible: true, gapBands: 0, studentBand: null, schoolBand };
  }
  const studentBand = classifyStudentAcademicBand(criteria);
  if (!studentBand) {
    return { eligible: true, gapBands: 0, studentBand: null, schoolBand };
  }
  const gapBands = schoolBand.admissionBand - studentBand.band;
  if (gapBands >= 2) {
    return {
      eligible: false,
      gapBands,
      studentBand,
      schoolBand,
      reason: `学生成绩档位（${studentBand.label}）与该校录取档位（${schoolBand.label}）差距较大（内部竞争力评估，evidence_grade=C），不予推荐`,
    };
  }
  return { eligible: true, gapBands, studentBand, schoolBand };
}

/**
 * Returns a 1..5 prestige band (1 = top elite, 5 = regular public/general)
 * and a 0..20 prestige base score for backwards-compatible school ranking cues.
 */
export function inferSchoolPrestige(
  schoolName: string,
  schoolTags?: string | null,
  qsRanking?: number | null,
): { band: 1 | 2 | 3 | 4 | 5; baseScore: number; label: string } {
  const baseName = normalizeSchoolBaseName(schoolName);
  const validQs = qsRanking != null && Number.isFinite(qsRanking) && qsRanking > 0 ? qsRanking : null;
  const tagTokens = splitSchoolTagTokens(schoolTags);
  const is985 = tagTokens.has("985") || PROJECT_985_SCHOOLS.has(baseName);
  const is211 = !is985 && (tagTokens.has("211") || PROJECT_211_ONLY_SCHOOLS.has(baseName));
  const isDoubleFirst = tagTokens.has("双一流") || DOUBLE_FIRST_CLASS_EXTRA_SCHOOLS.has(baseName);
  const isCeibs = /\bceibs\b/i.test(schoolName) || baseName.includes("中欧国际工商学院");

  if (
    ELITE_TIER_1.has(baseName)
    || isCeibs
    || (validQs != null && validQs <= 100)
  ) {
    return { band: 1, baseScore: 20, label: "顶尖名校 / C9 或顶流商学院" };
  }
  if (
    STRONG_985_TIER_2.has(baseName)
    || is985
    || (validQs != null && validQs <= 300)
  ) {
    return { band: 2, baseScore: 17, label: is985 ? "985 / 双一流高校" : "知名重点高校" };
  }
  if (
    STRONG_211_TIER_3.has(baseName)
    || is211
    || (validQs != null && validQs <= 600)
  ) {
    return { band: 3, baseScore: 13, label: is211 ? "211 / 双一流高校" : "一线特色重点高校" };
  }
  if (isDoubleFirst || (validQs != null && validQs <= 1000)) {
    return { band: 4, baseScore: 10, label: "双一流 / 国际上榜高校" };
  }
  return { band: 5, baseScore: 6, label: "普通高校" };
}

/**
 * Normalizes GPA across 4.0, 5.0, and 100-point scales into a 0..100 index
 * for cross-scale advisory competitiveness comparison only (never forged as a threshold).
 */
export function normalizeGpaPercent(gpa?: number | null, gpaScale?: number | null): number | null {
  if (gpa == null || !Number.isFinite(gpa) || gpa <= 0) return null;
  let scale = gpaScale != null && Number.isFinite(gpaScale) && gpaScale > 0 ? gpaScale : null;
  if (scale == null) {
    if (gpa <= 4.0) scale = 4.0;
    else if (gpa <= 5.0) scale = 5.0;
    else scale = 100;
  }
  if (scale <= 0) return null;
  return Math.max(0, Math.min(100, (gpa / scale) * 100));
}

export function assessStudentCompetitiveness(criteria: RankingCriteria) {
  const gpaPercent = normalizeGpaPercent(criteria.gpa, criteria.gpaScale);
  const academic = classifyStudentAcademicBand(criteria);
  const planned = criteria.plannedExams ?? "";
  const plannedIelts = Number(planned.match(/(?:雅思|ielts)[^\d]{0,12}(\d(?:\.\d)?)/iu)?.[1] ?? NaN);
  const effectiveIelts = criteria.ielts ?? (Number.isFinite(plannedIelts) ? plannedIelts : null);
  const hasCurrentEnglish = criteria.ielts != null || criteria.toefl != null || criteria.duolingo != null;
  const hasPlannedEnglish = !hasCurrentEnglish && Number.isFinite(plannedIelts);
  const englishStrong =
    (criteria.ielts != null && criteria.ielts >= 6.5)
    || (criteria.toefl != null && criteria.toefl >= 90)
    || (criteria.duolingo != null && criteria.duolingo >= 115);
  const englishPlannedStrong = !englishStrong && hasPlannedEnglish && plannedIelts >= 6.5;

  let strength = 68;
  if (academic) {
    const baseByBand: Record<AcademicBand, number> = {
      5: 88,
      4: 79,
      3: 68,
      2: 58,
      1: 46,
    };
    strength = baseByBand[academic.band];
    if (gpaPercent != null && gpaPercent >= 92) strength = 90;
  }
  if (criteria.teachingLanguage === "ENGLISH") {
    if (englishStrong) strength += 7;
    else if (englishPlannedStrong) strength += 2;
    else if (!hasCurrentEnglish && !hasPlannedEnglish) strength -= 8;
  }
  if (criteria.scholarshipType === "full") {
    strength -= 6;
  } else if (criteria.excludeSelfFunded) {
    strength -= 3;
  }

  return {
    gpaPercent,
    academicBand: academic?.band ?? null,
    academicLabel: academic?.label ?? null,
    effectiveIelts,
    hasCurrentEnglish,
    hasPlannedEnglish,
    englishStrong,
    englishPlannedStrong,
    strength: Math.max(20, Math.min(98, strength)),
  };
}

export type TierAssignmentOptions = {
  englishNeed?: boolean;
  requiresGmatOrGre?: boolean;
  scholarshipOnly?: boolean;
  hasCscaNeed?: boolean;
  supervisorNeed?: boolean;
  majorMatchType?: "exact" | "synonym" | "semantic" | "none";
  schoolName?: string;
  schoolTags?: string | null;
  qsRanking?: number | null;
};

export function assignAdmissionTier(
  prestigeBand: 1 | 2 | 3 | 4 | 5,
  criteria: RankingCriteria,
  options: TierAssignmentOptions = {},
): { tier: AdmissionTier; reason: string; canEnterSafe: boolean; gapBands: number } {
  const profile = assessStudentCompetitiveness(criteria);
  const difficultyByBand: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 92,
    2: 81,
    3: 69,
    4: 58,
    5: 46,
  };
  let difficulty = difficultyByBand[prestigeBand];
  if (options.requiresGmatOrGre) difficulty += 6;
  if (options.englishNeed) difficulty += 5;
  if (options.hasCscaNeed) difficulty += 3;
  if (options.supervisorNeed) difficulty += 3;
  if (options.scholarshipOnly) difficulty += 3;

  const schoolBand = options.schoolName
    ? inferSchoolAdmissionBand(options.schoolName, options.schoolTags, options.qsRanking).admissionBand
    : ((6 - prestigeBand) as AcademicBand);
  const gapBands = profile.academicBand != null ? schoolBand - profile.academicBand : 0;

  const hasConditionalGap = Boolean(
    gapBands >= 1
    || options.englishNeed
    || options.hasCscaNeed
    || options.supervisorNeed
    || options.requiresGmatOrGre
    || options.majorMatchType === "semantic",
  );
  const canEnterSafe = !hasConditionalGap;

  if (gapBands >= 1) {
    return {
      tier: "REACH",
      canEnterSafe: false,
      gapBands,
      reason: "学生成绩档位略低于该校常规录取档位，需在文书或语言上补强，定位同池冲刺",
    };
  }

  const gap = difficulty - profile.strength;
  if (prestigeBand === 1 && (gap >= 2 || !profile.englishStrong || options.requiresGmatOrGre)) {
    return {
      tier: "REACH",
      canEnterSafe,
      gapBands,
      reason: !profile.hasCurrentEnglish && criteria.teachingLanguage === "ENGLISH"
        ? "顶尖名校且目前缺少语言成绩或高门槛考试，定位冲刺"
        : "顶尖名校竞争激烈，适合作为冲刺目标",
    };
  }
  if (gap >= 10) {
    return {
      tier: "REACH",
      canEnterSafe,
      gapBands,
      reason: options.englishNeed || (!profile.hasCurrentEnglish && criteria.teachingLanguage === "ENGLISH")
        ? "院校门槛较高且需补齐语言/考试成绩，建议作为冲刺档"
        : "院校层级与奖学金竞争度高于当前硬件，建议作为冲刺档",
    };
  }
  if (!canEnterSafe || gap >= -10 || (prestigeBand === 2 && !profile.hasCurrentEnglish && criteria.teachingLanguage === "ENGLISH")) {
    return {
      tier: "TARGET",
      canEnterSafe,
      gapBands,
      reason: !canEnterSafe
        ? "存在需核实或补齐的前置条件，定位稳妥匹配档（不直接作为保底）"
        : profile.gpaPercent != null && profile.gpaPercent >= 85
          ? "学生学术背景有竞争力，与该校录取画像较为匹配"
          : "综合背景与项目门槛契合度较好，适合作为核心匹配档",
    };
  }
  return {
    tier: "SAFE",
    canEnterSafe,
    gapBands,
    reason: "已满足已知主要门槛且竞争相对友好，可作相对低风险保底（非录取保证）",
  };
}

function symmetricPrestigeScore(
  ctx: RankingProgramContext,
  criteria: RankingCriteria,
  prestige: ReturnType<typeof inferSchoolPrestige>,
): number {
  const student = classifyStudentAcademicBand(criteria);
  const schoolBand = inferSchoolAdmissionBand(ctx.schoolName, ctx.schoolTags, ctx.qsRanking);
  let score = prestige.baseScore;

  if (student) {
    if (student.band >= 4) {
      // Strong students focus on 985/211/key universities and down-rank private/low-tier colleges.
      if (schoolBand.admissionBand >= 4) score = Math.max(score, schoolBand.admissionBand === 5 ? 20 : 17);
      else if (schoolBand.admissionBand === 3) score = 11;
      else score = 3;
    } else if (student.band === 3) {
      // Medium students fit best in regular public universities & public/applied colleges.
      if (schoolBand.admissionBand === 3) score = 18;
      else if (schoolBand.admissionBand === 2) score = 16;
      else if (schoolBand.admissionBand === 4) score = 13;
      else score = 9;
    } else {
      // Weak/poor students prioritize regular public colleges & private/applied undergraduate colleges.
      if (schoolBand.admissionBand === 1) score = 18;
      else if (schoolBand.admissionBand === 2) score = 19;
      else if (schoolBand.admissionBand === 3) score = 13;
      else score = 2;
    }
  }

  if (ctx.verified) score += 3;
  if (ctx.feeFreshness === "current") score += 2;
  const unknownCoreCount = ctx.points.filter((p) => p.level === "UNKNOWN" && p.label !== "申请截止").length;
  score -= Math.min(3, unknownCoreCount);
  return Math.max(0, Math.min(25, score));
}

export function scoreCandidate(ctx: RankingProgramContext, criteria: RankingCriteria): ScoreBreakdown {
  const highlights: string[] = [];
  const prestige = inferSchoolPrestige(ctx.schoolName, ctx.schoolTags, ctx.qsRanking);

  // 1. 专业与硬条件贴合度 (0..40)
  let fitScore = 0;
  const majorPoint = ctx.points.find((p) => p.label === "专业");
  if (ctx.majorMatchType === "exact" || majorPoint?.level === "PASS") {
    fitScore += 18;
    highlights.push("专业方向直接命中");
  } else if (ctx.majorMatchType === "synonym") {
    fitScore += 12;
    highlights.push("同类专业方向匹配");
  } else if (ctx.majorMatchType === "semantic" || majorPoint?.level === "NEED") {
    fitScore += 7;
  } else if (!criteria.targetMajor && !criteria.targetMajors?.length) {
    fitScore += 12;
  }

  if (matchesTargetSchoolPool(ctx.schoolName, criteria.targetSchools)) {
    fitScore += 8;
    highlights.push("位于指定院校参考池");
  }

  // City preference affects location fit but never acts as a competition-difficulty penalty.
  const locationPoint = ctx.points.find((p) => p.label === "地区");
  if (locationPoint?.level === "PASS") {
    fitScore += ctx.isFallbackCity ? 4 : 8;
    if (!ctx.isFallbackCity) highlights.push("符合优先城市");
  } else if (!criteria.city && !criteria.province && !criteria.cities?.length) {
    fitScore += 4;
  }

  const degreePass = ctx.points.some((p) => p.label === "申请学历" && p.level === "PASS");
  const langPass = ctx.points.some((p) => p.label === "授课语言" && p.level === "PASS");
  if (degreePass) fitScore += 3;
  if (langPass) fitScore += 3;

  const scholarshipText = [ctx.scholarshipCategory, ctx.scholarshipContent].filter(Boolean).join(" ");
  const scholarshipLevel = classifyScholarshipText(scholarshipText);
  const scholarshipPoint = ctx.points.find((p) => p.label === "奖学金");
  if (scholarshipPoint?.level === "PASS") {
    fitScore += scholarshipPoint.text.includes("匹配：") || scholarshipLevel === "full" ? 4 : 3;
    highlights.push("支持奖学金申请");
  } else if (scholarshipLevel === "full" || scholarshipLevel === "available") {
    fitScore += 2;
  }
  fitScore = Math.max(0, Math.min(40, fitScore));

  // 2. 院校层次对称契合度与资料可信度 (0..25)
  const prestigeScore = symmetricPrestigeScore(ctx, criteria, prestige);
  if (prestige.band <= 2) highlights.push(prestige.label);

  // 3. 学生硬件竞争力与梯度契合度 (0..20)
  const profile = assessStudentCompetitiveness(criteria);
  const englishPoint = ctx.points.find((p) => p.label === "英语");
  const gpaPoint = ctx.points.find((p) => p.label === "GPA");
  const cscaPoint = ctx.points.find((p) => p.label === "CSCA" || p.label === "学校 CSCA 要求");
  const supervisorPoint = ctx.points.find((p) => p.label === "导师接收函");
  let readinessScore = 10;

  if (englishPoint?.level === "PASS") readinessScore += 6;
  else if (profile.hasPlannedEnglish) readinessScore += 4;
  else if (englishPoint?.level === "NEED") readinessScore -= 2;

  if (gpaPoint?.level === "PASS") readinessScore += 4;
  else if (profile.academicBand != null) {
    const schoolBand = inferSchoolAdmissionBand(ctx.schoolName, ctx.schoolTags, ctx.qsRanking).admissionBand;
    const bandDiff = Math.abs(schoolBand - profile.academicBand);
    if (bandDiff === 0) readinessScore += 4;
    else if (bandDiff === 1 && profile.academicBand >= schoolBand) readinessScore += 3;
    else if (bandDiff === 1) readinessScore += 1;
  }

  if (cscaPoint?.level === "PASS") readinessScore += 2;
  else if (cscaPoint?.level === "NEED") readinessScore -= 2;

  readinessScore = Math.max(0, Math.min(20, readinessScore));

  // 4. 合作关系与顾问反馈 (-15..15)
  let coopScore = 0;
  if (ctx.cooperation === "project_confirmed") {
    coopScore += 9;
    highlights.push("合作项目已确认");
  } else if (ctx.cooperation === "listed") {
    coopScore += 6;
    highlights.push("合作院校名单内");
  } else if (ctx.cooperation === "not_cooperating") {
    coopScore -= 12;
  }
  const rating = ctx.partnershipRating ?? 0;
  if (rating > 0 && ctx.cooperation !== "not_cooperating") {
    coopScore += Math.min(3, Math.round((rating / 5) * 3));
  }
  const fb = ctx.feedbackScore ?? 0;
  if (fb > 0) coopScore += 3;
  else if (fb < 0) coopScore -= 8;
  coopScore = Math.max(-15, Math.min(15, coopScore));

  const total = Math.max(
    0,
    Math.min(100, Math.round(fitScore + prestigeScore + readinessScore + Math.max(0, coopScore) - (coopScore < 0 ? Math.abs(coopScore) : 0))),
  );

  const assignment = assignAdmissionTier(prestige.band, criteria, {
    englishNeed: englishPoint?.level === "NEED",
    requiresGmatOrGre: ctx.requiresGmatOrGre,
    scholarshipOnly: Boolean(criteria.excludeSelfFunded || criteria.scholarshipType === "full"),
    hasCscaNeed: cscaPoint?.level === "NEED",
    supervisorNeed: ctx.supervisorNeed ?? supervisorPoint?.level === "NEED",
    majorMatchType: ctx.majorMatchType,
    schoolName: ctx.schoolName,
    schoolTags: ctx.schoolTags,
    qsRanking: ctx.qsRanking,
  });

  // Relative competition index used for within-pool Reach / Target / Safe stratification
  const schoolBand = inferSchoolAdmissionBand(ctx.schoolName, ctx.schoolTags, ctx.qsRanking);
  const hotMajorBonus = /(?:计算机|软件|人工智能|AI|金融|临床|MBA|法学)/iu.test(
    [criteria.targetMajor, ...(criteria.targetMajors ?? []), ctx.program?.majorText].filter(Boolean).join(" "),
  ) ? 2 : 0;
  const difficultyIndex =
    schoolBand.admissionBand * 20
    + (assignment.gapBands * 12)
    + (englishPoint?.level === "NEED" ? 5 : 0)
    + (ctx.requiresGmatOrGre ? 6 : 0)
    + (cscaPoint?.level === "NEED" ? 3 : 0)
    + (scholarshipLevel === "full" ? 3 : 0)
    + hotMajorBonus
    + total * 0.05;

  return {
    total,
    fitScore,
    prestigeScore,
    readinessScore,
    coopScore,
    tier: assignment.tier,
    tierReason: assignment.reason,
    highlights: [...new Set(highlights)].slice(0, 3),
    canEnterSafe: assignment.canEnterSafe,
    gapBands: assignment.gapBands,
    difficultyIndex,
  };
}

/**
 * Performs relative Reach / Match(TARGET) / Safe stratification within the
 * post-filter candidate pool (grouping by unique school), enforcing Safety gates.
 */
export function rebalancePoolTiers<T>(
  items: readonly T[],
  accessors: {
    schoolKeyOf: (item: T) => string;
    schoolNameOf: (item: T) => string;
    schoolTagsOf?: (item: T) => string | null | undefined;
    qsRankingOf?: (item: T) => number | null | undefined;
    scoreOf: (item: T) => number | undefined;
    tierOf: (item: T) => AdmissionTier | undefined;
    canSafeOf: (item: T) => boolean | undefined;
    gapBandsOf: (item: T) => number | undefined;
    difficultyOf: (item: T) => number | undefined;
    applyTier: (item: T, tier: AdmissionTier, reason: string) => T;
  },
): T[] {
  if (!items.length) return [...items];

  const schoolBuckets = new Map<string, T[]>();
  for (const item of items) {
    const key = accessors.schoolKeyOf(item);
    const list = schoolBuckets.get(key);
    if (list) list.push(item);
    else schoolBuckets.set(key, [item]);
  }
  const schoolCount = schoolBuckets.size;
  if (schoolCount <= 1) {
    return items.map((item) => {
      const current = accessors.tierOf(item) ?? "TARGET";
      if (current === "SAFE" && accessors.canSafeOf(item) === false) {
        return accessors.applyTier(item, "TARGET", "存在需核实或补齐的前置条件，暂不列为保底");
      }
      return item;
    });
  }

  type SchoolSummary = {
    key: string;
    difficulty: number;
    bestScore: number;
    gapBands: number;
    canSafe: boolean;
  };

  const summaries: SchoolSummary[] = [...schoolBuckets.entries()].map(([key, bucket]) => {
    const best = [...bucket].sort((a, b) => (accessors.scoreOf(b) ?? 0) - (accessors.scoreOf(a) ?? 0))[0];
    const difficulty = accessors.difficultyOf(best)
      ?? (inferSchoolAdmissionBand(
        accessors.schoolNameOf(best),
        accessors.schoolTagsOf?.(best),
        accessors.qsRankingOf?.(best),
      ).admissionBand * 20 + (accessors.scoreOf(best) ?? 0) * 0.05);
    // Use the best project's gap so a school is stratified by the program that
    // actually represents it; taking the minimum would let one easy program pull
    // the whole school out of Reach.
    const gapBands = accessors.gapBandsOf(best) ?? 0;
    const canSafe = bucket.some((item) => accessors.canSafeOf(item) !== false);
    return {
      key,
      difficulty,
      bestScore: accessors.scoreOf(best) ?? 0,
      gapBands,
      canSafe,
    };
  });

  summaries.sort((a, b) =>
    b.difficulty - a.difficulty
    || b.bestScore - a.bestScore
    || a.key.localeCompare(b.key, "zh-CN"),
  );

  const tierBySchool = new Map<string, { tier: AdmissionTier; reason: string }>();
  if (schoolCount === 2) {
    const [harder, easier] = summaries;
    tierBySchool.set(harder.key, {
      tier: "REACH",
      reason: "同批候选中申请条件相对更高，定位池内冲刺选择",
    });
    tierBySchool.set(easier.key, easier.canSafe
      ? { tier: "SAFE", reason: "同批候选中门槛相对友好，可作相对低风险保底（非录取保证）" }
      : { tier: "TARGET", reason: "门槛相对友好但存在待核实前置条件，定位稳妥匹配档" });
  } else {
    const reachGoal = Math.min(3, Math.floor((schoolCount + 1) / 3));
    const safeGoal = Math.min(3, Math.floor(schoolCount / 3));

    const fixedReach = summaries.filter((s) => s.gapBands >= 1);
    for (const s of fixedReach) {
      tierBySchool.set(s.key, {
        tier: "REACH",
        reason: "学生成绩略低于该校常规录取档位，建议作为同池冲刺选择",
      });
    }

    const remaining = summaries.filter((s) => !tierBySchool.has(s.key));
    const extraReachNeeded = Math.max(0, reachGoal - fixedReach.length);
    for (const s of remaining.slice(0, extraReachNeeded)) {
      tierBySchool.set(s.key, {
        tier: "REACH",
        reason: "综合竞争度居同批候选前列，定位同池择优冲刺档",
      });
    }

    const safeEligibleTail = remaining
      .slice(extraReachNeeded)
      .reverse()
      .filter((s) => s.canSafe);
    for (const s of safeEligibleTail.slice(0, safeGoal)) {
      tierBySchool.set(s.key, {
        tier: "SAFE",
        reason: "已满足已知核心条件且同批竞争相对较低，可作相对低风险保底（非录取保证）",
      });
    }

    for (const s of remaining) {
      if (!tierBySchool.has(s.key)) {
        tierBySchool.set(
          s.key,
          s.canSafe
            ? { tier: "TARGET", reason: "综合竞争度处于候选池中位，核心稳妥匹配档" }
            : { tier: "TARGET", reason: "背景与项目较为匹配（含待补齐或待核实项），定位稳妥匹配档" },
        );
      }
    }
  }

  return items.map((item) => {
    const decision = tierBySchool.get(accessors.schoolKeyOf(item));
    if (!decision) return item;
    if (decision.tier === "SAFE" && accessors.canSafeOf(item) === false) {
      return accessors.applyTier(item, "TARGET", "存在需补齐或待核实前置条件，定位稳妥匹配档");
    }
    return accessors.applyTier(item, decision.tier, decision.reason);
  });
}

/**
 * Selects up to `limit` unique schools from a scored candidate pool.
 * When `preferBalancedTiers` and `strictPerTierQuota` are enabled, takes at most
 * `Math.floor(limit / 3)` (default 3) schools per tier (REACH / TARGET / SAFE)
 * without filling missing tiers from other tiers.
 */
export function selectBalancedCandidates<T>(
  items: readonly T[],
  accessors: {
    keyOf: (item: T) => string;
    scoreOf: (item: T) => number | undefined;
    tierOf: (item: T) => AdmissionTier | undefined;
    blockedOf?: (item: T) => boolean;
  },
  limit: number,
  preferBalancedTiers = true,
  strictPerTierQuota = true,
): T[] {
  const isBlocked = (item: T) => Boolean(accessors.blockedOf?.(item));
  const unique: T[] = [];
  const seen = new Set<string>();
  const sorted = [...items].sort((a, b) => {
    const blockedDiff = Number(isBlocked(a)) - Number(isBlocked(b));
    if (blockedDiff) return blockedDiff;
    return (accessors.scoreOf(b) ?? 0) - (accessors.scoreOf(a) ?? 0);
  });
  for (const item of sorted) {
    const key = accessors.keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  if (!preferBalancedTiers) {
    return unique.slice(0, limit);
  }
  const perTierCap = Math.max(1, Math.floor(limit / 3));
  const picked = new Set<T>();
  const tierOrder: AdmissionTier[] = ["REACH", "TARGET", "SAFE"];
  for (const tier of tierOrder) {
    const bucket = unique.filter((item) => (accessors.tierOf(item) ?? "TARGET") === tier).slice(0, perTierCap);
    for (const item of bucket) picked.add(item);
  }
  if (!strictPerTierQuota) {
    for (const item of unique) {
      if (picked.size >= limit) break;
      picked.add(item);
    }
  }
  const tierRank: Record<AdmissionTier, number> = { REACH: 0, TARGET: 1, SAFE: 2 };
  return [...picked].slice(0, limit).sort((a, b) => {
    const blockedDiff = Number(isBlocked(a)) - Number(isBlocked(b));
    if (blockedDiff) return blockedDiff;
    const tDiff = tierRank[accessors.tierOf(a) ?? "TARGET"] - tierRank[accessors.tierOf(b) ?? "TARGET"];
    if (tDiff) return tDiff;
    return (accessors.scoreOf(b) ?? 0) - (accessors.scoreOf(a) ?? 0);
  });
}

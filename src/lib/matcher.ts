import type { RuleStatus } from "@/lib/constants";
import { DEFAULT_MAJOR_SYNONYMS } from "@/lib/constants";
import { normalizeKeyword } from "@/lib/utils";

export type DeadlineMode = "open" | "unknown" | "expired" | "all";
export type FitLevel = "MATCHED" | "NEEDS_ACTION" | "UNKNOWN" | "NOT_MATCHED";

export type ScreeningCriteria = {
  programType?: string;
  teachingLanguage?: string;
  targetMajor?: string;
  intakeYear?: number | null;
  budget?: number | null;
  hasCsca?: boolean | null;
  gpa?: number | null;
  gpaScale?: number | null;
  hskLevel?: number | null;
  hskScore?: number | null;
  ielts?: number | null;
  toefl?: number | null;
  duolingo?: number | null;
  age?: number | null;
  nationality?: string;
  province?: string;
  city?: string;
  scholarshipRequired?: boolean;
  accommodationRequired?: boolean;
  deadlineFrom?: Date | null;
  deadlineTo?: Date | null;
  deadlineMode?: DeadlineMode;
};

export type MatchProgram = {
  id: string;
  schoolId: string;
  schoolName: string;
  programName: string;
  programType: string;
  teachingLanguage: string;
  majorText: string | null;
  requirementsText: string | null;
  semesterText: string | null;
  applicationTimeText: string | null;
  accommodationText: string | null;
  firstYearCostMax: number | null;
  costIncomplete: boolean;
  cscaStatus: RuleStatus;
  gpaMin: number | null;
  gpaScale: number | null;
  hskLevelMin: number | null;
  hskScoreMin: number | null;
  ieltsMin: number | null;
  toeflMin: number | null;
  duolingoMin: number | null;
  minAge: number | null;
  maxAge: number | null;
  deadlineDate: Date | null;
  deadlineStatus: string;
  scholarshipCategory: string | null;
  province: string | null;
  city: string | null;
  partnershipRating: number;
  qsRanking: number | null;
  reviewStatus: string;
};

type EvidenceLevel = "PASS" | "NEED" | "UNKNOWN" | "FAIL";
export type MatchEvidence = { label: string; level: EvidenceLevel; detail: string };

export type RankedProgram = {
  program: MatchProgram;
  evidence: MatchEvidence[];
  fitLevel: FitLevel;
  score: number;
  effectiveDeadlineStatus: "OPEN" | "EXPIRED" | "UNKNOWN";
};

const FIT_PRIORITY: Record<FitLevel, number> = {
  MATCHED: 0,
  NEEDS_ACTION: 1,
  UNKNOWN: 2,
  NOT_MATCHED: 3,
};

function compareThreshold(
  label: string,
  actual: number | null | undefined,
  required: number | null | undefined,
) {
  if (required == null) return { label, level: "UNKNOWN" as const, detail: "数据库未有相关信息" };
  if (actual == null) return { label, level: "NEED" as const, detail: `需要达到 ${required}` };
  return actual >= required
    ? { label, level: "PASS" as const, detail: `${actual}，达到要求 ${required}` }
    : { label, level: "FAIL" as const, detail: `${actual}，低于要求 ${required}` };
}

function compareExact(label: string, actual: string, expected?: string): MatchEvidence | null {
  if (!expected) return null;
  return actual === expected
    ? { label, level: "PASS", detail: "符合筛选条件" }
    : { label, level: "FAIL", detail: "与筛选条件不一致" };
}

function normalizeLocation(value: string) {
  return normalizeKeyword(value).replace(
    /(壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/u,
    "",
  );
}

function locationMatches(expected: string, actual: string | null) {
  if (!actual) return false;
  const normalizedExpected = normalizeLocation(expected);
  const normalizedActual = normalizeLocation(actual);
  return normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual);
}

export function majorMatches(
  query: string,
  majorText: string | null,
  groups = DEFAULT_MAJOR_SYNONYMS,
) {
  if (!query) return true;
  if (!majorText) return false;
  const normalizedQuery = normalizeKeyword(query);
  const normalizedText = normalizeKeyword(majorText);
  if (normalizedText.includes(normalizedQuery)) return true;
  const related = Object.values(groups).find((keywords) =>
    keywords.some((keyword) => normalizedQuery.includes(normalizeKeyword(keyword))),
  );
  return related
    ? related.some((keyword) => normalizedText.includes(normalizeKeyword(keyword)))
    : false;
}

export function getEffectiveDeadlineStatus(program: MatchProgram, now = new Date()) {
  if (program.deadlineDate) {
    if (!Number.isFinite(program.deadlineDate.getTime())) return "UNKNOWN" as const;
    return program.deadlineDate.getTime() >= now.getTime()
      ? ("OPEN" as const)
      : ("EXPIRED" as const);
  }
  return program.deadlineStatus === "OPEN"
    ? ("OPEN" as const)
    : program.deadlineStatus === "EXPIRED"
      ? ("EXPIRED" as const)
      : ("UNKNOWN" as const);
}

function deadlineMatchesMode(
  status: "OPEN" | "EXPIRED" | "UNKNOWN",
  mode: DeadlineMode | undefined,
) {
  if (!mode || mode === "all") return true;
  if (mode === "open") return status === "OPEN";
  if (mode === "expired") return status === "EXPIRED";
  return status === "UNKNOWN";
}

function deadlineEvidence(
  program: MatchProgram,
  criteria: ScreeningCriteria,
  status: "OPEN" | "EXPIRED" | "UNKNOWN",
) {
  if (
    status === "UNKNOWN" ||
    !program.deadlineDate ||
    !Number.isFinite(program.deadlineDate.getTime())
  ) {
    return { label: "申请截止", level: "UNKNOWN" as const, detail: "数据库未有相关信息" };
  }
  const dateText = program.deadlineDate.toLocaleDateString("zh-CN");
  if (status === "EXPIRED") {
    return { label: "申请截止", level: "FAIL" as const, detail: `已截止 ${dateText}` };
  }
  const time = program.deadlineDate.getTime();
  const from = criteria.deadlineFrom?.getTime();
  const to = criteria.deadlineTo
    ? new Date(criteria.deadlineTo).setHours(23, 59, 59, 999)
    : null;
  if (from != null && time < from) {
    return { label: "申请截止", level: "FAIL" as const, detail: `截止 ${dateText}，早于筛选范围` };
  }
  if (to != null && time > to) {
    return { label: "申请截止", level: "FAIL" as const, detail: `截止 ${dateText}，晚于筛选范围` };
  }
  return { label: "申请截止", level: "PASS" as const, detail: `截止 ${dateText}` };
}

function ageEvidence(program: MatchProgram, age: number | null | undefined): MatchEvidence | null {
  if (age == null) return null;
  if (program.minAge == null && program.maxAge == null) {
    return { label: "年龄", level: "UNKNOWN", detail: "数据库未有相关信息" };
  }
  if (program.minAge != null && age < program.minAge) {
    return { label: "年龄", level: "FAIL", detail: `${age} 岁，低于最低年龄 ${program.minAge} 岁` };
  }
  if (program.maxAge != null && age > program.maxAge) {
    return { label: "年龄", level: "FAIL", detail: `${age} 岁，超过最高年龄 ${program.maxAge} 岁` };
  }
  const range = [
    program.minAge == null ? null : `最低 ${program.minAge} 岁`,
    program.maxAge == null ? null : `最高 ${program.maxAge} 岁`,
  ].filter(Boolean).join("，");
  return { label: "年龄", level: "PASS", detail: `${age} 岁，符合${range}` };
}

function nationalityEvidence(program: MatchProgram, nationality?: string): MatchEvidence | null {
  if (!nationality) return null;
  const requirement = program.requirementsText ?? "";
  if (!requirement) return { label: "国籍", level: "UNKNOWN", detail: "数据库未有相关信息" };
  const requiresForeignNationality = /非中国籍|外国公民|外籍人士|外籍申请人/u.test(requirement);
  if (!requiresForeignNationality) {
    return { label: "国籍", level: "UNKNOWN", detail: "项目未结构化国籍限制，需要人工复核" };
  }
  return /中国/u.test(nationality)
    ? { label: "国籍", level: "FAIL", detail: "项目明确要求非中国籍申请人" }
    : { label: "国籍", level: "PASS", detail: "项目要求外国公民，客户国籍符合" };
}

function intakeYearEvidence(
  program: MatchProgram,
  intakeYear: number | null | undefined,
): MatchEvidence | null {
  if (intakeYear == null) return null;
  const text = [program.semesterText, program.applicationTimeText].filter(Boolean).join(" ");
  if (!text) return { label: "入学年份", level: "UNKNOWN", detail: "数据库未有相关信息" };
  if (text.includes(String(intakeYear))) {
    return { label: "入学年份", level: "PASS", detail: `项目文本包含 ${intakeYear} 年` };
  }
  return {
    label: "入学年份",
    level: "UNKNOWN",
    detail: `未结构化确认 ${intakeYear} 年入学，需要人工复核`,
  };
}

function accommodationEvidence(program: MatchProgram, required?: boolean): MatchEvidence | null {
  if (!required) return null;
  const text = program.accommodationText?.trim();
  if (!text) return { label: "住宿", level: "UNKNOWN", detail: "数据库未有相关信息" };
  if (/不提供住宿|无住宿|校外自行解决/u.test(text)) {
    return { label: "住宿", level: "FAIL", detail: "项目文本明确不提供住宿" };
  }
  return {
    label: "住宿",
    level: "PASS",
    detail: "数据库有住宿信息，具体房型和名额需确认",
  };
}

function englishEvidence(program: MatchProgram, criteria: ScreeningCriteria): MatchEvidence {
  const scores = [
    compareThreshold("雅思", criteria.ielts, program.ieltsMin),
    compareThreshold("托福", criteria.toefl, program.toeflMin),
    compareThreshold("多邻国", criteria.duolingo, program.duolingoMin),
  ];
  if (scores.some((item) => item.level === "PASS")) {
    return { label: "英语", level: "PASS", detail: "至少一项英语成绩达到要求" };
  }
  if (scores.every((item) => item.level === "UNKNOWN")) {
    return { label: "英语", level: "UNKNOWN", detail: "数据库未有相关信息" };
  }
  if (scores.every((item) => item.level === "FAIL")) {
    return { label: "英语", level: "FAIL", detail: "已提供的英语成绩均低于项目要求" };
  }
  return { label: "英语", level: "NEED", detail: "英语成绩需要补充或人工复核" };
}

export function evaluateProgram(
  program: MatchProgram,
  criteria: ScreeningCriteria,
  now = new Date(),
) {
  const evidence: MatchEvidence[] = [];
  const programType = compareExact("申请学历", program.programType, criteria.programType);
  const teachingLanguage = compareExact("授课语言", program.teachingLanguage, criteria.teachingLanguage);
  if (programType) evidence.push(programType);
  if (teachingLanguage) evidence.push(teachingLanguage);

  if (criteria.targetMajor) {
    evidence.push(
      majorMatches(criteria.targetMajor, program.majorText)
        ? { label: "专业", level: "PASS", detail: "专业名称或同义词匹配" }
        : program.majorText
          ? { label: "专业", level: "FAIL", detail: "未找到相关专业" }
          : { label: "专业", level: "UNKNOWN", detail: "数据库未有相关信息" },
    );
  }

  if (criteria.budget != null) {
    evidence.push(
      program.firstYearCostMax == null
        ? { label: "首年预算", level: "UNKNOWN", detail: "数据库未有相关信息" }
        : program.firstYearCostMax <= criteria.budget
          ? {
              label: "首年预算",
              level: program.costIncomplete ? "UNKNOWN" : "PASS",
              detail: program.costIncomplete
                ? `已知费用约 ${program.firstYearCostMax} 元，仍有缺失项`
                : `约 ${program.firstYearCostMax} 元，在预算内`,
            }
          : { label: "首年预算", level: "FAIL", detail: `约 ${program.firstYearCostMax} 元，超过预算` },
    );
  }

  if (program.programType === "UG" && criteria.hasCsca != null) {
    evidence.push(
      criteria.hasCsca
        ? { label: "CSCA", level: "PASS", detail: "客户已有 CSCA" }
        : program.cscaStatus === "NOT_REQUIRED"
          ? { label: "CSCA", level: "PASS", detail: "项目明确不要求" }
          : program.cscaStatus === "REQUIRED"
            ? { label: "CSCA", level: "NEED", detail: "需要补充 CSCA" }
            : { label: "CSCA", level: "UNKNOWN", detail: "数据库未有相关信息" },
    );
  }

  if (criteria.gpa != null) {
    if (program.gpaMin == null || program.gpaScale == null) {
      evidence.push({ label: "GPA", level: "UNKNOWN", detail: "数据库未有相关信息" });
    } else if (criteria.gpaScale !== program.gpaScale) {
      evidence.push({ label: "GPA", level: "UNKNOWN", detail: "计分制不同，需要人工复核" });
    } else {
      evidence.push(compareThreshold("GPA", criteria.gpa, program.gpaMin));
    }
  }

  const needsChineseEvidence =
    program.teachingLanguage === "CHINESE" &&
    (criteria.teachingLanguage === "CHINESE" || criteria.hskLevel != null || criteria.hskScore != null);
  if (needsChineseEvidence) {
    evidence.push(compareThreshold("HSK级别", criteria.hskLevel, program.hskLevelMin));
    if (program.hskScoreMin != null || criteria.hskScore != null) {
      evidence.push(compareThreshold("HSK分数", criteria.hskScore, program.hskScoreMin));
    }
  }

  const hasEnglishScore = criteria.ielts != null || criteria.toefl != null || criteria.duolingo != null;
  if (
    program.teachingLanguage === "ENGLISH" &&
    (criteria.teachingLanguage === "ENGLISH" || hasEnglishScore)
  ) {
    evidence.push(englishEvidence(program, criteria));
  }

  const optionalEvidence = [
    ageEvidence(program, criteria.age),
    nationalityEvidence(program, criteria.nationality),
    intakeYearEvidence(program, criteria.intakeYear),
    accommodationEvidence(program, criteria.accommodationRequired),
  ];
  for (const item of optionalEvidence) if (item) evidence.push(item);

  if (criteria.province || criteria.city) {
    const provinceMatches = !criteria.province || locationMatches(criteria.province, program.province);
    const cityMatches = !criteria.city || locationMatches(criteria.city, program.city);
    const hasLocation = Boolean(program.province || program.city);
    evidence.push(
      !hasLocation
        ? { label: "地区", level: "UNKNOWN", detail: "数据库未有相关信息" }
        : provinceMatches && cityMatches
          ? { label: "地区", level: "PASS", detail: [program.province, program.city].filter(Boolean).join(" · ") }
          : {
              label: "地区",
              level: "FAIL",
              detail: `项目位于 ${[program.province, program.city].filter(Boolean).join(" · ") || "未知地区"}`,
            },
    );
  }

  if (criteria.scholarshipRequired) {
    evidence.push(
      program.scholarshipCategory
        ? { label: "奖学金", level: "PASS", detail: `有奖学金信息：${program.scholarshipCategory}` }
        : { label: "奖学金", level: "UNKNOWN", detail: "数据库未有相关信息" },
    );
  }

  const effectiveDeadlineStatus = getEffectiveDeadlineStatus(program, now);
  evidence.push(deadlineEvidence(program, criteria, effectiveDeadlineStatus));

  const failures = evidence.filter((item) => item.level === "FAIL").length;
  const needs = evidence.filter((item) => item.level === "NEED").length;
  const unknowns = evidence.filter((item) => item.level === "UNKNOWN").length;
  const passes = evidence.filter((item) => item.level === "PASS").length;
  const fitLevel: FitLevel = failures
    ? "NOT_MATCHED"
    : needs
      ? "NEEDS_ACTION"
      : unknowns
        ? "UNKNOWN"
        : "MATCHED";
  const score =
    passes * 20 - failures * 100 - needs * 25 - unknowns * 8 +
    program.partnershipRating * 3 +
    (program.qsRanking ? Math.max(0, 5 - program.qsRanking / 250) : 0) +
    (program.reviewStatus === "VERIFIED" ? 5 : 0);

  return { evidence, fitLevel, score, effectiveDeadlineStatus };
}

export function rankPrograms(
  programs: MatchProgram[],
  criteria: ScreeningCriteria,
  now = new Date(),
): RankedProgram[] {
  return programs
    .map((program) => ({ program, ...evaluateProgram(program, criteria, now) }))
    .filter((result) => deadlineMatchesMode(result.effectiveDeadlineStatus, criteria.deadlineMode))
    .sort((a, b) => {
      if (a.effectiveDeadlineStatus === "EXPIRED" && b.effectiveDeadlineStatus !== "EXPIRED") return 1;
      if (b.effectiveDeadlineStatus === "EXPIRED" && a.effectiveDeadlineStatus !== "EXPIRED") return -1;
      const fitDifference = FIT_PRIORITY[a.fitLevel] - FIT_PRIORITY[b.fitLevel];
      if (fitDifference) return fitDifference;
      const unknownDifference =
        a.evidence.filter((item) => item.level === "UNKNOWN").length -
        b.evidence.filter((item) => item.level === "UNKNOWN").length;
      if (unknownDifference) return unknownDifference;
      return b.score - a.score;
    });
}

import type { RuleStatus } from "@/lib/constants";
import { DEFAULT_MAJOR_SYNONYMS } from "@/lib/constants";
import { normalizeKeyword } from "@/lib/utils";

export type ScreeningCriteria = {
  programType?: string;
  teachingLanguage?: string;
  targetMajor?: string;
  budget?: number | null;
  hasCsca?: boolean | null;
  gpa?: number | null;
  gpaScale?: number | null;
  hskLevel?: number | null;
  hskScore?: number | null;
  ielts?: number | null;
  toefl?: number | null;
  duolingo?: number | null;
  province?: string;
  city?: string;
  scholarshipRequired?: boolean;
  deadlineFrom?: Date | null;
  deadlineTo?: Date | null;
  deadlineMode?: "open" | "unknown" | "expired" | "all";
};

export type MatchProgram = {
  id: string;
  schoolName: string;
  programType: string;
  teachingLanguage: string;
  majorText: string | null;
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

function compareThreshold(label: string, actual: number | null | undefined, required: number | null | undefined) {
  if (required == null) return { label, level: "UNKNOWN" as const, detail: "数据库未有相关信息" };
  if (actual == null) return { label, level: "NEED" as const, detail: `需要达到 ${required}` };
  return actual >= required
    ? { label, level: "PASS" as const, detail: `${actual}，达到要求 ${required}` }
    : { label, level: "FAIL" as const, detail: `${actual}，低于要求 ${required}` };
}

export function majorMatches(query: string, majorText: string | null, groups = DEFAULT_MAJOR_SYNONYMS) {
  if (!query) return true;
  if (!majorText) return false;
  const normalizedQuery = normalizeKeyword(query);
  const normalizedText = normalizeKeyword(majorText);
  if (normalizedText.includes(normalizedQuery)) return true;
  const related = Object.values(groups).find((keywords) =>
    keywords.some((keyword) => normalizedQuery.includes(normalizeKeyword(keyword))),
  );
  return related ? related.some((keyword) => normalizedText.includes(normalizeKeyword(keyword))) : false;
}

function deadlineInRange(program: MatchProgram, criteria: ScreeningCriteria) {
  if (criteria.deadlineMode && criteria.deadlineMode !== "all") {
    if (criteria.deadlineMode === "open" && program.deadlineStatus !== "OPEN") return false;
    if (criteria.deadlineMode === "unknown" && program.deadlineStatus !== "UNKNOWN") return false;
    if (criteria.deadlineMode === "expired" && program.deadlineStatus !== "EXPIRED") return false;
  }
  if (criteria.deadlineFrom || criteria.deadlineTo) {
    if (!program.deadlineDate) return false;
    const time = new Date(program.deadlineDate).getTime();
    if (criteria.deadlineFrom && time < criteria.deadlineFrom.getTime()) return false;
    if (criteria.deadlineTo) {
      const end = new Date(criteria.deadlineTo);
      end.setHours(23, 59, 59, 999);
      if (time > end.getTime()) return false;
    }
  }
  return true;
}

export function evaluateProgram(program: MatchProgram, criteria: ScreeningCriteria) {
  const evidence: MatchEvidence[] = [];

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

  if (program.programType === "UG" && criteria.hasCsca === false) {
    evidence.push(
      program.cscaStatus === "NOT_REQUIRED"
        ? { label: "CSCA", level: "PASS", detail: "明确不要求" }
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

  if (criteria.teachingLanguage === "CHINESE") {
    evidence.push(compareThreshold("HSK级别", criteria.hskLevel, program.hskLevelMin));
    if (program.hskScoreMin != null) evidence.push(compareThreshold("HSK分数", criteria.hskScore, program.hskScoreMin));
  }

  if (criteria.teachingLanguage === "ENGLISH") {
    const english = [
      compareThreshold("雅思", criteria.ielts, program.ieltsMin),
      compareThreshold("托福", criteria.toefl, program.toeflMin),
      compareThreshold("多邻国", criteria.duolingo, program.duolingoMin),
    ];
    if (english.some((item) => item.level === "PASS")) evidence.push({ label: "英语", level: "PASS", detail: "至少一项英语成绩达到要求" });
    else if (english.every((item) => item.level === "UNKNOWN")) evidence.push({ label: "英语", level: "UNKNOWN", detail: "数据库未有相关信息" });
    else evidence.push({ label: "英语", level: "NEED", detail: "英语成绩需要补充或复核" });
  }

  evidence.push(
    program.deadlineStatus === "OPEN"
      ? { label: "申请截止", level: "PASS", detail: program.deadlineDate ? `截止 ${new Date(program.deadlineDate).toLocaleDateString("zh-CN")}` : "当前解析为开放" }
      : program.deadlineStatus === "EXPIRED"
        ? { label: "申请截止", level: "FAIL", detail: program.deadlineDate ? `已截止 ${new Date(program.deadlineDate).toLocaleDateString("zh-CN")}` : "当前批次已截止" }
        : { label: "申请截止", level: "UNKNOWN", detail: "数据库未有相关信息" },
  );

  const failures = evidence.filter((item) => item.level === "FAIL").length;
  const needs = evidence.filter((item) => item.level === "NEED").length;
  const unknowns = evidence.filter((item) => item.level === "UNKNOWN").length;
  const passes = evidence.filter((item) => item.level === "PASS").length;
  const fitLevel = failures ? "NOT_MATCHED" : needs ? "NEEDS_ACTION" : unknowns ? "UNKNOWN" : "MATCHED";
  const score = passes * 20 - failures * 100 - needs * 25 - unknowns * 8 + program.partnershipRating * 3 + (program.qsRanking ? Math.max(0, 5 - program.qsRanking / 250) : 0);

  return { evidence, fitLevel, score };
}

export function rankPrograms(programs: MatchProgram[], criteria: ScreeningCriteria) {
  return programs
    .filter((program) =>
      (!criteria.programType || program.programType === criteria.programType) &&
      (!criteria.teachingLanguage || program.teachingLanguage === criteria.teachingLanguage) &&
      (!criteria.province || program.province === criteria.province) &&
      (!criteria.city || program.city === criteria.city) &&
      (!criteria.scholarshipRequired || Boolean(program.scholarshipCategory)) &&
      deadlineInRange(program, criteria),
    )
    .map((program) => ({ program, ...evaluateProgram(program, criteria) }))
    .sort((a, b) => {
      if (a.program.deadlineStatus === "EXPIRED" && b.program.deadlineStatus !== "EXPIRED") return 1;
      if (b.program.deadlineStatus === "EXPIRED" && a.program.deadlineStatus !== "EXPIRED") return -1;
      return b.score - a.score;
    });
}


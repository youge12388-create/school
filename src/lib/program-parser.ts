import type { RuleStatus } from "@/lib/constants";
import { normalizeKeyword } from "@/lib/utils";

export type MoneyRange = {
  min: number | null;
  max: number | null;
  period: "YEAR" | "SEMESTER" | "MONTH" | "ONE_TIME" | "UNKNOWN";
  annualMax: number | null;
};

export type ParsedProgram = {
  tuition: MoneyRange;
  accommodation: MoneyRange;
  insuranceMax: number | null;
  applicationFeeMax: number | null;
  firstYearCostMax: number | null;
  costIncomplete: boolean;
  cscaStatus: RuleStatus;
  hskLevelMin: number | null;
  hskScoreMin: number | null;
  ieltsMin: number | null;
  toeflMin: number | null;
  duolingoMin: number | null;
  gpaMin: number | null;
  gpaScale: number | null;
  minAge: number | null;
  maxAge: number | null;
  deadlineDate: Date | null;
  deadlineStatus: "OPEN" | "EXPIRED" | "UNKNOWN";
  majors: string[];
  reviewReasons: string[];
};

const numberPattern = /(?:人民币|RMB|￥|¥)?\s*(\d[\d,]*(?:\.\d+)?)/gi;

export function parseMoneyRange(text: string, kind: "tuition" | "other"): MoneyRange {
  const normalized = text.replace(/[，,](?=\d{3}\b)/g, "");
  const values = Array.from(normalized.matchAll(numberPattern))
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value >= 50);

  const period = /每月|\/月|元\/月/.test(text)
    ? "MONTH"
    : /每学期|\/学期|元\/学期/.test(text)
      ? "SEMESTER"
      : /每年|\/年|元\/年|年学费/.test(text)
        ? "YEAR"
        : kind === "other" && values.length
          ? "ONE_TIME"
          : "UNKNOWN";
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const multiplier =
    period === "MONTH" ? 12 : period === "SEMESTER" ? 2 : 1;
  const annualMax = max == null ? null : max * multiplier;

  return { min, max, period, annualMax };
}

function parseRuleStatus(text: string, keyword: RegExp): RuleStatus {
  if (!keyword.test(text)) return "UNKNOWN";
  const negative =
    /(无需|不需要|不要求|可免|免于|豁免).{0,18}/i.test(text) ||
    /(?:CSCA|来华留学本科入学学业水平测试).{0,18}(无需|不需要|不要求|可免|豁免)/i.test(
      text,
    );
  return negative ? "NOT_REQUIRED" : "REQUIRED";
}

function firstNumber(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

export function parseDeadline(text: string, now = new Date()) {
  const matches: Date[] = [];
  const fullDate = /(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})日?/g;
  for (const match of text.matchAll(fullDate)) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      23,
      59,
      59,
    );
    if (!Number.isNaN(date.getTime())) matches.push(date);
  }

  if (!matches.length) {
    const year = now.getFullYear();
    const monthDay = /(\d{1,2})月(\d{1,2})日/g;
    for (const match of text.matchAll(monthDay)) {
      const candidate = new Date(year, Number(match[1]) - 1, Number(match[2]), 23, 59, 59);
      if (candidate < now && candidate.getTime() + 180 * 86400000 < now.getTime()) {
        candidate.setFullYear(year + 1);
      }
      matches.push(candidate);
    }
  }

  if (!matches.length || /待定|另行通知|暂无|未公布/.test(text)) {
    return { date: null, status: "UNKNOWN" as const };
  }
  const date = new Date(Math.max(...matches.map((item) => item.getTime())));
  return {
    date,
    status: date.getTime() >= now.getTime() ? ("OPEN" as const) : ("EXPIRED" as const),
  };
}

export function splitMajors(text: string) {
  return Array.from(
    new Set(
      text
        .split(/[\n；;、]+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 1 && value.length < 100),
    ),
  );
}

export function parseProgram(input: {
  tuitionText: string;
  accommodationText: string;
  insuranceText: string;
  applicationFeeText: string;
  requirementsText: string;
  applicationTimeText: string;
  majorText: string;
  programType: string;
}) {
  const tuition = parseMoneyRange(input.tuitionText, "tuition");
  const accommodation = parseMoneyRange(input.accommodationText, "other");
  const insurance = parseMoneyRange(input.insuranceText, "other");
  const applicationFee = parseMoneyRange(input.applicationFeeText, "other");
  const requirement = input.requirementsText;
  const deadline = parseDeadline(input.applicationTimeText);
  const cscaStatus =
    input.programType === "UG"
      ? parseRuleStatus(
          requirement,
          /CSCA|来华留学本科入学学业水平测试/i,
        )
      : "NOT_REQUIRED";

  const hskLevelMin = firstNumber(requirement, /HSK\s*([1-6])\s*级?/i);
  const hskScoreMin = firstNumber(
    requirement,
    /HSK\s*[1-6]?\s*级?\s*(?:需|达到|成绩|总分|不低于|至少)?\s*(\d{3})/i,
  );
  const ieltsMin = firstNumber(requirement, /(?:IELTS|雅思)[^\d]{0,12}(\d(?:\.\d)?)/i);
  const toeflMin = firstNumber(requirement, /(?:TOEFL|托福)[^\d]{0,12}(\d{2,3})/i);
  const duolingoMin = firstNumber(
    requirement,
    /(?:Duolingo|多邻国)[^\d]{0,12}(\d{2,3})/i,
  );
  const gpaMatch = requirement.match(/GPA[^\d]{0,10}(\d(?:\.\d+)?)\s*\/\s*(\d)/i);
  const averageMatch = requirement.match(
    /(?:平均分|均分|百分制成绩)[^\d]{0,10}(\d{2,3})\s*分?/,
  );
  const ages = Array.from(
    requirement.matchAll(/(?:年满|年龄|不超过|以下|以上)[^\d]{0,8}(\d{1,2})\s*(?:周岁|岁)/g),
  ).map((match) => Number(match[1]));
  const explicitMinAge = firstNumber(requirement, /(?:年满|年龄不低于)\s*(\d{1,2})/);
  const explicitMaxAge = firstNumber(
    requirement,
    /(?:不超过|不满|年龄一般在|年龄)\s*(\d{1,2})\s*(?:周岁|岁)?(?:以下|以内|以)?/,
  );
  const firstYearParts = [
    tuition.annualMax,
    accommodation.annualMax,
    insurance.max,
    applicationFee.max,
  ];
  const firstYearCostMax = firstYearParts.every((value) => value == null)
    ? null
    : firstYearParts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const reviewReasons: string[] = [];

  if (cscaStatus === "UNKNOWN" && input.programType === "UG") {
    reviewReasons.push("本科项目未明确 CSCA 要求");
  }
  if (!deadline.date) reviewReasons.push("申请截止日期无法结构化");
  if (tuition.max == null) reviewReasons.push("学费无法结构化");
  if (!requirement) reviewReasons.push("缺少申请要求");

  return {
    tuition,
    accommodation,
    insuranceMax: insurance.max,
    applicationFeeMax: applicationFee.max,
    firstYearCostMax,
    costIncomplete: firstYearParts.some((value) => value == null),
    cscaStatus,
    hskLevelMin,
    hskScoreMin,
    ieltsMin,
    toeflMin,
    duolingoMin,
    gpaMin: gpaMatch ? Number(gpaMatch[1]) : averageMatch ? Number(averageMatch[1]) : null,
    gpaScale: gpaMatch ? Number(gpaMatch[2]) : averageMatch ? 100 : null,
    minAge: explicitMinAge ?? (ages.length ? Math.min(...ages) : null),
    maxAge: explicitMaxAge ?? (ages.length ? Math.max(...ages) : null),
    deadlineDate: deadline.date,
    deadlineStatus: deadline.status,
    majors: splitMajors(input.majorText),
    reviewReasons,
  } satisfies ParsedProgram;
}

export function findMajorCategory(
  major: string,
  synonymGroups: Record<string, string[]>,
) {
  const normalized = normalizeKeyword(major);
  for (const [category, keywords] of Object.entries(synonymGroups)) {
    if (keywords.some((keyword) => normalized.includes(normalizeKeyword(keyword)))) {
      return category;
    }
  }
  return null;
}

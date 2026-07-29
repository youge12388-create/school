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

const numberPattern = /(?:浜烘皯甯亅RMB|锟楼)?\s*(\d[\d,]*(?:\.\d+)?)/gi;

export function parseMoneyRange(text: string, kind: "tuition" | "other"): MoneyRange {
  const normalized = text.replace(/[锛?](?=\d{3}\b)/g, "");
  const values = Array.from(normalized.matchAll(numberPattern))
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value >= 50);

  const period = /姣忔湀|\/鏈坾鍏僜/鏈?.test(text)
    ? "MONTH"
    : /姣忓鏈焲\/瀛︽湡|鍏僜/瀛︽湡/.test(text)
      ? "SEMESTER"
      : /姣忓勾|\/骞磡鍏僜/骞磡骞村璐?.test(text)
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
  const csca = "(?:CSCA|鏉ュ崕鐣欏鏈鍏ュ瀛︿笟姘村钩娴嬭瘯)";
  const negative = "(?:鏃犻渶|涓嶉渶瑕亅涓嶈姹倈鍙厤|鍏嶄簬|璞佸厤)";
  const nearbyText = "[^\\r\\n銆傦紱;]{0,18}";
  const isExplicitlyNotRequired =
    new RegExp(negative + nearbyText + csca, "i").test(text) ||
    new RegExp(csca + nearbyText + negative, "i").test(text);
  return isExplicitlyNotRequired ? "NOT_REQUIRED" : "REQUIRED";
}

export function parseCscaStatus(requirementsText: string | null | undefined, programType: string): RuleStatus {
  if (programType !== "UG") return "NOT_REQUIRED";
  return parseRuleStatus(
    requirementsText ?? "",
    /CSCA|鏉ュ崕鐣欏鏈鍏ュ瀛︿笟姘村钩娴嬭瘯/i,
  );
}

function firstNumber(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

export function parseDeadline(text: string, now = new Date()) {
  const matches: Date[] = [];
  const year = now.getFullYear();

  // Step 1: full dates with year (e.g. 2026骞?鏈?0鏃?
  const fullDate = /(20\d{2})[骞?/-](\d{1,2})[鏈?/-](\d{1,2})鏃?/g;
  for (const match of text.matchAll(fullDate)) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      23, 59, 59,
    );
    if (!Number.isNaN(date.getTime())) matches.push(date);
  }

  if (!matches.length) {
    const makeDate = (month: number, day: number, forceYear?: number) => {
      const y = forceYear ?? year;
      const candidate = new Date(y, month - 1, day, 23, 59, 59);
      if (candidate < now && candidate.getTime() + 180 * 86400000 < now.getTime()) {
        candidate.setFullYear(y + 1);
      }
      return candidate;
    };

    // Step 2: match ranges (X鏈圶鏃?X鏈圶鏃?, take end dates as deadlines
    const rangePattern = /(\d{1,2})鏈?\d{1,2})鏃s*[-鈥斺€搤鑷冲埌]\s*(\d{1,2})鏈?\d{1,2})鏃?g;
    let remaining = text;
    for (const match of text.matchAll(rangePattern)) {
      const startMonth = Number(match[1]);
      const endMonth = Number(match[3]);
      const endDay = Number(match[4]);
      // cross-year range: end month < start month (e.g. 10鏈?1鏈?鈫?next year)
      const forceYear = endMonth < startMonth ? year + 1 : undefined;
      matches.push(makeDate(endMonth, endDay, forceYear));
      remaining = remaining.replace(match[0], "");
    }

    // Step 3: match standalone month-day dates (not part of ranges)
    const monthDay = /(\d{1,2})鏈?\d{1,2})鏃?g;
    for (const match of remaining.matchAll(monthDay)) {
      matches.push(makeDate(Number(match[1]), Number(match[2])));
    }
  }

  if (!matches.length || /寰呭畾|鍙﹁閫氱煡|鏆傛棤|鏈叕甯?.test(text)) {
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
        .split(/[\n锛?銆乚+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 1 && value.length < 100),
    ),
  );
}

export function parseAgeRequirement(requirementText: string | null | undefined) {
  const requirement = requirementText ?? "";
  const rangeMatch = requirement.match(
    /(?:骞撮緞(?:瑕佹眰|鑼冨洿|涓€鑸??\s*(?:涓簗鍦??\s*)?(\d{1,2})\s*(?:-|鈥攟鈥搢~|鑷硘鍒?\s*(\d{1,2})\s*(?:鍛ㄥ瞾|宀?/u,
  );
  const explicitMinAge = firstNumber(
    requirement,
    /(?:骞存弧|蹇呴』婊椤绘弧|骞撮緞(?:瑕佹眰)?(?:涓嶄綆浜巪涓嶅皯浜巪鑷冲皯))\s*(\d{1,2})\s*(?:鍛ㄥ瞾|宀??/u,
  );
  const suffixMinAge = firstNumber(
    requirement,
    /(\d{1,2})\s*(?:鍛ㄥ瞾|宀?\s*(?:浠ヤ笂|鍙婁互涓?/u,
  );
  const explicitMaxAge = firstNumber(
    requirement,
    /(?:骞撮緞(?:瑕佹眰)?(?:涓嶈秴杩噟涓嶉珮浜巪浣庝簬|灏忎簬)|涓嶈秴杩噟涓嶆弧)\s*(\d{1,2})\s*(?:鍛ㄥ瞾|宀??/u,
  );
  const suffixMaxAge = firstNumber(
    requirement,
    /(\d{1,2})\s*(?:鍛ㄥ瞾|宀?\s*(?:浠ヤ笅|浠ュ唴)/u,
  );

  return {
    minAge: explicitMinAge ?? suffixMinAge ?? (rangeMatch ? Number(rangeMatch[1]) : null),
    maxAge: explicitMaxAge ?? suffixMaxAge ?? (rangeMatch ? Number(rangeMatch[2]) : null),
  };
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
  const cscaStatus = parseCscaStatus(requirement, input.programType);

  const hskLevelMin = firstNumber(requirement, /HSK\s*([1-6])\s*绾?/i);
  const hskScoreMin = firstNumber(
    requirement,
    /HSK\s*[1-6]?\s*绾?\s*(?:闇€|杈惧埌|鎴愮哗|鎬诲垎|涓嶄綆浜巪鑷冲皯)?\s*(\d{3})/i,
  );
  const ieltsMin = firstNumber(requirement, /(?:IELTS|闆呮€?[^\d]{0,12}(\d(?:\.\d)?)/i);
  const toeflMin = firstNumber(requirement, /(?:TOEFL|鎵樼)[^\d]{0,12}(\d{2,3})/i);
  const duolingoMin = firstNumber(
    requirement,
    /(?:Duolingo|澶氶偦鍥?[^\d]{0,12}(\d{2,3})/i,
  );
  const gpaMatch = requirement.match(/GPA[^\d]{0,10}(\d(?:\.\d+)?)\s*\/\s*(\d)/i);
  const averageMatch = requirement.match(
    /(?:骞冲潎鍒唡鍧囧垎|鐧惧垎鍒舵垚缁?[^\d]{0,10}(\d{2,3})\s*鍒?/,
  );
  const ageRequirement = parseAgeRequirement(requirement);
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
    reviewReasons.push("鏈椤圭洰鏈槑纭?CSCA 瑕佹眰");
  }
  if (!deadline.date) reviewReasons.push("鐢宠鎴鏃ユ湡鏃犳硶缁撴瀯鍖?);
  if (tuition.max == null) reviewReasons.push("瀛﹁垂鏃犳硶缁撴瀯鍖?);
  if (!requirement) reviewReasons.push("缂哄皯鐢宠瑕佹眰");

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
    minAge: ageRequirement.minAge,
    maxAge: ageRequirement.maxAge,
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


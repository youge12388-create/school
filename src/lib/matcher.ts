import type { RuleStatus } from "@/lib/constants";
import { DEFAULT_MAJOR_SYNONYMS } from "@/lib/constants";
import { parseAgeRequirement } from "@/lib/program-parser";
import {
  parseProgramSoftRequirements,
  type SoftRequirement,
} from "@/lib/soft-requirements";
import { normalizeKeyword } from "@/lib/utils";


export type DeadlineMode = "open" | "unknown" | "expired" | "all";
export type FitLevel = "MATCHED" | "NEEDS_ACTION" | "UNKNOWN" | "NOT_MATCHED";
export type SchoolTier = "985" | "211" | "double_first_class_only" | "double_non";
export type SupervisorAcceptanceMode = "required" | "not_required" | "unknown";
export type SupervisorAcceptanceStatus = RuleStatus | "PARTIAL_REQUIRED";

export type ScreeningCriteria = {
  programType?: string;
  teachingLanguage?: string;
  targetMajor?: string;
  schoolTier?: SchoolTier;
  schoolQuery?: string;
  intakeYear?: number | null;
  budget?: number | null;
  cscaStatus?: RuleStatus | null;
  gpa?: number | null;
  gpaScale?: number | null;
  hskLevel?: number | null;
  hskScore?: number | null;
  ielts?: number | null;
  toefl?: number | null;
  duolingo?: number | null;
  age?: number | null;
  hasPaperPatent?: string | null;
  hasCompetition?: string | null;
  nationality?: string;
  province?: string;
  city?: string;
  scholarshipType?: string; // "full" | "any" | "none"
  accommodationRequired?: boolean;
  supervisorAcceptance?: SupervisorAcceptanceMode | null;
  enrollmentRegion?: string;
  deadlineFrom?: Date | null;
  deadlineTo?: Date | null;
  deadlineMode?: DeadlineMode;
};

export type MatchProgram = {
  id: string;
  schoolId: string;
  schoolName: string;
  schoolTags: string | null;
  programName: string;
  programType: string;
  teachingLanguage: string;
  majorText: string | null;
  requirementsText: string | null;
  sourceText: string | null;
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

const SCHOOL_TIERS = ["985", "211", "double_first_class_only", "double_non"] as const;

export function parseSchoolTier(value?: string): SchoolTier | undefined {
  return SCHOOL_TIERS.includes(value as SchoolTier)
    ? (value as SchoolTier)
    : undefined;
}

export function matchesSchoolTier(
  tags: string | null | undefined,
  tier: SchoolTier | undefined,
) {
  if (!tier) return true;

  const schoolTags = new Set(
    (tags ?? "")
      .split(/[锛?銆侊紱;\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
  const has985 = schoolTags.has("985");
  const has211 = schoolTags.has("211");
  const hasDoubleFirstClass = schoolTags.has("鍙屼竴娴?);

  if (tier === "985") return has985;
  if (tier === "211") return has211 && !has985;
  if (tier === "double_first_class_only") {
    return hasDoubleFirstClass && !has985 && !has211;
  }
  return !has985 && !has211 && !hasDoubleFirstClass;
}



/** 妫€娴嬬敓婧愬湴鎷涚敓鍋忓ソ */
const ENROLLMENT_REGIONS = /闈炲窞|涓滃崡浜殀涓簹|鍗椾簹|闈炴床|鎷夌編|涓笢|涓滄|涓€甯︿竴璺瘄娆犲彂杈緗宸村熀鏂潶|鍗板害|瀛熷姞鎷墊淇勭綏鏂瘄澶ф磱娲瞸缂呯敻|鑿插緥瀹緗濮斿唴鐟炴媺|濉斿悏鍏媩鍦熷簱鏇紎闃垮瘜姹梶鏈濋矞|闊╁浗|瓒婂崡|娉板浗|椹潵瑗夸簹|鍗板害灏艰タ浜殀鍗板反|鏂潶|灏兼棩鍒╀簹/u;
export function getEnrollmentRegionPreference(program: MatchProgram): "HAS_PREFERENCE" | "NO_PREFERENCE" {
  const text = (program.requirementsText ?? "") + (program.sourceText ?? "");
  if (!ENROLLMENT_REGIONS.test(text)) return "NO_PREFERENCE";
  // 鏄庣‘鎷涚敓鍋忓ソ锛氭嫑/涓嶆嫑/寮€鏀?闄愬埗 + 鍦板尯锛堣法琛屽尮閰嶏級
  if (/(涓?鎷泑涓?寮€鏀緗鑰冭檻|闄愬埗|鍊惧悜|渚ч噸|鍋忓悜|鍙嫑|宸叉嫑|鎺ㄨ崘|榧撳姳)[\s\S]{0,200}(闈炲窞|涓滃崡浜殀涓簹|鍗椾簹|闈炴床|鎷夌編|涓笢|涓滄|涓€甯︿竴璺瘄娆犲彂杈緗宸村熀鏂潶|鍗板害|瀛熷姞鎷墊淇勭綏鏂瘄澶ф磱娲?/u.test(text)) return "HAS_PREFERENCE";
  if (/(闈炲窞|涓滃崡浜殀涓簹|鍗椾簹|闈炴床|鎷夌編|涓笢|涓滄|涓€甯︿竴璺瘄娆犲彂杈緗宸村熀鏂潶|鍗板害|瀛熷姞鎷墊淇勭綏鏂瘄澶ф磱娲?[\s\S]{0,50}(涓?鎷泑涓?寮€鏀緗鑰冭檻|闄愬埗|涓嶅|涓嶄簣)/u.test(text)) return "HAS_PREFERENCE";
  // 鎷涚敓瀵硅薄 + 鍦板尯
  if (/(闈㈠悜|閽堝|浼樺厛|鎷涚敓瀵硅薄|鍥藉埆|鐢熸簮|鐢熸簮鍦?[\s\S]{0,100}(闈炲窞|涓滃崡浜殀涓簹|鍗椾簹|闈炴床|鎷夌編|涓笢|涓滄|涓€甯︿竴璺瘄娆犲彂杈?/u.test(text)) return "HAS_PREFERENCE";
  // 閲嶇偣闈㈠悜鐣欏鐢?  if (/(涓昏|閲嶇偣)[\s\S]{0,30}(鎷涙敹|闈㈠悜)[\s\S]{0,30}(鐣欏鐢焲鍥介檯瀛︾敓)/u.test(text)) return "HAS_PREFERENCE";
  return "NO_PREFERENCE";
}export function schoolNameMatches(schoolName: string, query?: string) {
  if (!query) return true;
  return normalizeKeyword(schoolName).includes(normalizeKeyword(query));
}

function compareThreshold(
  label: string,
  actual: number | null | undefined,
  required: number | null | undefined,
) {
  if (required == null) return { label, level: "UNKNOWN" as const, detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? };
  if (actual == null) return { label, level: "NEED" as const, detail: `闇€瑕佽揪鍒?${required}` };
  return actual >= required
    ? { label, level: "PASS" as const, detail: `${actual}锛岃揪鍒拌姹?${required}` }
    : { label, level: "FAIL" as const, detail: `${actual}锛屼綆浜庤姹?${required}` };
}

function compareExact(label: string, actual: string, expected?: string): MatchEvidence | null {
  if (!expected) return null;
  return actual === expected
    ? { label, level: "PASS", detail: "绗﹀悎绛涢€夋潯浠? }
    : { label, level: "FAIL", detail: "涓庣瓫閫夋潯浠朵笉涓€鑷? };
}

function normalizeLocation(value: string) {
  return normalizeKeyword(value).replace(
    /(澹棌鑷不鍖簗鍥炴棌鑷不鍖簗缁村惥灏旇嚜娌诲尯|鑷不鍖簗鐗瑰埆琛屾斂鍖簗鐪亅甯?$/u,
    "",
  );
}

function locationMatches(expected: string, actual: string | null) {
  if (!actual) return false;
  const normalizedExpected = normalizeLocation(expected);
  const normalizedActual = normalizeLocation(actual);
  return normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual);
}

export type MajorMatchResult = {
  matched: boolean;
  matchType: "exact" | "synonym" | "none";
  synonymKeyword?: string;
};

export function majorMatches(
  query: string,
  majorText: string | null,
  groups = DEFAULT_MAJOR_SYNONYMS,
): MajorMatchResult {
  if (!query) return { matched: true, matchType: "exact" };
  if (!majorText) return { matched: false, matchType: "none" };
  const normalizedQuery = normalizeKeyword(query);
  const normalizedText = normalizeKeyword(majorText);
  if (normalizedText.includes(normalizedQuery)) {
    return { matched: true, matchType: "exact" };
  }
  for (const keywords of Object.values(groups)) {
    const queryHit = keywords.find((k) => normalizedQuery.includes(normalizeKeyword(k)));
    if (queryHit) {
      const textHit = keywords.find((k) => normalizedText.includes(normalizeKeyword(k)));
      if (textHit) {
        return { matched: true, matchType: "synonym", synonymKeyword: textHit };
      }
    }
  }
  return { matched: false, matchType: "none" };
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
    return { label: "鐢宠鎴", level: "UNKNOWN" as const, detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? };
  }
  const dateText = program.deadlineDate.toLocaleDateString("zh-CN");
  // 浼樺厛灞曠ず鍘熷鏂囨湰锛岃寖鍥存牸寮忥紙X鏈圶鏃?X鏈圶鏃ワ級姣旇В鏋愭棩鏈熸洿鐩磋
  const rawText = program.applicationTimeText?.trim();
  const detailSuffix = rawText ? ` (${rawText})` : "";

  if (status === "EXPIRED") {
    const hasDeadlineFilter = criteria.deadlineFrom != null || criteria.deadlineTo != null || (criteria.deadlineMode && criteria.deadlineMode !== "all");
    if (!hasDeadlineFilter) {
      return { label: "鐢宠鎴", level: "NEED" as const, detail: `宸叉埅姝?${dateText}锛岄渶纭鏄惁浠嶅彲鐢宠${detailSuffix}` };
    }
    return { label: "鐢宠鎴", level: "FAIL" as const, detail: `宸叉埅姝?${dateText}${detailSuffix}` };
  }
  const time = program.deadlineDate.getTime();
  const from = criteria.deadlineFrom?.getTime();
  const to = criteria.deadlineTo
    ? new Date(criteria.deadlineTo).setHours(23, 59, 59, 999)
    : null;
  if (from != null && time < from) {
    return { label: "鐢宠鎴", level: "FAIL" as const, detail: `鎴 ${dateText}锛屾棭浜庣瓫閫夎寖鍥?{detailSuffix}` };
  }
  if (to != null && time > to) {
    return { label: "鐢宠鎴", level: "FAIL" as const, detail: `鎴 ${dateText}锛屾櫄浜庣瓫閫夎寖鍥?{detailSuffix}` };
  }
  return { label: "鐢宠鎴", level: "PASS" as const, detail: `鎴 ${dateText}${detailSuffix}` };
}

function ageEvidence(program: MatchProgram, age: number | null | undefined): MatchEvidence | null {
  if (age == null) return null;
  const parsedAge = parseAgeRequirement(program.requirementsText);
  const hasParsedAge = parsedAge.minAge != null || parsedAge.maxAge != null;
  const minAge = hasParsedAge ? parsedAge.minAge : program.minAge;
  const maxAge = hasParsedAge ? parsedAge.maxAge : program.maxAge;
  if (minAge == null && maxAge == null) {
    return { label: "骞撮緞", level: "UNKNOWN", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? };
  }
  if (minAge != null && age < minAge) {
    return { label: "骞撮緞", level: "FAIL", detail: `${age} 宀侊紝浣庝簬鏈€浣庡勾榫?${minAge} 宀乣 };
  }
  if (maxAge != null && age > maxAge) {
    return { label: "骞撮緞", level: "FAIL", detail: `${age} 宀侊紝瓒呰繃鏈€楂樺勾榫?${maxAge} 宀乣 };
  }
  const range = [
    minAge == null ? null : `鏈€浣?${minAge} 宀乣,
    maxAge == null ? null : `鏈€楂?${maxAge} 宀乣,
  ].filter(Boolean).join("锛?);
  return { label: "骞撮緞", level: "PASS", detail: `${age} 宀侊紝绗﹀悎${range}` };
}

function nationalityEvidence(program: MatchProgram, nationality?: string): MatchEvidence | null {
  if (!nationality) return null;
  const requirement = program.requirementsText ?? "";
  if (!requirement) return { label: "鍥界睄", level: "UNKNOWN", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? };
  const requiresForeignNationality = /闈炰腑鍥界睄|澶栧浗鍏皯|澶栫睄浜哄＋|澶栫睄鐢宠浜?u.test(requirement);
  if (!requiresForeignNationality) {
    return { label: "鍥界睄", level: "UNKNOWN", detail: "椤圭洰鏈粨鏋勫寲鍥界睄闄愬埗锛岄渶瑕佷汉宸ュ鏍? };
  }
  return /涓浗/u.test(nationality)
    ? { label: "鍥界睄", level: "FAIL", detail: "椤圭洰鏄庣‘瑕佹眰闈炰腑鍥界睄鐢宠浜? }
    : { label: "鍥界睄", level: "PASS", detail: "椤圭洰瑕佹眰澶栧浗鍏皯锛屽鎴峰浗绫嶇鍚? };
}

function intakeYearEvidence(
  program: MatchProgram,
  intakeYear: number | null | undefined,
): MatchEvidence | null {
  if (intakeYear == null) return null;
  const text = [program.semesterText, program.applicationTimeText].filter(Boolean).join(" ");
  if (!text) return { label: "鍏ュ骞翠唤", level: "UNKNOWN", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? };
  if (text.includes(String(intakeYear))) {
    return { label: "鍏ュ骞翠唤", level: "PASS", detail: `椤圭洰鏂囨湰鍖呭惈 ${intakeYear} 骞碻 };
  }
  return {
    label: "鍏ュ骞翠唤",
    level: "UNKNOWN",
    detail: `鏈粨鏋勫寲纭 ${intakeYear} 骞村叆瀛︼紝闇€瑕佷汉宸ュ鏍竊,
  };
}

function accommodationEvidence(program: MatchProgram, required?: boolean): MatchEvidence | null {
  if (!required) return null;
  const text = program.accommodationText?.trim();
  if (!text) return { label: "浣忓", level: "UNKNOWN", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? };
  if (/涓嶆彁渚涗綇瀹縷鏃犱綇瀹縷鏍″鑷瑙ｅ喅/u.test(text)) {
    return { label: "浣忓", level: "FAIL", detail: "椤圭洰鏂囨湰鏄庣‘涓嶆彁渚涗綇瀹? };
  }
  return {
    label: "浣忓",
    level: "PASS",
    detail: "鏁版嵁搴撴湁浣忓淇℃伅锛屽叿浣撴埧鍨嬪拰鍚嶉闇€纭",
  };
}

const supervisorAcceptanceRequiredPattern =
  /(瀵煎笀.{0,24}(鎺ユ敹鍑絴鎺ュ彈鍑絴鍚屾剰鍑絴鎺ユ敹鎰忓悜鍑絴鎺ュ彈鎰忓悜鍑絴閭€璇峰嚱|鎰忓悜琛▅鍚屾剰鎺ユ敹|鍚屾剰鎺ュ彈|瀹℃牳鎺ユ敹|瀹℃牳閫氳繃|鎺ユ敹纭|鎺ュ彈纭)|鎺ユ敹瀵煎笀|鎺ュ彈瀵煎笀|閫夋嫨瀵煎笀.{0,20}瀹℃牳閫氳繃|鎰忓悜瀵煎笀鎺ㄨ崘淇supervisor.{0,30}(acceptance|approval|consent|invitation)|advisor.{0,30}(acceptance|approval|consent|invitation)|adviser.{0,30}(acceptance|approval|consent|invitation)|(acceptance|invitation) letter.{0,30}(supervisor|advisor|adviser)|pre[-\s]?(acceptance|approval).{0,30}(supervisor|advisor|adviser))/iu;

const supervisorAcceptanceNotRequiredPattern =
  /((涓嶉渶瑕亅鏃犻渶|鏃犻』|涓嶇敤|涓嶈姹倈鍏?.{0,12}(瀵煎笀|鎺ユ敹鍑絴鎺ュ彈鍑絴鍚屾剰鍑?|(瀵煎笀|鎺ユ敹鍑絴鎺ュ彈鍑絴鍚屾剰鍑?.{0,12}(涓嶉渶瑕亅鏃犻渶|鏃犻』|涓嶇敤|涓嶈姹倈闈炲繀闇€|闈炲繀椤?|no need.{0,30}(supervisor|advisor|adviser|acceptance letter)|not required.{0,30}(supervisor|advisor|adviser|acceptance letter))/iu;

const supervisorAcceptancePartialScopePattern =
  /(閮ㄥ垎|鎸囧畾|涓埆|鐩稿叧).{0,12}(瀛﹂櫌|闄㈢郴|涓撲笟|椤圭洰)|(浠ヤ笅|涓婅堪).{0,12}(瀛﹂櫌|闄㈢郴|涓撲笟|椤圭洰)|鍏朵粬.{0,12}(瀛﹂櫌|闄㈢郴|涓撲笟|椤圭洰)|(瀛﹂櫌|闄㈢郴).{0,40}(蹇呴』|椤粅闇€瑕亅瑕佹眰).{0,40}(瀵煎笀|鎺ユ敹鍑絴鎺ュ彈鍑絴鍚屾剰鍑?/iu;

function splitRequirementSegments(text: string) {
  return text
    .split(/[銆傦紱;\n\r]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function hasPartialSupervisorAcceptanceScope(text: string) {
  return supervisorAcceptancePartialScopePattern.test(text);
}

export function getSupervisorAcceptanceStatus(program: MatchProgram): SupervisorAcceptanceStatus {
  const text = [program.requirementsText, program.sourceText]
    .filter(Boolean)
    .join("\\n");
  if (!text.trim()) return "UNKNOWN";

  const segments = splitRequirementSegments(text);
  const requiredSegments = segments.filter(
    (segment) =>
      supervisorAcceptanceRequiredPattern.test(segment) &&
      !supervisorAcceptanceNotRequiredPattern.test(segment),
  );
  const notRequiredSegments = segments.filter((segment) =>
    supervisorAcceptanceNotRequiredPattern.test(segment),
  );

  if (requiredSegments.length) {
    return notRequiredSegments.length ||
      requiredSegments.some(hasPartialSupervisorAcceptanceScope)
      ? "PARTIAL_REQUIRED"
      : "REQUIRED";
  }

  const hasRequiredText = supervisorAcceptanceRequiredPattern.test(text);
  const hasNotRequiredText = supervisorAcceptanceNotRequiredPattern.test(text);
  if (hasRequiredText && hasNotRequiredText) {
    return hasPartialSupervisorAcceptanceScope(text)
      ? "PARTIAL_REQUIRED"
      : "NOT_REQUIRED";
  }
  if (hasRequiredText) return "REQUIRED";
  if (hasNotRequiredText) return "NOT_REQUIRED";
  return "UNKNOWN";
}

function supervisorAcceptanceEvidence(
  program: MatchProgram,
  mode?: SupervisorAcceptanceMode | null,
): MatchEvidence | null {
  if (!mode) return null;

  const status = getSupervisorAcceptanceStatus(program);
  if (mode === "required") {
    return status === "REQUIRED"
      ? { label: "瀵煎笀鎺ユ敹鍑?, level: "PASS", detail: "瀛︽牎鐢宠鏉′欢鏄庣‘瑕佹眰瀵煎笀鎺ユ敹鍑? }
      : status === "PARTIAL_REQUIRED"
        ? { label: "瀵煎笀鎺ユ敹鍑?, level: "NEED", detail: "閮ㄥ垎瀛﹂櫌鎴栦笓涓氳姹傚甯堟帴鏀跺嚱锛岄渶纭鐩爣涓撲笟" }
        : status === "NOT_REQUIRED"
        ? { label: "瀵煎笀鎺ユ敹鍑?, level: "FAIL", detail: "瀛︽牎鐢宠鏉′欢鏄庣‘涓嶈姹傚甯堟帴鏀跺嚱" }
        : { label: "瀵煎笀鎺ユ敹鍑?, level: "FAIL", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? };
  }

  if (mode === "not_required") {
    return status === "NOT_REQUIRED"
      ? { label: "瀵煎笀鎺ユ敹鍑?, level: "PASS", detail: "瀛︽牎鐢宠鏉′欢鏄庣‘涓嶈姹傚甯堟帴鏀跺嚱" }
      : status === "REQUIRED"
        ? { label: "瀵煎笀鎺ユ敹鍑?, level: "FAIL", detail: "瀛︽牎鐢宠鏉′欢鏄庣‘瑕佹眰瀵煎笀鎺ユ敹鍑? }
        : status === "PARTIAL_REQUIRED"
          ? { label: "瀵煎笀鎺ユ敹鍑?, level: "FAIL", detail: "閮ㄥ垎瀛﹂櫌鎴栦笓涓氳姹傚甯堟帴鏀跺嚱" }
          : { label: "瀵煎笀鎺ユ敹鍑?, level: "FAIL", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? };
  }

  return status === "UNKNOWN"
    ? { label: "瀵煎笀鎺ユ敹鍑?, level: "PASS", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? }
    : status === "REQUIRED"
      ? { label: "瀵煎笀鎺ユ敹鍑?, level: "FAIL", detail: "瀛︽牎鐢宠鏉′欢鏄庣‘瑕佹眰瀵煎笀鎺ユ敹鍑? }
      : status === "PARTIAL_REQUIRED"
        ? { label: "瀵煎笀鎺ユ敹鍑?, level: "FAIL", detail: "閮ㄥ垎瀛﹂櫌鎴栦笓涓氳姹傚甯堟帴鏀跺嚱" }
        : { label: "瀵煎笀鎺ユ敹鍑?, level: "FAIL", detail: "瀛︽牎鐢宠鏉′欢鏄庣‘涓嶈姹傚甯堟帴鏀跺嚱" };
}

function englishEvidence(program: MatchProgram, criteria: ScreeningCriteria): MatchEvidence {
  const scores = [
    compareThreshold("闆呮€?, criteria.ielts, program.ieltsMin),
    compareThreshold("鎵樼", criteria.toefl, program.toeflMin),
    compareThreshold("澶氶偦鍥藉垎鏁?, criteria.duolingo, program.duolingoMin),
  ];
  if (scores.some((item) => item.level === "PASS")) {
    return { label: "鑻辫", level: "PASS", detail: "鑷冲皯涓€椤硅嫳璇垚缁╄揪鍒拌姹? };
  }
  if (scores.every((item) => item.level === "UNKNOWN")) {
    return { label: "鑻辫", level: "UNKNOWN", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? };
  }
  if (scores.every((item) => item.level === "FAIL")) {
    return { label: "鑻辫", level: "FAIL", detail: "宸叉彁渚涚殑鑻辫鎴愮哗鍧囦綆浜庨」鐩姹? };
  }
  return { label: "鑻辫", level: "NEED", detail: "鑻辫鎴愮哗闇€瑕佽ˉ鍏呮垨浜哄伐澶嶆牳" };
}


function paperPatentEvidence(
  actual: string | null | undefined,
  requirement: SoftRequirement,
): MatchEvidence | null {
  if (!actual) return null;
  if (actual === "sci_ei" && requirement.hasSCI) {
    return { label: "璁烘枃/涓撳埄鎴愭灉", level: "PASS", detail: "瀹㈡埛鏈塖CI/EI璁烘枃锛屽尮閰嶅鏍CI/EI瑕佹眰锛屾洿鍏风珵浜夊姏" };
  }
  if (requirement.status === "UNKNOWN") {
    return { label: "璁烘枃/涓撳埄鎴愭灉", level: "PASS", detail: "鐭ヨ瘑搴撴湭鎻愬強璁烘枃/涓撳埄瑕佹眰锛屼笉褰卞搷鐢虫姤" };
  }
  const isRequired = requirement.status === "REQUIRED";
  if (isRequired && actual === "general") {
    if (requirement.hasSCI) {
      return { label: "璁烘枃/涓撳埄鎴愭灉", level: "PASS", detail: "瀛︽牎瑕佹眰SCI/EI璁烘枃锛屽鎴锋湁鏅€氳鏂囧彲灏濊瘯鐢虫姤" };
    }
    return { label: "璁烘枃/涓撳埄鎴愭灉", level: "PASS", detail: "瀛︽牎瑕佹眰璁烘枃/涓撳埄锛屽鎴锋湁鐩稿叧鎴愭灉鍙敵鎶? };
  }
  if (isRequired && actual === "sci_ei") {
    return { label: "璁烘枃/涓撳埄鎴愭灉", level: "PASS", detail: "瀛︽牎瑕佹眰璁烘枃/涓撳埄锛屽鎴锋湁SCI/EI绾у埆鏇村叿浼樺娍" };
  }
  if (actual === "general") {
    return { label: "璁烘枃/涓撳埄鎴愭灉", level: "PASS", detail: "瀹㈡埛鏈夎鏂?涓撳埄锛屽彲浣滀负杈呭姪鏉愭枡鎻愪氦" };
  }
  return { label: "璁烘枃/涓撳埄鎴愭灉", level: "PASS", detail: "瀹㈡埛鏈塖CI/EI绾у埆璁烘枃/涓撳埄锛岀珵浜夊姏寮? };
}

function competitionEvidence(
  actual: string | null | undefined,
  requirement: SoftRequirement,
): MatchEvidence | null {
  if (!actual) return null;
  if (requirement.status === "UNKNOWN") {
    return { label: "绔炶禌/绐佸嚭琛ㄧ幇", level: "PASS", detail: "鐭ヨ瘑搴撴湭鎻愬強鐩稿叧鏉′欢锛屼笉褰卞搷鐢虫姤" };
  }
  const isRequired = requirement.status === "REQUIRED";
  const isPreferred = requirement.status === "PREFERRED";
  // 瀹㈡埛鍙湁閫氱敤绔炶禌缁忓巻锛屼絾椤圭洰瑕佹眰鐗瑰畾绾у埆
  if (isRequired && actual === "competition" && requirement.level === "national") {
    return { label: "绔炶禌缁忓巻", level: "FAIL", detail: "椤圭洰瑕佹眰鑷冲皯杈惧埌鍥藉绾х珵璧? };
  }
  if (isRequired && actual === "competition" && requirement.level === "provincial") {
    return { label: "绔炶禌缁忓巻", level: "FAIL", detail: "椤圭洰瑕佹眰鑷冲皯杈惧埌鐪佺骇绔炶禌" };
  }
  if (isRequired) {
    return { label: "绔炶禌/绐佸嚭琛ㄧ幇", level: "PASS", detail: "瀛︽牎瑕佹眰/璁ゅ彲绔炶禌鎴栫獊鍑鸿〃鐜帮紝瀹㈡埛绗﹀悎鏉′欢绔炰簤鍔涙洿寮? };
  }
  if (isPreferred) {
    return { label: "绔炶禌/绐佸嚭琛ㄧ幇", level: "PASS", detail: "瀛︽牎榧撳姳鎴栦紭鍏堣€冭檻绔炶禌/绐佸嚭琛ㄧ幇锛屽鎴锋湁浼樺娍" };
  }
  return { label: "绔炶禌/绐佸嚭琛ㄧ幇", level: "PASS", detail: "瀛︽牎鎻愬強绔炶禌/鑾峰鏉愭枡锛屽彲浣滀负杈呭姪鏉愭枡鎻愪氦" };
}


export function evaluateProgram(
  program: MatchProgram,
  criteria: ScreeningCriteria,
  now = new Date(),
) {
  const evidence: MatchEvidence[] = [];
  const programType = compareExact("鐢宠瀛﹀巻", program.programType, criteria.programType);
  const teachingLanguage = compareExact("鎺堣璇█", program.teachingLanguage, criteria.teachingLanguage);
  if (programType) evidence.push(programType);
  if (teachingLanguage) evidence.push(teachingLanguage);

  if (criteria.targetMajor) {
    const match = majorMatches(criteria.targetMajor, program.majorText);
    if (match.matchType === "exact") {
      evidence.push({ label: "涓撲笟", level: "PASS", detail: "鏈夊尮閰嶇殑涓撲笟" });
    } else if (match.matchType === "synonym") {
      evidence.push({ label: "涓撲笟", level: "NEED", detail: "鍙兘鍚岀被鐨勪笓涓? + (match.synonymKeyword ? "锛堝懡涓璡"" + match.synonymKeyword + "\"锛? : "") });
    } else if (program.majorText) {
      evidence.push({ label: "涓撲笟", level: "FAIL", detail: "鏈壘鍒扮浉鍏充笓涓? });
    } else {
      evidence.push({ label: "涓撲笟", level: "UNKNOWN", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? });
    }
  }

  if (criteria.budget != null) {
    evidence.push(
      program.firstYearCostMax == null
        ? { label: "棣栧勾棰勭畻", level: "UNKNOWN", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? }
        : program.firstYearCostMax <= criteria.budget
          ? {
              label: "棣栧勾棰勭畻",
              level: program.costIncomplete ? "UNKNOWN" : "PASS",
              detail: program.costIncomplete
                ? `宸茬煡璐圭敤绾?${program.firstYearCostMax} 鍏冿紝浠嶆湁缂哄け椤筦
                : `绾?${program.firstYearCostMax} 鍏冿紝鍦ㄩ绠楀唴`,
            }
          : { label: "棣栧勾棰勭畻", level: "FAIL", detail: `绾?${program.firstYearCostMax} 鍏冿紝瓒呰繃棰勭畻` },
    );
  }

  if (criteria.cscaStatus != null) {
    evidence.push(
      program.cscaStatus === "REQUIRED"
        ? { label: "CSCA", level: "PASS", detail: "闄㈡牎闇€瑕? }
        : program.cscaStatus === "NOT_REQUIRED"
          ? { label: "CSCA", level: "PASS", detail: "闄㈡牎涓嶉渶瑕? }
          : { label: "CSCA", level: "UNKNOWN", detail: "淇℃伅鏈爣鏄? },
    );
  }

  if (criteria.gpa != null) {
    if (program.gpaMin == null || program.gpaScale == null) {
      evidence.push({ label: "GPA", level: "UNKNOWN", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? });
    } else if (criteria.gpaScale !== program.gpaScale) {
      evidence.push({ label: "GPA", level: "UNKNOWN", detail: "璁″垎鍒朵笉鍚岋紝闇€瑕佷汉宸ュ鏍? });
    } else {
      evidence.push(compareThreshold("GPA", criteria.gpa, program.gpaMin));
    }
  }

  const needsChineseEvidence =
    program.teachingLanguage === "CHINESE" &&
    (criteria.teachingLanguage === "CHINESE" || criteria.hskLevel != null || criteria.hskScore != null);
  if (needsChineseEvidence) {
    evidence.push(compareThreshold("HSK绾у埆", criteria.hskLevel, program.hskLevelMin));
    if (program.hskScoreMin != null || criteria.hskScore != null) {
      evidence.push(compareThreshold("HSK鍒嗘暟", criteria.hskScore, program.hskScoreMin));
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
    supervisorAcceptanceEvidence(program, criteria.supervisorAcceptance),
  ];
  for (const item of optionalEvidence) if (item) evidence.push(item);

  if (criteria.province || criteria.city) {
    const provinceMatches = !criteria.province || locationMatches(criteria.province, program.province);
    const cityMatches = !criteria.city || locationMatches(criteria.city, program.city);
    const hasLocation = Boolean(program.province || program.city);
    evidence.push(
      !hasLocation
        ? { label: "鍦板尯", level: "UNKNOWN", detail: "鏁版嵁搴撴湭鏈夌浉鍏充俊鎭? }
        : provinceMatches && cityMatches
          ? { label: "鍦板尯", level: "PASS", detail: [program.province, program.city].filter(Boolean).join(" 路 ") }
          : {
              label: "鍦板尯",
              level: "FAIL",
              detail: `椤圭洰浣嶄簬 ${[program.province, program.city].filter(Boolean).join(" 路 ") || "鏈煡鍦板尯"}`,
            },
    );
  }

  if (criteria.schoolTier) {
    const tierLabels: Record<SchoolTier, string> = {
      "985": "985",
      "211": "211",
      double_first_class_only: "鍙屼竴娴?,
      double_non: "鍙岄潪鏅€氶櫌鏍?,
    };
    const matches = matchesSchoolTier(program.schoolTags, criteria.schoolTier);
    evidence.push(
      matches
        ? { label: "闄㈡牎灞傛", level: "PASS" as const, detail: `瀛︽牎灞炰簬 ${tierLabels[criteria.schoolTier]}` }
        : { label: "闄㈡牎灞傛", level: "FAIL" as const, detail: `瀛︽牎涓嶅睘浜?${tierLabels[criteria.schoolTier]}` },
    );
  }

  if (criteria.enrollmentRegion === "no_preference") {
    const pref = getEnrollmentRegionPreference(program);
    evidence.push(
      pref === "NO_PREFERENCE"
        ? { label: "鐢熸簮鍦板亸濂?, level: "PASS" as const, detail: "椤圭洰鏃犵敓婧愬湴鎷涚敓鍋忓ソ" }
        : { label: "鐢熸簮鍦板亸濂?, level: "FAIL" as const, detail: "椤圭洰鏈夌敓婧愬湴鎷涚敓鍋忓ソ" },
    );
  }

  if (criteria.scholarshipType) {
    const cat = program.scholarshipCategory ?? "";
    const isFull = /鍏ㄩ|鍏ㄥ|瀹屽叏|full/i.test(cat);
    const hasAny = cat.length > 0;
    if (criteria.scholarshipType === "full") {
      evidence.push(
        isFull
          ? { label: "濂栧閲?, level: "PASS", detail: `鍏ㄩ濂栧閲戯細${cat}` }
          : hasAny
            ? { label: "濂栧閲?, level: "NEED", detail: `闈炲叏棰濆瀛﹂噾锛?{cat}` }
            : { label: "濂栧閲?, level: "FAIL", detail: "鏁版嵁搴撴湭鏈夊瀛﹂噾淇℃伅" },
      );
    } else if (criteria.scholarshipType === "any") {
      evidence.push(
        hasAny
          ? { label: "濂栧閲?, level: "PASS", detail: `鏈夊瀛﹂噾锛?{cat}` }
          : { label: "濂栧閲?, level: "FAIL", detail: "鏁版嵁搴撴湭鏈夊瀛﹂噾淇℃伅" },
      );
    } else if (criteria.scholarshipType === "none") {
      evidence.push(
        !hasAny
          ? { label: "濂栧閲?, level: "PASS", detail: "璇ラ」鐩棤濂栧閲戯紙鑷垂锛? }
          : { label: "濂栧閲?, level: "NEED", detail: `璇ラ」鐩湁濂栧閲戜俊鎭細${cat}` },
      );
    }
  }

  
  const softRequirements = parseProgramSoftRequirements(program.requirementsText);
  const softEvidence = [
    paperPatentEvidence(criteria.hasPaperPatent, softRequirements.paperPatent),
    competitionEvidence(criteria.hasCompetition, softRequirements.competition),
  ];
  for (const item of softEvidence) if (item) evidence.push(item);

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
    .filter((program) => schoolNameMatches(program.schoolName, criteria.schoolQuery))
    .filter((program) => matchesSchoolTier(program.schoolTags, criteria.schoolTier))
    .filter((program) => criteria.cscaStatus == null || program.cscaStatus === criteria.cscaStatus)
    .map((program) => ({ program, ...evaluateProgram(program, criteria, now) }))
    .filter((result) =>
      criteria.enrollmentRegion === "no_preference"
        ? getEnrollmentRegionPreference(result.program) === "NO_PREFERENCE"
        : true,
    )
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


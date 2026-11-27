import { TextDecoder } from "node:util";
import type { ChatCriteria } from "@/lib/ai-screening";
import type { ExternalProgramItem } from "@/lib/ai-screening-external";
import {
  batchUpsertFactEntries,
  getCachedSchoolUrls,
  upsertSchoolUrls,
  type FactDegreeLevel,
  type FactProgramEntry,
  type FactScholarshipEntry,
  type FactSchoolUpsertInput,
  type FactTuitionBasis,
} from "@/lib/university-fact-db";

const JOINT_UNIVERSITY_DOMAINS = [
  "nottingham.edu.cn",
  "xjtlu.edu.cn",
  "cuhk.edu.cn",
  "uic.edu.cn",
  "wku.edu.cn",
  "gtiit.edu.cn",
  "dukekunshan.edu.cn",
  "nyu.edu",
  "ceibs.edu",
];

const CHALLENGE_PATTERN = /(?:captcha|turnstile|recaptcha|hcaptcha|verify you are human|安全验证|人机验证|访问受限|请开启\s*javascript)/iu;
const FABRICATION_WORD_PATTERN = /^(?:约|参考|需确认|需核实|估计|大概|通常|预期|可能为|应为)/u;

export function isAllowedOfficialAcademicUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local")) return false;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
    if (host.endsWith(".edu.cn")) return true;
    return JOINT_UNIVERSITY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export type OfficialPageFetchResult =
  | { status: "ok"; finalUrl: string; title: string; excerpt: string; detectedYears: number[] }
  | { status: "dead"; finalUrl: string; httpStatus: number }
  | { status: "challenge_blocked"; finalUrl: string }
  | { status: "error"; finalUrl: string; reason: string };

function decodeHtmlBuffer(bytes: Uint8Array, contentType: string): string {
  const charsetMatch = contentType.match(/charset=([\w-]+)/i);
  const declared = charsetMatch?.[1]?.toLowerCase() ?? "";
  if (declared.includes("gb")) {
    try {
      return new TextDecoder("gb18030").decode(bytes);
    } catch {
      // Fallback to utf-8 below.
    }
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (/charset=(?:gb2312|gbk|gb18030)/i.test(utf8.slice(0, 1200))) {
    try {
      return new TextDecoder("gb18030").decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function stripHtmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
  const title = (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim();
  const body = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<\/?(?:p|div|li|tr|h[1-6]|br|td|th)[^>]*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text: body };
}

export async function fetchOfficialPageExcerpt(
  rawUrl: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<OfficialPageFetchResult> {
  if (!isAllowedOfficialAcademicUrl(rawUrl)) {
    return { status: "error", finalUrl: rawUrl, reason: "非合法官网域名" };
  }
  const fetchFn = options.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 5_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  try {
    const response = await fetchFn(rawUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; SchoolSytOfficialVerifier/3.1)",
      },
    });
    const finalUrl = response.url || rawUrl;
    if (!isAllowedOfficialAcademicUrl(finalUrl)) {
      await response.body?.cancel().catch(() => {});
      return { status: "error", finalUrl, reason: "重定向离开允许的官网域名" };
    }
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel().catch(() => {});
      return { status: "dead", finalUrl, httpStatus: response.status };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { status: "error", finalUrl, reason: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/(?:text\/html|text\/plain|application\/xhtml\+xml)/i.test(contentType) && contentType) {
      await response.body?.cancel().catch(() => {});
      return { status: "ok", finalUrl, title: finalUrl.split("/").pop() ?? "官方文件", excerpt: "", detectedYears: [] };
    }

    const rawBuf = new Uint8Array(await response.arrayBuffer());
    const sliced = rawBuf.byteLength > 512 * 1024 ? rawBuf.slice(0, 512 * 1024) : rawBuf;
    const html = decodeHtmlBuffer(sliced, contentType);
    const { title, text } = stripHtmlToText(html);

    if (CHALLENGE_PATTERN.test(title) || (text.length < 400 && CHALLENGE_PATTERN.test(text))) {
      return { status: "challenge_blocked", finalUrl };
    }

    const years = [...new Set((`${title} ${text.slice(0, 4000)}`.match(/\b20(?:2[4-9]|3[0-5])\b/g) ?? []).map(Number))].sort();
    return {
      status: "ok",
      finalUrl,
      title,
      excerpt: text.slice(0, 2500),
      detectedYears: years,
    };
  } catch (err) {
    return {
      status: "error",
      finalUrl: rawUrl,
      reason: err instanceof Error ? err.message : "请求失败",
    };
  }
}

function mapCriteriaDegree(programType?: string | null): FactDegreeLevel {
  if (programType === "UG") return "bachelor";
  if (programType === "PHD") return "phd";
  if (programType === "LONG_TERM" || programType === "SHORT_TERM") return "language";
  return "master";
}

function mapCriteriaLang(teachingLanguage?: string | null): string {
  return teachingLanguage === "CHINESE" ? "chinese" : "english";
}

function parseTuitionNumeric(item: ExternalProgramItem): {
  tuition: number | null;
  status: "published" | "free" | "not_published";
  basis: FactTuitionBasis;
} {
  if (item.tuitionAmount != null && Number.isFinite(item.tuitionAmount)) {
    if (item.tuitionAmount === 0) {
      return { tuition: 0, status: "free", basis: item.tuitionBasis ?? "per_year" };
    }
    return { tuition: Math.round(item.tuitionAmount), status: "published", basis: item.tuitionBasis ?? "per_year" };
  }
  const txt = String(item.tuitionText ?? "").trim();
  if (!txt || FABRICATION_WORD_PATTERN.test(txt) || /未公布|不详|待定|未知/u.test(txt)) {
    return { tuition: null, status: "not_published", basis: "unknown" };
  }
  const match = txt.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(万)?/u);
  if (!match) return { tuition: null, status: "not_published", basis: "unknown" };
  const value = Math.round(Number(match[1]) * (match[2] ? 10000 : 1));
  if (!Number.isFinite(value) || value <= 0) return { tuition: null, status: "not_published", basis: "unknown" };
  const basis: FactTuitionBasis = /总计|全程|total/iu.test(txt)
    ? "total_program"
    : /学期|semester/iu.test(txt)
      ? "per_semester"
      : "per_year";
  return { tuition: value, status: "published", basis };
}

function splitScholarshipKeys(summary: string, sourceUrl: string, dataYear: number | null): Record<string, FactScholarshipEntry> {
  const out: Record<string, FactScholarshipEntry> = {};
  const parts = summary
    .split(/[、，,;；/]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 28);
  const candidates = parts.length ? parts.slice(0, 4) : (summary.trim() ? ["院校及政府奖学金"] : []);
  for (const key of candidates) {
    if (key.includes("/") && key.length > 8) continue;
    const isFull = /全额|全奖|CSC|中国政府|MOFCOM|商务部|A类|学费全免/iu.test(key + " " + summary);
    out[key] = {
      type: isFull ? "full" : "partial",
      data_year: dataYear,
      verification_status: dataYear ? "verified" : "needs_recheck",
      source_url: sourceUrl,
    };
  }
  return out;
}

function inferIecRoot(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/`;
  } catch {
    return "";
  }
}

export type OfficialSchoolVerifyEvent = {
  schoolName: string;
  url: string | null;
  status: "checking" | "verified" | "dead" | "blocked" | "skipped";
  year?: number | null;
  note?: string;
};

export type SchoolVerifyOutcome = {
  verifiedUrl: string | null;
  detectedYears: number[];
  pageExcerpt: string;
  blockedByChallenge: boolean;
  newlyDead: string[];
};

/**
 * Resolves the candidate official URLs for a school by unioning every program's
 * declared links with the cached official URLs, skipping known dead links.
 */
function candidateUrlsForSchool(
  items: readonly ExternalProgramItem[],
  cache: ReturnType<typeof getCachedSchoolUrls>[string],
): string[] {
  const deadSet = new Set(cache && cache.status !== "miss" ? cache.dead_urls : []);
  const cached = cache && cache.status !== "miss"
    ? [cache.admission_url, cache.program_url, cache.iec_url]
    : [];
  const declared = items.flatMap((item) => [item.officialUrl, ...(item.sourceUrls ?? [])]);
  return [...new Set([...declared, ...cached].filter((u): u is string => Boolean(u && isAllowedOfficialAcademicUrl(u) && !deadSet.has(u))))];
}

/**
 * Verifies one school's official pages once and reuses the result for every
 * program of that school. A school is retried with a second URL only when the
 * first one is a hard 404, never when the site gates access with a challenge.
 */
async function verifySchoolOfficialPages(
  schoolName: string,
  items: readonly ExternalProgramItem[],
  cache: ReturnType<typeof getCachedSchoolUrls>[string],
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    onSchoolVerify?: (event: OfficialSchoolVerifyEvent) => void;
  },
): Promise<SchoolVerifyOutcome> {
  const urlsToTry = candidateUrlsForSchool(items, cache).slice(0, 2);
  const newlyDead: string[] = [];
  let blockedByChallenge = false;
  let verifiedUrl: string | null = null;
  let detectedYears: number[] = [];
  let pageExcerpt = "";

  if (urlsToTry.length > 0) {
    options.onSchoolVerify?.({
      schoolName,
      url: urlsToTry[0],
      status: "checking",
      note: "正在直连核验官网",
    });
  } else {
    options.onSchoolVerify?.({
      schoolName,
      url: items[0]?.officialUrl ?? null,
      status: "skipped",
      note: "无白名单官网链接",
    });
  }

  for (const url of urlsToTry) {
    const res = await fetchOfficialPageExcerpt(url, { fetchImpl: options.fetchImpl, signal: options.signal });
    if (res.status === "ok") {
      verifiedUrl = res.finalUrl;
      detectedYears = res.detectedYears;
      pageExcerpt = res.excerpt;
      break;
    }
    if (res.status === "dead") {
      newlyDead.push(url);
    } else if (res.status === "challenge_blocked") {
      blockedByChallenge = true;
      break;
    }
  }

  if (!verifiedUrl && urlsToTry.length > 0) {
    options.onSchoolVerify?.({
      schoolName,
      url: urlsToTry[0],
      status: blockedByChallenge ? "blocked" : newlyDead.length > 0 ? "dead" : "skipped",
      note: blockedByChallenge ? "站点开启访问验证，已跳过" : newlyDead.length > 0 ? "页面失效(404)" : "访问超时或受限",
    });
  }

  return { verifiedUrl, detectedYears, pageExcerpt, blockedByChallenge, newlyDead };
}

export async function verifyAndPersistExternalPrograms(
  programs: ExternalProgramItem[],
  criteria: ChatCriteria,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    factDbPath?: string;
    maxConcurrent?: number;
    onSchoolVerify?: (event: OfficialSchoolVerifyEvent) => void;
  } = {},
): Promise<{
  verifiedPrograms: ExternalProgramItem[];
  persistedSchools: number;
  persistedPrograms: number;
  deadUrlsRecorded: number;
}> {
  if (!programs.length) {
    return { verifiedPrograms: [], persistedSchools: 0, persistedPrograms: 0, deadUrlsRecorded: 0 };
  }

  const targetYear = criteria.intakeYear ?? new Date().getFullYear();

  // Group by school first: one school costs one page fetch no matter how many
  // programs it contributed, so every program can be covered instead of only
  // the first `maxConcurrent` items.
  const groups = new Map<string, ExternalProgramItem[]>();
  for (const program of programs) {
    const list = groups.get(program.schoolName);
    if (list) list.push(program);
    else groups.set(program.schoolName, [program]);
  }
  const schoolEntries = [...groups.entries()];
  const cachedUrls = getCachedSchoolUrls(schoolEntries.map(([name]) => name), 6, options.factDbPath);

  let deadUrlsRecorded = 0;
  const outcomes = new Map<string, SchoolVerifyOutcome>();

  // Bounded-concurrency worker pool over schools rather than slicing the list,
  // so later schools are still verified instead of being passed through unverified.
  const limit = Math.max(1, Math.floor(options.maxConcurrent ?? 6));
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, schoolEntries.length) }, async () => {
    while (cursor < schoolEntries.length) {
      const current = cursor;
      cursor += 1;
      const [schoolName, items] = schoolEntries[current];
      const outcome = await verifySchoolOfficialPages(schoolName, items, cachedUrls[schoolName], options);
      if (outcome.newlyDead.length > 0) {
        deadUrlsRecorded += outcome.newlyDead.length;
        upsertSchoolUrls(
          {
            schoolName,
            deadUrls: outcome.newlyDead,
            city: items[0]?.city,
            tier: items[0]?.schoolNature ?? undefined,
            iecUrl: outcome.verifiedUrl ? inferIecRoot(outcome.verifiedUrl) : undefined,
          },
          options.factDbPath,
        );
      }
      outcomes.set(schoolName, outcome);
    }
  });
  await Promise.all(workers);

  // Keyed by the caller's own program object so duplicate school+program names
  // can never collapse into one entry, and the original order is preserved.
  const verifiedByProgram = new Map<ExternalProgramItem, ExternalProgramItem>();
  const upsertEntries: FactSchoolUpsertInput[] = [];

  for (const [schoolName, items] of schoolEntries) {
    const outcome = outcomes.get(schoolName);
    const verifiedUrl = outcome?.verifiedUrl ?? null;
    const detectedYears = outcome?.detectedYears ?? [];
    const pageExcerpt = outcome?.pageExcerpt ?? "";
    const newlyDead = outcome?.newlyDead ?? [];
    const factPrograms: FactProgramEntry[] = [];
    const schoolFacts: FactSchoolUpsertInput = {
      school_name: schoolName,
      city: items[0]?.city,
      tier: items[0]?.schoolNature ?? undefined,
      data_year: undefined,
      urls: {
        iec_url: inferIecRoot(verifiedUrl ?? ""),
        admission_url: verifiedUrl ?? "",
        verified_at: new Date().toISOString().slice(0, 10),
        ...(newlyDead.length ? { dead_urls: newlyDead } : {}),
      },
      programs: factPrograms,
    };
    let anyYear: number | null = null;

    for (const item of items) {
      if (!verifiedUrl) {
        verifiedByProgram.set(item, { ...item, officialVerified: false });
        continue;
      }

      const inferredYear = item.dataYear
        ?? (detectedYears.includes(targetYear)
          ? targetYear
          : detectedYears.length
            ? detectedYears[detectedYears.length - 1]
            : null);
      anyYear ??= inferredYear;

      const hasTargetYearOnPage = inferredYear === targetYear;
      const evidenceGrade: "A" | "B" | "C" = hasTargetYearOnPage && item.languageRequirement && !/待|参考|以官网/u.test(item.languageRequirement)
        ? "A"
        : "B";

      const nextItem: ExternalProgramItem = {
        ...item,
        officialUrl: verifiedUrl,
        sourceUrls: [...new Set([verifiedUrl, ...(item.sourceUrls ?? []).filter((u) => !newlyDead.includes(u))])],
        officialVerified: true,
        groundedBySearch: true,
        dataYear: inferredYear ?? item.dataYear ?? null,
        evidenceGrade: item.evidenceGrade ?? evidenceGrade,
      };

      const tuitionInfo = parseTuitionNumeric(nextItem);
      const cleanDeadline = nextItem.deadline && !FABRICATION_WORD_PATTERN.test(nextItem.deadline)
        ? nextItem.deadline
        : "";
      const cleanLangNote = nextItem.languageRequirement && !FABRICATION_WORD_PATTERN.test(nextItem.languageRequirement)
        ? nextItem.languageRequirement
        : "以当年官网简章为准";

      // Build neutral factual entry compliant with db_manager anti-pollution rules.
      const factProg: FactProgramEntry = {
        major: nextItem.programName,
        degrees: [mapCriteriaDegree(criteria.programType)],
        language: mapCriteriaLang(criteria.teachingLanguage),
        duration: nextItem.duration && !FABRICATION_WORD_PATTERN.test(nextItem.duration) ? nextItem.duration : undefined,
        tuition: tuitionInfo.tuition,
        tuition_status: tuitionInfo.status,
        tuition_basis: tuitionInfo.basis,
        data_year: inferredYear ?? undefined,
        verification_status: inferredYear ? "verified" : "needs_recheck",
        deadline_note: cleanDeadline || undefined,
        scholarships: nextItem.scholarshipEligible
          ? splitScholarshipKeys(nextItem.scholarshipSummary, verifiedUrl, inferredYear)
          : {},
        supervisor_letter: nextItem.supervisorLetter ?? (criteria.programType === "UG" ? "none" : "unknown"),
        official_requirements: {
          language: { raw_text: cleanLangNote, source_url: verifiedUrl },
        },
        notes: pageExcerpt ? `官网页面核实(${new Date().toISOString().slice(0, 10)})` : "",
        source_url: verifiedUrl,
      };

      factPrograms.push(factProg);
      verifiedByProgram.set(item, nextItem);
    }

    if (verifiedUrl) {
      // One school resolves a single page, so report the verify event once instead
      // of once per program of that school.
      options.onSchoolVerify?.({
        schoolName,
        url: verifiedUrl,
        status: "verified",
        year: anyYear,
        note: anyYear ? `核实 ${anyYear} 批次` : "官网可访问",
      });
      schoolFacts.data_year = anyYear ?? undefined;
      upsertEntries.push(schoolFacts);
    }
  }

  let persistedSchools = 0;
  let persistedPrograms = 0;
  if (upsertEntries.length > 0) {
    const res = batchUpsertFactEntries(upsertEntries, options.factDbPath);
    if (res.ok) {
      persistedSchools = res.updatedSchools.length;
      persistedPrograms = res.updatedSchools.reduce((sum, s) => sum + s.added, 0);
    }
  }

  const verifiedPrograms = programs.map((item) => verifiedByProgram.get(item) ?? item);
  return {
    verifiedPrograms,
    persistedSchools,
    persistedPrograms,
    deadUrlsRecorded,
  };
}

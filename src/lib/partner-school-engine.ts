import partnerSeedRaw from "@/data/partner-schools-seed.json";
import { inferSchoolPolicyMetadata } from "@/data/school-policy-metadata";
import type { ChatCriteria, ListRow } from "@/lib/ai-screening";
import { sensitiveSnippets } from "@/lib/ai-screening";
import {
  evaluateSchoolAgainstRules,
  MIN_ANNUAL_SELF_SUPPORT_RMB,
  type AdmissionDiagnostic,
} from "@/lib/admission-rule-engine";
import { getPartnerTierRank, isJuniorCollegeOrSecondarySchool } from "@/lib/screening-ranking";
import { MAJOR_GROUPS } from "@/lib/university-fact-db";

export type PartnerLevel = "language" | "preparatory" | "secondary" | "diploma" | "bachelor" | "master" | "phd";
export type PartnerGpaBand = "优秀" | "良好" | "中等" | "偏弱" | "弱";

type PartnerProgramInfo = {
  tuition_text?: string;
  min_yearly_rmb?: number | null;
  languages?: string[];
  intakes?: string[];
  featured_majors?: string[];
};

type PartnerSchoolSeedEntry = {
  row_ids?: number[];
  school_name: string;
  name_en?: string;
  aliases?: string[];
  city?: string;
  raw_category?: string;
  school_level?: string;
  coop_status?: "active" | "suspended" | string;
  partner_tier?: string;
  partner_rank?: number;
  contact_person?: string;
  info_completeness?: string;
  spring_2027_status?: string;
  levels_offered?: string[];
  programs?: Record<string, PartnerProgramInfo>;
  featured_majors?: string[];
  dormitory?: string;
  scholarship_summary?: string;
  has_scholarship?: boolean;
  deadline_summary?: string;
  requirements_summary?: string;
  age_limits?: Record<string, { min?: number; max?: number }>;
  restrictions?: {
    excluded_countries?: string[];
    excluded_regions?: string[];
    only_regions?: string[];
    preferred_regions?: string[];
    caution_countries?: string[];
    policy_notes?: string[];
  };
  internal_notes?: string;
};

type PartnerSeedPayload = {
  _non_partner_warnings?: Record<string, string>;
  schools?: Record<string, PartnerSchoolSeedEntry>;
};

export type PartnerSearchQuery = {
  level?: PartnerLevel;
  lang?: "english" | "chinese" | "both";
  intake?: "spring" | "autumn";
  major?: string;
  nationality?: string;
  age?: number;
  budget?: number;
  gpaBand?: PartnerGpaBand;
  partnerTiers?: string[];
  contact?: string;
  keyword?: string;
  city?: string;
  includeSuspended?: boolean;
  limit?: number;
  diagnostic?: AdmissionDiagnostic;
  criteria?: ChatCriteria;
};

export type PartnerSearchResultItem = {
  schoolName: string;
  nameEn: string;
  city: string;
  schoolLevel: string;
  schoolLevelLabel: string;
  coopStatus: string;
  partnerTier: string;
  partnerRank: number;
  contactPerson: string;
  partnerBadgeText: string;
  matchedLevel: string;
  matchedLevelLabel: string;
  tuitionText: string;
  minYearlyRmb: number | null;
  languages: string[];
  intakes: string[];
  spring2027Status: string;
  scholarshipSummary: string;
  dormitory: string;
  deadlineSummary: string;
  requirementsSummary: string;
  majorMatchScore: number;
  majorMatchTag: string;
  nationalityTag: string;
  budgetNote: string;
  partnerNote: string;
};

export type PartnerSearchPayload = {
  totalMatched: number;
  nonPartnerWarnings: Array<{ school: string; warning: string }>;
  results: PartnerSearchResultItem[];
  blockedByPolicy: Array<{ school: string; partnerTier: string; reason: string }>;
  blockedByGpaBand: Array<{ school: string; partnerTier: string; reason: string }>;
  redactedForPrivilege: boolean;
};

export type PartnerLookupMetadata = {
  isPartner: boolean;
  matchedSchool?: string;
  coopStatus?: string;
  schoolLevel?: string;
  partnerTier: string | null;
  partnerRank: number;
  partnerContact: string;
  partnerBadgeText: string;
  partnerNote: string;
  nonPartnerWarning?: string;
};

const LEVEL_LABELS: Record<string, string> = {
  language: "语言生",
  preparatory: "预科",
  secondary: "高中/中专",
  diploma: "专科/高职",
  bachelor: "本科",
  master: "硕士",
  phd: "博士",
};

const SCHOOL_LEVEL_LABELS: Record<string, string> = {
  "985": "985",
  "211": "211",
  normal: "公办本科",
  vocational_ug: "职业本科",
  college: "本科学院/民办本科",
  diploma: "高职专科",
  secondary: "国际中学/中专",
};

const COUNTRY_SYNONYMS: Record<string, string> = {
  bangladesh: "孟加拉",
  孟加拉国: "孟加拉",
  pakistan: "巴基斯坦",
  india: "印度",
  nepal: "尼泊尔",
  "sri lanka": "斯里兰卡",
  vietnam: "越南",
  thailand: "泰国",
  laos: "老挝",
  cambodia: "柬埔寨",
  myanmar: "缅甸",
  malaysia: "马来西亚",
  indonesia: "印尼",
  印度尼西亚: "印尼",
  philippines: "菲律宾",
  russia: "俄罗斯",
  kazakhstan: "哈萨克斯坦",
  uzbekistan: "乌兹别克斯坦",
  tajikistan: "塔吉克斯坦",
  kyrgyzstan: "吉尔吉斯斯坦",
  turkmenistan: "土库曼",
  土库曼斯坦: "土库曼",
  nigeria: "尼日利亚",
  cameroon: "喀麦隆",
  morocco: "摩洛哥",
  congo: "刚果",
  sudan: "苏丹",
  "south sudan": "南苏丹",
  "north sudan": "北苏丹",
  somalia: "索马里",
  libya: "利比亚",
  iran: "伊朗",
  iraq: "伊拉克",
  afghanistan: "阿富汗",
  yemen: "也门",
  palestine: "巴勒斯坦",
  syria: "叙利亚",
  israel: "以色列",
  ukraine: "乌克兰",
  "north korea": "朝鲜",
  cuba: "古巴",
  venezuela: "委内瑞拉",
  canada: "加拿大",
};

const COUNTRY_TO_REGIONS: Record<string, string[]> = {
  孟加拉: ["南亚"],
  印度: ["南亚"],
  巴基斯坦: ["南亚"],
  尼泊尔: ["南亚"],
  斯里兰卡: ["南亚"],
  越南: ["东南亚"],
  泰国: ["东南亚"],
  老挝: ["东南亚"],
  柬埔寨: ["东南亚"],
  缅甸: ["东南亚"],
  马来西亚: ["东南亚"],
  印尼: ["东南亚"],
  菲律宾: ["东南亚"],
  文莱: ["东南亚"],
  新加坡: ["东南亚"],
  哈萨克斯坦: ["中亚"],
  乌兹别克斯坦: ["中亚"],
  塔吉克斯坦: ["中亚"],
  吉尔吉斯斯坦: ["中亚"],
  土库曼: ["中亚"],
  俄罗斯: ["俄罗斯", "东欧"],
  乌克兰: ["东欧", "战乱国"],
  白俄罗斯: ["东欧"],
  波兰: ["东欧"],
  尼日利亚: ["非洲"],
  喀麦隆: ["非洲"],
  摩洛哥: ["非洲"],
  刚果: ["非洲", "战乱国"],
  苏丹: ["非洲", "战乱国"],
  南苏丹: ["非洲", "战乱国"],
  北苏丹: ["非洲"],
  索马里: ["非洲", "战乱国"],
  利比亚: ["非洲", "战乱国"],
  肯尼亚: ["非洲"],
  加纳: ["非洲"],
  埃塞俄比亚: ["非洲"],
  埃及: ["非洲", "中东"],
  伊朗: ["中东"],
  伊拉克: ["中东", "战乱国"],
  阿富汗: ["战乱国", "中亚"],
  也门: ["中东", "战乱国"],
  巴勒斯坦: ["中东", "战乱国"],
  叙利亚: ["中东", "战乱国"],
  以色列: ["中东", "战乱国"],
  沙特: ["中东"],
  澳大利亚: ["大洋洲"],
  新西兰: ["大洋洲"],
};

const CONFIDENTIAL_INTERNAL_NOTE_PATTERN = /(?:优惠价|渠道价|内部台账|不开团|不开户|免收|减免后.*对外宣传)/iu;

function normalizeSchoolName(name: string): string {
  return String(name ?? "")
    .normalize("NFKC")
    .replace(/\((?:公办|民办|公办本科|民办本科|普通本科|本科院校|本科)\)$/u, "")
    .replace(/\s+/gu, "")
    .trim()
    .toLowerCase();
}

export function normalizeCountryName(raw?: string | null): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const cnPart = s.replace(/\([^)]*\)|（[^）]*）/gu, "").trim();
  const low = s.toLowerCase();
  for (const [k, v] of Object.entries(COUNTRY_SYNONYMS)) {
    if (k === low || k === cnPart.toLowerCase() || low.includes(k)) return v;
  }
  return cnPart || s;
}

function regionsForCountry(countryCn: string): Set<string> {
  if (!countryCn) return new Set();
  if (COUNTRY_TO_REGIONS[countryCn]) return new Set(COUNTRY_TO_REGIONS[countryCn]);
  for (const [k, regs] of Object.entries(COUNTRY_TO_REGIONS)) {
    if (countryCn.includes(k) || k.includes(countryCn)) return new Set(regs);
  }
  return new Set();
}

/**
 * Region labels in the ledger are free text ("中东地区", "南亚各国"), so compare
 * with bidirectional containment instead of equality; otherwise a policy that
 * must block a region silently misses and the school stays recommended.
 */
export function regionMatches(studentRegions: Set<string>, ledgerRegion: string): boolean {
  const target = String(ledgerRegion ?? "").trim();
  if (!target) return false;
  for (const region of studentRegions) {
    if (region === target || region.includes(target) || target.includes(region)) return true;
  }
  return false;
}

function redactForUnprivileged(text: string): string {
  if (!text.trim()) return "";
  if (sensitiveSnippets(text).length > 0 || CONFIDENTIAL_INTERNAL_NOTE_PATTERN.test(text)) {
    return "存在内部合作或生源注意事项，请联系有权限的同事核实";
  }
  return text.replace(/(?:\b1[3-9]\d{9}\b)|(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g, "[联系方式已隐藏]");
}

function formatPartnerBadge(school: PartnerSchoolSeedEntry, privileged: boolean): string {
  const tier = (school.partner_tier || "UNRATED").toUpperCase();
  const base = tier && tier !== "UNRATED" ? `🤝 ${tier}级合作` : "🤝 合作院校";
  if (!privileged) return base;
  return school.contact_person ? `${base} · ${school.contact_person}` : base;
}

function buildPartnerNote(school: PartnerSchoolSeedEntry, privileged: boolean): string {
  const tier = (school.partner_tier || "UNRATED").toUpperCase();
  let tierTxt = tier !== "UNRATED" ? `${tier}级合作院校` : "未定级合作院校";
  if (privileged && school.contact_person) {
    tierTxt += `（对接人：${school.contact_person}）`;
  }
  const parts: string[] = [tierTxt];
  if (school.coop_status === "suspended") parts.push("⚠️ 台账标注今年暂停招收留学生");
  if (school.spring_2027_status === "published_27_spring") parts.push("27春季简章已出");
  else if (school.spring_2027_status === "not_published") parts.push("27春季简章未出");
  if (school.dormitory) parts.push(`住宿：${school.dormitory}`);
  if (school.scholarship_summary) parts.push(`奖学金亮点：${school.scholarship_summary}`);

  if (privileged) {
    const pol = school.restrictions?.policy_notes ?? [];
    if (pol.length) parts.push(`收生风控：${pol.join("；")}`);
    if (school.internal_notes) parts.push(school.internal_notes);
  } else {
    const hasRestrictedMeta =
      Boolean(school.restrictions?.excluded_countries?.length)
      || Boolean(school.restrictions?.excluded_regions?.length)
      || Boolean(school.restrictions?.only_regions?.length)
      || Boolean(school.restrictions?.caution_countries?.length)
      || Boolean(school.restrictions?.policy_notes?.length)
      || Boolean(school.internal_notes && (sensitiveSnippets(school.internal_notes).length > 0 || CONFIDENTIAL_INTERNAL_NOTE_PATTERN.test(school.internal_notes)));
    if (hasRestrictedMeta) {
      parts.push("存在内部生源或渠道备注，请联系管理员核实");
    }
  }
  return parts.join(" | ");
}

function buildEffectiveCatalog(workbookRows?: ListRow[]): {
  schools: Record<string, PartnerSchoolSeedEntry>;
  nonPartners: Record<string, string>;
} {
  const seed = partnerSeedRaw as unknown as PartnerSeedPayload;
  const schools: Record<string, PartnerSchoolSeedEntry> = { ...(seed.schools ?? {}) };
  const nonPartners: Record<string, string> = { ...(seed._non_partner_warnings ?? {}) };

  if (!workbookRows?.length) return { schools, nonPartners };

  const existingByNorm = new Map<string, string>();
  for (const name of Object.keys(schools)) {
    existingByNorm.set(normalizeSchoolName(name), name);
  }

  for (const row of workbookRows) {
    const rowName = row.name.trim();
    if (!rowName) continue;
    const normKey = normalizeSchoolName(rowName);
    if (row.noCooperation) {
      if (existingByNorm.has(normKey)) {
        const matchedKey = existingByNorm.get(normKey)!;
        delete schools[matchedKey];
        existingByNorm.delete(normKey);
      }
      if (!nonPartners[rowName]) {
        nonPartners[rowName] = `内部名单第 ${row.row} 行标注不合作/暂停合作。`;
      }
      continue;
    }

    if (existingByNorm.has(normKey)) continue;
    const f = row.fields ?? [];
    const levelsOffered: string[] = [];
    const programs: Record<string, PartnerProgramInfo> = {};
    const addLevel = (lvl: PartnerLevel, colIdx: number) => {
      const txt = String(f[colIdx] ?? "").trim();
      if (!txt) return;
      levelsOffered.push(lvl);
      const langs: string[] = [];
      if (/英文|英语|english/iu.test(txt)) langs.push("english");
      if (/中文|汉语|chinese/iu.test(txt) || (!langs.length && lvl === "language")) langs.push("chinese");
      const m = txt.match(/(\d+(?:\.\d+)?)\s*(万)?/u);
      const minFee = m ? Math.round(Number(m[1]) * (m[2] ? 10000 : 1)) : null;
      programs[lvl] = {
        tuition_text: txt,
        min_yearly_rmb: minFee && minFee > 500 ? minFee : null,
        languages: langs,
        intakes: /春/u.test(txt + (f[15] ?? "")) ? ["spring", "autumn"] : ["autumn"],
        featured_majors: [],
      };
    };
    addLevel("language", 7);
    addLevel("preparatory", 8);
    addLevel("diploma", 9);
    addLevel("bachelor", 10);
    addLevel("master", 11);
    addLevel("phd", 12);

    const tierRaw = String(f[4] ?? "").trim().toUpperCase();
    const tier = ["SS", "S", "A", "B", "C", "D"].includes(tierRaw) ? tierRaw : "UNRATED";
    const category = String(f[1] ?? "");
    const sl = /985/u.test(category)
      ? "985"
      : /211/u.test(category)
        ? "211"
        : isJuniorCollegeOrSecondarySchool(rowName, category)
          ? "diploma"
          : /职业.*大学/u.test(rowName)
            ? "vocational_ug"
            : /学院/u.test(rowName)
              ? "college"
              : "normal";

    schools[rowName] = {
      row_ids: [row.row],
      school_name: rowName,
      name_en: String(f[3] ?? "").trim(),
      aliases: [],
      city: String(f[5] ?? "").trim(),
      raw_category: category,
      school_level: sl,
      coop_status: "active",
      partner_tier: tier,
      partner_rank: getPartnerTierRank(tier),
      contact_person: "",
      info_completeness: levelsOffered.length ? "full" : "minimal",
      spring_2027_status: "unknown",
      levels_offered: levelsOffered.length ? levelsOffered : ["bachelor"],
      programs: Object.keys(programs).length ? programs : { bachelor: { tuition_text: String(f[6] ?? "详见台账"), languages: [], intakes: ["autumn"], featured_majors: [] } },
      featured_majors: String(f[6] ?? "").split(/[、,，/；;\s]+/u).filter(Boolean).slice(0, 6),
      dormitory: String(f[13] ?? "").trim(),
      scholarship_summary: String(f[14] ?? "").trim(),
      has_scholarship: Boolean(String(f[14] ?? "").trim() && !/^(?:无|暂无)$/u.test(String(f[14] ?? "").trim())),
      deadline_summary: String(f[15] ?? "").trim(),
      requirements_summary: String(f[16] ?? "").trim(),
      internal_notes: String(f[17] ?? "").trim(),
    };
    existingByNorm.set(normKey, rowName);
  }

  return { schools, nonPartners };
}

function matchMajorScore(school: PartnerSchoolSeedEntry, prog: PartnerProgramInfo, majorKw?: string): { score: number; tag: string } {
  if (!majorKw) return { score: 1, tag: "" };
  const q = majorKw.trim().toLowerCase();
  const featured = [...(prog.featured_majors ?? []), ...(school.featured_majors ?? [])];
  const textPool = [prog.tuition_text ?? "", school.internal_notes ?? "", ...featured].join(" ").toLowerCase();

  if (textPool.includes(q)) return { score: 2, tag: "🎯 明确主推专业命中" };

  const qGroups = new Set(
    Object.entries(MAJOR_GROUPS)
      .filter(([g, members]) => [g, ...members].some((a) => q.includes(a.toLowerCase()) || a.toLowerCase().includes(q)))
      .map(([g]) => g),
  );
  if (qGroups.size > 0) {
    for (const [g, members] of Object.entries(MAJOR_GROUPS)) {
      if (!qGroups.has(g)) continue;
      if ([g, ...members].some((a) => textPool.includes(a.toLowerCase()))) {
        return { score: 2, tag: "🎯 同专业族方向命中" };
      }
    }
  }

  const narrowOnly: Record<string, string[]> = {
    清华大学深圳国际研究生院: ["公共管理", "医院管理", "mpa", "public administration", "hospital"],
    广西医科大学: ["mbbs", "临床医学", "医学", "medicine"],
  };
  const sname = school.school_name;
  if (narrowOnly[sname] && !narrowOnly[sname].some((k) => q.includes(k))) {
    return { score: 0, tag: `⚠️ 台账仅列特定方向(${featured.slice(0, 3).join(", ")})` };
  }
  if (school.school_level === "diploma" && sname.includes("外语") && /(?:医学|临床|机械|土木)/u.test(q)) {
    return { score: 0, tag: "⚠️ 专科校特色偏向不同，须核官网" };
  }
  return { score: 1, tag: "📋 综合合作校（需核官网具体专业目录）" };
}

function checkNationalityPolicy(
  school: PartnerSchoolSeedEntry,
  natCn: string,
  privileged: boolean,
): { error: string | null; isPreferred: boolean; tag: string } {
  if (!natCn) return { error: null, isPreferred: false, tag: "" };
  const res = school.restrictions ?? {};
  const exclC = res.excluded_countries ?? [];
  const exclR = res.excluded_regions ?? [];
  const onlyR = res.only_regions ?? [];
  const prefR = res.preferred_regions ?? [];
  const cautionC = res.caution_countries ?? [];
  const regs = regionsForCountry(natCn);

  for (const c of exclC) {
    if (natCn.includes(c) || c.includes(natCn)) {
      return {
        error: privileged ? `国籍限制：不招收${c}` : "存在内部招生国别限制，请联系有权限的同事核实",
        isPreferred: false,
        tag: "",
      };
    }
  }

  const hitExclR = exclR.filter((r) => regionMatches(regs, r));
  if (hitExclR.length > 0) {
    return {
      error: privileged ? `区域限制：不招收${hitExclR.join("/")}生源（${natCn}）` : "存在内部区域招生限制，请联系有权限的同事核实",
      isPreferred: false,
      tag: "",
    };
  }

  if (onlyR.length > 0 && !onlyR.some((r) => regionMatches(regs, r))) {
    return {
      error: privileged ? `定向区域限制：仅招收${onlyR.join("/")}生源（${natCn}不符合）` : "存在内部定向招生区域限制，请联系有权限的同事核实",
      isPreferred: false,
      tag: "",
    };
  }

  const tags: string[] = [];
  let isPreferred = false;
  for (const c of cautionC) {
    if (natCn.includes(c) || c.includes(natCn) || (c === "非洲各国" && regs.has("非洲"))) {
      tags.push(privileged ? `⚠️ 谨慎审核/名额已多(${c})` : "⚠️ 需人工核实生源名额与审核口径");
    }
  }
  const hitPref = prefR.filter((r) => regionMatches(regs, r) || natCn.includes(r));
  if (hitPref.length > 0) {
    isPreferred = true;
    tags.push(privileged ? `⭐ 生源偏好契合(${hitPref.join("/")})` : "⭐ 符合院校招生方向");
  }
  return { error: null, isPreferred, tag: tags.join("；") };
}

function checkAge(school: PartnerSchoolSeedEntry, level: string, age?: number): string | null {
  if (age == null) return null;
  const limits = school.age_limits ?? {};
  const lim = limits[level] ?? limits.default;
  if (!lim) return null;
  const minA = lim.min ?? 0;
  const maxA = lim.max ?? 99;
  if (age < minA || age > maxA) {
    return `年龄不符（要求 ${minA}-${maxA} 周岁，当前 ${age} 岁）`;
  }
  return null;
}

function checkGpaBand(school: PartnerSchoolSeedEntry, gpaBand?: PartnerGpaBand): string | null {
  if (!gpaBand) return null;
  const sl = school.school_level;
  if ((gpaBand === "偏弱" || gpaBand === "弱") && (sl === "985" || sl === "211")) {
    return `成绩档位过滤：学生为【${gpaBand}】档，禁止推荐 ${sl} 高校`;
  }
  if (gpaBand === "中等" && sl === "985") {
    return "成绩档位过滤：学生为【中等】档，禁止推荐 985 高校（差≥2档）";
  }
  return null;
}

export function searchPartnerSchools(
  query: PartnerSearchQuery,
  options: { privileged: boolean; workbookRows?: ListRow[] },
): PartnerSearchPayload {
  const { privileged, workbookRows } = options;
  const { schools, nonPartners } = buildEffectiveCatalog(workbookRows);
  const natCn = normalizeCountryName(query.nationality);
  const tierFilter = query.partnerTiers?.length
    ? new Set(query.partnerTiers.map((x) => x.trim().toUpperCase()).filter(Boolean))
    : null;
  const cityFilter = query.city?.replace(/市$/u, "").trim();

  const nonPartnerWarnings: Array<{ school: string; warning: string }> = [];
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase();
    for (const [npName, npMsg] of Object.entries(nonPartners)) {
      if (npName.toLowerCase().includes(kw) || kw.includes(npName.toLowerCase())) {
        nonPartnerWarnings.push({ school: npName, warning: npMsg });
      }
    }
  }

  type SortableResult = PartnerSearchResultItem & {
    _rank: number;
    _budgetOk: number;
    _majorScore: number;
    _prefScore: number;
    _springScore: number;
    _compScore: number;
    _minFee: number;
  };

  const sortable: SortableResult[] = [];
  const blockedByPolicy: Array<{ school: string; partnerTier: string; reason: string }> = [];
  const blockedByGpaBand: Array<{ school: string; partnerTier: string; reason: string }> = [];

  if (query.diagnostic?.state === "CIRCUIT_BREAKER") {
    return {
      totalMatched: 0,
      nonPartnerWarnings,
      results: [],
      blockedByPolicy: [
        ...query.diagnostic.gate1StopReasons.map((reason) => ({ school: "全库硬熔断", partnerTier: "GATE", reason })),
        ...query.diagnostic.bottlenecks.filter((b) => b.severity === "STOP").map((b) => ({ school: "全库硬熔断", partnerTier: "GATE", reason: b.effect })),
      ],
      blockedByGpaBand: [],
      redactedForPrivilege: !privileged,
    };
  }

  const allowDowngradeDiploma = Boolean(query.diagnostic?.allowVocationalDiploma);
  const blockDirectUg = Boolean(query.diagnostic?.blockDirectDegree && query.level === "bachelor");

  for (const [name, sch] of Object.entries(schools)) {
    if (sch.coop_status === "suspended" && !query.includeSuspended) continue;
    const tier = (sch.partner_tier || "UNRATED").toUpperCase();
    if (tierFilter && !tierFilter.has(tier)) continue;
    if (query.contact) {
      if (!privileged) continue;
      if (!(sch.contact_person ?? "").toLowerCase().includes(query.contact.trim().toLowerCase())) continue;
    }
    if (cityFilter) {
      const sCity = (sch.city ?? "").replace(/市$/u, "").trim();
      if (!sCity.includes(cityFilter) && !cityFilter.includes(sCity)) continue;
    }
    if (query.keyword) {
      const kwLow = query.keyword.trim().toLowerCase();
      const searchable = privileged
        ? JSON.stringify(sch).toLowerCase()
        : JSON.stringify({
            school_name: sch.school_name,
            name_en: sch.name_en,
            city: sch.city,
            raw_category: sch.raw_category,
            featured_majors: sch.featured_majors,
            scholarship_summary: sch.scholarship_summary,
            programs: sch.programs,
          }).toLowerCase();
      if (!searchable.includes(kwLow)) continue;
    }

    const sl = sch.school_level || "normal";
    let level = query.level;
    let prog: PartnerProgramInfo | undefined;
    if (level) {
      if (blockDirectUg) {
        // Under pathway lock for UG, switch lookup from direct bachelor to preparatory / diploma / language
        const fallbackOrder: PartnerLevel[] = allowDowngradeDiploma
          ? ["preparatory", "diploma", "language"]
          : ["preparatory", "language"];
        const chosen = fallbackOrder.find((lk) => Boolean(sch.programs?.[lk]));
        if (!chosen) continue;
        level = chosen;
        prog = sch.programs?.[chosen];
      } else {
        if ((level === "bachelor" || level === "master" || level === "phd") && (sl === "diploma" || sl === "secondary")) {
          if (!(level === "bachelor" && allowDowngradeDiploma && sl === "diploma" && sch.programs?.diploma)) {
            continue;
          }
          level = "diploma";
          prog = sch.programs.diploma;
        } else {
          if (!(sch.levels_offered ?? []).includes(level)) continue;
          prog = sch.programs?.[level];
        }
      }
    } else {
      const prefOrder: PartnerLevel[] = ["bachelor", "master", "phd", "language", "preparatory", "diploma", "secondary"];
      const chosen = prefOrder.find((lk) => Boolean(sch.programs?.[lk]));
      if (!chosen) continue;
      level = chosen;
      prog = sch.programs?.[chosen];
    }
    if (!prog) continue;

    if (query.lang && query.lang !== "both") {
      const progLangs = prog.languages ?? [];
      if (progLangs.length > 0 && !progLangs.includes(query.lang)) continue;
    }

    if (query.intake) {
      const intakes = prog.intakes ?? [];
      if (intakes.length > 0 && !intakes.includes(query.intake)) continue;
    }

    const natCheck = checkNationalityPolicy(sch, natCn, privileged);
    if (natCheck.error) {
      blockedByPolicy.push({ school: name, partnerTier: tier, reason: natCheck.error });
      continue;
    }

    const ageErr = checkAge(sch, level, query.age);
    if (ageErr) {
      blockedByPolicy.push({ school: name, partnerTier: tier, reason: ageErr });
      continue;
    }

    const gpaErr = checkGpaBand(sch, query.gpaBand);
    if (gpaErr) {
      blockedByGpaBand.push({ school: name, partnerTier: tier, reason: gpaErr });
      continue;
    }

    const policyMeta = inferSchoolPolicyMetadata(name, {
      schoolTags: sch.raw_category ?? sl,
      firstYearCostMax: prog.min_yearly_rmb ?? null,
      programName: LEVEL_LABELS[level] ?? level,
      programType: level === "bachelor" ? "UG" : level === "master" ? "MASTER" : level === "phd" ? "PHD" : "LONG_TERM",
      city: sch.city,
    });

    if (query.diagnostic && query.criteria) {
      const ruleDecision = evaluateSchoolAgainstRules(query.diagnostic, query.criteria, {
        schoolName: name,
        schoolTags: sch.raw_category ?? sl,
        programName: `${name} · ${LEVEL_LABELS[level] ?? level}`,
        programType: level === "bachelor" ? "UG" : level === "master" ? "MASTER" : level === "phd" ? "PHD" : "LONG_TERM",
        teachingLanguage: query.lang === "english" ? "ENGLISH" : query.lang === "chinese" ? "CHINESE" : undefined,
        firstYearCostMax: prog.min_yearly_rmb ?? null,
        scholarshipSummary: sch.scholarship_summary,
        city: sch.city,
      });
      if (!ruleDecision.eligible) {
        blockedByGpaBand.push({ school: name, partnerTier: tier, reason: ruleDecision.reasons[0] ?? "触发确定性档位/路径闸门拦截" });
        continue;
      }
    }

    let budgetNote = "";
    const minFee = prog.min_yearly_rmb ?? null;
    if (query.budget != null && minFee != null && minFee > query.budget) {
      const allowScholarshipBypass =
        Boolean(sch.has_scholarship)
        && (!query.diagnostic || query.diagnostic.scholarshipPolicy.govFullAllowed);
      const waiverCovers =
        policyMeta.firstYearWaiverType === "FULL_TUITION_AND_DORM"
        && query.budget >= MIN_ANNUAL_SELF_SUPPORT_RMB;
      if (waiverCovers) {
        budgetNote = `首年免学费住宿通道（自理约 ${MIN_ANNUAL_SELF_SUPPORT_RMB.toLocaleString("en-US")} 元/年生活医保，契合低预算洼地）`;
      } else if (allowScholarshipBypass) {
        budgetNote = `自费起步约${minFee.toLocaleString("en-US")}元/年超预算${query.budget.toLocaleString("en-US")}元（含奖学金通道：${(sch.scholarship_summary ?? "").slice(0, 30)}）`;
      } else {
        blockedByPolicy.push({
          school: name,
          partnerTier: tier,
          reason: `自费最低约${minFee.toLocaleString("en-US")}元/年超预算${query.budget.toLocaleString("en-US")}元，且学生不具备全额奖学金兜底资格`,
        });
        continue;
      }
    }

    const majorMatch = matchMajorScore(sch, prog, query.major);
    const partnerRank = Number(sch.partner_rank ?? getPartnerTierRank(tier));
    const reqSummary = privileged
      ? (sch.requirements_summary ?? "")
      : redactForUnprivileged(sch.requirements_summary ?? "");

    sortable.push({
      schoolName: name,
      nameEn: sch.name_en ?? "",
      city: sch.city ?? "",
      schoolLevel: sl,
      schoolLevelLabel: SCHOOL_LEVEL_LABELS[sl] ?? sl,
      coopStatus: sch.coop_status ?? "active",
      partnerTier: tier,
      partnerRank,
      contactPerson: privileged ? (sch.contact_person ?? "") : "",
      partnerBadgeText: formatPartnerBadge(sch, privileged),
      matchedLevel: level,
      matchedLevelLabel: LEVEL_LABELS[level] ?? level,
      tuitionText: prog.tuition_text ?? "",
      minYearlyRmb: minFee,
      languages: [...(prog.languages ?? [])],
      intakes: [...(prog.intakes ?? [])],
      spring2027Status: sch.spring_2027_status ?? "unknown",
      scholarshipSummary: sch.scholarship_summary ?? "",
      dormitory: sch.dormitory ?? "",
      deadlineSummary: sch.deadline_summary ?? "",
      requirementsSummary: reqSummary,
      majorMatchScore: majorMatch.score,
      majorMatchTag: majorMatch.tag,
      nationalityTag: natCheck.tag,
      budgetNote,
      partnerNote: buildPartnerNote(sch, privileged),
      _rank: partnerRank,
      _budgetOk: query.budget == null || minFee == null || minFee <= query.budget ? 1 : 0,
      _majorScore: majorMatch.score,
      _prefScore: natCheck.isPreferred ? 1 : 0,
      _springScore: sch.spring_2027_status === "published_27_spring" ? 1 : 0,
      _compScore: sch.info_completeness === "full" ? 1 : 0,
      _minFee: minFee ?? 999999,
    });
  }

  sortable.sort((a, b) =>
    b._rank - a._rank
    || b._budgetOk - a._budgetOk
    || b._majorScore - a._majorScore
    || b._prefScore - a._prefScore
    || b._springScore - a._springScore
    || b._compScore - a._compScore
    || a._minFee - b._minFee
    || a.schoolName.localeCompare(b.schoolName, "zh-CN"),
  );

  const limited = query.limit && query.limit > 0 ? sortable.slice(0, query.limit) : sortable;
  const results: PartnerSearchResultItem[] = limited.map((item) => {
    const clean = { ...item } as Record<string, unknown>;
    delete clean._rank;
    delete clean._budgetOk;
    delete clean._majorScore;
    delete clean._prefScore;
    delete clean._springScore;
    delete clean._compScore;
    delete clean._minFee;
    return clean as PartnerSearchResultItem;
  });

  return {
    totalMatched: results.length,
    nonPartnerWarnings,
    results,
    blockedByPolicy,
    blockedByGpaBand,
    redactedForPrivilege: !privileged,
  };
}

export function lookupPartnerMetadata(
  schoolNames: readonly string[],
  options: { privileged: boolean; workbookRows?: ListRow[] },
): Record<string, PartnerLookupMetadata> {
  const { privileged, workbookRows } = options;
  const { schools, nonPartners } = buildEffectiveCatalog(workbookRows);
  const out: Record<string, PartnerLookupMetadata> = {};

  for (const rawName of schoolNames) {
    const query = rawName.trim();
    const qNorm = normalizeSchoolName(query);

    let matchedNp: { name: string; warning: string } | null = null;
    if (nonPartners[query]) {
      matchedNp = { name: query, warning: nonPartners[query] };
    } else {
      for (const [npName, msg] of Object.entries(nonPartners)) {
        if (normalizeSchoolName(npName) === qNorm) {
          matchedNp = { name: npName, warning: msg };
          break;
        }
      }
    }

    if (matchedNp) {
      out[rawName] = {
        isPartner: false,
        nonPartnerWarning: matchedNp.warning,
        partnerTier: null,
        partnerRank: 0,
        partnerContact: "",
        partnerBadgeText: "非合作院校(明确不开户)",
        partnerNote: privileged ? matchedNp.warning : "该院校明确标注不合作",
      };
      continue;
    }

    let matchedSchool: PartnerSchoolSeedEntry | null = schools[query] ?? null;
    if (!matchedSchool) {
      for (const [sname, sdata] of Object.entries(schools)) {
        if (normalizeSchoolName(sname) === qNorm) {
          matchedSchool = sdata;
          break;
        }
        if ((sdata.aliases ?? []).some((al) => normalizeSchoolName(al) === qNorm || al.toLowerCase() === query.toLowerCase())) {
          matchedSchool = sdata;
          break;
        }
      }
    }

    if (matchedSchool) {
      const tier = (matchedSchool.partner_tier || "UNRATED").toUpperCase();
      out[rawName] = {
        isPartner: true,
        matchedSchool: matchedSchool.school_name,
        coopStatus: matchedSchool.coop_status ?? "active",
        schoolLevel: matchedSchool.school_level,
        partnerTier: tier,
        partnerRank: Number(matchedSchool.partner_rank ?? getPartnerTierRank(tier)),
        partnerContact: privileged ? (matchedSchool.contact_person ?? "") : "",
        partnerBadgeText: formatPartnerBadge(matchedSchool, privileged),
        partnerNote: buildPartnerNote(matchedSchool, privileged),
      };
    } else {
      out[rawName] = {
        isPartner: false,
        partnerTier: null,
        partnerRank: 0,
        partnerContact: "",
        partnerBadgeText: "全网补充(非合作)",
        partnerNote: "",
      };
    }
  }
  return out;
}

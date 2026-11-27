import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import seedFactDb from "@/data/university-fact-seed.json";

export type FactDegreeLevel = "master" | "phd" | "bachelor" | "diploma" | "language";
export type FactTuitionStatus = "published" | "free" | "not_published";
export type FactTuitionBasis = "per_year" | "total_program" | "per_semester" | "unknown";
export type FactVerificationStatus = "verified" | "needs_recheck" | "unverified";
export type FactSupervisorLetter = "required" | "optional" | "none" | "unknown" | "required-ish";

export type FactScholarshipEntry = {
  type?: "full" | "partial" | string;
  data_year?: number | string | null;
  verification_status?: FactVerificationStatus | string;
  included_countries?: string[];
  excluded_countries?: string[];
  source_url?: string;
  note?: string;
};

export type FactProgramEntry = {
  major: string;
  major_cn?: string;
  major_en?: string;
  college?: string;
  degrees: string[];
  language: string;
  duration?: string;
  tuition?: number | null;
  tuition_status?: FactTuitionStatus | string;
  tuition_basis?: FactTuitionBasis | string;
  program_track?: string;
  data_year?: number | string | null;
  verification_status?: FactVerificationStatus | string;
  deadline_note?: string;
  scholarships?: Record<string, FactScholarshipEntry>;
  supervisor_letter?: FactSupervisorLetter | string | null;
  official_requirements?: {
    gpa?: { status?: string; raw_text?: string; source_url?: string };
    language?: { raw_text?: string; source_url?: string };
    [key: string]: unknown;
  };
  notes?: string;
  source_url?: string;
};

export type FactSchoolUrls = {
  iec_url?: string;
  admission_url?: string;
  program_url?: string;
  dead_urls?: string[];
  verified_at?: string;
  note?: string;
};

export type FactSchoolRecord = {
  city?: string;
  tier?: string;
  updated_at?: string;
  data_year?: number | string | null;
  urls?: FactSchoolUrls;
  programs?: FactProgramEntry[];
};

export type FactSchoolUpsertInput = FactSchoolRecord & {
  school_name: string;
};

export type FactDbMap = Record<string, FactSchoolRecord>;

export type FactCandidateStatus = "fresh" | "historical" | "recheck";

export type FilteredFactProgram = FactProgramEntry & {
  school: string;
  city: string;
  tier: string;
  updated_at: string;
  source_urls: string[];
  iec_url: string;
  admission_url: string;
  program_url: string;
  stale: boolean;
  candidate_status: FactCandidateStatus;
  stale_reason: string | null;
  historical_reference?: boolean;
  historical_reason?: string | null;
  nationality_note?: string | null;
  budget_note?: string | null;
};

export type UrlCacheLookup =
  | { status: "miss" }
  | {
      status: "hit_fresh" | "hit_stale";
      verified_at: string;
      iec_url: string;
      admission_url: string;
      program_url: string;
      dead_urls: string[];
      note: string;
    };

const MAX_BACKUPS = 5;

const DEGREE_ALIASES: Record<FactDegreeLevel, string[]> = {
  master: ["master", "硕士", "graduate", "研究生", "msc", "mres", "meng", "mba"],
  phd: ["phd", "doctor", "博士", "doctoral"],
  bachelor: ["bachelor", "本科", "undergraduate", "bsc", "beng"],
  diploma: ["diploma", "专科", "高职", "大专", "associate"],
  language: ["language", "语言生", "汉语进修", "hsk", "汉语培训", "预科", "preparatory"],
};

const LANG_ALIASES: Record<"english" | "chinese", string[]> = {
  english: ["english", "英文", "英语授课", "en"],
  chinese: ["chinese", "中文", "汉语授课", "zh"],
};

export const MAJOR_GROUPS: Record<string, string[]> = {
  计算机与人工智能: [
    "计算机", "computer", "软件工程", "software", "人工智能", "artificial intelligence",
    "ai", "数据科学", "data science", "大数据", "big data", "信息技术", "information technology",
    "信息学", "informatics", "网络安全", "cyber", "网络空间安全", "物联网", "iot",
  ],
  电子与通信: [
    "电子工程", "electronic", "electronics", "信息与通信", "通信工程", "communication engineering",
    "telecommunication", "微电子", "microelectronics", "集成电路", "integrated circuit", "光电", "optoelectronics",
  ],
  电气与自动化: [
    "电气", "electrical", "电力系统", "power engineering", "power system", "自动化", "automation",
    "控制科学", "control engineering", "机器人", "robotics", "智能制造", "intelligent manufacturing", "机电", "mechatronics",
  ],
  机械与能源动力: [
    "机械", "mechanical", "车辆工程", "automotive", "vehicle", "航空航天", "aerospace",
    "能源动力", "动力工程", "power and energy", "energy engineering", "新能源", "renewable energy", "船舶", "naval",
  ],
  土木与建筑交通: [
    "土木", "civil engineering", "civil", "结构工程", "structural engineering", "建筑学", "architecture",
    "建筑", "绿色建筑", "可持续建筑", "green building", "sustainable architecture",
    "城乡规划", "urban planning", "交通运输", "transportation", "道路桥梁", "水利", "hydraulic", "测绘", "geomatics",
  ],
  材料与化工环境: [
    "材料", "materials", "化学工程", "化工", "chemical engineering", "环境工程", "环境科学",
    "environmental", "冶金", "metallurgical", "矿业", "mining", "高分子", "polymer",
  ],
  商科与管理: [
    "工商管理", "business administration", "mba", "国际mba", "global mba", "imba", "企业管理", "管理科学与工程", "management",
    "市场营销", "marketing", "会计", "accounting", "人力资源", "human resource", "电子商务",
    "e-commerce", "物流", "logistics", "供应链", "supply chain", "旅游管理", "hospitality",
  ],
  经济与金融: [
    "经济学", "economics", "金融", "finance", "financial", "国际经济与贸易", "国际贸易",
    "international trade", "应用经济", "applied economics", "数字经济", "digital economy", "保险学",
  ],
  医学与药学: [
    "临床医学", "clinical medicine", "mbbs", "医学", "medical", "medicine", "口腔", "stomatology",
    "dental", "护理", "nursing", "药学", "pharmacy", "pharmaceutical", "公共卫生", "public health", "中医", "tcm",
  ],
  汉语与文学语言: [
    "汉语国际教育", "国际中文教育", "tcsol", "mtcsol", "汉语言", "chinese language",
    "中国文学", "literature", "语言学", "linguistics", "翻译", "translation", "英语", "外语",
  ],
  教育与心理: [
    "教育学", "education", "高等教育", "教育技术", "educational technology", "心理学", "psychology", "体育教育",
  ],
  法学与公共社科: [
    "法学", "law", "legal", "国际法", "international law", "国际关系", "international relations",
    "外交", "diplomacy", "全球治理", "global governance", "国际政治", "international politics",
    "政治学", "politics", "公共管理", "public administration", "mpa", "社会学", "sociology",
  ],
  理学与基础科学: [
    "数学", "mathematics", "物理学", "physics", "化学", "chemistry", "生物科学", "生物学",
    "biology", "biological", "统计学", "statistics", "大气科学", "atmospheric", "海洋科学", "marine",
  ],
  艺术设计与传媒: [
    "设计", "design", "视觉传达", "visual communication", "数字媒体", "digital media",
    "艺术", "fine arts", "新闻", "journalism", "传播学", "communication studies", "新媒体", "动画", "animation",
  ],
};

const FORBIDDEN_FACT_PATTERNS = [
  /GPA\s*基准/i, /录取概率/i, /录取几率/i, /稳录/i, /保底/i, /几乎确定/i,
  /大概率录取/i, /降一档/i, /升一档/i, /竞争度(?:高|低)/i, /拿奖概率/i,
  /自费录取GPA/i, /奖学金GPA基准/i,
  /成绩档位评估/i, /约中等到偏弱/i, /适合成绩(?:偏弱|较弱|一般|优秀)学生/i,
  /差学生场景/i, /好学生场景/i, /申请价值有限/i,
  /超\s*\d+(?:\.\d+)?\s*万?预算/i, /学生无(?:全额|奖学金)通道/i,
  /不满足(?:全额)?奖学金(?:硬性|需求)/i, /应淘汰该校/i,
  /需确认.{1,8}资格/i,
];

const SUBJECTIVE_NOTE_PATTERNS = [
  /语言线低/i, /学费偏高/i, /竞争激烈/i, /竞争较低/i, /城市吸引力/i, /学生友好/i,
];

const FORBIDDEN_PROGRAM_KEYS = new Set([
  "admission_prob", "admission_probability", "tier_reason", "match_tier", "admission_tier",
  "scholarship_tier", "internal_assessment", "admission_competitiveness",
]);

const ALLOWED_SUPERVISOR = new Set<unknown>([undefined, null, "required", "optional", "none", "unknown", "required-ish"]);
const ALLOWED_VERIFICATION = new Set<unknown>([undefined, null, "verified", "needs_recheck", "unverified"]);
const ALLOWED_TUITION_BASIS = new Set<unknown>(["per_year", "total_program", "per_semester", "unknown"]);
const ALLOWED_TUITION_STATUS = new Set<unknown>([undefined, null, "published", "free", "not_published"]);

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function resolveFactDbPath(customPath?: string): string {
  if (customPath) return resolve(/* turbopackIgnore: true */ customPath);
  const configured = process.env.AI_SCREENING_FACT_DB_PATH?.trim();
  if (configured) return resolve(/* turbopackIgnore: true */ configured);
  const dbDir = dirname(resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH ?? "./data/app.db"));
  return join(dbDir, "university-fact-db.json");
}

function getSeedFactDb(): FactDbMap {
  return structuredClone(seedFactDb as unknown as FactDbMap);
}

export function loadFactDb(customPath?: string): FactDbMap {
  const path = resolveFactDbPath(customPath);
  if (!existsSync(/* turbopackIgnore: true */ path)) {
    return getSeedFactDb();
  }
  try {
    const parsed = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8")) as FactDbMap;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : getSeedFactDb();
  } catch {
    return getSeedFactDb();
  }
}

function atomicSaveFactDb(db: FactDbMap, dbPath: string, makeBackup = true) {
  const dir = dirname(resolve(/* turbopackIgnore: true */ dbPath));
  mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
  if (makeBackup && existsSync(/* turbopackIgnore: true */ dbPath)) {
    const backupDir = join(dir, ".backups");
    mkdirSync(/* turbopackIgnore: true */ backupDir, { recursive: true });
    const stamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`;
    copyFileSync(/* turbopackIgnore: true */ dbPath, join(backupDir, `university_db.${stamp}.json.bak`));
    const backups = readdirSync(/* turbopackIgnore: true */ backupDir)
      .filter((name) => name.endsWith(".bak"))
      .sort()
      .map((name) => join(backupDir, name));
    for (const old of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
      try {
        unlinkSync(/* turbopackIgnore: true */ old);
      } catch {
        // Ignore cleanup failure for rotated backup files.
      }
    }
  }

  const tmpPath = join(dir, `.tmp_fact_db_${randomUUID()}.json`);
  try {
    writeFileSync(/* turbopackIgnore: true */ tmpPath, JSON.stringify(db, null, 1), { encoding: "utf8" });
    renameSync(/* turbopackIgnore: true */ tmpPath, /* turbopackIgnore: true */ dbPath);
  } catch (err) {
    try {
      if (existsSync(/* turbopackIgnore: true */ tmpPath)) unlinkSync(/* turbopackIgnore: true */ tmpPath);
    } catch {
      // Ignore temp cleanup failure.
    }
    throw err;
  }
}

export function canonicalMajorName(prog: Pick<FactProgramEntry, "major" | "major_cn">): string {
  let base = prog.major_cn ? String(prog.major_cn).trim() : String(prog.major ?? "").trim();
  base = base.replace(/（[^）]*）|\([^)]*\)/gu, " ");
  base = base.replace(/\b\d{4,6}\b/g, " ");
  base = base.trim().replace(/(?:专业)?(?:硕士研究生|博士研究生|研究型硕士|硕士|博士|本科|学士|学位项目|项目)$/u, "");
  base = base.replace(/\b(?:master|msc|mres|meng|phd|bachelor|bsc|beng|program)\b/gi, "");
  base = base.replace(/\s+/g, " ").replace(/^[ /·\-—]+|[ /·\-—]+$/g, "");
  return norm(base) || norm(prog.major);
}

function programKey(prog: FactProgramEntry): string {
  const major = canonicalMajorName(prog);
  const degrees = [...(prog.degrees ?? [])].map(norm).sort().join("|");
  const lang = norm(prog.language);
  const track = norm(prog.program_track);
  return track ? `${major}__${degrees}__${lang}__${track}` : `${major}__${degrees}__${lang}`;
}

export function matchFactDegree(progDegrees: readonly string[], level: FactDegreeLevel): boolean {
  const aliases = DEGREE_ALIASES[level] ?? [];
  return progDegrees.some((deg) => {
    const d = norm(deg);
    return aliases.some((alias) => d.includes(alias));
  });
}

function isBachelorProgram(prog: Pick<FactProgramEntry, "degrees">): boolean {
  return matchFactDegree(prog.degrees ?? [], "bachelor");
}

function matchFactLanguage(progLang: string, lang: "english" | "chinese" | "both"): boolean {
  if (!lang || lang === "both") return true;
  const v = norm(progLang);
  if (lang === "english" && (v.includes("中英") || v.includes("bilingual") || v.includes("english"))) return true;
  return (LANG_ALIASES[lang] ?? []).some((alias) => v.includes(alias));
}

function aliasInText(alias: string, text: string): boolean {
  const a = norm(alias);
  const t = norm(text);
  if (!a || !t) return false;
  if (/^[\x00-\x7f]+$/.test(a) && a.length <= 4 && /^[a-z0-9-]+$/i.test(a)) {
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(t);
  }
  return t.includes(a);
}

export function majorGroupsFor(text: string): Set<string> {
  const groups = new Set<string>();
  for (const [group, members] of Object.entries(MAJOR_GROUPS)) {
    if ([group, ...members].some((alias) => aliasInText(alias, text))) {
      groups.add(group);
    }
  }
  return groups;
}

export function matchFactMajor(
  prog: Pick<FactProgramEntry, "major" | "major_cn" | "major_en">,
  majorKw: string,
  matchMode: "fuzzy" | "strict" = "fuzzy",
): boolean {
  const q = norm(majorKw);
  if (!q) return true;
  const candidates = [prog.major, prog.major_cn, prog.major_en].filter(Boolean).join(" ");
  if (aliasInText(q, candidates) || aliasInText(candidates, q)) return true;
  if (matchMode === "strict") return false;
  const qGroups = majorGroupsFor(q);
  const cGroups = majorGroupsFor(candidates);
  for (const g of qGroups) {
    if (cGroups.has(g)) return true;
  }
  return false;
}

function monthsSince(dstr?: string | null, now = new Date()): number {
  const match = String(dstr ?? "").match(/^(\d{4})-(\d{2})/);
  if (!match) return 999;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 999;
  // Future-dated records (clock skew or hand-edited data) must not look fresher
  // than today; clamp to 0 so they are still judged by the normal staleness rule.
  return Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m));
}

function yearInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const m = value.match(/(20\d{2})/);
    if (m) return Number(m[1]);
  }
  return null;
}

function checkNationality(
  prog: FactProgramEntry,
  nationality?: string | null,
  targetYear?: number,
): string | null {
  if (!nationality) return null;
  const natNorm = norm(nationality);
  const sch = prog.scholarships ?? {};
  const notes: string[] = [];
  for (const [name, info] of Object.entries(sch)) {
    if (!info || typeof info !== "object") continue;
    const excl = info.excluded_countries ?? [];
    const incl = info.included_countries ?? [];
    const matchedExcl = excl.some((c) => natNorm.includes(norm(c)) || norm(c).includes(natNorm));
    const matchedIncl = incl.length > 0 && incl.some((c) => natNorm.includes(norm(c)) || norm(c).includes(natNorm));
    if (!matchedExcl && !matchedIncl) continue;

    const sy = yearInt(info.data_year);
    const sv = info.verification_status ?? "verified";
    const current = (targetYear == null || sy === targetYear) && sv === "verified";
    const rel = matchedExcl ? "明确不含" : "包含";
    if (current) {
      notes.push(`${name}${rel}${nationality}`);
    } else {
      const y = sy ? `${sy}批次` : "年份未标注";
      notes.push(`历史参考(${y},${sv})：${name}${rel}${nationality}，目标批次须重核`);
    }
  }
  return notes.length ? notes.join("；") : null;
}

export function formatFactTuition(prog: Pick<FactProgramEntry, "tuition" | "tuition_status" | "tuition_basis">): string {
  const status = prog.tuition_status;
  const n = prog.tuition;
  if (status === "not_published" || n == null || Number.isNaN(Number(n))) return "学费未公布";
  if (status === "free" || n === 0) return "0元(项目免学费)";
  const amount = `${Math.round(Number(n)).toLocaleString("en-US")}元`;
  const suffixMap: Record<string, string> = {
    per_year: "/年",
    total_program: "/项目总计",
    per_semester: "/学期",
    unknown: "（计费周期待核实）",
  };
  return amount + (suffixMap[prog.tuition_basis ?? "per_year"] ?? "（计费周期待核实）");
}

export function validateFactProgram(prog: FactProgramEntry, schoolName = ""): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prefix = `${schoolName} · ${prog.major || "未命名项目"}`;

  if (!prog.major) errors.push(`${prefix}: 缺少 major`);
  if (!Array.isArray(prog.degrees) || !prog.degrees.length) errors.push(`${prefix}: 缺少 degrees`);
  if (!prog.source_url) warnings.push(`${prefix}: 缺少 source_url，引用前必须补官网来源`);

  const badKeys = Object.keys(prog).filter((k) => FORBIDDEN_PROGRAM_KEYS.has(k)).sort();
  if (badKeys.length) {
    errors.push(`${prefix}: 官网事实库禁止存内部评估字段 ${badKeys.join(", ")}`);
  }

  const notes = prog.notes ?? "";
  if (FORBIDDEN_FACT_PATTERNS.some((p) => p.test(notes))) {
    errors.push(`${prefix}: notes 含内部判断/特定学生残留，必须移出事实库: ${notes}`);
  }
  if (SUBJECTIVE_NOTE_PATTERNS.some((p) => p.test(notes))) {
    warnings.push(`${prefix}: notes 含主观比较措辞，建议改成原始事实: ${notes}`);
  }

  if (!ALLOWED_SUPERVISOR.has(prog.supervisor_letter)) {
    errors.push(`${prefix}: supervisor_letter 值非法: ${String(prog.supervisor_letter)}`);
  }

  const { tuition, tuition_basis, tuition_status } = prog;
  if (!ALLOWED_TUITION_STATUS.has(tuition_status)) {
    errors.push(`${prefix}: tuition_status 值非法: ${String(tuition_status)}`);
  }
  if (tuition === 0 && tuition_basis === "unknown" && tuition_status !== "free") {
    errors.push(`${prefix}: 禁止用 tuition=0 表示学费未公布，请设 tuition=null 且 tuition_status='not_published'`);
  }
  if (tuition != null && tuition_basis == null) {
    errors.push(`${prefix}: 有 tuition 金额时必须明确 tuition_basis，禁止默认假定为按年`);
  }
  if (tuition_basis !== undefined && tuition_basis !== null && !ALLOWED_TUITION_BASIS.has(tuition_basis)) {
    errors.push(`${prefix}: tuition_basis 值非法: ${String(tuition_basis)}`);
  }

  if (prog.data_year !== undefined && prog.data_year !== null && yearInt(prog.data_year) === null) {
    errors.push(`${prefix}: data_year 应为招生/入学批次年份，例如2026: ${String(prog.data_year)}`);
  }

  const scholarships = prog.scholarships ?? {};
  if (typeof scholarships !== "object" || Array.isArray(scholarships)) {
    errors.push(`${prefix}: scholarships 必须是对象`);
  } else {
    for (const [schName, info] of Object.entries(scholarships)) {
      if (schName.includes("/") && schName.length > 8) {
        errors.push(`${prefix}: 奖学金键名 '${schName}' 疑似用斜杠拼接了多个奖学金，请拆分为独立条目`);
      }
      if (!info || typeof info !== "object" || Array.isArray(info)) {
        errors.push(`${prefix}: 奖学金 ${schName} 必须是对象`);
        continue;
      }
      const sv = info.verification_status ?? "verified";
      if (!ALLOWED_VERIFICATION.has(sv)) {
        errors.push(`${prefix}: 奖学金 ${schName} verification_status 值非法: ${String(sv)}`);
      }
      if (info.data_year !== undefined && info.data_year !== null && yearInt(info.data_year) === null) {
        errors.push(`${prefix}: 奖学金 ${schName} data_year 非法: ${String(info.data_year)}`);
      }
      const schNote = info.note ?? "";
      if (FORBIDDEN_FACT_PATTERNS.some((p) => p.test(schNote))) {
        errors.push(`${prefix}: 奖学金 ${schName} note 含违规主观/特定学生残留: ${schNote}`);
      }
      if ((info.included_countries?.length || info.excluded_countries?.length) && info.data_year == null) {
        warnings.push(`${prefix}: 奖学金 ${schName} 含国别名单但未标 data_year，跨批次使用前必须重核`);
      }
    }
  }

  if (!ALLOWED_VERIFICATION.has(prog.verification_status)) {
    errors.push(`${prefix}: verification_status 值非法: ${String(prog.verification_status)}`);
  }

  const combined = JSON.stringify(prog);
  if (!isBachelorProgram(prog) && /CSCA/i.test(combined)) {
    if (/CSCA.{0,12}(?:需要|必需|required)|(?:需要|必需|required).{0,12}CSCA/iu.test(combined)) {
      warnings.push(`${prefix}: 非本科项目出现CSCA必需描述，请逐项目按当年官网重新核实，防止本科要求串入硕博`);
    }
  }

  if (String(prog.major ?? "").includes("第三方") || String(prog.notes ?? "").includes("第三方")) {
    warnings.push(`${prefix}: 条目包含第三方来源提示，不应作为已核实官网事实；建议 verification_status=unverified`);
  }

  if (prog.official_requirements !== undefined && prog.official_requirements !== null && (typeof prog.official_requirements !== "object" || Array.isArray(prog.official_requirements))) {
    errors.push(`${prefix}: official_requirements 必须是对象`);
  }

  return { errors, warnings };
}

export function validateFactEntry(entry: FactSchoolUpsertInput): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = entry.school_name ?? "";
  if (!name) errors.push("单校数据缺少 school_name");
  const progs = entry.programs ?? [];
  if (!Array.isArray(progs)) {
    errors.push(`${name || "未命名学校"}: programs 必须是数组`);
    return { errors, warnings };
  }
  const seenKeys = new Set<string>();
  for (const prog of progs) {
    const pk = programKey(prog);
    if (seenKeys.has(pk)) {
      errors.push(`${name}: 提交数据内部存在重复专业键 ${pk}，请先合并`);
    }
    seenKeys.add(pk);
    const res = validateFactProgram(prog, name);
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }
  return { errors, warnings };
}

function staleReason(ageStale: boolean, yearStale: boolean, verification: string): string | null {
  const reasons: string[] = [];
  if (ageStale) reasons.push("核实时间超过有效期");
  if (yearStale) reasons.push("数据年份与目标入学批次不一致");
  if (verification === "needs_recheck" || verification === "unverified") reasons.push(`项目验证状态=${verification}`);
  return reasons.length ? reasons.join("；") : null;
}

function historicalReason(progYearInt: number | null, targetYear: number, ageStale: boolean): string | null {
  if (progYearInt == null) return null;
  const parts = [`${progYearInt}批次官网规则仅作${targetYear}预匹配参考，目标批次须更新`];
  if (ageStale) parts.push("历史规则核实时间已超过常规有效期");
  return parts.join("；");
}

export function filterUniversityFactDb(
  params: {
    level?: FactDegreeLevel;
    lang?: "english" | "chinese" | "both";
    major?: string;
    majors?: string[];
    matchMode?: "fuzzy" | "strict";
    nationality?: string | null;
    budget?: number | null;
    blockFullScholarship?: boolean;
    targetYear?: number | null;
    maxAgeMonths?: number;
    cities?: string[];
  },
  customDbPath?: string,
): {
  fresh: FilteredFactProgram[];
  historical: FilteredFactProgram[];
  recheck: FilteredFactProgram[];
  urlCachedSchools: number;
} {
  const db = loadFactDb(customDbPath);
  const targetYear = params.targetYear ?? new Date().getFullYear();
  const maxAgeMonths = params.maxAgeMonths ?? 6;
  const matchMode = params.matchMode ?? "fuzzy";
  const majorQueries = [...(params.majors ?? []), ...(params.major ? [params.major] : [])].filter(Boolean);
  const cityNorms = (params.cities ?? []).map((c) => c.replace(/市$/u, "").trim()).filter(Boolean);

  const fresh: FilteredFactProgram[] = [];
  const historical: FilteredFactProgram[] = [];
  const recheck: FilteredFactProgram[] = [];
  let urlCachedSchools = 0;

  for (const [schoolName, school] of Object.entries(db)) {
    if (schoolName.startsWith("_") || !school || typeof school !== "object") continue;
    const urls = school.urls ?? {};
    const urlDate = urls.verified_at || school.updated_at || "";
    if ((urls.iec_url || urls.admission_url) && monthsSince(urlDate) <= maxAgeMonths) {
      urlCachedSchools += 1;
    }

    if (cityNorms.length > 0) {
      const sCity = String(school.city ?? "").replace(/市$/u, "").trim();
      if (sCity && !cityNorms.some((c) => sCity.includes(c) || c.includes(sCity))) {
        continue;
      }
    }

    const ageStale = monthsSince(school.updated_at) > maxAgeMonths;
    for (const prog of school.programs ?? []) {
      if (params.level && !matchFactDegree(prog.degrees ?? [], params.level)) continue;
      if (params.lang && !matchFactLanguage(prog.language ?? "", params.lang)) continue;
      if (majorQueries.length > 0 && !majorQueries.some((q) => matchFactMajor(prog, q, matchMode))) continue;

      const progYear = prog.data_year ?? school.data_year ?? null;
      const progYearInt = yearInt(progYear);
      const yearStale = progYearInt == null || progYearInt !== targetYear;
      const verification = String(prog.verification_status ?? "verified");
      const verificationStale = verification === "needs_recheck" || verification === "unverified";

      let bucket: FactCandidateStatus;
      if (verificationStale || progYearInt == null) bucket = "recheck";
      else if (progYearInt !== targetYear) bucket = "historical";
      else if (ageStale) bucket = "recheck";
      else bucket = "fresh";

      const natNote = checkNationality(prog, params.nationality, targetYear);
      let budgetNote: string | null = null;
      if (params.budget != null && prog.tuition != null && prog.tuition !== 0 && prog.tuition_basis === "per_year") {
        const fee = Number(prog.tuition);
        if (Number.isFinite(fee) && fee > params.budget) {
          const hasFull = Object.values(prog.scholarships ?? {}).some((v) => v && v.type === "full");
          if (params.blockFullScholarship || !hasFull) {
            continue;
          }
          budgetNote = `自费学费(${fee}元/年)超预算${params.budget}元（含全额奖学金通道）`;
        }
      }

      const sourceUrls = [
        prog.source_url,
        urls.admission_url,
        urls.program_url,
        urls.iec_url,
      ].filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)));

      const item: FilteredFactProgram = {
        ...prog,
        school: schoolName,
        city: school.city ?? "",
        tier: school.tier ?? "",
        updated_at: school.updated_at ?? "",
        data_year: progYear,
        verification_status: verification,
        source_urls: [...new Set(sourceUrls)],
        iec_url: urls.iec_url ?? "",
        admission_url: urls.admission_url ?? "",
        program_url: urls.program_url ?? "",
        stale: bucket !== "fresh",
        candidate_status: bucket,
        stale_reason: staleReason(ageStale, yearStale, verification),
        ...(bucket === "historical"
          ? { historical_reference: true, historical_reason: historicalReason(progYearInt, targetYear, ageStale) }
          : {}),
        ...(natNote ? { nationality_note: natNote } : {}),
        ...(budgetNote ? { budget_note: budgetNote } : {}),
      };

      if (bucket === "fresh") fresh.push(item);
      else if (bucket === "historical") historical.push(item);
      else recheck.push(item);
    }
  }

  return { fresh, historical, recheck, urlCachedSchools };
}

export function getCachedSchoolUrls(
  schoolNames?: readonly string[],
  maxAgeMonths = 6,
  customDbPath?: string,
): Record<string, UrlCacheLookup> {
  const db = loadFactDb(customDbPath);
  const targets = schoolNames?.length
    ? schoolNames
    : Object.keys(db).filter((k) => !k.startsWith("_"));
  const results: Record<string, UrlCacheLookup> = {};

  for (const name of targets) {
    const school = db[name];
    if (!school || typeof school !== "object") {
      results[name] = { status: "miss" };
      continue;
    }
    const urls = school.urls ?? {};
    const vDate = urls.verified_at || school.updated_at || "";
    const hasUrl = Boolean(urls.iec_url || urls.admission_url || urls.program_url);
    if (!hasUrl) {
      results[name] = { status: "miss" };
      continue;
    }
    results[name] = {
      status: monthsSince(vDate) <= maxAgeMonths ? "hit_fresh" : "hit_stale",
      verified_at: vDate,
      iec_url: urls.iec_url ?? "",
      admission_url: urls.admission_url ?? "",
      program_url: urls.program_url ?? "",
      dead_urls: [...(urls.dead_urls ?? [])],
      note: urls.note ?? "",
    };
  }
  return results;
}

export function upsertSchoolUrls(
  input: {
    schoolName: string;
    iecUrl?: string;
    admissionUrl?: string;
    programUrl?: string;
    deadUrls?: string[];
    city?: string;
    tier?: string;
  },
  customDbPath?: string,
): { verifiedAt: string; deadUrlCount: number } {
  const dbPath = resolveFactDbPath(customDbPath);
  const db = loadFactDb(dbPath);
  const name = input.schoolName.trim();
  const existing = db[name] && typeof db[name] === "object" ? db[name] : {};
  const urls: FactSchoolUrls = { ...(existing.urls ?? {}) };
  if (input.iecUrl !== undefined) urls.iec_url = input.iecUrl;
  if (input.admissionUrl !== undefined) urls.admission_url = input.admissionUrl;
  if (input.programUrl !== undefined) urls.program_url = input.programUrl;
  if (input.deadUrls?.length) {
    const dead = new Set(urls.dead_urls ?? []);
    for (const u of input.deadUrls) {
      if (u) dead.add(u);
    }
    urls.dead_urls = [...dead];
  }
  const today = todayIsoDate();
  urls.verified_at = today;

  db[name] = {
    ...existing,
    city: input.city || existing.city || "",
    tier: input.tier || existing.tier || "",
    updated_at: existing.updated_at || today,
    urls,
    programs: existing.programs ?? [],
  };
  atomicSaveFactDb(db, dbPath, true);
  return { verifiedAt: today, deadUrlCount: urls.dead_urls?.length ?? 0 };
}

function mergeSingleSchoolIntoDb(db: FactDbMap, entry: FactSchoolUpsertInput, today: string) {
  const name = entry.school_name;
  const newProgs = entry.programs ?? [];
  const newKeys = new Set(newProgs.map(programKey));
  const existing = db[name] && typeof db[name] === "object" ? db[name] : {};
  const mergedProgs = [
    ...(existing.programs ?? []).filter((p) => !newKeys.has(programKey(p))),
    ...newProgs,
  ];
  const mergedUrls: FactSchoolUrls = { ...(existing.urls ?? {}) };
  const incomingUrls = entry.urls ?? {};
  if (Object.keys(incomingUrls).length > 0) {
    const oldDead = new Set(mergedUrls.dead_urls ?? []);
    for (const u of incomingUrls.dead_urls ?? []) {
      if (u) oldDead.add(u);
    }
    Object.assign(mergedUrls, incomingUrls);
    if (oldDead.size > 0) mergedUrls.dead_urls = [...oldDead];
    mergedUrls.verified_at = incomingUrls.verified_at || today;
  }

  const nextEntry: FactSchoolRecord = {
    city: entry.city || existing.city || "",
    tier: entry.tier || existing.tier || "",
    updated_at: entry.updated_at || today,
    urls: mergedUrls,
    programs: mergedProgs,
  };
  if (entry.data_year != null) nextEntry.data_year = entry.data_year;
  else if (existing.data_year != null) nextEntry.data_year = existing.data_year;

  db[name] = nextEntry;
  return { name, added: newProgs.length, total: mergedProgs.length };
}

export function batchUpsertFactEntries(
  entries: FactSchoolUpsertInput[],
  customDbPath?: string,
): {
  ok: boolean;
  errors: string[];
  warnings: string[];
  updatedSchools: Array<{ name: string; added: number; total: number }>;
  totalSchools: number;
} {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  for (const entry of entries) {
    const { errors, warnings } = validateFactEntry(entry);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }
  if (allErrors.length > 0) {
    return {
      ok: false,
      errors: allErrors,
      warnings: allWarnings,
      updatedSchools: [],
      totalSchools: 0,
    };
  }

  const dbPath = resolveFactDbPath(customDbPath);
  const db = loadFactDb(dbPath);
  const today = todayIsoDate();
  const updatedSchools = entries.map((entry) => mergeSingleSchoolIntoDb(db, entry, today));
  atomicSaveFactDb(db, dbPath, true);
  const totalSchools = Object.keys(db).filter((k) => !k.startsWith("_")).length;
  return {
    ok: true,
    errors: [],
    warnings: allWarnings,
    updatedSchools,
    totalSchools,
  };
}

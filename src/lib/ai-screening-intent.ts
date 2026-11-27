import { z } from "zod";

import { extractJsonObject, getAiProviderConfig, requestAiCompletion } from "@/lib/ai-provider";
import { criteriaSchema, hasCriteriaValue, mergeCriteria, type ChatCriteria } from "@/lib/ai-screening";

export const screeningHistorySchema = z
  .array(
    z
      .object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(500),
      })
      .strict(),
  )
  .max(8);

export type ScreeningHistory = z.infer<typeof screeningHistorySchema>;

export const screeningIntentResultSchema = z
  .object({
    criteria: criteriaSchema,
    showOther: z.boolean().optional(),
    intent: z
      .enum(["chat", "search", "compare_cost", "explain", "school_fact"])
      .optional(),
    topic: z
      .enum([
        "TUITION",
        "COST",
        "DEADLINE",
        "INTAKE",
        "LANGUAGE",
        "SCHOLARSHIP",
      ])
      .nullable()
      .optional(),
    reply: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export type ScreeningIntentResult = z.infer<typeof screeningIntentResultSchema>;

export type RequestedRunMode = "partner_priority" | "standard_all" | "partner_quick";

/**
 * Resolves the effective screening mode from the explicit UI toggle or natural
 * language phrasing (e.g. querying internal partner ledger routes to mode 3).
 */
export function detectRunModeFromMessage(
  message: string,
  requestedMode: RequestedRunMode = "partner_priority",
): RequestedRunMode {
  if (requestedMode === "standard_all" || requestedMode === "partner_quick") {
    return requestedMode;
  }
  if (/(?:模式三|只查合作|查合作库|查内部合作|合作院校有哪些|合作名单有哪些|(?:Julia|Young)\s*对接|[SABCD]级合作)/iu.test(message)) {
    return "partner_quick";
  }
  if (/(?:模式一|不看合作|忽略合作|纯客观全网|不要优先合作)/u.test(message)) {
    return "standard_all";
  }
  return requestedMode;
}

export function otherSchoolsPreference(message: string): boolean | null {
  if (/(?:不要|不用|无需|不想|不看|排除|只看|仅看).{0,10}(?:其他|非合作)/u.test(message)) return false;
  if (/(?:其他(?:的)?|非合作(?:的)?)(?:院校|学校|大学)|合作(?:院校|学校|名单).{0,8}(?:以外|之外)/u.test(message)) return true;
  if (/(?:专业|学费|费用|截止|语言|成绩|奖学金|住宿).{0,8}(?:还有|其他|别的)/u.test(message) && !/(?:院校|学校|大学)/u.test(message)) return false;
  if (/(?:还有|再|另外|换|多).{0,6}(?:其他|别的|院校|学校|大学|选择|推荐)|(?:其他|别的)(?:的)?(?:吗|嘛|呢|么)/u.test(message)) return true;
  return null;
}

function normalizedCriteria(criteria: ChatCriteria) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(criteria)
        .filter(([, value]) => hasCriteriaValue(value))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

export function normalizeScreeningIntent(
  result: ScreeningIntentResult,
  previousCriteria: ChatCriteria,
  message: string,
): ScreeningIntentResult {
  const preference = otherSchoolsPreference(message);
  const criteriaChanged =
    normalizedCriteria(result.criteria) !== normalizedCriteria(previousCriteria);
  const intent =
    result.intent === "chat" &&
    (criteriaChanged || preference !== null)
      ? "search"
      : result.intent;
  return {
    ...result,
    intent,
    showOther:
      preference === true
        ? true
        : preference === false
          ? false
          : Boolean(result.showOther),
  };
}

function coerceStringList(value: unknown, itemMax: number, maxItems: number): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const rawList = Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : typeof value === "string"
      ? value.split(/[、,，/／;；|\n]+/u).map((s) => s.trim()).filter(Boolean)
      : [];
  if (!rawList.length) return null;
  return [...new Set(rawList.map((s) => s.slice(0, itemMax)))].slice(0, maxItems);
}

function coerceCriteriaObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const allowedKeys = new Set(Object.keys(criteriaSchema.shape));
  const out: Record<string, unknown> = {};
  const listLimits: Record<string, [number, number]> = {
    targetMajors: [60, 10],
    cities: [30, 10],
    fallbackCities: [30, 10],
    targetSchools: [60, 15],
    scholarshipPreferences: [40, 8],
    customQuestions: [200, 8],
    complianceFlags: [40, 8],
  };
  const stringLimits: Record<string, number> = {
    targetMajor: 120,
    city: 40,
    province: 30,
    nationality: 40,
    degreeBackground: 180,
    plannedExams: 260,
  };
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key)) continue;
    if (key in listLimits) {
      const [itemMax, maxItems] = listLimits[key];
      const coerced = coerceStringList(value, itemMax, maxItems);
      if (coerced !== undefined) out[key] = coerced;
      continue;
    }
    if (key === "mbbsSubjectScores") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        const numOrNull = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
        out[key] = {
          physics: numOrNull(obj.physics),
          chemistry: numOrNull(obj.chemistry),
          biology: numOrNull(obj.biology),
        };
      } else if (value === null) {
        out[key] = null;
      }
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        out[key] = null;
        continue;
      }
      if (key in stringLimits) out[key] = trimmed.slice(0, stringLimits[key]);
      else out[key] = trimmed;
      continue;
    }
    out[key] = value;
  }
  const majors = out.targetMajors as string[] | null | undefined;
  if (majors?.length && !out.targetMajor) {
    out.targetMajor = majors.join(" / ").slice(0, 120);
  }
  const cities = out.cities as string[] | null | undefined;
  if (cities?.length === 1 && !out.city) {
    out.city = cities[0];
  } else if (cities && cities.length > 1 && typeof out.city === "string" && /[、,，/／]/u.test(out.city)) {
    out.city = null;
  }
  if (typeof out.city === "string" && /[、,，/／]/u.test(out.city)) {
    const split = coerceStringList(out.city, 30, 10);
    if (split && split.length > 1) {
      out.cities = split;
      out.city = null;
    }
  }
  return out;
}

function coerceIntentPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {
    criteria: coerceCriteriaObject(obj.criteria),
  };
  if (typeof obj.showOther === "boolean") cleaned.showOther = obj.showOther;
  if (typeof obj.intent === "string") cleaned.intent = obj.intent;
  if (obj.topic === null || typeof obj.topic === "string") cleaned.topic = obj.topic;
  if (obj.reply === null || typeof obj.reply === "string") {
    cleaned.reply = typeof obj.reply === "string" ? obj.reply.trim().slice(0, 300) : null;
  }
  return cleaned;
}

function applyDeterministicHints(criteria: ChatCriteria, message: string): ChatCriteria {
  const next: ChatCriteria = { ...criteria };
  if (/(?:不要|排除|不接受|不考虑|不看)(?:任何)?(?:相近|类似|相关|近似)(?:的)?(?:专业|方向)|(?:只要|仅限|只看)(?:这个|该|指定的)专业|专业(?:必须|要求)(?:完全一致|精确匹配)/u.test(message)) {
    next.strictMajor = true;
  }
  if (next.excludeSelfFunded == null && /(?:过滤|不返回|不要|排除).{0,8}(?:纯自费|自费|无奖学金)|必须可申请奖学金/u.test(message)) {
    next.excludeSelfFunded = true;
    if (!next.scholarshipType) next.scholarshipType = "any";
  }
  if (next.publicOnly == null && /(?:只考虑|仅限|只要|仅看).{0,12}公立|公立大学|公立高校/u.test(message)) {
    next.publicOnly = true;
  }
  if (next.noFoundation == null && /(?:没有|不要|无需|不读).{0,8}(?:基础|预科)|直入.{0,4}(?:1年级|大一|本科一年级)|直接.{0,12}进入\s*1\s*年级/u.test(message)) {
    next.noFoundation = true;
  }
  if (next.wantTiering == null && /(?:Reach|Target|Safe|冲刺.{0,4}匹配|冲刺.{0,4}稳妥|冲稳保|三档)/iu.test(message)) {
    next.wantTiering = true;
  }

  // Deterministic cross-national grade extraction to prevent misclassifying FR 14/20, UK 2:1, DE 1.5, CN 58%
  if (next.gpa == null) {
    const frMatch = message.match(/(?:法语区?|法国|摩洛哥|突尼斯|阿尔及利亚)[^\d]{0,12}(\d{1,2}(?:\.\d+)?)\s*\/\s*20\b|\b(\d{1,2}(?:\.\d+)?)\s*\/\s*20\b/iu);
    if (frMatch) {
      const val = Number(frMatch[1] ?? frMatch[2]);
      if (Number.isFinite(val) && val > 0 && val <= 20) {
        next.gpa = val;
        next.gpaScale = 20;
        next.gradeSystem = "FR_20";
      }
    }
  }
  if (next.gradeSystem == null) {
    if (next.gpaScale === 20 || /\b\d{1,2}(?:\.\d+)?\s*\/\s*20\b/u.test(message)) {
      next.gradeSystem = "FR_20";
    } else if (/德国|德制|反向制|german\s*gpa/iu.test(message) && next.gpa != null && next.gpa <= 5) {
      next.gradeSystem = "DE_REVERSE";
    } else if (/\b2\s*:\s*1\b|\b2\s*:\s*2\b|upper\s*second|二等一|英国(?:本科|荣誉)/iu.test(message)) {
      next.gradeSystem = "UK_HONOURS";
    }
  }
  if (next.gpa == null) {
    const pctMatch = message.match(/(?:均分|平均分|高中成绩|成绩|分数)[^\d]{0,4}(\d{2}(?:\.\d+)?)\s*(?:%|％|分)/u);
    if (pctMatch) {
      const val = Number(pctMatch[1]);
      if (Number.isFinite(val) && val >= 20 && val <= 100) {
        next.gpa = val;
        next.gpaScale = 100;
        if (!next.gradeSystem) next.gradeSystem = "CN_100";
      }
    }
  }

  // Deterministic language status (explicit zero language vs MOI vs unspecified)
  const hasAnyScore =
    next.hskLevel != null || next.ielts != null || next.toefl != null || next.duolingo != null;
  if (next.hasMoiCertificate == null && /\bMOI\b|英文授课证明|英语授课证明|medium\s+of\s+instruction/iu.test(message)) {
    next.hasMoiCertificate = true;
  }
  if (next.languageStatus == null) {
    if (hasAnyScore) {
      next.languageStatus = "HAS_SCORE";
    } else if (next.hasMoiCertificate) {
      next.languageStatus = "MOI_ONLY";
    } else if (/(?:无|没有|暂无|零基础|未考).{0,6}(?:HSK|雅思|IELTS|托福|TOEFL|多邻国|语言成绩|语言证书)|零语言/iu.test(message)) {
      next.languageStatus = "CONFIRMED_NONE";
    }
  }

  // HSK 3.0 & HSKK detection
  if (next.hskVersion == null && /HSK\s*3\.0|新\s*HSK/iu.test(message)) {
    next.hskVersion = "3.0";
  }
  if (next.hasHskk == null) {
    if (/(?:无|没有|没考).{0,4}(?:HSKK|口语)/iu.test(message)) next.hasHskk = false;
    else if (/HSKK|口语(?:合格|通过|\d+分)/iu.test(message)) next.hasHskk = true;
  }

  // CSCA score detection (e.g. "CSCA数学42分", "CSCA 45分")
  if (next.cscaMinSubjectScore == null && next.cscaScore == null) {
    const cscaMath = message.match(/CSCA[^\d。！？；;]{0,10}(?:数学|math)[^\d]{0,4}(\d{1,3}(?:\.\d+)?)/iu);
    const cscaPhys = message.match(/CSCA[^\d。！？；;]{0,10}(?:物理|physics)[^\d]{0,4}(\d{1,3}(?:\.\d+)?)/iu);
    const cscaGen = message.match(/CSCA[^\d。！？；;]{0,8}(\d{2,3}(?:\.\d+)?)\s*分?/iu);
    const vals: number[] = [];
    if (cscaMath) {
      const v = Number(cscaMath[1]);
      if (v >= 0 && v <= 100) { next.cscaMathScore = v; vals.push(v); }
    }
    if (cscaPhys) {
      const v = Number(cscaPhys[1]);
      if (v >= 0 && v <= 100) { next.cscaPhysicsScore = v; vals.push(v); }
    }
    if (!vals.length && cscaGen) {
      const v = Number(cscaGen[1]);
      if (v >= 0 && v <= 100) { next.cscaScore = v; vals.push(v); }
    }
    if (vals.length) {
      next.cscaMinSubjectScore = Math.min(...vals);
      next.hasCsca = true;
    }
  }

  // Failed course count detection
  if (next.failedCourseCount == null) {
    const failMatch = message.match(/(?:挂科|不及格)[^\d]{0,4}(\d{1,2})\s*门|(\d{1,2})\s*门(?:核心课)?(?:挂科|不及格)/u);
    if (failMatch) {
      next.failedCourseCount = Number(failMatch[1] ?? failMatch[2]);
    } else if (/多门挂科|挂科很多|挂科严重/u.test(message)) {
      next.failedCourseCount = 3;
    }
  }

  // Highest education & degree certificate status detection
  if (next.highestEducation == null) {
    if (/(?:无|没有)高中(?:毕业证|学历|同等学历)|仅初中/u.test(message)) {
      next.highestEducation = "BELOW_HS";
    } else if (/(?:中专|职高|技校|中等专业学校|中职)/u.test(message)) {
      next.highestEducation = "VOCATIONAL_HS";
    } else if (/(?:无|没有|缺)(?:学士)?学位证|仅(?:有)?本科毕业证|本科结业/u.test(message)) {
      next.highestEducation = "BACHELOR_NO_DEGREE";
    } else if (/(?:大专|高职|专科)(?:毕业|学历)/u.test(message) && next.programType === "MASTER") {
      next.highestEducation = "ASSOCIATE";
    }
  }
  if (next.associateWorkYears == null && next.highestEducation === "ASSOCIATE") {
    const yrMatch = message.match(/(?:毕业|工作)(?:满|已)?\s*(\d{1,2})\s*年/u);
    if (yrMatch) next.associateWorkYears = Number(yrMatch[1]);
  }

  // Statutory compliance flags detection
  const flags = new Set(next.complianceFlags ?? []);
  if (/未满.{0,4}(?:四年两年|4年2年)|不满足.{0,4}(?:四年两年|4年2年)|入籍未满4年/u.test(message)) {
    next.isChineseOrigin = true;
    next.chineseOriginCompliant = false;
    flags.add("UNDER_FOUR_TWO_RULE");
  }
  if (/活动性肺结核|开放性肺结核/u.test(message)) flags.add("TB_ACTIVE");
  if (/严重精神障碍|精神分裂/u.test(message)) flags.add("MENTAL_DISORDER");
  if (/犯罪记录|前科|刑事犯罪/u.test(message)) flags.add("CRIMINAL_RECORD");
  if (/吸毒|涉毒/u.test(message)) flags.add("DRUG_HISTORY");
  if (/材料造假|假成绩单|假学历|伪造证书/u.test(message)) flags.add("DOC_FRAUD");
  if (flags.size) next.complianceFlags = [...flags];

  if (next.academicLevel == null) {
    if (/(?:成绩|绩点|均分|学术基础|学习基础).{0,8}(?:很烂|太烂|非常烂|很差|极差|太差|垫底|非常低|特别低|一塌糊涂)|挂科.{0,6}(?:很多|严重)/u.test(message)) {
      next.academicLevel = "POOR";
    } else if (/(?:成绩|绩点|均分|学术基础).{0,8}(?:偏弱|较差|偏低|不太好|一般偏下|较弱)/u.test(message)) {
      next.academicLevel = "WEAK";
    }
  }
  return next;
}

export const SCREENING_INTENT_SYSTEM_PROMPT = `你是面向留学顾问的中文 AI 选校助手。自然、简洁地理解对话和长段结构化选校指令，先回答用户真正的问题；不要假装已经检索，不编造学校、项目、费用、申请资格或招生信息。只能输出 JSON 对象：{"criteria":{},"showOther":false,"intent":"chat|search|compare_cost|explain|school_fact","topic":null,"reply":null}。
打招呼、问你是谁、怎么使用、能力或一般闲聊用 chat，并在 reply 给出简短自然的回答；通常一两句话，问什么答什么，不要每次罗列全部功能或机械追问。结合已有对话，避免每次重复自我介绍。chat 不能推荐具体学校或断言具体学校事实。请求查找、给出选校方案、调整申请条件、询问是否有合适学校用 search；即使缺条件也可以提出需求，如果完全没有申请条件，在 reply 中自然询问一两项关键条件。问哪所最便宜或比较费用用 compare_cost；问为什么推荐、哪所更适合用 explain；追问某校或项目的学费、首年费用、截止、入学、语言或奖学金用 school_fact，topic 分别为 TUITION、COST、DEADLINE、INTAKE、LANGUAGE、SCHOLARSHIP，其余为 null。历史对话仅用于理解上下文，学校结果由系统工具核实；不能把历史里的内容当作学校事实。用户要求其他或非合作学校时 showOther=true。
将用户最新要求合并到已有 criteria；未提及的保留，明确取消时设 null；不能推测，绝不脑补好条件。允许的 criteria 字段：
- programType: "UG"|"MASTER"|"PHD"|"LONG_TERM"|"SHORT_TERM"（学士/本科用 UG，硕士/MBA 用 MASTER，博士用 PHD）
- teachingLanguage: "CHINESE"|"ENGLISH"
- targetMajor: 字符串（主专业概括）
- targetMajors: 字符串数组（多个并列专业方向时拆分填这里，如 ["建筑国际MBA","绿色建筑","可持续建筑"] 或 ["国际关系","外交","全球治理"]）
- strictMajor: 布尔值（仅当用户明确拒绝相近专业时 true）
- budget: 人民币数字
- intakeYear: 整数年份（如 2027）
- intakeSeason: "SPRING"|"SUMMER"|"AUTUMN"|"WINTER"（9月入学记为 AUTUMN，3月入学记为 SPRING；未明确不猜）
- gpa, gpaScale, gradeSystem: 保留原始分制不换算（如 3.02/4.0 -> gpa:3.02, gpaScale:4, gradeSystem:"GPA_4"；均分58% -> gpa:58, gpaScale:100, gradeSystem:"CN_100"；法语区 14/20 -> gpa:14, gpaScale:20, gradeSystem:"FR_20"；英国 2:1 65% -> gpa:65, gpaScale:100, gradeSystem:"UK_HONOURS"；德国反向制 1.5 -> gpa:1.5, gpaScale:5, gradeSystem:"DE_REVERSE"）
- academicLevel: "EXCELLENT"|"GOOD"|"MEDIUM"|"WEAK"|"POOR"（仅当用文字定性描述成绩好坏而未给具体分值时填）
- failedCourseCount: 整数（明确提到挂科门数时填，未提及留 null）
- hskLevel, hskScore, hskVersion ("2.0"|"3.0"), hasHskk, ielts, toefl, duolingo: 仅填学生“当前已考出”的成绩；“无雅思托福/无HSK”留 null 并把 languageStatus 设为 "CONFIRMED_NONE"；仅持本地英文授课证明(MOI)设 hasMoiCertificate:true 与 languageStatus:"MOI_ONLY"；计划考试放 plannedExams。
- hasCsca, cscaRequirement, cscaScore, cscaMathScore, cscaPhysicsScore, cscaChineseScore, cscaMinSubjectScore: 已有 CSCA 成绩时填入对应数字（特别是低于50/70分的单科成绩）
- scholarshipType: "full"|"any"（要求必须可申奖学金填 "any"，明确要求全奖填 "full"）
- excludeSelfFunded: 布尔值（明确要求过滤纯自费/无奖学金项目时填 true）
- scholarshipPreferences: 字符串数组（如 ["CSC","MOFCOM","上海市政府奖学金","院校Merit奖学金"]）
- accommodationRequired: 布尔值
- age: 整数
- city, cities, fallbackCities, province: 城市与省份
- targetSchools: 指定院校参考池字符串数组（英文缩写如 ECUPL 转为 "华东政法大学"）
- publicOnly: 布尔值
- noFoundation: 布尔值（明确直入大一不要预科时 true）
- nationality, isChineseOrigin, chineseOriginCompliant: 国籍及华裔“四年两年”合规情况
- highestEducation: "HIGH_SCHOOL"|"VOCATIONAL_HS"|"ASSOCIATE"|"BACHELOR_DEGREE"|"BACHELOR_NO_DEGREE"|"MASTER"|"BELOW_HS"（区分普高/中专职高/大专/本科有学位证/本科无学位证或结业）
- associateWorkYears: 大专毕业年限（整数）
- complianceFlags: 字符串数组（仅当明确提及法定禁忌时填，如 "UNDER_FOUR_TWO_RULE"、"TB_ACTIVE"、"MENTAL_DISORDER"、"CRIMINAL_RECORD"、"DRUG_HISTORY"、"DOC_FRAUD"）
- mbbsSubjectScores: {"physics":数字,"chemistry":数字,"biology":数字}（仅申请英文 MBBS 且提及理化生单科分时填）
- consultationMonth: 整数 1-12（仅当用户明确指明咨询月份如“现在4月”时填）
- degreeBackground: 前置学历说明
- plannedExams: 计划考试与目标分
- wantTiering: 布尔值
- customQuestions: 字符串数组`;

type ExtractOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function extractScreeningIntent(
  input: {
    message: string;
    criteria: ChatCriteria;
    history: ScreeningHistory;
    hasPrevious: boolean;
  },
  options: ExtractOptions = {},
): Promise<ScreeningIntentResult & { criteria: ChatCriteria }> {
  const current = getAiProviderConfig();
  const payload = await requestAiCompletion({
    apiKey: options.apiKey ?? current.apiKey,
    baseUrl: options.baseUrl ?? current.baseUrl,
    model: options.model ?? current.model,
  }, [
    { role: "system", content: SCREENING_INTENT_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        previousCriteria: input.criteria,
        hasPreviousSearch: input.hasPrevious,
        history: input.history,
        message: input.message,
      }),
    },
  ], { timeoutMs: options.timeoutMs ?? 30_000, maxTokens: 1024, signal: options.signal, fetchImpl: options.fetchImpl });
  const content = payload?.choices?.[0]?.message?.content;
  if (
    typeof content !== "string" ||
    !content.trim() ||
    payload?.choices?.[0]?.finish_reason === "length"
  ) {
    throw new Error("模型返回内容不完整，请重试。");
  }
  let parsed: unknown;
  try {
    parsed = extractJsonObject(content);
  } catch {
    throw new Error("模型返回格式错误，请重试。");
  }
  const result = screeningIntentResultSchema.safeParse(coerceIntentPayload(parsed));
  if (!result.success) {
    throw new Error("模型返回的筛选条件不符合要求，请重试或换一种说法。");
  }
  const enriched = applyDeterministicHints(result.data.criteria, input.message);
  const mergedCriteria = mergeCriteria(
    input.criteria,
    enriched,
    input.message,
  );
  return {
    ...normalizeScreeningIntent(
      { ...result.data, criteria: mergedCriteria },
      input.criteria,
      input.message,
    ),
    criteria: mergedCriteria,
  };
}

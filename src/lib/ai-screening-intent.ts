import { z } from "zod";

import { criteriaSchema, mergeCriteria, type ChatCriteria } from "@/lib/ai-screening";

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
        .filter(([, value]) => value != null && value !== "")
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

export const SCREENING_INTENT_SYSTEM_PROMPT = `你是面向留学顾问的中文 AI 选校助手。自然、简洁地理解对话，先回答用户真正的问题；不要假装已经检索，不编造学校、项目、费用、申请资格或招生信息。只能输出 JSON 对象：{"criteria":{},"showOther":false,"intent":"chat|search|compare_cost|explain|school_fact","topic":null,"reply":null}。
打招呼、问你是谁、怎么使用、能力或一般闲聊用 chat，并在 reply 给出简短自然的回答；通常一两句话，问什么答什么，不要每次罗列全部功能或机械追问。结合已有对话，避免每次重复自我介绍。chat 不能推荐具体学校或断言具体学校事实。请求查找、调整申请条件、询问是否有合适学校用 search；即使缺条件也可以提出需求，如果完全没有申请条件，在 reply 中自然询问一两项关键条件。问哪所最便宜或比较费用用 compare_cost；问为什么推荐、哪所更适合用 explain；追问某校或项目的学费、首年费用、截止、入学、语言或奖学金用 school_fact，topic 分别为 TUITION、COST、DEADLINE、INTAKE、LANGUAGE、SCHOLARSHIP，其余为 null。历史对话仅用于理解上下文，学校结果由系统工具核实；不能把历史里的内容当作学校事实。用户要求其他或非合作学校时 showOther=true。
将用户最新要求合并到已有 criteria；未提及的保留，明确取消时设 null；不能推测。只允许字段 programType(UG,MASTER,PHD,LONG_TERM,SHORT_TERM), teachingLanguage(CHINESE,ENGLISH), targetMajor, budget(人民币数字), intakeYear, intakeSeason(SPRING,SUMMER,AUTUMN,WINTER), gpa, gpaScale, hskLevel, hskScore, ielts, toefl, duolingo, hasCsca, cscaRequirement(NOT_REQUIRED,REQUIRED), scholarshipType(full,any), accommodationRequired, age, city, province。未明确入学季节时不要猜测。学生没有 CSCA 使用 hasCsca=false；仅当用户要求只看明确不要求 CSCA 的学校时使用 cscaRequirement=NOT_REQUIRED。不要在 criteria 输出姓名、国籍或敏感信息。`;

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
  const key = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error(
      "尚未配置 DeepSeek API，无法解析对话条件。请联系管理员配置后重试。",
    );
  }
  const base = (
    options.baseUrl ??
    process.env.DEEPSEEK_BASE_URL ??
    "https://api.deepseek.com"
  ).replace(/\/$/, "");
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 25_000);
  const signals = options.signal ? [options.signal, timeout] : [timeout];
  const response = await (options.fetchImpl ?? fetch)(
    `${base}/chat/completions`,
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.any(signals),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:
          options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
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
        ],
      }),
    },
  );
  if (!response.ok) {
    throw new Error("DeepSeek 请求失败，请检查模型配置或稍后重试。");
  }
  const payload = await response.json();
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
    parsed = JSON.parse(content);
  } catch {
    throw new Error("模型返回格式错误，请重试。");
  }
  const result = screeningIntentResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("模型返回的筛选条件不符合要求，请重试或换一种说法。");
  }
  const mergedCriteria = mergeCriteria(
    input.criteria,
    result.data.criteria,
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

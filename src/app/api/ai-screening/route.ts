import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { buildResults, criteriaSchema, mergeCriteria } from "@/lib/ai-screening";
import { loadScreeningData } from "@/lib/ai-screening-data";
import { containsPersonalContact, containsSensitiveRestriction } from "@/lib/ai-screening-input";
import { isCandidate } from "@/lib/ai-screening-presentation";
import { WorkbookError } from "@/lib/ai-screening-workbook";
import { advisorFollowUpAnswer, factQuestion, followUpIntent, schoolFactAnswer } from "@/lib/ai-screening-follow-up";
import { chooseNarrativeFocus, createNarrative } from "@/lib/ai-screening-narrative";
import type { SearchEvent, ScreeningResponse } from "@/lib/ai-screening-events";

export const runtime = "nodejs";
const historySchema = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(500) }).strict()).max(8);
const seenSchema = z.array(z.string().trim().min(1).max(160)).max(200).default([]);
const requestSchema = z.object({ message: z.string().trim().min(1).max(1500), criteria: criteriaSchema.default({}), criteriaOverride: criteriaSchema.nullable().default(null), showOther: z.boolean().default(false), sensitiveContext: z.boolean().default(false), hasPrevious: z.boolean().default(false), previousOtherRequested: z.boolean().default(false), focusSchool: z.string().max(120).nullable().default(null), previousProgramIds: z.array(z.string().min(1).max(120)).max(3).default([]), seenProgramIds: seenSchema, seenSchoolNames: seenSchema, history: historySchema.default([]) }).strict();

async function extractCriteria(message: string, criteria: z.infer<typeof criteriaSchema>, history: z.infer<typeof historySchema>, hasPrevious: boolean, signal: AbortSignal) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("尚未配置 DeepSeek API，无法解析对话条件。请联系管理员配置后重试。");
  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || "deepseek-flash", response_format: { type: "json_object" }, temperature: 0, messages: [
      { role: "system", content: `你是面向留学顾问的中文 AI 选校助手。自然、简洁地理解对话，先回答用户真正的问题；不要假装已经检索，不编造学校、项目、费用、申请资格或招生信息。只能输出 JSON 对象：{"criteria":{},"showOther":false,"intent":"chat|search|compare_cost|explain|school_fact","topic":null,"reply":null}。
打招呼、问你是谁、怎么使用、能力或一般闲聊用 chat，并在 reply 给出简短自然的回答；通常一两句话，问什么答什么，不要每次罗列全部功能或机械追问。结合已有对话，避免每次重复自我介绍。chat 不能推荐具体学校或断言具体学校事实。请求查找、调整申请条件、询问是否有合适学校用 search；即使缺条件也可以提出需求，如果完全没有申请条件，在 reply 中自然询问一两项关键条件。问哪所最便宜或比较费用用 compare_cost；问为什么推荐、哪所更适合用 explain；追问某校或项目的学费、首年费用、截止、入学、语言或奖学金用 school_fact，topic 分别为 TUITION、COST、DEADLINE、INTAKE、LANGUAGE、SCHOLARSHIP，其余为 null。历史对话仅用于理解上下文，学校结果由系统工具核实；不能把历史里的内容当作学校事实。用户要求其他或非合作学校时 showOther=true。
将用户最新要求合并到已有 criteria；未提及的保留，明确取消时设 null；不能推测。只允许字段 programType(UG,MASTER,PHD,LONG_TERM,SHORT_TERM), teachingLanguage(CHINESE,ENGLISH), targetMajor, budget(人民币数字), intakeYear, intakeSeason(SPRING,SUMMER,AUTUMN,WINTER), gpa, gpaScale, hskLevel, hskScore, ielts, toefl, duolingo, hasCsca, cscaRequirement(NOT_REQUIRED,REQUIRED), scholarshipType(full,any), accommodationRequired, age, city, province。未明确入学季节时不要猜测。学生没有 CSCA 使用 hasCsca=false；仅当用户要求只看明确不要求 CSCA 的学校时使用 cscaRequirement=NOT_REQUIRED。不要在 criteria 输出姓名、国籍或敏感信息。` },
      { role: "user", content: JSON.stringify({ previousCriteria: criteria, hasPreviousSearch: hasPrevious, history, message }) },
    ] }),
  });
  if (!response.ok) throw new Error("DeepSeek 请求失败，请检查模型配置或稍后重试。");
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim() || payload?.choices?.[0]?.finish_reason === "length") throw new Error("模型返回内容不完整，请重试。");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("模型返回格式错误，请重试。"); }
  const result = z.object({ criteria: criteriaSchema, showOther: z.boolean().optional(), intent: z.enum(["chat", "search", "compare_cost", "explain", "school_fact"]).optional(), topic: z.enum(["TUITION", "COST", "DEADLINE", "INTAKE", "LANGUAGE", "SCHOLARSHIP"]).nullable().optional(), reply: z.string().trim().max(300).nullable().optional() }).safeParse(parsed);
  if (!result.success) throw new Error("模型返回的筛选条件不符合要求，请重试或换一种说法。");
  return { ...result.data, criteria: mergeCriteria(criteria, result.data.criteria, message) };
}

function safeConversationReply(reply: string | null | undefined) {
  if (!reply || containsPersonalContact(reply) || containsSensitiveRestriction(reply) || /(?:大学|学院|学校).{0,20}(?:录取|费用|学费|奖学金|截止|开班)|https?:\/\//iu.test(reply)) return null;
  return reply;
}

function otherSchoolsPreference(message: string): boolean | null {
  if (/(?:不要|不用|无需|不想|不看|排除|只看|仅看).{0,10}(?:其他|非合作)/u.test(message)) return false;
  if (/(?:其他(?:的)?|非合作(?:的)?)(?:院校|学校|大学)|合作(?:院校|学校|名单).{0,8}(?:以外|之外)/u.test(message)) return true;
  if (/(?:专业|学费|费用|截止|语言|成绩|奖学金|住宿).{0,8}(?:还有|其他|别的)/u.test(message) && !/(?:院校|学校|大学)/u.test(message)) return false;
  if (/(?:还有|再|另外|换|多).{0,6}(?:其他|别的|院校|学校|大学|选择|推荐)|(?:其他|别的)(?:的)?(?:吗|嘛|呢|么)/u.test(message)) return true;
  return null;
}

function errorMessage(error: unknown) {
  return error instanceof WorkbookError || error instanceof Error && (error.message.startsWith("模型") || error.message.startsWith("DeepSeek") || error.message.startsWith("尚未") || error.message.startsWith("招生表")) ? error.message : "读取数据或模型请求失败，请检查配置后重试。";
}

async function search(data: z.infer<typeof requestSchema>, role: string, signal: AbortSignal, emit: (event: SearchEvent) => void): Promise<ScreeningResponse> {
  const step = (id: "understand" | "cooperation" | "alternatives" | "summary", status: "active" | "done" | "warning" | "skipped", message: string) => emit({ type: "progress", step: { id, status, message } });
  step("understand", "active", "正在理解学生的申请需求");
  const extracted = data.criteriaOverride
    ? { criteria: data.criteriaOverride, showOther: false, intent: "search" as const, topic: null, reply: null }
    : await extractCriteria(data.message, data.criteria, data.history, data.hasPrevious, signal);
  step("understand", "done", "已整理本次申请条件");
  const otherPreference = otherSchoolsPreference(data.message);
  if (extracted.intent === "chat" && !data.showOther && otherPreference !== true) {
    const reply = safeConversationReply(extracted.reply);
    if (!reply) throw new Error("模型未能生成合适的对话回复，请重试。");
    step("summary", "done", "已回复本次问题");
    return { criteria: data.criteria, results: { confirmed: [], pending: [], other: [], otherHidden: false }, source: "", partnerConfigured: Boolean(process.env.AI_SCREENING_PARTNERS_PATH), otherRequested: data.previousOtherRequested, sensitiveContext: data.sensitiveContext, prompt: "", focusSchool: data.focusSchool, conversation: true, answer: { lead: reply, details: [] } };
  }
  const noCriteria = Object.values(extracted.criteria).every((value) => value == null || value === "");
  if (noCriteria) {
    step("summary", "done", "等待学生的申请需求");
    return { criteria: extracted.criteria, results: { confirmed: [], pending: [], other: [], otherHidden: false }, source: "", partnerConfigured: Boolean(process.env.AI_SCREENING_PARTNERS_PATH), otherRequested: data.previousOtherRequested, sensitiveContext: data.sensitiveContext, prompt: "", focusSchool: data.focusSchool, conversation: true, answer: { lead: safeConversationReply(extracted.reply) ?? "您可以先告诉我学生想申请的学历或专业，我再帮您查找。", details: [] } };
  }
  step("cooperation", "active", "正在核对招生名单和合作记录");
  const { list, partners, schools, programs: searchPrograms } = await loadScreeningData();
  const partnerConfigured = Boolean(process.env.AI_SCREENING_PARTNERS_PATH);
  let searchingOthers = false;
  const recognizedFact = data.hasPrevious ? factQuestion(data.message) : null;
  const intent = recognizedFact ? "school_fact" : followUpIntent(data.message) ?? (extracted.intent === "chat" || extracted.intent === "school_fact" && !data.hasPrevious ? "search" : extracted.intent) ?? "search";
  const otherRequested = data.showOther || (otherPreference !== false && (otherPreference === true || Boolean(extracted.showOther) || (intent !== "search" && data.previousOtherRequested)));
  const evaluationCriteria = intent === "school_fact" ? data.criteria : extracted.criteria;
  const exclusions = otherRequested && intent === "search" ? { schoolKeys: data.seenSchoolNames, programIds: data.seenProgramIds } : undefined;
  const results = buildResults(list.rows, searchPrograms, schools, partners, evaluationCriteria, role === "ADMIN" || role === "DATA_MANAGER", otherRequested, {
    onPartnerSearchComplete(state) {
      searchingOthers = state.searchingOthers;
      if (state.confirmed) step("cooperation", "done", `已检索合作院校名单，找到 ${state.confirmed} 个已知条件符合的项目；项目合作范围需核实`);
      else step("cooperation", "warning", "已先检索合作院校名单，暂未找到已知条件明确符合的项目");
      if (state.searchingOthers) step("alternatives", "active", "正在核对学校知识库");
      else step("alternatives", "skipped", "已找到合作候选；如需更多选择，可以继续查看其他院校");
    },
  }, exclusions);
  if (searchingOthers) {
    const count = results.other.filter(isCandidate).length;
    step("alternatives", "done", count ? `已检索其他院校，找到 ${count} 个项目候选` : "已检索其他院校，暂未找到有足够依据的项目候选");
  }
  step("summary", "active", "正在整理匹配依据和需要核实的信息");
  const needsMajor = !["LONG_TERM", "SHORT_TERM"].includes(evaluationCriteria.programType ?? "");
  const missing = [!evaluationCriteria.programType && "申请学历", needsMajor && !evaluationCriteria.targetMajor && "目标专业", evaluationCriteria.budget == null && "首年预算", evaluationCriteria.intakeYear == null && "入学年份"].filter((value): value is string => Boolean(value));
  const prompt = missing.length ? `想进一步缩小范围，可以告诉我${missing.slice(0, 2).join("和")}。` : "如果想调整条件，直接告诉我就可以。";
  const sensitiveContext = data.sensitiveContext || /国籍|国别|生源|种族|肤色|皮肤|宗教|穆斯林|伊斯兰|孟加拉|巴基斯坦|印度|尼日利亚|非洲|南亚|东南亚|中亚|俄罗斯|越南|泰国|缅甸|韩国|菲律宾/iu.test(data.message);
  const response: ScreeningResponse = { criteria: evaluationCriteria, results, source: list.name, partnerConfigured, otherRequested, sensitiveContext, prompt };
  if (intent === "school_fact") {
    const topic = recognizedFact ?? extracted.topic;
    response.answer = topic ? schoolFactAnswer(topic, data.message, response, data.hasPrevious, data.focusSchool, data.previousProgramIds) : { lead: "您想了解哪所学校的哪项信息？可以问学费、入学时间、语言要求或奖学金。", details: [] };
  } else if (intent !== "search") response.answer = await advisorFollowUpAnswer(intent, data.message, response, data.hasPrevious, data.focusSchool, data.previousProgramIds, signal);
  else response.narrative = createNarrative(response, await chooseNarrativeFocus(response, signal, data.message));
  if (response.narrative) {
    response.shown = {
      programIds: [...new Set(response.narrative.highlights.flatMap((item) => item.programId ? [item.programId] : []))],
      schoolNames: [...new Set(response.narrative.highlights.map((item) => item.name))],
    };
  }
  const inResults = [...results.confirmed, ...results.pending, ...results.other].some((card) => card.name === data.focusSchool);
  response.focusSchool = response.answer?.school ?? (intent === "search" && inResults ? data.focusSchool : null);
  step("summary", "done", "已整理结果；缺失或存在冲突的信息会单独提示");
  return response;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  let body: ReturnType<typeof requestSchema.safeParse>;
  try { body = requestSchema.safeParse(await request.json()); } catch { return Response.json({ error: "输入内容无效，请检查后重试。" }, { status: 400 }); }
  if (!body.success) return Response.json({ error: "输入内容无效，请检查后重试。" }, { status: 400 });
  const textInputs = [body.data.message, ...body.data.history.map(({ content }) => content), ...Object.values(body.data.criteria).filter((value): value is string => typeof value === "string")];
  if (textInputs.some(containsPersonalContact)) return Response.json({ error: "请移除姓名、联系方式和证件等个人信息，使用脱敏案例。" }, { status: 400 });
  if (textInputs.some(containsSensitiveRestriction)) return Response.json({ error: "请移除聊天中的敏感招生限制，再描述申请条件；结果中会提示需要人工核实的事项。" }, { status: 400 });
  const data = body.data;
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
    try { return Response.json(await search(data, user.role, request.signal, () => {}), { headers: { "Cache-Control": "no-store" } }); }
    catch (error) { return Response.json({ error: errorMessage(error) }, { status: 503 }); }
  }
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: SearchEvent) => { if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      try { emit({ type: "result", result: await search(data, user.role, request.signal, emit) }); }
      catch (error) { emit({ type: "error", message: errorMessage(error) }); }
      finally { if (!cancelled) controller.close(); }
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}

import { z } from "zod";
import { AiProviderError } from "@/lib/ai-provider";
import { getCurrentUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/access-control";
import { buildResults, criteriaSchema } from "@/lib/ai-screening";
import { loadScreeningData } from "@/lib/ai-screening-data";
import { loadScreeningFeedbackScores } from "@/lib/ai-screening-feedback";
import { containsPersonalContact, containsSensitiveRestriction } from "@/lib/ai-screening-input";
import { extractScreeningIntent, otherSchoolsPreference, screeningHistorySchema } from "@/lib/ai-screening-intent";
import { isCandidate } from "@/lib/ai-screening-presentation";
import { WorkbookError } from "@/lib/ai-screening-workbook";
import { advisorFollowUpAnswer, factQuestion, followUpIntent, schoolFactAnswer, shownGroupAnswer, shownGroupTopic } from "@/lib/ai-screening-follow-up";
import { chooseNarrativeFocus, createNarrative } from "@/lib/ai-screening-narrative";
import type { SearchEvent, ScreeningResponse } from "@/lib/ai-screening-events";
import { isSameOrigin } from "@/lib/http";

export const runtime = "nodejs";
const seenSchema = z.array(z.string().trim().min(1).max(160)).max(200).default([]);
const requestSchema = z.object({ message: z.string().trim().min(1).max(1500), criteria: criteriaSchema.default({}), criteriaOverride: criteriaSchema.nullable().default(null), showOther: z.boolean().default(false), sensitiveContext: z.boolean().default(false), hasPrevious: z.boolean().default(false), previousOtherRequested: z.boolean().default(false), focusSchool: z.string().max(120).nullable().default(null), previousProgramIds: z.array(z.string().min(1).max(120)).max(3).default([]), seenProgramIds: seenSchema, seenSchoolNames: seenSchema, history: screeningHistorySchema.default([]) }).strict();

function safeConversationReply(reply: string | null | undefined) {
  if (!reply || containsPersonalContact(reply) || containsSensitiveRestriction(reply) || /(?:大学|学院|学校).{0,20}(?:录取|费用|学费|奖学金|截止|开班)|https?:\/\//iu.test(reply)) return null;
  return reply;
}

function errorMessage(error: unknown) {
  return error instanceof AiProviderError || error instanceof WorkbookError || error instanceof Error && (error.message.startsWith("模型") || error.message.startsWith("招生表")) ? error.message : "读取数据或模型请求失败，请检查配置后重试。";
}

async function search(data: z.infer<typeof requestSchema>, user: { id: string; role: string }, signal: AbortSignal, emit: (event: SearchEvent) => void): Promise<ScreeningResponse> {
  const step = (id: "understand" | "cooperation" | "alternatives" | "summary", status: "active" | "done" | "warning" | "skipped", message: string) => emit({ type: "progress", step: { id, status, message } });
  step("understand", "active", "正在理解学生的申请需求");
  const groupTopic = data.hasPrevious && !data.criteriaOverride ? shownGroupTopic(data.message) : null;
  const extracted = groupTopic
    ? { criteria: data.criteria, showOther: false, intent: "school_fact" as const, topic: groupTopic, reply: null }
    : data.criteriaOverride
    ? { criteria: data.criteriaOverride, showOther: false, intent: "search" as const, topic: null, reply: null }
    : await extractScreeningIntent({ message: data.message, criteria: data.criteria, history: data.history, hasPrevious: data.hasPrevious }, { signal });
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
  const intent = groupTopic || recognizedFact ? "school_fact" : followUpIntent(data.message) ?? (extracted.intent === "chat" || extracted.intent === "school_fact" && !data.hasPrevious ? "search" : extracted.intent) ?? "search";
  const otherRequested = data.showOther || (otherPreference !== false && (otherPreference === true || Boolean(extracted.showOther) || (intent !== "search" && data.previousOtherRequested)));
  const evaluationCriteria = intent === "school_fact" ? data.criteria : extracted.criteria;
  const exclusions = otherRequested && intent === "search" ? { schoolKeys: data.seenSchoolNames, programIds: data.seenProgramIds } : undefined;
  const results = buildResults(list.rows, searchPrograms, schools, partners, evaluationCriteria, user.role === "ADMIN" || user.role === "DATA_MANAGER", otherRequested, {
    onPartnerSearchComplete(state) {
      searchingOthers = state.searchingOthers;
      if (state.confirmed) step("cooperation", "done", `已检索合作院校名单，找到 ${state.confirmed} 个已知条件符合的项目；项目合作范围需核实`);
      else step("cooperation", "warning", "已先检索合作院校名单，暂未找到已知条件明确符合的项目");
      if (state.searchingOthers) step("alternatives", "active", "正在核对学校知识库");
      else step("alternatives", "skipped", "已找到合作候选；如需更多选择，可以继续查看其他院校");
    },
  }, exclusions, loadScreeningFeedbackScores(user.id));
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
  if (groupTopic) response.answer = shownGroupAnswer(groupTopic, data.message, response, data.previousProgramIds);
  else if (intent === "school_fact") {
    const topic = recognizedFact ?? extracted.topic;
    response.answer = topic ? schoolFactAnswer(topic, data.message, response, data.hasPrevious, data.focusSchool, data.previousProgramIds) : { lead: "您想了解哪所学校的哪项信息？可以问学费、入学时间、语言要求或奖学金。", details: [] };
  } else if (intent !== "search") response.answer = await advisorFollowUpAnswer(intent, data.message, response, data.hasPrevious, data.focusSchool, data.previousProgramIds, signal);
  else if (evaluationCriteria.strictMajor && evaluationCriteria.targetMajor && ![...results.confirmed, ...results.pending, ...results.other].some(isCandidate)) {
    response.shown = { programIds: [], schoolNames: [] };
    response.answer = { lead: `没有找到符合本轮条件、专业名称确切匹配「${evaluationCriteria.targetMajor}」的项目。`, details: [] };
  } else if (evaluationCriteria.cscaRequirement === "NOT_REQUIRED" && ![...results.confirmed, ...results.pending, ...results.other].some(isCandidate)) {
    response.shown = { programIds: [], schoolNames: [] };
    response.answer = { lead: "目前没有找到符合本轮条件且明确不要求 CSCA 的项目。", details: [] };
  } else response.narrative = createNarrative(response, await chooseNarrativeFocus(response, signal, data.message));
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
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不受信任。" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!userHasPermission(user, "SCREENING_VIEW")) return Response.json({ error: "当前账号无权使用选校。" }, { status: 403 });
  let body: ReturnType<typeof requestSchema.safeParse>;
  try { body = requestSchema.safeParse(await request.json()); } catch { return Response.json({ error: "输入内容无效，请检查后重试。" }, { status: 400 }); }
  if (!body.success) return Response.json({ error: "输入内容无效，请检查后重试。" }, { status: 400 });
  const textInputs = [body.data.message, ...body.data.history.map(({ content }) => content), ...Object.values(body.data.criteria).filter((value): value is string => typeof value === "string")];
  if (textInputs.some(containsPersonalContact)) return Response.json({ error: "请移除姓名、联系方式和证件等个人信息，使用脱敏案例。" }, { status: 400 });
  if (textInputs.some(containsSensitiveRestriction)) return Response.json({ error: "请移除聊天中的敏感招生限制，再描述申请条件；结果中会提示需要人工核实的事项。" }, { status: 400 });
  const data = body.data;
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
    try { return Response.json(await search(data, user, request.signal, () => {}), { headers: { "Cache-Control": "no-store" } }); }
    catch (error) { return Response.json({ error: errorMessage(error) }, { status: 503 }); }
  }
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: SearchEvent) => { if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      try { emit({ type: "result", result: await search(data, user, request.signal, emit) }); }
      catch (error) { emit({ type: "error", message: errorMessage(error) }); }
      finally { if (!cancelled) controller.close(); }
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}

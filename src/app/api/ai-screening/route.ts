import { z } from "zod";
import { AiProviderError } from "@/lib/ai-provider";
import { getCurrentUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/access-control";
import { buildResults, criteriaSchema, hasCriteriaValue, type ChatCriteria } from "@/lib/ai-screening";
import { loadScreeningData } from "@/lib/ai-screening-data";
import { getSearchGovernanceConfig } from "@/lib/ai-search-governance";
import { generateExternalScreening, shouldTriggerExternalScreening, type ExternalScreeningResult } from "@/lib/ai-screening-external";
import { loadScreeningFeedbackScores } from "@/lib/ai-screening-feedback";
import { containsPersonalContact, containsSensitiveRestriction, sanitizePersonalContact } from "@/lib/ai-screening-input";
import { detectRunModeFromMessage, extractScreeningIntent, otherSchoolsPreference, screeningHistorySchema } from "@/lib/ai-screening-intent";
import { isCandidate, resultSchoolKey } from "@/lib/ai-screening-presentation";
import { WorkbookError } from "@/lib/ai-screening-workbook";
import { advisorFollowUpAnswer, factQuestion, followUpIntent, schoolFactAnswer, shownGroupAnswer, shownGroupTopic } from "@/lib/ai-screening-follow-up";
import { chooseNarrativeFocus, createNarrative } from "@/lib/ai-screening-narrative";
import type { SearchEvent, ScreeningResponse, ScreeningRunMode, SearchStep, SearchStepId, SearchStepItem, SearchStepMetrics } from "@/lib/ai-screening-events";
import { isSameOrigin } from "@/lib/http";
import { lookupPartnerMetadata, searchPartnerSchools, type PartnerLevel } from "@/lib/partner-school-engine";
import { DEFAULT_DISPLAY_SCHOOL_COUNT } from "@/lib/recommendation-profile";
import { evaluateAdmissionRules } from "@/lib/admission-rule-engine";
import { classifyStudentAcademicBand } from "@/lib/screening-ranking";
import { buildV31ReportPayload } from "@/lib/v31-report-builder";

export const runtime = "nodejs";
const seenSchema = z.array(z.string().trim().min(1).max(160)).max(200).default([]);
const requestSchema = z.object({
  message: z.string().trim().min(1).max(6000),
  runMode: z.enum(["partner_priority", "standard_all", "partner_quick"]).default("partner_priority"),
  criteria: criteriaSchema.default({}),
  criteriaOverride: criteriaSchema.nullable().default(null),
  showOther: z.boolean().default(false),
  sensitiveContext: z.boolean().default(false),
  hasPrevious: z.boolean().default(false),
  previousOtherRequested: z.boolean().default(false),
  focusSchool: z.string().max(120).nullable().default(null),
  previousProgramIds: z.array(z.string().min(1).max(120)).max(15).default([]),
  seenProgramIds: seenSchema,
  seenSchoolNames: seenSchema,
  history: screeningHistorySchema.default([]),
}).strict();

function safeConversationReply(reply: string | null | undefined) {
  if (!reply || containsPersonalContact(reply) || containsSensitiveRestriction(reply) || /(?:大学|学院|学校).{0,20}(?:录取|费用|学费|奖学金|截止|开班)|https?:\/\//iu.test(reply)) return null;
  return reply;
}

function errorMessage(error: unknown) {
  return error instanceof AiProviderError || error instanceof WorkbookError || error instanceof Error && (error.message.startsWith("模型") || error.message.startsWith("招生表")) ? error.message : "读取数据或模型请求失败，请检查配置后重试。";
}

function criteriaFingerprint(criteria: Record<string, unknown>) {
  return JSON.stringify(
    Object.entries(criteria)
      .filter(([, value]) => hasCriteriaValue(value))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function sanitizeCriteriaStrings(criteria: z.infer<typeof criteriaSchema>): { criteria: z.infer<typeof criteriaSchema>; redacted: boolean } {
  let redacted = false;
  const out: Record<string, unknown> = { ...criteria };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === "string") {
      const cleaned = sanitizePersonalContact(value);
      if (cleaned.redacted) redacted = true;
      out[key] = cleaned.text;
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => {
        if (typeof item !== "string") return item;
        const cleaned = sanitizePersonalContact(item);
        if (cleaned.redacted) redacted = true;
        return cleaned.text;
      });
    }
  }
  return { criteria: out as z.infer<typeof criteriaSchema>, redacted };
}

function mapPartnerLevel(programType?: string | null, message = ""): PartnerLevel | undefined {
  if (/(?:高职|大专|专科)/u.test(message)) return "diploma";
  if (/(?:高中|中专|中学)/u.test(message)) return "secondary";
  if (/(?:预科)/u.test(message) && programType !== "UG") return "preparatory";
  if (programType === "UG") return "bachelor";
  if (programType === "MASTER") return "master";
  if (programType === "PHD") return "phd";
  if (programType === "LONG_TERM" || programType === "SHORT_TERM") return "language";
  return undefined;
}

function parseQuickModeFallback(message: string, base: ChatCriteria): {
  criteria: ChatCriteria;
  contact?: string;
  partnerTiers?: string[];
  keyword?: string;
} {
  const next: ChatCriteria = { ...base };
  if (!next.programType) {
    if (/本科/u.test(message)) next.programType = "UG";
    else if (/硕士|研究生|MBA/iu.test(message)) next.programType = "MASTER";
    else if (/博士|PhD/iu.test(message)) next.programType = "PHD";
    else if (/语言|汉语进修/u.test(message)) next.programType = "LONG_TERM";
  }
  if (!next.teachingLanguage) {
    if (/英文|英语授课/iu.test(message)) next.teachingLanguage = "ENGLISH";
    else if (/中文|汉语授课/iu.test(message)) next.teachingLanguage = "CHINESE";
  }
  if (!next.intakeSeason) {
    if (/春季|3月/u.test(message)) next.intakeSeason = "SPRING";
    else if (/秋季|9月/u.test(message)) next.intakeSeason = "AUTUMN";
  }
  if (next.budget == null) {
    const m = message.match(/(\d+(?:\.\d+)?)\s*(万)?\s*(?:元|以?内|预算)/u);
    if (m) next.budget = Math.round(Number(m[1]) * (m[2] ? 10000 : 1));
  }
  const contact = message.match(/\b(Julia|Young)\b/i)?.[1];
  const tierMatch = message.match(/\b(SS|S|A|B|C|D)\s*级/gi);
  const partnerTiers = tierMatch ? [...new Set(tierMatch.map((t) => t.replace(/级/u, "").trim().toUpperCase()))] : undefined;
  const kwMatch = message.match(/(山东大学|湖南师范大学|清华大学|哈尔滨工业大学|同济大学|上海大学|苏州大学|深圳大学)/u)?.[1];
  return { criteria: next, contact, partnerTiers, keyword: kwMatch };
}

async function search(
  data: z.infer<typeof requestSchema>,
  user: { id: string; role: string; authProvider?: string },
  signal: AbortSignal,
  emit: (event: SearchEvent) => void,
): Promise<ScreeningResponse> {
  const step = (
    id: SearchStepId,
    status: SearchStep["status"],
    message: string,
    extra?: Partial<Omit<SearchStep, "id" | "status" | "message">>,
  ) => emit({ type: "progress", step: { id, status, message, timestamp: Date.now(), ...extra } });

  // Silently redact personal contacts (phone / email / ID numbers) before sending anything to external models.
  // Normal student backgrounds (nationality, city priority, scholarship filters, exclusions) are never blocked.
  const sanitizedMsg = sanitizePersonalContact(data.message);
  let redactedContact = sanitizedMsg.redacted;
  const sanitizedHistory = data.history.map((item) => {
    const cleaned = sanitizePersonalContact(item.content);
    if (cleaned.redacted) redactedContact = true;
    return { ...item, content: cleaned.text };
  });
  const sanitizedCriteriaWrap = sanitizeCriteriaStrings(data.criteria);
  if (sanitizedCriteriaWrap.redacted) redactedContact = true;
  const cleanCriteria = sanitizedCriteriaWrap.criteria;
  const cleanOverride = data.criteriaOverride ? sanitizeCriteriaStrings(data.criteriaOverride).criteria : null;
  const effectiveRunMode: ScreeningRunMode = detectRunModeFromMessage(sanitizedMsg.text, data.runMode);
  const privileged = userHasPermission(user as Parameters<typeof userHasPermission>[0], "SCHOOL_VIEW_CONFIDENTIAL");

  step("understand", "active", "正在解析学生背景、学历目标与硬性筛选条件", { progress: 12 });
  const groupTopic = data.hasPrevious && !cleanOverride ? shownGroupTopic(sanitizedMsg.text) : null;
  const fallbackQuick = effectiveRunMode === "partner_quick" ? parseQuickModeFallback(sanitizedMsg.text, cleanCriteria) : null;
  const extracted = groupTopic
    ? { criteria: cleanCriteria, showOther: false, intent: "school_fact" as const, topic: groupTopic, reply: null }
    : cleanOverride
    ? { criteria: cleanOverride, showOther: false, intent: "search" as const, topic: null, reply: null }
    : effectiveRunMode === "partner_quick" && !process.env.DEEPSEEK_API_KEY
      ? { criteria: fallbackQuick!.criteria, showOther: false, intent: "search" as const, topic: null, reply: null }
      : await extractScreeningIntent({ message: sanitizedMsg.text, criteria: cleanCriteria, history: sanitizedHistory, hasPrevious: data.hasPrevious }, { signal });
  const parsedBand = classifyStudentAcademicBand(extracted.criteria);
  const diagnostic = evaluateAdmissionRules(extracted.criteria, sanitizedMsg.text);
  const understandSummary = [
    extracted.criteria.programType && ({ UG: "本科", MASTER: "硕士", PHD: "博士", LONG_TERM: "长期语言", SHORT_TERM: "短期项目" } as Record<string, string>)[extracted.criteria.programType],
    extracted.criteria.targetMajors?.length ? extracted.criteria.targetMajors.slice(0, 2).join("/") : extracted.criteria.targetMajor,
    extracted.criteria.cities?.length ? extracted.criteria.cities.slice(0, 2).join("/") : extracted.criteria.city,
    diagnostic.finalTier ? `定档：${diagnostic.finalTier}${parsedBand ? `（${parsedBand.label}）` : ""}` : parsedBand ? `定档：${parsedBand.label}` : null,
    diagnostic.state !== "NORMAL" ? diagnostic.stateLabel : null,
  ].filter(Boolean).join(" · ");
  step("understand", "done", understandSummary ? `已整理申请条件（${understandSummary}）` : "已整理本次申请条件", {
    progress: 22,
    detail: understandSummary || undefined,
  });

  const otherPreference = otherSchoolsPreference(sanitizedMsg.text);
  if (extracted.intent === "chat" && !data.showOther && otherPreference !== true && effectiveRunMode !== "partner_quick") {
    const reply = safeConversationReply(extracted.reply);
    if (!reply) throw new Error("模型未能生成合适的对话回复，请重试。");
    step("summary", "done", "已回复本次问题");
    return { criteria: cleanCriteria, runMode: effectiveRunMode, results: { confirmed: [], pending: [], other: [], otherHidden: false }, redactedContact, source: "", partnerConfigured: Boolean(process.env.AI_SCREENING_PARTNERS_PATH), otherRequested: data.previousOtherRequested, sensitiveContext: data.sensitiveContext, prompt: "", focusSchool: data.focusSchool, conversation: true, answer: { lead: reply, details: [] } };
  }

  // Mode 3: Internal partner quick search engine (fast local lookup, zero external search calls)
  if (effectiveRunMode === "partner_quick") {
    step("cooperation", "active", "正在检索内部合作院校库与收生风控台账");
    let workbookRows: Awaited<ReturnType<typeof loadScreeningData>>["list"]["rows"] = [];
    let listName = "内部合作院校库";
    try {
      const loaded = await loadScreeningData();
      workbookRows = loaded.list.rows;
      listName = loaded.list.name || listName;
    } catch {
      // Fall back to seed partner catalog when Excel workbook is unavailable.
    }
    const quickHints = parseQuickModeFallback(sanitizedMsg.text, extracted.criteria);
    const mergedQuick = quickHints.criteria;
    const quickDiagnostic = evaluateAdmissionRules(mergedQuick, sanitizedMsg.text);
    const band = classifyStudentAcademicBand(mergedQuick);
    const partnerQuick = searchPartnerSchools(
      {
        level: mapPartnerLevel(mergedQuick.programType, sanitizedMsg.text),
        lang: mergedQuick.teachingLanguage === "ENGLISH" ? "english" : mergedQuick.teachingLanguage === "CHINESE" ? "chinese" : undefined,
        intake: mergedQuick.intakeSeason === "SPRING" ? "spring" : mergedQuick.intakeSeason === "AUTUMN" ? "autumn" : undefined,
        major: mergedQuick.targetMajors?.[0] ?? mergedQuick.targetMajor ?? undefined,
        nationality: mergedQuick.nationality ?? undefined,
        age: mergedQuick.age ?? undefined,
        budget: mergedQuick.budget ?? undefined,
        gpaBand: band?.label,
        partnerTiers: quickHints.partnerTiers,
        contact: quickHints.contact,
        keyword: quickHints.keyword,
        city: mergedQuick.cities?.[0] ?? mergedQuick.city ?? undefined,
        diagnostic: quickDiagnostic,
        criteria: mergedQuick,
      },
      { privileged, workbookRows },
    );
    step("cooperation", "done", quickDiagnostic.state === "CIRCUIT_BREAKER"
      ? "触发硬熔断劝退闸门，已隐藏所有推荐院校"
      : `内部合作库快检完成，命中 ${partnerQuick.totalMatched} 所合作院校`, {
      progress: 70,
      metrics: { partners: partnerQuick.totalMatched },
    });
    step("alternatives", "skipped", "模式三仅执行内部合作库快检，不消耗全网检索额度", { progress: 85 });
    step("summary", "done", "已生成内部合作院校对比列表与风控拦截摘要", { progress: 100 });
    const sensitiveContext = data.sensitiveContext || Boolean(mergedQuick.nationality) || /国籍|国别|生源|孟加拉|巴基斯坦|俄罗斯|非洲|南亚/iu.test(sanitizedMsg.text);
    return {
      criteria: mergedQuick,
      runMode: "partner_quick",
      diagnostic: quickDiagnostic,
      results: { confirmed: [], pending: [], other: [], otherHidden: true },
      partnerQuick: quickDiagnostic.state === "CIRCUIT_BREAKER" ? null : partnerQuick,
      redactedContact,
      source: listName,
      partnerConfigured: true,
      otherRequested: false,
      sensitiveContext,
      prompt: quickDiagnostic.state === "CIRCUIT_BREAKER"
        ? "触发刚性红线熔断，请先按行动清单补齐资格或资金条件后再重新评估。"
        : partnerQuick.totalMatched === 0 ? "内部合作库暂无完全匹配学校，可点击「切换模式二全网补齐」。" : "如需全网补齐冲稳保与官网核实，可切换至「模式二：合作优先+全网补齐」。",
      answer: quickDiagnostic.state === "CIRCUIT_BREAKER"
        ? {
            lead: quickDiagnostic.advisory.headline,
            details: [
              quickDiagnostic.advisory.diagnosisParagraph,
              ...quickDiagnostic.advisory.actionPlan,
            ],
            note: quickDiagnostic.advisory.legalComplianceNotice,
          }
        : {
            lead: partnerQuick.totalMatched > 0
              ? `【模式三 · 内部合作院校快检】共命中 ${partnerQuick.totalMatched} 所合作院校（已按合作等级排序${partnerQuick.blockedByPolicy.length ? `，拦截 ${partnerQuick.blockedByPolicy.length} 所政策受限校` : ""}）。`
              : "【模式三 · 内部合作院校快检】当前条件下内部合作库暂无完全匹配学校，建议切换模式二走全网 .edu.cn 补齐。",
            details: partnerQuick.nonPartnerWarnings.map((w) => `不合作预警 · ${w.school}：${w.warning}`),
          },
    };
  }

  const noCriteria = Object.values(extracted.criteria).every((value) => !hasCriteriaValue(value));
  if (noCriteria) {
    step("summary", "done", "等待学生的申请需求");
    return { criteria: extracted.criteria, runMode: effectiveRunMode, diagnostic, results: { confirmed: [], pending: [], other: [], otherHidden: false }, redactedContact, source: "", partnerConfigured: Boolean(process.env.AI_SCREENING_PARTNERS_PATH), otherRequested: data.previousOtherRequested, sensitiveContext: data.sensitiveContext, prompt: "", focusSchool: data.focusSchool, conversation: true, answer: { lead: safeConversationReply(extracted.reply) ?? "您可以先告诉我学生想申请的学历或专业，我再帮您查找。", details: [] } };
  }

  // Hard Circuit Breaker short-circuit: hide all school lists and skip external search completely.
  if (diagnostic.state === "CIRCUIT_BREAKER") {
    step("cooperation", "warning", "触发硬熔断劝退闸门，已拦截所有院校推荐", { progress: 60 });
    step("alternatives", "skipped", "硬熔断态不展开知识库与全网推荐列表", { progress: 80 });
    const builtStop = buildV31ReportPayload({
      runMode: effectiveRunMode,
      criteria: extracted.criteria,
      localCards: [],
      external: null,
      eliminatedNotes: [...diagnostic.gate1StopReasons, ...diagnostic.bottlenecks.filter((b) => b.severity === "STOP").map((b) => b.effect)],
      privileged,
      diagnostic,
    });
    step("summary", "done", "已输出硬熔断劝退评估、量化差距与合规红线", { progress: 100 });
    return {
      criteria: extracted.criteria,
      runMode: effectiveRunMode,
      diagnostic,
      results: { confirmed: [], pending: [], other: [], otherHidden: true, eliminatedNotes: [...diagnostic.gate1StopReasons, ...diagnostic.bottlenecks.filter((b) => b.severity === "STOP").map((b) => b.effect)] },
      external: null,
      v31Report: builtStop.report,
      v31Gates: builtStop.gates,
      canExportAdvisorReport: privileged,
      redactedContact,
      source: "",
      partnerConfigured: Boolean(process.env.AI_SCREENING_PARTNERS_PATH),
      otherRequested: false,
      sensitiveContext: data.sensitiveContext || Boolean(extracted.criteria.nationality),
      prompt: "触发硬熔断劝退，补齐前置条件或资金后再重新评估。",
      shown: { programIds: [], schoolNames: [] },
      answer: {
        lead: diagnostic.advisory.headline,
        details: [
          diagnostic.advisory.diagnosisParagraph,
          ...diagnostic.advisory.actionPlan,
        ],
        note: diagnostic.advisory.legalComplianceNotice,
      },
    };
  }

  step("cooperation", "active", effectiveRunMode === "standard_all" ? "正在核对校内知识库（模式一：不偏重合作关系）" : "正在核对内部合作台账与招生名单", { progress: 30 });
  const { list, partners, schools, programs: searchPrograms } = await loadScreeningData();
  const partnerConfigured = Boolean(process.env.AI_SCREENING_PARTNERS_PATH);
  let searchingOthers = false;
  let localPartnerCount = 0;
  let localKbCount = 0;
  const recognizedFact = data.hasPrevious ? factQuestion(sanitizedMsg.text) : null;
  const criteriaUpdated = criteriaFingerprint(extracted.criteria) !== criteriaFingerprint(cleanCriteria);
  const intent = groupTopic ? "school_fact" : (recognizedFact && !criteriaUpdated) ? "school_fact" : followUpIntent(sanitizedMsg.text) ?? (extracted.intent === "chat" || extracted.intent === "school_fact" && !data.hasPrevious ? "search" : extracted.intent) ?? "search";
  const otherRequested = effectiveRunMode === "standard_all" || data.showOther || (otherPreference !== false && (otherPreference === true || Boolean(extracted.showOther) || (intent !== "search" && data.previousOtherRequested)));
  const evaluationCriteria = intent === "school_fact" ? cleanCriteria : extracted.criteria;
  const evaluationDiagnostic = intent === "school_fact" ? evaluateAdmissionRules(cleanCriteria, sanitizedMsg.text) : diagnostic;
  const exclusions = otherRequested && intent === "search" ? { schoolKeys: data.seenSchoolNames, programIds: data.seenProgramIds } : undefined;
  const results = buildResults(list.rows, searchPrograms, schools, partners, evaluationCriteria, privileged, otherRequested, {
    onPartnerSearchComplete(state) {
      searchingOthers = state.searchingOthers;
      localPartnerCount = state.confirmed;
      if (state.confirmed) step("cooperation", "done", `已检索合作院校名单，找到 ${state.confirmed} 个已知条件符合的项目；项目合作范围需核实`, { progress: 38, metrics: { partners: state.confirmed } });
      else step("cooperation", "warning", "已先检索合作院校名单，暂未找到已知条件明确符合的项目", { progress: 38, metrics: { partners: 0 } });
      if (state.searchingOthers) step("alternatives", "active", "正在核对校内知识库与历史招生资料", { progress: 44 });
      else step("alternatives", "skipped", "已找到足够合作候选；如需更多选择，可以继续查看其他院校", { progress: 48 });
    },
  }, exclusions, loadScreeningFeedbackScores(user.id), evaluationDiagnostic);

  if (searchingOthers) {
    const count = results.other.filter(isCandidate).length;
    localKbCount = count;
    step("alternatives", "done", count ? `已检索校内知识库，找到 ${count} 个项目候选` : "已检索校内知识库，暂未找到足够匹配的项目候选", {
      progress: 50,
      metrics: { partners: localPartnerCount, localKb: count },
    });
  }

  const localCandidateCards = [...results.confirmed, ...results.pending, ...results.other].filter(isCandidate);
  const localCandidateSchools = [...new Set(localCandidateCards.map((card) => card.name))];
  const uniqueLocalSchoolCount = new Set(localCandidateCards.map(resultSchoolKey)).size;

  const needsMajor = !["LONG_TERM", "SHORT_TERM"].includes(evaluationCriteria.programType ?? "");
  const hasMajor = Boolean(evaluationCriteria.targetMajor || evaluationCriteria.targetMajors?.length);
  const missing = [!evaluationCriteria.programType && "申请学历", needsMajor && !hasMajor && "目标专业", evaluationCriteria.budget == null && !evaluationCriteria.excludeSelfFunded && !evaluationCriteria.scholarshipType && "首年预算", evaluationCriteria.intakeYear == null && "入学年份"].filter((value): value is string => Boolean(value));
  const prompt = missing.length ? `想进一步缩小范围，可以告诉我${missing.slice(0, 2).join("和")}。` : "如果想调整条件，直接告诉我就可以。";
  const sensitiveContext = data.sensitiveContext || Boolean(evaluationCriteria.nationality) || /国籍|国别|生源|俄罗斯|孟加拉|巴基斯坦|印度|尼日利亚|非洲|南亚|东南亚|中亚|越南|泰国|缅甸|韩国|菲律宾/iu.test(sanitizedMsg.text);

  const response: ScreeningResponse = {
    criteria: evaluationCriteria,
    runMode: effectiveRunMode,
    diagnostic: evaluationDiagnostic,
    results,
    external: null,
    canExportAdvisorReport: privileged,
    redactedContact,
    source: list.name,
    partnerConfigured,
    otherRequested,
    sensitiveContext,
    prompt,
  };

  if (groupTopic) {
    step("summary", "active", "正在整理匹配依据和需要核实的信息");
    response.answer = shownGroupAnswer(groupTopic, sanitizedMsg.text, response, data.previousProgramIds);
  } else if (intent === "school_fact") {
    step("summary", "active", "正在整理匹配依据和需要核实的信息");
    const topic = recognizedFact ?? extracted.topic;
    response.answer = topic ? schoolFactAnswer(topic, sanitizedMsg.text, response, data.hasPrevious, data.focusSchool, data.previousProgramIds) : { lead: "您想了解哪所学校的哪项信息？可以问学费、入学时间、语言要求或奖学金。", details: [] };
  } else if (intent !== "search") {
    step("summary", "active", "正在整理匹配依据和需要核实的信息");
    response.answer = await advisorFollowUpAnswer(intent, sanitizedMsg.text, response, data.hasPrevious, data.focusSchool, data.previousProgramIds, signal);
  } else {
    const externalAllowed = process.env.NODE_ENV === "test" || getSearchGovernanceConfig().externalEnabled;
    const localSchoolTierMap = new Map<string, "REACH" | "TARGET" | "SAFE">();
    for (const card of [...results.confirmed, ...results.pending, ...results.other]) {
      if (!isCandidate(card)) continue;
      const key = resultSchoolKey(card);
      if (!localSchoolTierMap.has(key)) {
        localSchoolTierMap.set(key, card.tier ?? "TARGET");
      }
    }
    const localTierCounts = { REACH: 0, TARGET: 0, SAFE: 0 };
    for (const tier of localSchoolTierMap.values()) {
      localTierCounts[tier] += 1;
    }

    const needExternal = !cleanOverride
      && externalAllowed
      && (effectiveRunMode === "standard_all" || shouldTriggerExternalScreening(
        evaluationCriteria,
        localCandidateSchools,
        otherRequested,
        DEFAULT_DISPLAY_SCHOOL_COUNT,
        localTierCounts,
      ));

    let externalResult: ExternalScreeningResult | null = null;
    const liveMetrics: SearchStepMetrics = { partners: localPartnerCount, localKb: localKbCount };
    let activeQueries: string[] = [];
    const verifyItemsMap = new Map<string, SearchStepItem>();
    let verifyTotalCount = 0;
    let verifyTriggered = false;

    if (needExternal) {
      step("external", "active", "正在检索本地官网事实库并准备全网定向检索", {
        progress: 54,
        metrics: { ...liveMetrics },
      });
    }

    const partnerMetaBySchool = effectiveRunMode === "partner_priority"
      ? Object.fromEntries(
          Object.entries(lookupPartnerMetadata(
            [...localCandidateSchools, ...(evaluationCriteria.targetSchools ?? [])],
            { privileged, workbookRows: list.rows },
          )).map(([name, meta]) => [name, {
            isPartner: meta.isPartner,
            partnerTier: meta.partnerTier,
            partnerBadge: meta.partnerBadgeText,
            partnerNote: meta.partnerNote,
          }]),
        )
      : undefined;

    const runExternal = async (): Promise<ExternalScreeningResult | null> => {
      if (!needExternal) return null;
      try {
        const ext = await generateExternalScreening({
          sanitizedMessage: sanitizedMsg.text,
          criteria: evaluationCriteria,
          localSchoolNames: localCandidateSchools,
          localTierCounts,
          partnerMetaBySchool,
          diagnostic: evaluationDiagnostic,
        }, {
          signal,
          onSearchStart(queries) {
            activeQueries = queries;
            step("external", "active", `正在通过 DeepSeek 全网定向检索（${queries.length} 组关键词）`, {
              progress: 58,
              queries,
              metrics: { ...liveMetrics },
            });
          },
          onFactDbChecked(info) {
            liveMetrics.factDb = info.freshCount + info.historicalCount;
            if (info.freshCount > 0 || info.historicalCount > 0) {
              step("external", "active", `本地官网事实库已命中 ${info.freshCount} 条当季 + ${info.historicalCount} 条往年参考，正在补充全网检索`, {
                progress: 62,
                queries: activeQueries.length ? activeQueries : undefined,
                metrics: { ...liveMetrics },
              });
            }
          },
          onWebResultParsed(info) {
            liveMetrics.webPrograms = info.rawCount;
            step("external", "done", info.mode === "web_search"
              ? `全网检索返回 ${info.rawCount} 个候选项目（引用 ${info.sourceCount} 个网页来源）`
              : `已通过 AI 公开知识整理 ${info.rawCount} 个候选项目`, {
              progress: 74,
              queries: activeQueries.length ? activeQueries : undefined,
              metrics: { ...liveMetrics },
            });
          },
          onVerifyStart(schoolsToCheck) {
            verifyTriggered = true;
            verifyTotalCount = schoolsToCheck.length;
            verifyItemsMap.clear();
            for (const s of schoolsToCheck) {
              verifyItemsMap.set(s, { label: s, status: "running", note: "等待连接官网" });
            }
            step("verify", "active", `正在直连 ${schoolsToCheck.length} 所高校 .edu.cn 官网核验简章与费用`, {
              progress: 78,
              items: [...verifyItemsMap.values()],
              metrics: { ...liveMetrics },
            });
          },
          onVerifySchool(ev) {
            const host = (() => {
              if (!ev.url) return "";
              try { return new URL(ev.url).hostname; } catch { return ""; }
            })();
            const statusMap: Record<typeof ev.status, SearchStepItem["status"]> = {
              checking: "running",
              verified: "done",
              dead: "warn",
              blocked: "warn",
              skipped: "skipped",
            };
            verifyItemsMap.set(ev.schoolName, {
              label: host ? `${ev.schoolName} · ${host}` : ev.schoolName,
              status: statusMap[ev.status],
              url: ev.url ?? undefined,
              note: ev.note,
            });
            const allItems = [...verifyItemsMap.values()];
            const finished = allItems.filter((i) => i.status !== "running").length;
            const verifiedCount = allItems.filter((i) => i.status === "done").length;
            liveMetrics.verifiedSites = verifiedCount;
            const pct = verifyTotalCount > 0 ? Math.min(89, 78 + Math.round((finished / verifyTotalCount) * 11)) : 84;
            step("verify", "active", `正在直连核验高校官网（已完成 ${finished}/${Math.max(verifyTotalCount, allItems.length)}，核实通过 ${verifiedCount} 所）`, {
              progress: pct,
              items: allItems,
              metrics: { ...liveMetrics },
            });
          },
        });
        if (ext && (ext.programs.length || ext.historicalPrograms?.length || ext.policyNotes.length || ext.excludedNotes?.length)) {
          const persistTip = ext.persistedFactCount ? `，沉淀 ${ext.persistedFactCount} 条官网事实` : "";
          liveMetrics.webPrograms = ext.programs.length;
          if (ext.persistedFactCount) liveMetrics.persistedFacts = ext.persistedFactCount;
          if (!verifyTriggered) {
            step("external", "done", ext.mode === "web_search"
              ? `已通过联网搜索整理 ${ext.programs.length} 个官网核验项目${persistTip}`
              : `已通过 AI 公开知识拓展 ${ext.programs.length} 个库外参考项目（建议核实官网）`, {
              progress: 86,
              queries: ext.searchQueries ?? activeQueries,
              metrics: { ...liveMetrics },
            });
          } else {
            const allItems = [...verifyItemsMap.values()];
            const verifiedCount = allItems.filter((i) => i.status === "done").length;
            liveMetrics.verifiedSites = verifiedCount;
            step("verify", "done", `官网直连核验完成：${verifiedCount}/${allItems.length} 所核实通过${persistTip}`, {
              progress: 90,
              items: allItems,
              metrics: { ...liveMetrics },
            });
          }
        } else {
          step("external", "skipped", "本次未生成额外的库外参考项目", { progress: 84, metrics: { ...liveMetrics } });
        }
        return ext;
      } catch {
        step("external", "warning", "库外院校拓展暂未返回，已优先保留本地库核验结果", { progress: 84, metrics: { ...liveMetrics } });
        return null;
      }
    };

    const hasStrictMajorEmpty = Boolean(evaluationCriteria.strictMajor && evaluationCriteria.targetMajor && uniqueLocalSchoolCount === 0);
    const hasCscaEmpty = Boolean(evaluationCriteria.cscaRequirement === "NOT_REQUIRED" && uniqueLocalSchoolCount === 0);

    const [narrativePlan, ext] = await Promise.all([
      !hasStrictMajorEmpty && !hasCscaEmpty && uniqueLocalSchoolCount > 0
        ? chooseNarrativeFocus(response, signal, sanitizedMsg.text)
        : Promise.resolve(null),
      runExternal(),
    ]);
    step("summary", "active", "正在综合评分、分档并执行 25 项零虚构守门校验", {
      progress: 94,
      metrics: { ...liveMetrics },
    });
    const localEliminated = results.eliminatedNotes ?? [];
    if (ext && localEliminated.length) {
      ext.excludedNotes = [...new Set([...localEliminated, ...(ext.excludedNotes ?? [])])];
    }
    externalResult = ext;
    response.external = externalResult;

    // Enrich partner metadata onto external programs returned in mode 2
    if (effectiveRunMode === "partner_priority" && externalResult?.programs.length) {
      const extPartnerMeta = lookupPartnerMetadata(
        externalResult.programs.map((p) => p.schoolName),
        { privileged, workbookRows: list.rows },
      );
      externalResult.programs = externalResult.programs.map((p) => {
        const pm = extPartnerMeta[p.schoolName];
        if (!pm) return p;
        return {
          ...p,
          isPartner: pm.isPartner,
          partnerTier: pm.partnerTier,
          partnerBadge: pm.partnerBadgeText,
          partnerNote: pm.partnerNote || null,
        };
      });
    }

    if (hasStrictMajorEmpty && !(externalResult?.programs.length)) {
      response.shown = { programIds: [], schoolNames: [] };
      response.answer = { lead: `没有找到符合本轮条件、专业名称确切匹配「${evaluationCriteria.targetMajor}」的项目。`, details: [] };
    } else if (hasCscaEmpty && !(externalResult?.programs.length)) {
      response.shown = { programIds: [], schoolNames: [] };
      response.answer = { lead: "目前没有找到符合本轮条件且明确不要求 CSCA 的项目。", details: [] };
    } else {
      response.narrative = createNarrative(response, narrativePlan);
    }

    // Build v3.1 report payload & run 25 deterministic gates when there are candidates or external results.
    if (localCandidateCards.length > 0 || (externalResult?.programs.length ?? 0) > 0 || (externalResult?.historicalPrograms?.length ?? 0) > 0) {
      const built = buildV31ReportPayload({
        runMode: effectiveRunMode,
        criteria: evaluationCriteria,
        localCards: localCandidateCards,
        external: externalResult,
        eliminatedNotes: results.eliminatedNotes,
        workbookRows: list.rows,
        privileged,
        diagnostic: evaluationDiagnostic,
      });
      response.v31Report = built.report;
      response.v31Gates = built.gates;
    }
  }

  if (response.narrative) {
    response.shown = {
      programIds: [...new Set(response.narrative.highlights.flatMap((item) => item.programId ? [item.programId] : []))],
      schoolNames: [...new Set(response.narrative.highlights.map((item) => item.name))],
    };
  }
  const inResults = [...results.confirmed, ...results.pending, ...results.other].some((card) => card.name === data.focusSchool);
  response.focusSchool = response.answer?.school ?? (intent === "search" && inResults ? data.focusSchool : null);
  step("summary", "done", "已整理结果；库内与库外来源及待核实事项已分开标注", { progress: 100 });
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

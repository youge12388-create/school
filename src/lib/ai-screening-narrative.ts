import { z } from "zod";
import { extractJsonObject, getAiProviderConfig, requestAiCompletion } from "@/lib/ai-provider";
import type { ChatCriteria, EvidencePoint, ResultCard } from "@/lib/ai-screening";
import type { ScreeningResponse } from "@/lib/ai-screening-events";
import { admissionListLabel, isCandidate, resultSchoolKey, summarizePoints } from "@/lib/ai-screening-presentation";
import { DEFAULT_DISPLAY_SCHOOL_COUNT } from "@/lib/recommendation-profile";
import { selectBalancedCandidates, type AdmissionTier } from "@/lib/screening-ranking";

const codes = ["MAJOR", "BUDGET", "INTAKE", "DEADLINE", "LANGUAGE", "SCORE", "DEGREE", "EXAM", "SCHOLARSHIP", "ACCOMMODATION", "AGE", "LOCATION"] as const;
type Code = typeof codes[number];
const slots = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
type Slot = typeof slots[number];
type Candidate = { slot: Slot; card: ResultCard; group: "partner" | "other"; tier: "confirmed" | "pending" | "other"; matches: { code: Code; point: EvidencePoint }[]; concerns: { code: Code; point: EvidencePoint }[] };
type Plan = { selections: { slot: Slot; reasons: Code[]; caution: Code | null; text?: string; verified?: boolean }[] };
export type NarrativeHighlight = {
  name: string;
  programId?: string;
  group: "partner" | "other";
  body: string;
  attention: boolean;
  notCooperating: boolean;
  score?: number;
  admissionTier?: AdmissionTier;
  tierReason?: string;
  cityLabel?: string | null;
  schoolTags?: string | null;
};
export type Narrative = { lead: string; highlights: NarrativeHighlight[]; next?: string };

const codeByLabel: Record<string, Code> = {
  "专业": "MAJOR", "首年预算": "BUDGET", "费用冲突": "BUDGET", "入学年份": "INTAKE", "入学季": "INTAKE", "申请截止": "DEADLINE",
  "授课语言": "LANGUAGE", "英语": "SCORE", "HSK级别": "SCORE", "HSK分数": "SCORE", "GPA": "SCORE", "申请学历": "DEGREE",
  "CSCA": "EXAM", "学校 CSCA 要求": "EXAM", "奖学金": "SCHOLARSHIP", "住宿": "ACCOMMODATION", "年龄": "AGE", "地区": "LOCATION",
};
const planSchema = z.object({ selections: z.array(z.object({ slot: z.enum(slots), reasons: z.array(z.enum(codes)).max(3), caution: z.enum(codes).nullable(), text: z.string().max(250).optional() }).strict()).max(slots.length) }).strict();
const reviewSchema = z.object({ reviews: z.array(z.object({ slot: z.enum(slots), grounded: z.boolean() }).strict()).max(slots.length) }).strict();
const rewriteSchema = z.object({ selections: z.array(z.object({ slot: z.enum(slots), text: z.string().trim().min(1).max(250) })).max(slots.length) });

function candidatePoints(card: ResultCard) {
  const { matches, concerns } = summarizePoints(card.points);
  const map = (points: EvidencePoint[]) => points.flatMap((point) => {
    const code = codeByLabel[point.label];
    return code ? [{ code, point }] : [];
  });
  return { matches: map(matches), concerns: map(concerns) };
}

function candidatePool(result: ScreeningResponse): Candidate[] {
  const { confirmed, pending, other } = result.results;
  const confirmedProjects = confirmed.filter(isCandidate);
  const pendingProjects = pending.filter(isCandidate);
  const alternatives = other.filter(isCandidate);
  const hasScores = [...confirmedProjects, ...pendingProjects, ...alternatives].some((card) => typeof card.score === "number");

  const tagged: { card: ResultCard; group: Candidate["group"]; tier: Candidate["tier"] }[] = [];
  if (hasScores && !result.otherRequested) {
    // Overall quality & fit priority: merge all valid candidates, dedupe by school keeping best score,
    // and select up to 12 slots balanced across admission tiers.
    const merged: { card: ResultCard; group: Candidate["group"]; tier: Candidate["tier"] }[] = [
      ...confirmedProjects.map((card) => ({ card, group: "partner" as const, tier: "confirmed" as const })),
      ...pendingProjects.filter((card) => card.cooperation !== "not_cooperating").map((card) => ({ card, group: "partner" as const, tier: "pending" as const })),
      ...alternatives.filter((card) => card.cooperation !== "not_cooperating").map((card) => ({ card, group: "other" as const, tier: "other" as const })),
      ...pendingProjects.filter((card) => card.cooperation === "not_cooperating").map((card) => ({ card, group: "partner" as const, tier: "pending" as const })),
      ...alternatives.filter((card) => card.cooperation === "not_cooperating").map((card) => ({ card, group: "other" as const, tier: "other" as const })),
    ];
    const picked = selectBalancedCandidates(
      merged,
      {
        keyOf: (item) => resultSchoolKey(item.card),
        scoreOf: (item) => item.card.score,
        tierOf: (item) => item.card.tier,
        blockedOf: (item) => item.card.cooperation === "not_cooperating",
      },
      slots.length,
      true,
      true,
    );
    tagged.push(...picked);
  } else {
    const seen = new Set<string>();
    const unique = (cards: ResultCard[], limit: number, group: Candidate["group"], tier: Candidate["tier"]) => {
      const picked: { card: ResultCard; group: Candidate["group"]; tier: Candidate["tier"] }[] = [];
      if (limit <= 0) return picked;
      for (const card of cards) {
        const key = resultSchoolKey(card);
        if (seen.has(key)) continue;
        seen.add(key); picked.push({ card, group, tier });
        if (picked.length === limit) break;
      }
      return picked;
    };
    if (result.otherRequested) {
      const alternativesFirst = unique(alternatives, 9, "other", "other");
      const remainingConfirmed = unique(confirmedProjects, Math.max(0, slots.length - alternativesFirst.length), "partner", "confirmed");
      const remainingPending = unique(pendingProjects, Math.max(0, slots.length - alternativesFirst.length - remainingConfirmed.length), "partner", "pending");
      tagged.push(...alternativesFirst, ...remainingConfirmed, ...remainingPending);
    } else {
      const first = unique(confirmedProjects, 6, "partner", "confirmed");
      const activePending = unique(pendingProjects.filter((card) => card.cooperation !== "not_cooperating"), Math.max(0, 6 - first.length), "partner", "pending");
      const alt = unique(alternatives, Math.max(0, slots.length - first.length - activePending.length), "other", "other");
      tagged.push(...first, ...activePending, ...alt);
      if (tagged.length < DEFAULT_DISPLAY_SCHOOL_COUNT) {
        tagged.push(...unique(pendingProjects.filter((card) => card.cooperation === "not_cooperating"), DEFAULT_DISPLAY_SCHOOL_COUNT - tagged.length, "partner", "pending"));
      }
    }
  }
  return tagged.slice(0, slots.length).map(({ card, group, tier }, index) => ({ slot: slots[index], card, group, tier, ...candidatePoints(card) }));
}

function displayCandidates(result: ScreeningResponse, plan: Plan | null): Candidate[] {
  const pool = candidatePool(result);
  const ranking = new Map<Slot, number>();
  plan?.selections.forEach(({ slot }, index) => { if (!ranking.has(slot)) ranking.set(slot, index); });

  const hasScores = pool.some((item) => typeof item.card.score === "number");
  if (hasScores && !result.otherRequested) {
    return selectBalancedCandidates(
      pool,
      {
        keyOf: (item) => resultSchoolKey(item.card),
        scoreOf: (item) => item.card.score,
        tierOf: (item) => item.card.tier,
        blockedOf: (item) => item.card.cooperation === "not_cooperating",
      },
      DEFAULT_DISPLAY_SCHOOL_COUNT,
      true,
      true,
    );
  }

  const ordered = (tier: Candidate["tier"]) => pool.filter((item) => item.tier === tier).sort((a, b) => (ranking.get(a.slot) ?? 99) - (ranking.get(b.slot) ?? 99));
  const pending = ordered("pending");
  const partners = [...ordered("confirmed"), ...pending.filter(({ card }) => card.cooperation !== "not_cooperating")];
  const blocked = pending.filter(({ card }) => card.cooperation === "not_cooperating");
  const orderedCandidates = result.otherRequested ? [...ordered("other"), ...partners] : [...partners, ...ordered("other")];
  return [...orderedCandidates, ...blocked].slice(0, DEFAULT_DISPLAY_SCHOOL_COUNT);
}

export function shownNarrativeCards(result: ScreeningResponse, previousProgramIds: string[] = []): ResultCard[] {
  if (previousProgramIds.length) {
    const available = [...result.results.confirmed, ...result.results.pending, ...result.results.other].filter(isCandidate);
    const selected = previousProgramIds.flatMap((id) => available.find((card) => card.programId === id) ?? []);
    if (selected.length === previousProgramIds.length && selected.length <= DEFAULT_DISPLAY_SCHOOL_COUNT
      && new Set(selected.map(resultSchoolKey)).size === selected.length) return selected;
  }
  return displayCandidates(result, null).map((candidate) => candidate.card);
}

function providedCodes(criteria: ChatCriteria): Code[] {
  const values: [boolean, Code][] = [
    [Boolean(criteria.targetMajor || criteria.targetMajors?.length), "MAJOR"], [criteria.budget != null, "BUDGET"], [criteria.intakeYear != null || criteria.intakeSeason != null, "INTAKE"],
    [criteria.teachingLanguage != null, "LANGUAGE"], [criteria.ielts != null || criteria.toefl != null || criteria.duolingo != null || criteria.hskLevel != null || criteria.hskScore != null || criteria.gpa != null, "SCORE"],
    [criteria.programType != null, "DEGREE"], [criteria.hasCsca != null || criteria.cscaRequirement != null, "EXAM"], [criteria.scholarshipType != null || Boolean(criteria.excludeSelfFunded), "SCHOLARSHIP"],
    [Boolean(criteria.accommodationRequired), "ACCOMMODATION"], [criteria.age != null, "AGE"], [Boolean(criteria.city || criteria.province || criteria.cities?.length), "LOCATION"],
  ];
  return values.filter(([present]) => present).map(([, code]) => code);
}

// Only anonymous slots and generic evidence categories leave the server; no source text, school identity, money, or internal notes.
function emphasizedCodes(message: string, criteria: ChatCriteria): Code[] {
  const patterns: [Code, RegExp][] = [["BUDGET", /预算|费用|便宜|贵|学费/u], ["INTAKE", /入学|开学|春季|秋季|夏季|冬季/u], ["LANGUAGE", /授课语言|英文授课|中文授课/u], ["SCORE", /雅思|托福|多邻国|HSK|GPA/iu], ["DEGREE", /本科|硕士|博士/u], ["SCHOLARSHIP", /奖学金|全奖/u], ["LOCATION", /城市|地区|省份/u], ["MAJOR", /专业|方向/u]];
  const found = patterns.flatMap(([code, pattern]) => { const index = message.search(pattern); return index < 0 ? [] : [{ code, index }]; });
  if (criteria.targetMajor && message.includes(criteria.targetMajor)) found.push({ code: "MAJOR", index: message.indexOf(criteria.targetMajor) });
  return [...new Set(found.sort((a, b) => a.index - b.index).map(({ code }) => code))];
}

function requiredConcernIndexes(candidate: Candidate, criteria: ChatCriteria): number[] {
  const concerns = candidate.concerns;
  const indexes: number[] = [];
  if (criteria.intakeYear != null || criteria.intakeSeason != null) {
    const intake = concerns.findIndex((item) => item.code === "INTAKE" && item.point.level !== "PASS");
    if (intake >= 0) indexes.push(intake);
  }
  concerns.forEach((item, index) => {
    if (item.code === "DEADLINE" && item.point.level === "NEED" && /已过|过期|不一致|冲突/u.test(item.point.text)) indexes.push(index);
    if (item.code === "BUDGET" && (criteria.budget != null || /冲突|费用口径不明确/u.test(item.point.text))) indexes.push(index);
    if (item.code === "MAJOR" && (criteria.targetMajor || criteria.targetMajors?.length)) indexes.push(index);
    if (item.code === "LANGUAGE" && criteria.teachingLanguage) indexes.push(index);
    if (item.code === "SCORE" && hasScore(criteria)) indexes.push(index);
  });
  return [...new Set(indexes)];
}

function hasScore(criteria: ChatCriteria) {
  return [criteria.ielts, criteria.toefl, criteria.duolingo, criteria.hskLevel, criteria.hskScore, criteria.gpa].some((value) => value != null);
}

function visibleConcernIndexes(candidate: Candidate, criteria: ChatCriteria, sharedIntakeRisk: boolean): number[] {
  const visible = (index: number) => !(sharedIntakeRisk && candidate.concerns[index].code === "INTAKE");
  const required = requiredConcernIndexes(candidate, criteria).filter(visible);
  if (required.length) return required;
  const first = candidate.concerns.findIndex((_item, index) => visible(index));
  return first >= 0 ? [first] : [];
}

function requiredMatchIndexes(candidate: Candidate, criteria: ChatCriteria): number[] {
  const hasMajor = Boolean(criteria.targetMajor || criteria.targetMajors?.length);
  return candidate.matches.flatMap((item, index) => (item.code === "MAJOR" && hasMajor) || (item.code === "LANGUAGE" && criteria.teachingLanguage) || (item.code === "SCORE" && hasScore(criteria)) || (item.code === "BUDGET" && criteria.budget != null) ? [index] : []);
}

function compositeMatch(candidate: Candidate, criteria: ChatCriteria): { covers: string[]; text: string; sharedText: string } | null {
  const selected = requiredMatchIndexes(candidate, criteria).filter((index) => index < 16 && candidate.matches[index].code !== "BUDGET");
  const ordered = [...selected].sort((a, b) => {
    const priority = (code: Code) => code === "MAJOR" ? 0 : code === "LANGUAGE" ? 1 : 2;
    return priority(candidate.matches[a].code) - priority(candidate.matches[b].code);
  });
  const parts = ordered.map((index) => {
    const item = candidate.matches[index];
    if (item.code === "MAJOR") return "专业方向";
    if (item.code === "LANGUAGE") return "授课语言";
    if (item.point.label === "英语") return "至少一项英语成绩";
    if (item.point.label.startsWith("HSK")) return "现有汉语成绩";
    return "现有学术成绩";
  });
  const names = [...new Set(parts)];
  if (names.length < 2) return null;
  const subject = names.length === 2 ? names.join("和") : `${names.slice(0, -1).join("、")}和${names.at(-1)}`;
  const base = names.filter((name) => !name.includes("成绩"));
  const scores = names.filter((name) => name.includes("成绩"));
  const join = (values: string[]) => values.length === 2 ? values.join("和") : values.length > 2 ? `${values.slice(0, -1).join("、")}和${values.at(-1)}` : values[0];
  const sharedText = `${base.length ? `${join(base)}符合需求` : ""}${base.length && scores.length ? "，" : ""}${scores.length ? `${join(scores)}达到已知要求` : ""}`;
  return { covers: selected.map((index) => `M${index + 1}`), text: `${subject}与项目的已知条件相符`, sharedText };
}

function sharedComposite(result: ScreeningResponse, candidates = candidatePool(result)) {
  const composites = candidates.map((candidate) => compositeMatch(candidate, result.criteria));
  return candidates.length > 1 && composites[0] && composites.every((item) => item?.text === composites[0]?.text) ? composites[0] : null;
}

function sharedIntake(result: ScreeningResponse, candidates = candidatePool(result)): string | null {
  if (candidates.length < 2 || (result.criteria.intakeYear == null && !result.criteria.intakeSeason)) return null;
  const concerns = candidates.map((candidate) => candidate.concerns.find((item) => item.code === "INTAKE" && item.point.level !== "PASS"));
  if (concerns.some((item) => !item)) return null;
  const texts = concerns.map((item) => concernText(item!.point, result.criteria));
  return texts.every((text) => text === texts[0]) ? texts[0] : null;
}

function joinPhrases(values: string[]) {
  if (values.length < 2) return values[0] ?? "";
  return values.length === 2 ? values.join("和") : `${values.slice(0, -1).join("、")}和${values.at(-1)}`;
}

function sharedMatchSummary(candidate: Candidate, criteria: ChatCriteria, shared: NonNullable<ReturnType<typeof compositeMatch>>) {
  const labels = shared.covers.flatMap((id) => {
    const item = candidate.matches[Number(id.slice(1)) - 1];
    if (!item) return [];
    const priority = item.code === "MAJOR" ? 0 : item.code === "LANGUAGE" ? 1 : 2;
    const majorDisplay = criteria.targetMajors?.length ? criteria.targetMajors.slice(0, 3).join("/") : criteria.targetMajor;
    if (item.code === "MAJOR") return [{ priority, text: majorDisplay ? `${majorDisplay}方向` : "目标专业" }];
    if (item.code === "LANGUAGE") return [{ priority, text: criteria.teachingLanguage === "ENGLISH" ? "英文授课" : criteria.teachingLanguage === "CHINESE" ? "中文授课" : "授课语言" }];
    if (item.point.label === "英语") return [{ priority, text: "英语成绩" }];
    if (item.point.label.startsWith("HSK")) return [{ priority, text: "HSK 成绩" }];
    if (item.point.label === "GPA") return [{ priority, text: "GPA" }];
    return [{ priority, text: "学术成绩" }];
  });
  const ordered = [...new Map(labels.sort((a, b) => a.priority - b.priority).map((item) => [item.text, item])).values()].map((item) => item.text);
  return ordered.length ? `共同匹配${joinPhrases(ordered)}` : null;
}

function budgetHeadroom(candidate: Candidate, criteria: ChatCriteria): "comfortable" | "close" | "unknown" {
  if (criteria.budget == null || criteria.budget <= 0 || candidate.card.comparableCost == null || !candidate.matches.some((item) => item.code === "BUDGET")) return "unknown";
  return candidate.card.comparableCost <= criteria.budget * 0.75 ? "comfortable" : "close";
}

function anonymousInputFor(result: ScreeningResponse, emphasis: Code[], selected: Candidate[]) {
  const shared = sharedComposite(result, selected);
  const intake = sharedIntake(result, selected);
  return { supplied: providedCodes(result.criteria), emphasis, sharedCore: Boolean(shared), sharedIntake: Boolean(intake), candidates: selected.map((candidate) => {
    const composite = compositeMatch(candidate, result.criteria);
    return {
    slot: candidate.slot, matches: [...new Set(candidate.matches.map((item) => item.code))], needs: [...new Set(candidate.concerns.map((item) => item.code))],
    role: candidate.group === "other" ? "alternative" : candidate.tier === "confirmed" ? "priority_known" : "priority_verify",
    budgetHeadroom: budgetHeadroom(candidate, result.criteria),
    evidence: [...(composite && !shared ? [{ id: "C1", category: "COMBINED_MATCH", state: "match", covers: composite.covers }] : []),
      ...candidate.matches.slice(0, 16).map((item, index) => ({ id: `M${index + 1}`, category: item.code, state: "match" })),
      ...candidate.concerns.slice(0, 16).flatMap((item, index) => intake && item.code === "INTAKE" ? [] : [{ id: `N${index + 1}`, category: item.code, state: item.code === "DEADLINE" && /已过|过期/u.test(item.point.text) ? "expired" : item.point.level === "UNKNOWN" ? "unknown" : "verify" }])],
    required: [...(composite && !shared ? ["C1"] : []), ...requiredMatchIndexes(candidate, result.criteria).filter((index) => index < 16 && !composite?.covers.includes(`M${index + 1}`)).map((index) => `M${index + 1}`), ...visibleConcernIndexes(candidate, result.criteria, Boolean(intake)).filter((index) => index < 16).map((index) => `N${index + 1}`)],
  }; }) };
}

export function anonymousNarrativeInput(result: ScreeningResponse, emphasis: Code[] = []) {
  return anonymousInputFor(result, emphasis, candidatePool(result));
}

function safeDraft(candidate: Candidate, criteria: ChatCriteria, text: string | undefined, shared: boolean, intake: boolean): boolean {
  if (!text || text.length > 250) return false;
  const used = new Set<string>();
  const composite = compositeMatch(candidate, criteria);
  let invalid = false;
  const prose = text.replace(/\{\{([MNC])(1[0-6]|[1-9])\}\}/gu, (_, type: string, number: string) => {
    const item = type === "C" ? (number === "1" ? composite : null) : type === "M" ? candidate.matches[Number(number) - 1] : candidate.concerns[Number(number) - 1];
    if (!item) invalid = true;
    used.add(`${type}${number}`);
    return "";
  });
  const forbidden = /[{}\d０-９%％A-Za-z]|(?:[零〇一二三四五六七八九十百千万亿点]{1,10})(?:元|万|年|分)|大学|学院|国籍|国别|种族|人种|族裔|肤色|皮肤|宗教|穆斯林|招生限制|(?:非洲|南亚|中东)|电话|微信|邮箱|护照|身份证|录取|申请成功|成功申请|保录|稳录|保证|(?:入学).{0,6}(?:希望|概率|几率|机会)|无需核实|无需确认|无须|不要求|无需提供|免(?:费|学费|语言|考试)|(?:已|已经|均|完全|全部).{0,4}(?:符合|满足|达标|合格)|(?:符合|满足).{0,4}(?:所有|全部)|已经确认|已确认开班|最便宜|最低|最高|排名|名校|王牌|顶尖|一流|优势学科|地理位置|就业前景|位于|坐落|师资|声誉|含金量|提供(?:奖学金|住宿)|(?:学费|费用|成绩|门槛|日期)(?:是|为|达到)/u;
  const unsupportedAssertion = /学位背景|学历背景|(?:专业|方向|语言|成绩|学位|学历|费用|预算|奖学金|入学|招生|考试|住宿)[^。！？；;]{0,18}(?:对得上|匹配|符合|满足|达标|合格|达到|足够|合适|不成问题|没问题)|(?:都|均|全部|已经|已)[^。！？；;]{0,8}(?:对得上|匹配|符合|满足|达标|合格|达到|具备|齐全)/u;
  const claimsComfort = /(?:预算|资金|费用)[^。！？；;]{0,10}(?:宽裕|充裕|充足|宽松|舒服|余量|有余|压力不大|无忧)/u.test(prose);
  const budgetEvidence = candidate.matches.findIndex((item) => item.code === "BUDGET");
  if (invalid || forbidden.test(prose) || unsupportedAssertion.test(prose) || (claimsComfort && (budgetHeadroom(candidate, criteria) !== "comfortable" || !used.has(`M${budgetEvidence + 1}`))) || (candidate.matches.length > 0 && !shared && ![...used].some((id) => id.startsWith("M") || id === "C1")) ||
      (candidate.concerns.some((item) => !intake || item.code !== "INTAKE") && ![...used].some((id) => id.startsWith("N"))) ||
      requiredMatchIndexes(candidate, criteria).some((index) => !used.has(`M${index + 1}`) && !((shared || used.has("C1")) && composite?.covers.includes(`M${index + 1}`))) ||
      (shared && used.has("C1")) ||
      (used.has("C1") && Boolean(composite?.covers.some((id) => used.has(id)))) ||
      (intake && candidate.concerns.some((item, index) => item.code === "INTAKE" && used.has(`N${index + 1}`))) ||
      visibleConcernIndexes(candidate, criteria, intake).some((index) => !used.has(`N${index + 1}`))) return false;
  if (candidate.group === "other" && /优先|首先|先考虑|首选|首推|主选|优选|首要|首位|排在前/u.test(prose)) return false;
  return true;
}

function logNarrativeMetric(event: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") return;
  console.info("[ai-screening:narrative]", JSON.stringify(event));
}

async function verifyDrafts(config: ReturnType<typeof getAiProviderConfig>, input: ReturnType<typeof anonymousNarrativeInput>, plan: z.infer<typeof planSchema>, result: ScreeningResponse, signal: AbortSignal, pool = candidatePool(result), timeoutMs = 10_000): Promise<Plan> {
  const candidates = plan.selections.flatMap((selection) => {
    const candidate = pool.find((item) => item.slot === selection.slot);
    const evidence = input.candidates.find((item) => item.slot === selection.slot);
    return candidate && evidence && safeDraft(candidate, result.criteria, selection.text, input.sharedCore, input.sharedIntake) ? [{ ...evidence, text: selection.text }] : [];
  });
  const accepted = new Set<Slot>();
  if (candidates.length && timeoutMs >= 1500) {
    try {
      const payload = await requestAiCompletion(config, [
          { role: "system", content: `你是选校回答的事实审校员。输入只含匿名候选的证据类别、状态和拟写的解释；{{M编号}}是已核验的单项匹配原句，{{C1}}是 covers 中各项匹配依据的合并说明，{{N编号}}是已核验的待核实或过期原句。占位符内容无需你再次证明，服务端会替换为原句。你的任务是检查占位符之外的自由措辞是否新增事实、把待核实说成已满足、弱化过期风险、承诺录取，或把备选说成优先于合作候选。DEGREE 只表示项目学历，LANGUAGE 只表示授课语言。只要事实均由占位符承载，自由措辞仅作取舍判断、谨慎提醒和行动建议，就应判为 grounded=true；不要因为匿名摘要缺少学校、金额或原文而拒绝。只返回 JSON：{"reviews":[{"slot":"A","grounded":true}]}，每个候选只输出一项。` },
          { role: "user", content: JSON.stringify({ supplied: input.supplied, sharedCore: input.sharedCore, sharedIntake: input.sharedIntake, candidates }) },
      ], { signal, timeoutMs, maxTokens: 512, retries: 0 });
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content === "string" && payload?.choices?.[0]?.finish_reason !== "length") {
        const parsed = reviewSchema.safeParse(extractJsonObject(content));
        if (parsed.success) for (const review of parsed.data.reviews) if (review.grounded && parsed.data.reviews.filter((item) => item.slot === review.slot).length === 1) accepted.add(review.slot);
      }
    } catch (error) {
      logNarrativeMetric({ stage: "verify_error", message: error instanceof Error ? error.message : "unknown" });
    }
  }
  return { selections: plan.selections.map((selection) => {
    const candidate = pool.find((item) => item.slot === selection.slot);
    return candidate && accepted.has(selection.slot) && safeDraft(candidate, result.criteria, selection.text, input.sharedCore, input.sharedIntake) ? { ...selection, verified: true } : { slot: selection.slot, reasons: selection.reasons, caution: selection.caution };
  }) };
}

async function rewriteSelected(config: ReturnType<typeof getAiProviderConfig>, input: ReturnType<typeof anonymousNarrativeInput>, plan: z.infer<typeof planSchema>, selected: Candidate[], signal: AbortSignal, timeoutMs = 12_000): Promise<z.infer<typeof planSchema>> {
  if (timeoutMs < 2000) return plan;
  try {
    const payload = await requestAiCompletion(config, [
        { role: "system", content: `你是留学选校顾问，为顾问写简短、自然、有判断的推荐说明。sharedCore 为 true 时，共同匹配的专业、授课语言和成绩已在页面开头统一说明；否则各校必须用占位符说明自己的匹配依据。sharedIntake 为 true 时，目标入学时间的共同不确定性也已在开头说明，各校不要重复。每所只保留最有用的一段判断，先说这所值得还是不值得跟进，再说唯一的下一步；不要使用“费用上”“先核实费用：”这类字段式开头，不要连续几所使用同一个开头，不要把同一项风险换句话再说一次。其他院校只能作为备选。
你只知道匿名类别，不知道学校、具体金额和原始资料。所有具体事实必须原样引用该候选 required 中的占位符，例如 {{M2}}、{{N1}}，系统会替换为已核实的完整事实；每项 required 都必须出现，不要添加任何数字、校名、排名或未经提供的条件。未知信息不能说成已经符合，不要承诺录取。每所最多两句，最终替换后尽量控制在 80 个汉字以内，语气像在向同事解释。只返回 JSON：{"selections":[{"slot":"A","text":"这所值得先联系：{{M2}}。不过，{{N1}}，建议先核实后再推进。"}]}，每个候选一项。` },
        { role: "user", content: JSON.stringify(input) },
    ], { signal, timeoutMs, maxTokens: 768, retries: 0 });
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || payload?.choices?.[0]?.finish_reason === "length") return plan;
    const parsed = rewriteSchema.safeParse(extractJsonObject(content));
    if (!parsed.success) return plan;
    const selections = [...plan.selections];
    for (const candidate of selected) {
      const replacements = parsed.data.selections.filter((item) => item.slot === candidate.slot && item.text);
      if (replacements.length !== 1) continue;
      const index = selections.findIndex((item) => item.slot === candidate.slot);
      if (index >= 0) selections[index] = { ...selections[index], text: replacements[0].text };
      else selections.push({ slot: candidate.slot, reasons: [], caution: null, text: replacements[0].text });
    }
    return { selections };
  } catch (error) {
    logNarrativeMetric({ stage: "rewrite_error", message: error instanceof Error ? error.message : "unknown" });
    return plan;
  }
}

export async function chooseNarrativeFocus(result: ScreeningResponse, signal: AbortSignal, message = ""): Promise<Plan | null> {
  const startedAt = Date.now();
  const budgetDeadline = startedAt + 24_000;
  const input = anonymousNarrativeInput(result, emphasizedCodes(message, result.criteria));
  if (!input.candidates.length || input.candidates.every((candidate) => !candidate.matches.length && !candidate.needs.length)) return null;
  try {
    const config = getAiProviderConfig();
    const payload = await requestAiCompletion(config, [
        { role: "system", content: `你是经验丰富的留学选校顾问。请根据匿名候选的匹配依据与风险，比较候选并按值得了解的顺序排列 selections。给每所学校写一段简洁自然的顾问说明：先给这所是否值得继续的判断，再说目前最关键的不确定性和唯一的下一步。结合各自风险体现区别，不要每段使用同样的开头；不要使用“费用上”“先核实费用：”这类字段式表达，不要把同一项风险换句话重复，语言像向同事解释判断，通常两句，最终替换后尽量控制在 80 个汉字以内。
你不知道学校名称、具体成绩、金额或原始资料，绝不能猜测具体事实。只返回 JSON：{"selections":[{"slot":"A","reasons":["MAJOR"],"caution":"INTAKE","text":"这所值得先联系：{{M1}}，{{M2}}。不过，{{N1}}，建议先核实清楚再推进。"}]}。
reasons 最多三个，从 matches 选；caution 从 needs 选，没有时为 null。优先回应 emphasis 本轮提及的条件。text 必须用当前候选 evidence 的占位符引用事实，系统会替换为完整的核验原句，并引用 required 的所有编号；有未共享的 needs 时至少引用一个 N。sharedCore=true 时，系统会在开头统一说明各校共有的专业与语言匹配信息，各校 text 不要重复这部分，允许没有 M；sharedIntake=true 时，目标入学时间的共同风险也已在开头说明，不要重复。sharedCore=false 时，有 matches 至少引用一个 M 或 C1；若有 C1，它会概括多项匹配，不要再重复它 covers 里的 M 编号。预算、专业、语言、成绩或学历是否符合都必须使用对应占位符，不要在占位符以外另写这些事实；DEGREE 指项目的申请学历，不是学生已有学位，LANGUAGE 指授课语言，不是语言成绩达标。占位符外可写自然的判断和建议，但不得增加具体事实，不得将未知说成符合；不得承诺录取、写数字或猜测排名、地区。role=alternative 的候选只能作为备选；state=expired 必须提醒核实新批次。每个候选返回一项。` },
        { role: "user", content: JSON.stringify(input) },
    ], { signal, timeoutMs: 14_000, maxTokens: 1200, retries: 0 });
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || payload?.choices?.[0]?.finish_reason === "length") {
      logNarrativeMetric({ stage: "focus_incomplete", latencyMs: Date.now() - startedAt, candidates: input.candidates.length });
      return null;
    }
    const parsed = planSchema.safeParse(extractJsonObject(content));
    if (!parsed.success) {
      logNarrativeMetric({ stage: "focus_schema_invalid", latencyMs: Date.now() - startedAt });
      return null;
    }
    const selected = displayCandidates(result, parsed.data);
    const selectedInput = anonymousInputFor(result, input.emphasis, selected);
    const needsRewrite = selectedInput.sharedCore !== input.sharedCore || selectedInput.sharedIntake !== input.sharedIntake;
    const plan = needsRewrite
      ? await rewriteSelected(config, selectedInput, parsed.data, selected, signal, Math.min(8_000, budgetDeadline - Date.now()))
      : parsed.data;
    const verified = await verifyDrafts(config, selectedInput, plan, result, signal, candidatePool(result), Math.min(8_000, budgetDeadline - Date.now()));
    logNarrativeMetric({
      stage: "complete",
      latencyMs: Date.now() - startedAt,
      candidates: input.candidates.length,
      selected: selected.length,
      rewritten: needsRewrite,
      verifiedCount: verified.selections.filter((item) => item.verified).length,
      totalTokens: payload?.usage?.total_tokens ?? null,
    });
    return verified;
  } catch (error) {
    logNarrativeMetric({ stage: "focus_error", latencyMs: Date.now() - startedAt, message: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}

// The model can choose and arrange evidence but cannot add unverified facts to a result.
function generatedExplanation(candidate: Candidate, criteria: ChatCriteria, text: string | undefined, verified: boolean | undefined, shared: boolean, intake: boolean): string | null {
  if (!verified || !safeDraft(candidate, criteria, text, shared, intake)) return null;
  return text!.replace(/\{\{([MNC])(1[0-6]|[1-9])\}\}/gu, (_, type: string, number: string) => {
    const index = Number(number) - 1;
    if (type === "C") return compositeMatch(candidate, criteria)!.text;
    const item = (type === "M" ? candidate.matches[index] : candidate.concerns[index])!;
    return type === "M" ? matchText(item.point) : concernText(item.point, criteria);
  }).trim();
}

// The selected school is chosen by the server. The model receives only anonymous evidence
// and writes the connective reasoning, then an independent pass verifies every factual claim.
export async function createAdvisorExplanation(result: ScreeningResponse, schoolName: string, signal: AbortSignal, previousProgramIds: string[] = []): Promise<string | null> {
  const displayed = shownNarrativeCards(result, previousProgramIds);
  const pool = candidatePool(result);
  const ordered = displayed.flatMap((card) => pool.find((candidate) => candidate.card.name === card.name) ?? []);
  const target = ordered.find((candidate) => candidate.card.name === schoolName);
  if (!target) return null;
  const input = anonymousInputFor(result, [], [target]);
  const comparison = ordered.filter((candidate) => candidate.slot !== target.slot).map((candidate) => ({
    slot: candidate.slot,
    role: candidate.group === "other" ? "alternative" : candidate.tier === "confirmed" ? "priority_known" : "priority_verify",
    budgetHeadroom: budgetHeadroom(candidate, result.criteria),
    matches: [...new Set(candidate.matches.map((item) => item.code))],
    needs: [...new Set(candidate.concerns.map((item) => item.code))],
  }));
  const writerInput = { ...input, decision: { target: target.slot, comparison } };
  try {
    const config = getAiProviderConfig();
    const payload = await requestAiCompletion(config, [
        { role: "system", content: `你是经验丰富的留学选校顾问。decision.target 是顾问刚刚优先展示的候选，comparison 是同一轮未排在前面的匿名候选。请解释“为什么先看这所”，像顾问面对面说明判断，帮助用户理解取舍，不要复述字段清单，也不要用“匹配项如下”式表达。
先用一句话说清它为什么值得先看，再点出最关键的未确认事项和具体下一步。可以结合 comparison 的费用明确度、风险类别和角色说明相对取舍；不要在正文判断学校是否合作，合作状态由系统单独说明。不得猜测排名、地区、就业、录取机会或具体金额，不得把待核实说成已经满足。不要使用“费用上”“先核实费用：”这类字段式开头，也不要把同一项风险换句话重复。
事实只能通过候选 required 中的占位符引用，所有 required 编号都必须出现；每项占位符会在服务端替换为核验原句。{{C1}} 可概括多项条件，若使用它就不要重复它 covers 的 M 编号。最多两句、最终约 80 个汉字，避免“首先、其次、此外”式罗列。只返回 JSON：{"selections":[{"slot":"${target.slot}","text":"这所更适合先核对：{{C1}}，{{M2}}。目前最需要向学校核实的是{{N1}}；先问清招生批次，再决定是否继续推进。"}]}。` },
        { role: "user", content: JSON.stringify(writerInput) },
    ], { signal, timeoutMs: 12_000, maxTokens: 384, retries: 0 });
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || payload?.choices?.[0]?.finish_reason === "length") return null;
    const parsed = rewriteSchema.safeParse(extractJsonObject(content));
    if (!parsed.success) return null;
    const drafts = parsed.data.selections.filter((selection) => selection.slot === target.slot);
    if (drafts.length !== 1) return null;
    const plan: Plan = { selections: [{ slot: target.slot, reasons: [], caution: null, text: drafts[0].text }] };
    const verified = await verifyDrafts(config, input, plan, result, signal, [target]);
    const selection = verified.selections.find((item) => item.slot === target.slot);
    return generatedExplanation(target, result.criteria, selection?.text, selection?.verified, false, false);
  } catch {
    return null;
  }
}

function matchText(point: EvidencePoint) {
  if (point.label === "专业") return point.text.replace(/^专业信息中包含/u, "项目资料列有").replace(/专业信息与要求匹配/u, "项目方向与目标专业匹配");
  if (point.label === "首年预算") {
    const amount = point.text.match(/约\s*([\d,]+)\s*元/u)?.[1];
    if (amount) return `首年费用约 ${Number(amount.replace(/,/g, "")).toLocaleString("zh-CN")} 元，预算能覆盖`;
  }
  if (point.label === "申请学历") return point.text.replace(/^有/u, "资料列有");
  if (point.label === "英语" && point.text === "至少一项英语成绩达到要求") return "现有英语成绩达到项目已知要求";
  return point.text.replace(/[。；;]+$/u, "");
}

function concernText(point: EvidencePoint, criteria: ChatCriteria) {
  if (point.label === "入学年份" || point.label === "入学季") {
    const year = criteria.intakeYear != null ? `${criteria.intakeYear} 年` : "目标年份的";
    const season = ({ SPRING: "春季", SUMMER: "夏季", AUTUMN: "秋季", WINTER: "冬季" } as const)[criteria.intakeSeason ?? "SPRING"];
    return `${year}${criteria.intakeSeason ? season : ""}是否开班还没有确认`;
  }
  if (point.text.includes("招生表费用口径不明确")) return "名单中的费用口径还不明确，预算是否足够需要核实";
  if (point.text.includes("费用冲突")) return "名单和知识库的费用有冲突，需要先核对";
  if (point.text.includes("截止日期已过")) return "知识库里的截止时间已过，新批次尚待核实";
  if (point.label === "首年预算" && point.level === "NEED" && /名单列有当期学费/u.test(point.text)) return "名单有当期学费，但完整首年费用仍来自旧年或未注明年份的知识库，需要核实";
  if (point.label === "首年预算" && point.level === "NEED" && /未注明适用年份|资料年份为/u.test(point.text)) return "知识库费用的适用年份尚未确认，预算是否足够需要核实";
  if (point.label === "申请截止" && point.text.includes("需确认适用批次")) return "现有截止日期需要确认是否适用于目标批次";
  if (point.label === "申请截止" && point.level === "UNKNOWN") return "申请截止时间还没有确认";
  if (point.label === "首年预算" && point.level === "UNKNOWN") return "项目首年费用资料不足，暂时无法判断是否在预算内";
  if (point.label === "英语" && point.level === "UNKNOWN") return "项目的英语成绩要求尚未明确";
  if (point.label.startsWith("HSK") && point.level === "UNKNOWN") return "项目的 HSK 要求尚未明确";
  if (point.label === "GPA" && point.level === "UNKNOWN") return "项目的 GPA 要求尚未明确";
  if (point.label === "授课语言" && point.level === "UNKNOWN") return "项目授课语言尚未确认";
  if (point.label === "专业" && point.level === "NEED") return "专业方向可能相关，还需向学校确认是否有目标专业";
  return point.text.replace(/[。；;]+$/u, "");
}

export function formatAdvisorConcern(point: EvidencePoint, criteria: ChatCriteria) {
  return concernText(point, criteria);
}

function nextStep(criteria: ChatCriteria) {
  if (!criteria.programType) return "学生想申请本科、硕士还是博士？告诉我学历后，我可以把范围缩小。";
  if (!criteria.targetMajor && !criteria.targetMajors?.length && !["LONG_TERM", "SHORT_TERM"].includes(criteria.programType)) return "如果方便，告诉我学生想读的专业，我可以继续缩小范围。";
  if (criteria.budget == null && !criteria.excludeSelfFunded && !criteria.scholarshipType) return "如果有首年预算，也可以告诉我，我会再核对费用。";
  return undefined;
}

export function createNarrative(result: ScreeningResponse, plan: Plan | null): Narrative {
  const candidates = displayCandidates(result, plan);
  const shared = sharedComposite(result, candidates);
  const intake = sharedIntake(result, candidates);
  const partnerCount = candidates.filter((candidate) => candidate.group === "partner").length;
  const otherCount = candidates.filter((candidate) => candidate.group === "other").length;
  const externalCount = result.external?.programs.length ?? 0;
  const primary = result.results.pending.some(isCandidate);
  const alternatives = result.results.other.some(isCandidate);
  const listName = admissionListLabel(result.source);
  const listReference = /^\d/u.test(listName) ? ` ${listName}` : listName;
  let lead: string;
  if (result.otherRequested) {
    const excluded = result.results.excludedSchoolCount ?? 0;
    if (candidates.length) lead = excluded > 0
      ? `这次按你的要求查了学校知识库，并排除了前几轮已展示的院校，有 ${candidates.length} 所可以继续比较。`
      : `这次按你的要求查了学校知识库，有 ${candidates.length} 所可以继续比较。`;
    else if (externalCount > 0) lead = `本地知识库暂无更多新候选，下面补充了 ${externalCount} 个库外院校参考项目。`;
    else if ((result.results.excludedSchoolCount ?? 0) > 0) lead = "这次按你的要求查了学校知识库，前几轮展示过的院校不再重复，暂时没有更多新候选。";
    else lead = "知识库里暂时没有找到可展示的项目。";
  }
  else if (partnerCount && otherCount) lead = `我优先查了${listReference}，有 ${partnerCount} 所合作院校可以先核对；知识库另补了 ${otherCount} 所候选。`;
  else if (partnerCount) lead = `我优先查了${listReference}，有 ${partnerCount} 所合作院校可以先核对。`;
  else if (primary && alternatives) lead = `${listName}里的合作项目信息还不够完整，下面从知识库补充了 ${otherCount} 所候选。`;
  else if (primary) lead = `${listName}里有学校，但项目资料还不足以判断。`;
  else if (alternatives) lead = `${listName}里暂未找到合适项目，下面从知识库补充了 ${otherCount} 所候选。`;
  else if (externalCount > 0) lead = `本地合作名单与院校知识库暂未匹配到完全符合的项目，下面已为你拓展了 ${externalCount} 个库外院校参考项目。`;
  else if (result.results.pending.length) lead = `${listName}里有学校，但项目资料还不足以判断。`;
  else lead = "按目前条件，暂时没有找到可展示的项目。可以补充一两个关键条件后重试。";

  if (externalCount > 0 && candidates.length > 0) {
    const sourceTag = result.external?.mode === "web_search" ? "实时联网检索" : "AI 公开知识拓展";
    lead = `${lead}同时通过${sourceTag}补充了 ${externalCount} 个库外项目。`;
  }

  if ((shared || intake) && candidates.length) {
    const status = [
      shared ? sharedMatchSummary(candidates[0], result.criteria, shared) : null,
      intake?.replace(/还没有确认$/u, "还需确认"),
    ].filter(Boolean).join("；");
    if (status) lead = `${lead}\n${status}。`;
  }
  const highlights: NarrativeHighlight[] = candidates.map((candidate) => {
    const choice = plan?.selections.find((item) => item.slot === candidate.slot);
    const ordered = (choice?.reasons ?? []).flatMap((code) => candidate.matches.find((item) => item.code === code) ?? []);
    const requiredMatches = requiredMatchIndexes(candidate, result.criteria).map((index) => candidate.matches[index]);
    const reasons = [...new Map([...requiredMatches, ...ordered, ...candidate.matches].map((item) => [`${item.code}:${item.point.label}`, item])).values()].slice(0, 2);
    const requestedCaution = choice?.caution && candidate.concerns.find((item) => item.code === choice.caution && !(intake && item.code === "INTAKE"));
    const required = requiredConcernIndexes(candidate, result.criteria).map((index) => candidate.concerns[index]).filter((item) => !(intake && item.code === "INTAKE"));
    const availableConcerns = candidate.concerns.filter((item) => !(intake && item.code === "INTAKE"));
    const fallbackCaution = availableConcerns.find((item) => item.point.level !== "PASS") || availableConcerns[0];
    const cautions = [...new Map([...required, requestedCaution || fallbackCaution].filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => [`${item.code}:${item.point.label}`, item])).values()].slice(0, 2);
    const composite = compositeMatch(candidate, result.criteria);
    const reasonText = composite ? [...(shared ? [] : [composite.text]), ...reasons.filter((item) => item.code !== "DEGREE" && !composite.covers.includes(`M${candidate.matches.indexOf(item) + 1}`)).map((item) => matchText(item.point))] : reasons.map((item) => matchText(item.point));
    const why = reasonText.length ? `${candidate.group === "other" ? "可以作为备选" : "这所值得先了解"}：${reasonText.join("，")}。` : shared ? (candidate.group === "other" ? "这所可以作为备选。" : "这所也可以继续了解。") : "目前可核对的匹配依据还不够，建议先补充项目资料。";
    const caveat = cautions.length ? `需要注意的是，${cautions.map((item) => concernText(item.point, result.criteria)).join("；")}。` : intake ? "" : "具体项目及申请批次还需要核实。";
    return {
      name: candidate.card.name,
      programId: candidate.card.programId,
      group: candidate.group,
      body: generatedExplanation(candidate, result.criteria, choice?.text, choice?.verified, Boolean(shared), Boolean(intake)) ?? `${why}${caveat}`,
      attention: candidate.card.warning.length > 0,
      notCooperating: candidate.card.cooperation === "not_cooperating",
      score: candidate.card.score,
      admissionTier: candidate.card.tier,
      tierReason: candidate.card.tierReason,
      cityLabel: candidate.card.cityLabel,
      schoolTags: candidate.card.schoolTags,
    };
  });
  return { lead, highlights, next: candidates.length || externalCount ? nextStep(result.criteria) : undefined };
}

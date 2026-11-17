import { schoolIdentityKey, type ResultCard } from "@/lib/ai-screening";
import type { ScreeningResponse } from "@/lib/ai-screening-events";
import { isCandidate, summarizePoints } from "@/lib/ai-screening-presentation";
import { createAdvisorExplanation, formatAdvisorConcern, shownNarrativeCards } from "@/lib/ai-screening-narrative";

export type FactTopic = "TUITION" | "COST" | "DEADLINE" | "INTAKE" | "LANGUAGE" | "SCHOLARSHIP";
export type FollowUpIntent = "search" | "compare_cost" | "explain" | "school_fact";
export type FollowUpAnswer = { lead: string; details: string[]; note?: string; school?: string };
const programLabel = (card: ResultCard) => card.program.startsWith(card.name) ? card.program : `${card.name} · ${card.program}`;
const partnerCard = (card: ResultCard) => card.cooperation === "listed" || card.cooperation === "project_confirmed";
const feeTimingNote = (card: ResultCard) => {
  if (!card.facts || card.comparableCost == null) return null;
  if (card.facts.feeFreshness === "historical") return `${card.facts.sourceYear ?? "较早年份"} 年资料，具体标准需确认是否适用于目标批次`;
  if (card.facts.feeFreshness === "unknown") return card.facts.sourceYear != null
    ? `知识库资料年份为 ${card.facts.sourceYear} 年，需确认是否适用于目标批次`
    : "知识库未注明这项费用的适用年份，需确认是否适用于目标批次";
  return null;
};

function advisorLead(card: ResultCard, result: ScreeningResponse) {
  if (card.cooperation === "project_confirmed") return `${card.name}的合作记录已经覆盖到这个项目，我会先联系这一所。`;
  if (card.cooperation === "listed") return `我会先看${card.name}。学校在合作院校名单内，但这条项目是否属于合作范围还要核实。`;
  if (card.cooperation === "not_cooperating") return `名单标注${card.name}为不合作，我不会把它放进合作推荐；这里只保留相关信息供核实。`;
  if ([...result.results.confirmed, ...result.results.pending].some(isCandidate)) return `合作候选之后，${card.name}可以作为其他院校备选；它不参与本轮合作优先排序。`;
  return `合作名单暂时没有给出足够合适的项目，我会先拿${card.name}的知识库项目作备选。`;
}

export function followUpIntent(message: string): FollowUpIntent | null {
  if (/(?:最便宜|费用最低|花费最低|价格最低|哪个.{0,6}便宜|哪所.{0,6}便宜|比较.{0,8}(?:费用|价格|花费)|(?:费用|价格|花费).{0,6}(?:对比|比较))/u.test(message)) return "compare_cost";
  if (/(?:为什么|为何|理由|原因).{0,30}(?:推荐|第一|这所|该校|学校)|(?:推荐|第一).{0,20}(?:理由|原因|为什么)|(?:哪所|哪个|哪家).{0,8}(?:更适合|比较合适|更合适|值得|推荐)|(?:该|应该)选哪所/u.test(message)) return "explain";
  return null;
}

export function factQuestion(message: string): FactTopic | null {
  if (followUpIntent(message) === "compare_cost") return null;
  if (!/(?:多少|几|什么|怎样|怎么|是否|有没有|有吗|需要吗|要不要|够吗|吗|嘛|[?？])/u.test(message)) return null;
  if (/学费/u.test(message)) return "TUITION";
  if (/(?:首年|一年|第一年|总共|总费用|花费|费用|花多少钱)/u.test(message)) return "COST";
  if (/(?:截止|报名时间|申请时间|什么时候申请)/u.test(message)) return "DEADLINE";
  if (/(?:入学|开学|开班|春季招生|秋季招生|春季入|秋季入)/u.test(message)) return "INTAKE";
  if (/(?:语言要求|语言成绩|雅思|托福|多邻国|HSK|汉语水平)/iu.test(message)) return "LANGUAGE";
  if (/(?:奖学金|全奖|奖助)/u.test(message)) return "SCHOLARSHIP";
  return null;
}

export function schoolFactAnswer(topic: FactTopic, message: string, result: ScreeningResponse, hasPrevious: boolean, focusedSchool: string | null = null, previousProgramIds: string[] = []): FollowUpAnswer {
  if (!hasPrevious) return { lead: "请先告诉我学生的申请条件，我会先查合作院校。", details: [] };
  const { confirmed, pending, other } = result.results;
  const pendingProjects = pending.filter(isCandidate);
  const otherProjects = other.filter(isCandidate);
  const visible = result.otherRequested ? [...otherProjects, ...confirmed, ...pendingProjects] : [...confirmed, ...pendingProjects, ...otherProjects];
  const allProjects = [...confirmed, ...pending, ...other].filter((card) => card.kind === "project");
  const seen = new Set<string>();
  const shown = shownNarrativeCards(result, previousProgramIds);
  const schools = (shown.length ? shown : visible).filter((card) => { const key = schoolIdentityKey(card.name); if (seen.has(key)) return false; seen.add(key); return true; });
  const mentioned = allProjects.find((card) => message.includes(card.name));
  const ordinalText = message.match(/第([一二三四五六七八九1-9])(?:所|个)/u)?.[1];
  const ordinal = ordinalText ? ("一二三四五六七八九".indexOf(ordinalText) + 1 || Number(ordinalText)) : 1;
  const pointsToOne = /(?:这所|这家|这间|这个学校|这个项目|这学校|该校|该项目|那所|那家|它|第[一二三四五六七八九1-9](?:所|个))/u.test(message);
  const named = message.match(/([\u4e00-\u9fffA-Za-z（）()]{2,25}(?:大学|学院))/u)?.[1];
  const focused = focusedSchool ? allProjects.find((item) => item.name === focusedSchool) : undefined;
  const card = mentioned ?? (named ? undefined : ordinalText ? schools[ordinal - 1] : pointsToOne && focusedSchool ? focused : schools.length === 1 ? schools[0] : undefined);
  if (!card) return { lead: named || (pointsToOne && focusedSchool && !focused) ? "这轮结果中没有找到这所学校的项目，请确认校名或重新检索。" : "您想了解哪所学校的这个项目？告诉我学校名称，我再帮您核对。", details: [] };
  const facts = card.facts;
  const label = programLabel(card);
  const note = [card.cooperation === "not_cooperating" && "名单标注该校不合作，需核实。", card.warning.length > 0 && "这所学校还有内部注意事项，请展开院校结果核实。"].filter(Boolean).join("") || undefined;
  const answer = (lead: string, details: string[]): FollowUpAnswer => ({ lead, details, note, school: card.name });
  if (topic === "TUITION") {
    if (facts?.tuitionStatus === "known" && facts.tuition != null) return answer(`${card.name}在招生名单中的对应学历栏写的是每年 ${facts.tuition.toLocaleString("zh-CN")} 元。`, ["这个金额是否适用当前项目和招生批次，还要向学校确认。", ...(feeTimingNote(card) ? [`知识库对应项目的费用：${feeTimingNote(card)}。`] : [])]);
    if (facts?.tuitionStatus === "conflict") return answer(`${card.name}的名单与知识库费用存在冲突，现在不能确认这个项目的学费。`, ["建议向学校核对当前项目、授课语言和招生批次的收费。"]);
    const cost = card.comparableCost;
    return answer(`目前没有查到 ${card.name} 这个项目单列的学费。`, cost != null ? [`知识库记录的首年费用上限为 ${cost.toLocaleString("zh-CN")} 元，但首年总费用不等于单列学费，建议向学校核实。`] : ["费用资料不足或口径不清，建议向学校核实该项目的最新收费。"]);
  }
  if (topic === "COST") {
    return card.comparableCost != null
      ? answer(`${label}的知识库首年费用上限为 ${card.comparableCost.toLocaleString("zh-CN")} 元。`, ["具体包含哪些费用、是否适用于当前批次，还需要向学校确认。", ...(feeTimingNote(card) ? [`这笔费用：${feeTimingNote(card)}。`] : [])])
      : answer(`${card.name}这个项目的首年费用目前无法可靠计算。`, ["已有费用存在缺失、口径不清或来源冲突，建议先向学校核实。"]);
  }
  if (topic === "DEADLINE") {
    const requestedYear = message.match(/20\d{2}/u)?.[0];
    if (requestedYear && requestedYear !== String(result.criteria.intakeYear ?? "")) return answer(`${card.name}在 ${requestedYear} 年这个批次的申请截止时间还没有确认。`, ["请向学校核实具体批次和截止日期。"]);
    const point = card.points.find((item) => item.label === "申请截止");
    return answer(point && point.level !== "UNKNOWN" ? `${card.name}：${point.text.replace(/[。；;]+$/u, "")}。` : `${card.name}这个项目的申请截止时间还没有确认。`, ["请向学校确认日期适用的招生批次。"]);
  }
  if (topic === "INTAKE") {
    const requestedYear = message.match(/20\d{2}/u)?.[0];
    const requestedSeason = /春季|春学期/u.test(message) ? "SPRING" : /夏季|夏学期/u.test(message) ? "SUMMER" : /秋季|秋学期/u.test(message) ? "AUTUMN" : /冬季|冬学期/u.test(message) ? "WINTER" : null;
    if ((requestedYear && requestedYear !== String(result.criteria.intakeYear ?? "")) || (requestedSeason && requestedSeason !== result.criteria.intakeSeason)) return answer(`${card.name}这个项目在您问的批次是否开班，目前还不能确认。`, ["建议向学校核实具体年份的入学批次和申请开放时间。"]);
    const point = card.points.find((item) => item.label === "入学季") ?? card.points.find((item) => item.label === "入学年份");
    return answer(point?.level === "PASS" ? `${card.name}的${point.text}，具体批次仍需向学校确认。` : `${card.name}这个项目是否在目标时间开班，目前还不能确认。`, ["建议向学校核实入学批次和申请开放时间。"]);
  }
  if (topic === "LANGUAGE") {
    const asked = /雅思|IELTS/iu.test(message) ? "雅思" : /托福|TOEFL/iu.test(message) ? "托福" : /多邻国|DUOLINGO/iu.test(message) ? "多邻国" : /HSK|汉语水平/iu.test(message) ? "HSK" : null;
    const scores = facts ? [facts.ielts != null && `雅思 ${facts.ielts}`, facts.toefl != null && `托福 ${facts.toefl}`, facts.duolingo != null && `多邻国 ${facts.duolingo}`, facts.hskLevel != null && `HSK ${facts.hskLevel} 级`, facts.hskScore != null && `HSK ${facts.hskScore} 分`].filter((item): item is string => Boolean(item)) : [];
    if (asked) {
      const relevant = scores.filter((item) => item.startsWith(asked));
      if (!relevant.length) return answer(`知识库没有明确列出 ${card.name} 这个项目的${asked}要求。`, ["建议向学校核实该批次接受的语言成绩和门槛。"]);
      const examPattern = asked === "雅思" ? "(?:雅思|IELTS)" : asked === "托福" ? "(?:托福|TOEFL)" : asked === "多邻国" ? "(?:多邻国|DUOLINGO)" : "HSK";
      const personScore = message.match(new RegExp(`(?:我|学生|他|她)(?:的)?(?:${examPattern})?(?:成绩)?(?:为|是|有|考了|考到|考)?\\s*(\\d+(?:\\.\\d+)?)`, "iu"))?.[1];
      const numbers = message.match(/\d+(?:\.\d+)?/gu) ?? [];
      const explicit = personScore ?? (numbers.length === 1 ? message.match(new RegExp(`${examPattern}\\s*(?:为|是|有|成绩)?\\s*(\\d+(?:\\.\\d+)?)`, "iu"))?.[1] ?? message.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*分?\\s*${examPattern}`, "iu"))?.[1] : undefined);
      const scoreValue = explicit != null ? Number(explicit) : numbers.length ? null : asked === "雅思" ? result.criteria.ielts : asked === "托福" ? result.criteria.toefl : asked === "多邻国" ? result.criteria.duolingo : null;
      const minimum = asked === "雅思" ? facts?.ielts : asked === "托福" ? facts?.toefl : asked === "多邻国" ? facts?.duolingo : null;
      const comparison = /够|达标|满足|符合|可以吗/u.test(message) && scoreValue != null && minimum != null ? `您提供的 ${scoreValue} 分${scoreValue >= minimum ? "达到" : "尚未达到"}这一已知门槛。` : "";
      return answer(`${card.name}这个项目在知识库中列出的${asked}要求是 ${relevant.map((item) => item.replace(asked, "").trim()).join("、")}${asked === "HSK" ? "" : " 分"}。`, [`${comparison}该门槛是否适用于当前招生批次，仍需向学校确认。`]);
    }
    const language = facts?.teachingLanguage === "ENGLISH" ? "英文授课" : facts?.teachingLanguage === "CHINESE" ? "中文授课" : "授课语言待确认";
    return answer(`${card.name}这个项目${language === "授课语言待确认" ? "的授课语言还没有确认" : `是${language}`}。`, scores.length ? [`知识库列出的语言门槛有 ${scores.join("、")}；各项是否互相替代、是否适用于该批次，还要向学校确认。`] : ["知识库没有明确的语言成绩门槛，建议向学校核实。"]);
  }
  if (facts?.scholarship === "full") return answer(`${card.name}的项目资料列有全额奖学金。`, ["是否适用于该项目、覆盖范围和申请资格仍需向学校确认。"]);
  if (facts?.scholarship === "available") return answer(`${card.name}的项目资料列有奖学金。`, ["金额、覆盖范围和申请资格仍需向学校确认。"]);
  return answer(`目前没有足够资料确认 ${card.name} 这个项目的奖学金。`, ["建议向学校核实是否提供，以及申请资格。"]);
}

export function followUpAnswer(intent: "compare_cost" | "explain", message: string, result: ScreeningResponse, hasPrevious: boolean, focusedSchool: string | null = null, previousProgramIds: string[] = []): FollowUpAnswer {
  if (!hasPrevious) return { lead: "请先告诉我学生的申请条件，我会先查合作院校。", details: [] };
  const { confirmed, pending, other, otherHidden } = result.results;
  const pendingProjects = pending.filter(isCandidate);
  const pendingSchools = pending.filter((card) => !isCandidate(card));
  const otherProjects = other.filter(isCandidate);
  const otherSchools = other.filter((card) => !isCandidate(card));
  const visibleProjects = result.otherRequested ? [...otherProjects, ...confirmed, ...pendingProjects] : [...confirmed, ...pendingProjects, ...otherProjects];
  const first = [...visibleProjects, ...pendingSchools, ...otherSchools];
  if (intent === "explain") {
    const mentioned = first.find((card) => message.includes(card.name));
    const ordinalText = message.match(/第([一二三四五六七八九1-9])(?:所|个)/u)?.[1];
    const ordinal = ordinalText ? ("一二三四五六七八九".indexOf(ordinalText) + 1 || Number(ordinalText)) : 1;
    const seen = new Set<string>();
    const shown = shownNarrativeCards(result, previousProgramIds);
    const visibleSchools = (shown.length ? shown : visibleProjects).filter((card) => { const key = schoolIdentityKey(card.name); if (seen.has(key)) return false; seen.add(key); return true; });
    const named = message.match(/(?:推荐|选择|介绍)(.{2,30}?(?:大学|学院))/u)?.[1];
    const referred = /这所|这家|这个学校|该校|该项目|它/u.test(message);
    const focused = focusedSchool ? visibleProjects.find((item) => item.name === focusedSchool) : undefined;
    const card = mentioned ?? (named ? undefined : ordinalText ? visibleSchools[ordinal - 1] : referred && focusedSchool ? focused : referred && visibleSchools.length > 1 ? undefined : visibleSchools[0]);
    if (!card) return { lead: named || (referred && focusedSchool && !focused) ? "当前结果中没有找到这所学校，请确认校名或重新检索。" : referred && visibleSchools.length > 1 ? "您想了解哪所学校？告诉我校名，我会说明推荐依据。" : "当前条件下没有对应的可解释项目，请试着调整条件。", details: [] };
    const { matches, concerns } = summarizePoints(card.points);
    const partner = partnerCard(card);
    const lead = matches.length ? `${card.name}${partner ? "值得先留在合作候选里继续核实" : "可以作为其他院校备选"}。` : `${card.name}目前还不能作为明确候选。`;
    const reason = matches.length ? `它先被看到，是因为${matches.slice(0, 2).map((point) => point.text).join("，")}。` : "目前缺少能支撑判断的核心项目资料。";
    const cautionTexts = [...new Set(concerns.map((point) => formatAdvisorConcern(point, result.criteria)))];
    const caution = cautionTexts.length
      ? `现在真正卡住的是${cautionTexts.slice(0, 2).join("，")}；先核实这一点，再决定是否继续推进。`
      : "下一步先确认项目范围和招生批次，再判断是否值得继续联系。";
    const note = [card.cooperation === "not_cooperating" && "名单标注该校不合作，需核实。", card.warning.length > 0 && "这所学校还有内部注意事项，请展开结果查看。"].filter(Boolean).join("") || undefined;
    return { lead, details: [reason, caution], note, school: card.name };
  }
  const compareAll = /所有|全部|全量|完整名单|整个名单/u.test(message);
  const shown = shownNarrativeCards(result, previousProgramIds);
  const projects = (!compareAll && shown.length ? shown : first).filter(isCandidate);
  const bySchool = new Map<string, ResultCard>();
  for (const card of projects) {
    if (card.comparableCost == null) continue;
    const key = schoolIdentityKey(card.name);
    const previous = bySchool.get(key);
    if (!previous || card.comparableCost < previous.comparableCost!) bySchool.set(key, card);
  }
  const known = [...bySchool.values()].sort((a, b) => a.comparableCost! - b.comparableCost!);
  const listed = known.filter((card) => card.cooperation === "listed" || card.cooperation === "project_confirmed");
  const alternatives = known.filter((card) => card.cooperation !== "listed" && card.cooperation !== "project_confirmed");
  const unknown = projects.some((card) => card.comparableCost == null) || (compareAll && (pendingSchools.length > 0 || otherSchools.length > 0));
  const historical = known.some((card) => card.facts?.feeFreshness === "historical");
  const unverifiedYear = known.some((card) => card.facts?.feeFreshness === "unknown");
  if (!known.length) return { lead: "目前没有足够的可比费用，无法判断哪所最便宜。", details: [], note: "部分费用缺失、口径不清或来源冲突，请先核实。" };
  const money = (card: ResultCard) => `${card.comparableCost!.toLocaleString("zh-CN")} 元`;
  const basis = historical && unverifiedYear
    ? "按现有资料（含较早年份及未注明年份）"
    : historical
      ? "按现有资料（含较早年份）"
      : unverifiedYear
        ? "按现有资料（部分未注明年份）"
        : "在当前费用可比较";
  const lead = listed.length
    ? `${basis}的合作项目中，${programLabel(listed[0])}的知识库首年费用上限最低，为 ${money(listed[0])}。`
    : `${basis}的项目中，${programLabel(known[0])}的知识库首年费用上限最低，为 ${money(known[0])}。`;
  const details = listed.length && alternatives.length
    ? [`作为对照，其他院校中 ${programLabel(alternatives[0])} 的费用上限为 ${money(alternatives[0])}${alternatives[0].comparableCost! < listed[0].comparableCost! ? "，低于上述合作项目" : ""}${alternatives[0].cooperation === "not_cooperating" ? "；名单标注该校不合作" : ""}。`]
    : [];
  return {
    lead, details,
    note: `${unknown ? "部分候选费用不完整或有冲突，不能确认整体最低。" : "费用及适用招生批次仍需核实。"}${historical ? "部分费用来自较早年份资料，不能视为当前批次标准。" : ""}${unverifiedYear ? "部分费用未注明适用年份，不能视为当前批次标准。" : ""}${!compareAll && shown.length ? "这里只比较刚才展示的项目。" : ""}${otherHidden ? "其他院校尚未纳入比较。" : ""}`,
  };
}

export async function advisorFollowUpAnswer(intent: "compare_cost" | "explain", message: string, result: ScreeningResponse, hasPrevious: boolean, focusedSchool: string | null, previousProgramIds: string[], signal: AbortSignal): Promise<FollowUpAnswer> {
  const fallback = followUpAnswer(intent, message, result, hasPrevious, focusedSchool, previousProgramIds);
  if (intent !== "explain" || !fallback.school) return fallback;
  const card = [...result.results.confirmed, ...result.results.pending, ...result.results.other].find((item) => item.name === fallback.school);
  if (!card) return fallback;
  const explanation = await createAdvisorExplanation(result, card.name, signal, previousProgramIds);
  if (!explanation) return fallback;
  return { ...fallback, lead: advisorLead(card, result), details: [explanation] };
}

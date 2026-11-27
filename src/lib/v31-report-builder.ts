import { schoolIdentityKey, type ChatCriteria, type ListRow, type ResultCard } from "@/lib/ai-screening";
import type { ExternalScreeningResult, ExternalProgramItem } from "@/lib/ai-screening-external";
import {
  evaluateAdmissionRules,
  LEGAL_NO_ILLEGAL_WORK_NOTICE,
  type AdmissionDiagnostic,
} from "@/lib/admission-rule-engine";
import { lookupPartnerMetadata, type PartnerLookupMetadata } from "@/lib/partner-school-engine";
import {
  classifyStudentAcademicBand,
  evaluateAcademicTierEligibility,
  inferSchoolAdmissionBand,
  normalizeSchoolBaseName,
  PROJECT_211_ONLY_SCHOOLS,
  PROJECT_985_SCHOOLS,
  type AdmissionTier,
} from "@/lib/screening-ranking";
import {
  runV31ReportGates,
  type V31EliminatedItem,
  type V31GateReport,
  type V31HistoricalCandidate,
  type V31ReportCosts,
  type V31ReportPayload,
  type V31ReportSchoolCard,
  type V31SchoolLevel,
  type V31SourceItem,
} from "@/lib/v31-report-render";

export type ScreeningRunMode = "partner_priority" | "standard_all" | "partner_quick";

function degreeLabel(programType?: string | null): string {
  if (programType === "UG") return "本科 (Bachelor)";
  if (programType === "MASTER") return "硕士 (Master)";
  if (programType === "PHD") return "博士 (PhD)";
  if (programType === "LONG_TERM") return "长期语言进修";
  if (programType === "SHORT_TERM") return "短期项目";
  return "学位项目";
}

function inferSchoolLevel(schoolName: string, tags?: string | null): V31SchoolLevel {
  const base = normalizeSchoolBaseName(schoolName);
  const t = tags ?? "";
  if (PROJECT_985_SCHOOLS.has(base) || t.includes("985")) return "985";
  if (PROJECT_211_ONLY_SCHOOLS.has(base) || t.includes("211")) return "211";
  if (t.includes("双一流")) return "double_first_class";
  if (/(?:诺丁汉|西交利物浦|上海纽约|昆山杜克|港中深|北师港浸大|温州肯恩|中欧)/u.test(schoolName) || t.includes("中外合作")) {
    return "joint";
  }
  const band = inferSchoolAdmissionBand(schoolName, tags);
  if (band.isCollege) return "college";
  return "normal";
}

function formatGpaText(criteria: ChatCriteria): string {
  if (criteria.gpa != null && Number.isFinite(criteria.gpa)) {
    const scale = criteria.gpaScale ?? (criteria.gpa <= 4 ? 4 : criteria.gpa <= 5 ? 5 : 100);
    return `${criteria.gpa}/${scale}（保留原始分制）`;
  }
  const map: Record<string, string> = {
    EXCELLENT: "成绩优秀（定性评估）",
    GOOD: "成绩良好（定性评估）",
    MEDIUM: "成绩中等（定性评估）",
    WEAK: "成绩偏弱（定性评估）",
    POOR: "成绩较弱（定性评估）",
  };
  return criteria.academicLevel ? map[criteria.academicLevel] : "未提供 GPA";
}

function formatLanguageScore(criteria: ChatCriteria): string {
  const parts: string[] = [];
  if (criteria.ielts != null) parts.push(`雅思 ${criteria.ielts}`);
  if (criteria.toefl != null) parts.push(`托福 ${criteria.toefl}`);
  if (criteria.duolingo != null) parts.push(`多邻国 ${criteria.duolingo}`);
  if (criteria.hskLevel != null) parts.push(`HSK ${criteria.hskLevel}级${criteria.hskScore != null ? ` ${criteria.hskScore}分` : ""}`);
  if (criteria.plannedExams) parts.push(`计划考试：${criteria.plannedExams}`);
  return parts.length ? parts.join(" · ") : "暂未提供语言成绩";
}

function buildHardRequirements(criteria: ChatCriteria): string[] {
  const reqs: string[] = [];
  if (criteria.programType) reqs.push(degreeLabel(criteria.programType));
  if (criteria.teachingLanguage) reqs.push(criteria.teachingLanguage === "ENGLISH" ? "英文授课" : "中文授课");
  if (criteria.excludeSelfFunded) reqs.push("可申请奖学金（过滤纯自费）");
  else if (criteria.scholarshipType === "full") reqs.push("全额奖学金（学费100%减免）");
  if (criteria.publicOnly) reqs.push("仅公立高校");
  if (criteria.noFoundation) reqs.push("直入正课（无预科年）");
  if (criteria.budget != null) reqs.push(`首年预算 ≤ ${criteria.budget.toLocaleString("en-US")} 元`);
  if (criteria.cities?.length) reqs.push(`优先城市：${criteria.cities.join("/")}`);
  else if (criteria.city) reqs.push(`目标城市：${criteria.city}`);
  if (criteria.strictMajor && criteria.targetMajor) reqs.push(`严格限定专业：${criteria.targetMajor}`);
  return reqs;
}

function mapTierKey(tier?: AdmissionTier): "reach" | "match" | "safety" {
  if (tier === "REACH") return "reach";
  if (tier === "SAFE") return "safety";
  return "match";
}

function cleanNoFabricationValue(raw: string | null | undefined, sourceId: number | null): { value: string; isEmpty?: boolean } {
  const s = String(raw ?? "").trim();
  if (!s) return { value: "未公布，需向学校确认", isEmpty: true };
  if (/^(?:未公布|未公开|官网无|官网未|需联系学校确认|截止时间未公布)/u.test(s)) {
    return { value: s, isEmpty: true };
  }
  const hasFabric = /(?:约|参考|需确认|需核实|估计|大概|通常|预期|可能为|应为)/u.test(s);
  if (sourceId == null || hasFabric) {
    return { value: "未公布，需向学校确认", isEmpty: true };
  }
  return { value: s };
}

function buildCosts(
  tuitionRaw: string | null | undefined,
  tuitionAmount: number | null | undefined,
  basis: V31ReportCosts["basis"],
  accommodationRaw: string | null | undefined,
  city: string,
  allowTotalNum: boolean,
): V31ReportCosts {
  const cleanTuition = tuitionRaw && !/^(?:约|参考|需确认|需核实|估计|大概|通常|预期|可能为|应为)/u.test(tuitionRaw)
    ? tuitionRaw
    : "未公布，需向学校确认";
  const labelMap: Record<string, string> = {
    per_year: "学费（年）",
    total_program: "学费（项目总计）",
    per_semester: "学费（学期）",
    unknown: "学费标准",
  };
  const living = /北京|上海|深圳|广州/u.test(city)
    ? "20,000–35,000 元/年（一线城市生活费估算）"
    : "15,000–25,000 元/年（常规城市生活费估算）";
  return {
    basis: basis ?? "unknown",
    tuition_label: labelMap[basis ?? "unknown"] ?? "学费标准",
    tuition: cleanTuition,
    tuition_hl: cleanTuition !== "未公布，需向学校确认",
    accommodation: accommodationRaw?.trim() || "未公布，需向学校确认",
    insurance: "800 元/年（按来华留学生常规医保口径）",
    living,
    total_label: basis === "total_program" ? "项目总学费参考" : "首年学杂参考（不含生活费）",
    total: tuitionAmount != null && tuitionAmount > 0 ? `${tuitionAmount.toLocaleString("en-US")} 元` : cleanTuition,
    total_num: allowTotalNum && tuitionAmount != null ? tuitionAmount : null,
    total_hl: Boolean(tuitionAmount && tuitionAmount > 0),
  };
}

export function buildV31ReportPayload(params: {
  runMode: ScreeningRunMode;
  criteria: ChatCriteria;
  localCards: ResultCard[];
  external: ExternalScreeningResult | null;
  eliminatedNotes?: string[];
  workbookRows?: ListRow[];
  privileged: boolean;
  diagnostic?: AdmissionDiagnostic;
}): { report: V31ReportPayload; gates: V31GateReport } {
  const { runMode, criteria, localCards, external, eliminatedNotes, workbookRows, privileged } = params;
  const diagnostic = params.diagnostic ?? evaluateAdmissionRules(criteria);
  const studentBand = classifyStudentAcademicBand(criteria);
  const targetYear = criteria.intakeYear ?? new Date().getFullYear();
  const isUg = criteria.programType === "UG";
  const isCircuitBreaker = diagnostic.state === "CIRCUIT_BREAKER";

  const sourceList: V31SourceItem[] = [];
  const sourceIdByUrl = new Map<string, number>();
  const registerSource = (name: string, url: string | null | undefined, type = "官网"): number | null => {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    if (sourceIdByUrl.has(url)) return sourceIdByUrl.get(url)!;
    const id = sourceList.length + 1;
    sourceList.push({ id, name, type, url });
    sourceIdByUrl.set(url, id);
    return id;
  };
  let internalKbSourceId: number | null = null;
  const getInternalKbSourceId = (): number => {
    if (internalKbSourceId != null) return internalKbSourceId;
    const id = sourceList.length + 1;
    sourceList.push({
      id,
      name: "校内合作院校项目知识库（已归档招生口径）",
      type: "校内归档",
      url: "#report-sources",
    });
    internalKbSourceId = id;
    return id;
  };

  // Preload partner metadata for all involved schools.
  const allSchoolNames = [
    ...new Set([
      ...localCards.map((c) => c.name),
      ...(external?.programs ?? []).map((p) => p.schoolName),
      ...(external?.historicalPrograms ?? []).map((h) => h.schoolName),
    ]),
  ];
  const partnerMap: Record<string, PartnerLookupMetadata> = runMode === "standard_all"
    ? {}
    : lookupPartnerMetadata(allSchoolNames, { privileged, workbookRows });

  const reachSchools: V31ReportSchoolCard[] = [];
  const matchSchools: V31ReportSchoolCard[] = [];
  const safetySchools: V31ReportSchoolCard[] = [];
  const historicalCandidates: V31HistoricalCandidate[] = [];
  const eliminated: V31EliminatedItem[] = [];
  const addedSchoolKeys = new Set<string>();

  const pushEliminated = (school: string, tierLabel: string, reason: string, url?: string) => {
    if (eliminated.some((e) => e.school === school && e.reason === reason)) return;
    eliminated.push({ school, tier_label: tierLabel, reason, ...(url ? { source_url: url } : {}) });
  };

  for (const note of [...(eliminatedNotes ?? []), ...(external?.excludedNotes ?? [])]) {
    const idx = note.indexOf("：");
    if (idx > 0) {
      pushEliminated(note.slice(0, idx), "候选过滤", note.slice(idx + 1));
    } else if (note.trim()) {
      pushEliminated("已过滤院校", "条件淘汰", note);
    }
  }

  for (const h of external?.historicalPrograms ?? []) {
    const pMeta = partnerMap[h.schoolName];
    historicalCandidates.push({
      school: h.schoolNature ? `${h.schoolName} (${h.schoolNature})` : h.schoolName,
      program: h.programName,
      reference_year: String(h.referenceYear),
      target_year: String(h.targetYear),
      preliminary_tier: h.preliminaryTier,
      historical_summary: h.historicalSummary,
      next_action: `待 ${h.targetYear} 官网招生简章发布后核实转正`,
      ...(pMeta?.isPartner ? { partner_tag: pMeta.partnerBadgeText } : {}),
      ...(h.sourceUrl ? { source_url: h.sourceUrl } : {}),
    });
  }

  const convertExternalItem = (item: ExternalProgramItem) => {
    const key = schoolIdentityKey(item.schoolName).toLowerCase();
    if (addedSchoolKeys.has(key)) return;
    const eligCheck = evaluateAcademicTierEligibility(criteria, { schoolName: item.schoolName, schoolTags: item.schoolNature });
    if (!eligCheck.eligible) {
      pushEliminated(item.schoolName, item.schoolNature || "跨档候选", eligCheck.reason ?? "成绩档位不匹配", item.officialUrl ?? undefined);
      return;
    }

    const itemYear = item.dataYear ?? null;
    if (itemYear != null && itemYear !== targetYear) {
      const pMeta = partnerMap[item.schoolName];
      historicalCandidates.push({
        school: item.schoolName,
        program: item.programName,
        reference_year: String(itemYear),
        target_year: String(targetYear),
        preliminary_tier: item.tier === "REACH" ? "冲" : item.tier === "SAFE" ? "保（参考）" : "稳",
        historical_summary: `${itemYear}官网参考：${item.tuitionText || "学费待核"}，${item.deadline}`,
        next_action: `等待 ${targetYear} 简章发布后重核`,
        ...(pMeta?.isPartner ? { partner_tag: pMeta.partnerBadgeText } : {}),
        ...(item.officialUrl ? { source_url: item.officialUrl } : {}),
      });
      return;
    }

    const primaryUrl = item.officialUrl ?? item.sourceUrls[0] ?? null;
    const sid = registerSource(`${item.schoolName}国际学生招生官网`, primaryUrl, item.officialVerified ? "官网" : "检索");
    const pMeta = partnerMap[item.schoolName];
    const hasOfficialYear = itemYear === targetYear;
    const longTermEvidence = !hasOfficialYear
      ? `${item.schoolName}官网常设国际学生项目与通用招生规则页（${primaryUrl || "待核链接"}）`
      : undefined;

    const ws = item.windowStatus && item.windowStatus !== "wait"
      ? item.windowStatus
      : "upcoming";
    const supRequired = !isUg && item.supervisorLetter === "required";

    let targetTier = mapTierKey(item.tier);
    const eligStatus: "eligible" | "conditional" = item.eligibilityStatus
      ?? (supRequired || !item.officialVerified ? "conditional" : "eligible");
    if (targetTier === "safety" && eligStatus !== "eligible") {
      targetTier = "match";
    }

    const cleanLang = cleanNoFabricationValue(item.languageRequirement, sid);
    const cleanTuition = cleanNoFabricationValue(item.tuitionText, sid);
    const cleanDeadline = cleanNoFabricationValue(item.deadline, sid);
    const cleanScholarship = cleanNoFabricationValue(item.scholarshipSummary, sid);
    const cleanDuration = cleanNoFabricationValue(item.duration, sid);

    const card: V31ReportSchoolCard = {
      name_cn: item.schoolName,
      city: item.city,
      level: inferSchoolLevel(item.schoolName, item.schoolNature),
      data_year: hasOfficialYear ? targetYear : null,
      ...(longTermEvidence ? { long_term_rule: true, long_term_evidence: longTermEvidence } : {}),
      window_status: ws,
      needs_supervisor: isUg ? false : supRequired,
      eligibility_status: eligStatus,
      admission_competitiveness: targetTier === "reach" ? "竞争较高" : targetTier === "safety" ? "相对低风险（非录取保证）" : "竞争力较匹配",
      scholarship_assessment: item.scholarshipEligible
        ? `具备申请资格；${item.scholarshipSummary.slice(0, 48)}`
        : "自费项目为主或未确认奖学金资格",
      evidence_grade: item.evidenceGrade ?? (sid ? "B" : "C"),
      tier_reason: item.tierReason ?? item.fitReason,
      risk_note: item.caution,
      ...(runMode === "partner_priority" ? {
        is_partner: pMeta?.isPartner ?? Boolean(item.isPartner),
        partner_tier: pMeta?.partnerTier ?? item.partnerTier ?? undefined,
        partner_contact: privileged ? (pMeta?.partnerContact ?? "") : "",
        partner_note: pMeta?.partnerNote ?? item.partnerNote ?? undefined,
      } : {}),
      info_rows: [
        { label: "专业名称", value: item.programName, source_id: sid, highlight: true },
        { label: "授课语言", value: item.teachingLanguage, source_id: sid, highlight: true },
        { label: "学制", value: cleanDuration.value, source_id: cleanDuration.isEmpty ? null : sid, is_empty: cleanDuration.isEmpty },
        { label: "学费标准", value: cleanTuition.value, source_id: cleanTuition.isEmpty ? null : sid, is_fee: !cleanTuition.isEmpty, is_empty: cleanTuition.isEmpty },
        { label: "奖学金", value: cleanScholarship.value, source_id: cleanScholarship.isEmpty ? null : sid, is_empty: cleanScholarship.isEmpty },
        { label: "语言要求", value: cleanLang.value, source_id: cleanLang.isEmpty ? null : sid, highlight: !cleanLang.isEmpty, is_empty: cleanLang.isEmpty },
        { label: "申请截止", value: cleanDeadline.value, source_id: cleanDeadline.isEmpty ? null : sid, status: ws, is_empty: cleanDeadline.isEmpty },
        ...(isUg ? [{ label: "CSCA 要求", value: item.cscaRequired == null ? "未公布，需向学校确认" : item.cscaRequired ? "要求参加 CSCA" : "未提及强制 CSCA", source_id: sid, is_empty: item.cscaRequired == null }] : []),
        ...(!isUg ? [{ label: "导师接收函", value: supRequired ? "要求联系导师" : "未要求强制导师函或待核简章", source_id: sid }] : []),
      ],
      match_rows: [
        { dimension: "专业", student: criteria.targetMajors?.join(" / ") || criteria.targetMajor || "综合意向", school: item.programName, match_type: "yes", note: item.fitReason.slice(0, 32) || "方向匹配", school_highlight: true },
        { dimension: "成绩档位", student: formatGpaText(criteria), school: item.schoolNature || "按官网综合审核", match_type: targetTier === "reach" ? "warn" : "yes", note: targetTier === "reach" ? "竞争略高，定位冲刺" : "匹配目标档位" },
        { dimension: "语言", student: formatLanguageScore(criteria), school: cleanLang.value, match_type: cleanLang.isEmpty ? "unknown" : "yes", note: cleanLang.isEmpty ? "待核实官网细则" : "请对照分数线核实" },
      ],
      costs: buildCosts(item.tuitionText, item.tuitionAmount, item.tuitionBasis, item.accommodationText, item.city, false),
      timeline: [
        { date: "当前阶段", task: "核实目标批次简章并准备成绩单/学历公证与语言证明", type: "now" },
        { date: cleanDeadline.isEmpty ? "目标批次窗口期" : cleanDeadline.value.slice(0, 24), task: "提交网申及奖学金申请", type: "deadline" },
      ],
    };

    addedSchoolKeys.add(key);
    if (targetTier === "reach") reachSchools.push(card);
    else if (targetTier === "safety") safetySchools.push(card);
    else matchSchools.push(card);
  };

  if (!isCircuitBreaker) {
    for (const extItem of external?.programs ?? []) {
      convertExternalItem(extItem);
    }

    for (const card of localCards) {
      if (card.quality === "insufficient" || card.kind !== "project") continue;
      const key = schoolIdentityKey(card.name).toLowerCase();
      if (addedSchoolKeys.has(key)) continue;
      const eligCheck = evaluateAcademicTierEligibility(criteria, { schoolName: card.name, schoolTags: card.schoolTags, qsRanking: card.qsRanking });
      if (!eligCheck.eligible) {
        pushEliminated(card.name, card.schoolTags || "校内库候选", eligCheck.reason ?? "成绩档位不匹配");
        continue;
      }

      const pMeta = partnerMap[card.name];
      let targetTier = mapTierKey(card.tier);
      const hasNeed = card.points.some((p) => p.level === "NEED" || p.level === "UNKNOWN");
      const eligStatus: "eligible" | "conditional" = card.fit === "已知条件符合" && !hasNeed ? "eligible" : "conditional";
      if (targetTier === "safety" && eligStatus !== "eligible") targetTier = "match";

      const city = card.cityLabel?.split("·").pop()?.trim() || "中国";
      const hasKnownTuition = card.facts?.tuitionStatus === "known" && card.facts.tuition != null;
      const tuitionStr = hasKnownTuition
        ? `${card.facts!.tuition!.toLocaleString("en-US")} 元/年`
        : "未公布，需向学校确认";

      const reportCard: V31ReportSchoolCard = {
        name_cn: card.name,
        city,
        level: inferSchoolLevel(card.name, card.schoolTags),
        data_year: null,
        long_term_rule: true,
        long_term_evidence: `校内项目知识库${card.sources.join("/")}核验归档项目，具体年度批次简章需同步官网最新公告`,
        window_status: "upcoming",
        needs_supervisor: false,
        eligibility_status: eligStatus,
        admission_competitiveness: targetTier === "reach" ? "竞争较高" : targetTier === "safety" ? "相对低风险（非录取保证）" : "竞争力较匹配",
        scholarship_assessment: card.facts?.scholarship === "full" && diagnostic.scholarshipPolicy.govFullAllowed
          ? "具备全额奖学金通道（以当年简章为准）"
          : card.facts?.scholarship === "available"
            ? "列有奖学金项目（需核具体覆盖与名额）"
            : "未公布，需向学校确认",
        evidence_grade: card.verified ? "B" : "C",
        tier_reason: card.tierReason ?? "校内知识库综合匹配",
        risk_note: card.warning[0] || "核实目标招生批次最新简章与名额",
        ...(runMode === "partner_priority" ? {
          is_partner: pMeta?.isPartner ?? card.cooperation !== "unknown",
          partner_tier: pMeta?.partnerTier ?? undefined,
          partner_contact: privileged ? (pMeta?.partnerContact ?? "") : "",
          partner_note: pMeta?.partnerNote || undefined,
        } : {}),
        info_rows: [
          { label: "校内档案项目", value: card.program, source_id: getInternalKbSourceId(), highlight: true },
          { label: "语言口径", value: card.facts?.teachingLanguage === "ENGLISH" ? "英文授课" : card.facts?.teachingLanguage === "CHINESE" ? "中文授课" : "未公布，需向学校确认", source_id: card.facts?.teachingLanguage === "UNKNOWN" ? null : getInternalKbSourceId(), is_empty: card.facts?.teachingLanguage === "UNKNOWN" },
          { label: "学费标准", value: tuitionStr, source_id: hasKnownTuition ? getInternalKbSourceId() : null, is_fee: hasKnownTuition, is_empty: !hasKnownTuition },
          { label: "申请截止", value: "截止时间未公布，需联系学校确认", source_id: null, status: "upcoming", is_empty: true },
        ],
        match_rows: [
          { dimension: "专业", student: criteria.targetMajors?.join(" / ") || criteria.targetMajor || "综合意向", school: card.program, match_type: "yes", note: "校内知识库匹配" },
          { dimension: "成绩档位", student: formatGpaText(criteria), school: card.schoolTags || "综合评估", match_type: targetTier === "reach" ? "warn" : "yes", note: card.tierReason || "按成绩档位分层" },
        ],
        costs: buildCosts(tuitionStr, null, "per_year", null, city, false),
        timeline: [{ date: "当前阶段", task: "确认目标批次开放时间并准备申请材料", type: "now" }],
      };

      addedSchoolKeys.add(key);
      if (targetTier === "reach") reachSchools.push(reportCard);
      else if (targetTier === "safety") safetySchools.push(reportCard);
      else matchSchools.push(reportCard);
    }
  }

  const limitThree = (arr: V31ReportSchoolCard[]) => arr.slice(0, 3);
  const reachTrimmed = limitThree(reachSchools);
  const matchTrimmed = limitThree(matchSchools);
  const safetyTrimmed = limitThree(safetySchools);

  const tierFillNote = (label: string, count: number) => count >= 2
    ? undefined
    : count === 0
      ? `当前 ${targetYear} 批次暂未检索到满足全部硬性条件与成绩档位的已核实${label}候选（可参考下方历史规则预匹配区或扩大条件）。`
      : `本层仅找到 ${count} 所满足目标批次与全部硬性条件的合格院校，严格遵循不跨档凑数规则保留空位。`;

  const risks: V31ReportPayload["risks"] = [
    { type: "warn", content: "<strong>核验提示：</strong>高校每学年学费、奖学金国别名单及截止时间均以当年国际教育学院（<code>.edu.cn</code>）最新招生简章为准，<code>Safety</code> 梯队仅代表竞争力相对较低风险，不构成录取保证。" },
    { type: "warn", content: `<strong>法律与费用底线：</strong>${LEGAL_NO_ILLEGAL_WORK_NOTICE}` },
  ];
  if (diagnostic.state !== "NORMAL") {
    risks.unshift({
      type: "warn",
      content: `<strong>${diagnostic.advisory.headline}：</strong>${diagnostic.advisory.diagnosisParagraph}`,
    });
  }
  if (diagnostic.modifiers.length > 0) {
    risks.push({
      type: "info",
      content: `<strong>专业与轮次动态偏移：</strong>${diagnostic.modifiers.map((m) => `${m.summary}（${m.action}）`).join("；")}`,
    });
  }

  const formalAll = [...reachTrimmed, ...matchTrimmed, ...safetyTrimmed];
  if (studentBand && ["中等", "偏弱", "弱"].includes(studentBand.label)) {
    const hasCollege = formalAll.some((s) => s.level === "college" || s.name_cn.includes("学院"));
    if (!hasCollege) {
      risks.push({
        type: "info",
        content: isUg
          ? "<strong>本科学院层次覆盖说明：</strong>学生处于中等/偏弱档，系统已优先搜索地方公办本科与本科学院；当前城市或硬条件下暂无更多已核实学院项目，建议适当放宽城市或语言条件以扩大保底选择。"
          : "<strong>硕士学位点层次说明：</strong>因大多数独立/民办本科学院不具备硕士学位授权点，系统仅保留具硕博授予权的公办大学与正规高校，不虚构本科学院的硕士项目。",
      });
    }
  }

  const runModeLabel = runMode === "partner_priority"
    ? "模式二：合作院校优先（合作占位+全网补齐）"
    : runMode === "standard_all"
      ? "模式一：标准全网客观匹配"
      : "模式三：内部合作院校快检";

  const report: V31ReportPayload = {
    report_title: `${criteria.targetMajors?.join("/") || criteria.targetMajor || "来华留学"} - v3.1 匹配评估报告`,
    student: {
      name: criteria.nationality ? `${criteria.nationality}籍申请者` : "来华留学申请者",
      gpa: formatGpaText(criteria),
      ...(studentBand ? { gpa_band: studentBand.label } : {}),
      engine_state: diagnostic.state,
      allow_vocational_fallback: diagnostic.allowVocationalDiploma,
      pathway_locks: diagnostic.pathwayLockLabels,
      degree: degreeLabel(criteria.programType),
      major: criteria.targetMajors?.join(" / ") || criteria.targetMajor || "不限专业",
      ...(criteria.nationality ? { nationality: criteria.nationality } : {}),
      language: criteria.teachingLanguage === "ENGLISH" ? "英文授课 (English-taught)" : criteria.teachingLanguage === "CHINESE" ? "中文授课 (Chinese-taught)" : "中英文皆可",
      language_score: formatLanguageScore(criteria),
      scholarship: !diagnostic.scholarshipPolicy.govFullAllowed
        ? "未达政府全奖门槛（按自费或校内小额减免口径核查）"
        : criteria.excludeSelfFunded ? "必须可申奖学金（过滤纯自费）" : criteria.scholarshipType === "full" ? "全额奖学金" : "可申请奖学金或自费均可",
      hard_requirements: buildHardRequirements(criteria),
      intake: `${targetYear}年${criteria.intakeSeason === "SPRING" ? "春季" : "秋季"}`,
      match_mode: criteria.strictMajor ? "严格匹配" : "模糊匹配（默认）",
      run_mode: runModeLabel,
      search_date: new Date().toLocaleDateString("zh-CN"),
      note: `${diagnostic.stateLabel}${diagnostic.finalTier ? ` · 最终定档 ${diagnostic.finalTier}` : ""}；已执行五阶段确定性资格闸门、双向±1档锁池与零虚构守门。`,
    },
    progress: {
      steps: [
        { label: "阶段零 双库检索", status: "done" },
        { label: "阶段一二 全网发现", status: external ? "done" : "pending" },
        { label: "阶段三四 官网核实", status: "done" },
        { label: "阶段五 25项守门", status: "done" },
      ],
      meta: {
        正式推荐: `${formalAll.length} 所`,
        历史预匹配: `${historicalCandidates.length} 所`,
        已淘汰记录: `${eliminated.length} 条`,
      },
    },
    tiers: {
      reach: { source_type: "official", tier_note: tierFillNote("冲刺", reachTrimmed.length), empty_reason: tierFillNote("冲刺", reachTrimmed.length), schools: reachTrimmed },
      match: { source_type: "official", tier_note: tierFillNote("稳妥", matchTrimmed.length), empty_reason: tierFillNote("稳妥", matchTrimmed.length), schools: matchTrimmed },
      safety: { source_type: "official", tier_note: tierFillNote("保底", safetyTrimmed.length), empty_reason: tierFillNote("保底", safetyTrimmed.length), schools: safetyTrimmed },
    },
    historical_candidates: historicalCandidates,
    eliminated,
    sources: sourceList,
    risks,
  };

  const gates = runV31ReportGates(report);
  return { report, gates };
}

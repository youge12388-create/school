import { V31_REPORT_HTML_TEMPLATE } from "@/data/v31-report-template";
import {
  getPartnerTierRank,
  normalizeSchoolBaseName,
  PROJECT_211_ONLY_SCHOOLS,
  PROJECT_985_SCHOOLS,
} from "@/lib/screening-ranking";

export type V31WindowStatus = "open" | "upcoming" | "wait";
export type V31SchoolLevel = "985" | "211" | "double_first_class" | "normal" | "college" | "joint";

export type V31ReportInfoRow = {
  label: string;
  value: string;
  source_id?: number | null;
  highlight?: boolean;
  is_fee?: boolean;
  is_empty?: boolean;
  empty_text?: string;
  status?: V31WindowStatus;
};

export type V31ReportMatchRow = {
  dimension: string;
  student: string;
  school: string;
  match_type: "yes" | "warn" | "no" | "unknown";
  note: string;
  student_highlight?: boolean;
  school_highlight?: boolean;
};

export type V31ReportCosts = {
  basis?: "per_year" | "total_program" | "per_semester" | "unknown";
  tuition_label?: string;
  tuition: string;
  tuition_hl?: boolean;
  accommodation_label?: string;
  accommodation: string;
  accommodation_hl?: boolean;
  insurance_label?: string;
  insurance: string;
  living_label?: string;
  living: string;
  total_label?: string;
  total: string;
  total_num?: number | null;
  total_hl?: boolean;
  note?: string;
};

export type V31ReportTimelineItem = {
  date: string;
  task: string;
  type: "now" | "milestone" | "deadline";
};

export type V31ReportSchoolCard = {
  name_cn: string;
  name_en?: string;
  city?: string;
  level: V31SchoolLevel;
  data_year?: number | null;
  long_term_rule?: boolean;
  long_term_evidence?: string;
  window_status?: V31WindowStatus;
  needs_supervisor?: boolean;
  deadline_urgent?: boolean;
  eligibility_status: "eligible" | "conditional" | "unverified";
  admission_competitiveness: string;
  scholarship_assessment: string;
  evidence_grade: "A" | "B" | "C";
  tier_reason?: string;
  risk_note?: string;
  is_partner?: boolean;
  partner_tier?: string | null;
  partner_contact?: string;
  partner_note?: string;
  info_rows: V31ReportInfoRow[];
  match_rows: V31ReportMatchRow[];
  costs?: V31ReportCosts;
  timeline?: V31ReportTimelineItem[];
};

export type V31ReportTierBucket = {
  source_type?: "official" | "unverified" | "mixed" | "third";
  tier_note?: string;
  empty_reason?: string;
  schools: V31ReportSchoolCard[];
};

export type V31HistoricalCandidate = {
  school: string;
  program: string;
  reference_year: string | number;
  target_year: string | number;
  preliminary_tier: string;
  historical_summary: string;
  next_action?: string;
  partner_tag?: string;
  source_url?: string;
};

export type V31EliminatedItem = {
  school: string;
  tier_label?: string;
  reason: string;
  source_url?: string;
};

export type V31SourceItem = {
  id: number;
  name: string;
  type: string;
  url: string;
};

export type V31RiskItem = {
  type: "warn" | "info" | "success";
  content: string;
};

export type V31ReportPayload = {
  report_title: string;
  student: {
    name: string;
    gpa: string;
    gpa_band?: string;
    engine_state?: "NORMAL" | "DOWNGRADE_LOCK" | "CIRCUIT_BREAKER";
    allow_vocational_fallback?: boolean;
    pathway_locks?: string[];
    degree: string;
    major: string;
    nationality?: string;
    language: string;
    language_score?: string;
    scholarship: string;
    hard_requirements: string[];
    intake: string;
    intake_note?: string;
    match_mode?: string;
    run_mode?: string;
    search_date?: string;
    note?: string;
  };
  progress?: {
    steps: Array<{ label: string; status: "done" | "pending" | "active" }>;
    meta?: Record<string, string>;
  };
  tiers: {
    reach: V31ReportTierBucket;
    match: V31ReportTierBucket;
    safety: V31ReportTierBucket;
  };
  historical_candidates: V31HistoricalCandidate[];
  eliminated: V31EliminatedItem[];
  sources: V31SourceItem[];
  risks: V31RiskItem[];
};

export type V31GateCheckResult = {
  name: string;
  passed: boolean;
};

export type V31GateReport = {
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  checks: V31GateCheckResult[];
  fabricationWarnings: string[];
  policyWarnings: string[];
};

const NON_ESTIMATABLE_KEYWORDS = [
  "学费", "奖学金", "截止", "申请时间", "申请材料", "申请资格",
  "CSCA", "导师接收函", "授课语言", "学制", "专业", "学历", "申请要求",
];
const FABRIC_MARKERS = ["约", "参考", "需确认", "需核实", "估计", "大概", "通常", "预期", "可能为", "应为"];
const KNOWN_EMPTY_PREFIX = ["未公布", "未公开", "官网无", "官网未", "需联系学校确认", "截止时间未公布"];
const VOCATIONAL_SCHOOL_MARKERS = ["职业技术学院", "高等专科", "专科学校", "职业学院", "职业大学（专科）"];

const WINDOW_BADGES: Record<V31WindowStatus, string> = {
  open: '<span class="badge badge-window-open"><span class="status-dot"></span>开放中</span>',
  upcoming: '<span class="badge badge-window-upcoming"><span class="status-dot"></span>即将开放</span>',
  wait: '<span class="badge badge-window-wait"><span class="status-dot"></span>本轮已截止</span>',
};

function esc(text: unknown): string {
  if (text == null) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function extractYear(value: unknown): number | null {
  const m = String(value ?? "").match(/(20\d{2})/);
  return m ? Number(m[1]) : null;
}

function sanitizeValue(
  label: string,
  value: string,
  sourceId: number | null | undefined,
  schoolName: string,
  status: string | undefined,
  fabricationWarnings: string[],
): { value: string; blocked: boolean } {
  if (!NON_ESTIMATABLE_KEYWORDS.some((k) => label.includes(k))) return { value, blocked: false };
  if (status === "wait") return { value, blocked: false };
  const v = String(value ?? "");
  if (KNOWN_EMPTY_PREFIX.some((p) => v.startsWith(p))) return { value, blocked: false };
  if (sourceId == null || FABRIC_MARKERS.some((m) => v.includes(m))) {
    fabricationWarnings.push(`${schoolName} · ${label}: 原值'${v}' (source_id=${String(sourceId ?? null)}) 无有效来源或含估算措辞，已替换为'未公布，需向学校确认'`);
    return { value: "未公布，需向学校确认", blocked: true };
  }
  return { value, blocked: false };
}

function getWindowStatus(school: V31ReportSchoolCard): V31WindowStatus | null {
  if (school.window_status) return school.window_status;
  for (const ir of school.info_rows ?? []) {
    if (ir.label.includes("截止") && ir.status) return ir.status;
  }
  return null;
}

function hasValidDeadlineAnnotation(school: V31ReportSchoolCard): boolean {
  const ws = getWindowStatus(school);
  if (ws === "open" || ws === "upcoming" || ws === "wait") return true;
  for (const ir of school.info_rows ?? []) {
    if (ir.label.includes("截止") || ir.label.includes("申请时间")) {
      const val = String(ir.value ?? "");
      if (ir.is_empty || KNOWN_EMPTY_PREFIX.some((p) => val.startsWith(p))) return true;
    }
  }
  return false;
}

function inferCostBasis(costs?: V31ReportCosts): string {
  if (!costs) return "unknown";
  if (costs.basis) return costs.basis;
  const labels = `${costs.tuition_label ?? ""} ${costs.total_label ?? ""} ${costs.total ?? ""}`.toLowerCase();
  if (labels.includes("项目总") || labels.includes("全程") || labels.includes("total")) return "total_program";
  if (labels.includes("学期") || labels.includes("semester")) return "per_semester";
  return "per_year";
}

function getSchoolPartnerRank(school: V31ReportSchoolCard): number {
  const tier = String(school.partner_tier ?? "").trim().toUpperCase();
  if (school.is_partner || tier) return getPartnerTierRank(tier || "UNRATED");
  return 0;
}

function formatPartnerLabel(school: V31ReportSchoolCard): string {
  const tier = String(school.partner_tier ?? "").trim().toUpperCase();
  const contact = String(school.partner_contact ?? "").trim();
  if (school.is_partner || tier) {
    const base = tier && tier !== "UNRATED" ? `🤝 ${tier}级合作` : "🤝 合作院校";
    return contact ? `${base} · ${contact}` : base;
  }
  if (school.is_partner === false) return "全网补充(非合作)";
  return "";
}

function schoolAnchorId(tierKey: string, nameCn: string): string {
  const slug = String(nameCn ?? "").replace(/[^0-9a-zA-Z\u4e00-\u9fff]+/gu, "-").replace(/^-+|-+$/g, "");
  return `school-${tierKey}-${slug || "item"}`;
}

function inferStudentGpaBand(student: V31ReportPayload["student"]): string | null {
  const rawBand = String(student.gpa_band ?? "").trim();
  for (const token of ["偏弱", "弱", "中等", "良好", "优秀"]) {
    if (rawBand.includes(token)) return token;
  }
  const gpaRaw = String(student.gpa ?? "").trim();
  const m = gpaRaw.match(/(\d+(?:\.\d+)?)\s*\/\s*(4(?:\.0+)?|5(?:\.0+)?|100(?:\.0+)?)\b/);
  if (m) {
    const val = Number(m[1]);
    const scale = Number(m[2]);
    if (scale === 4) return val >= 3.5 ? "优秀" : val >= 3.0 ? "良好" : val >= 2.5 ? "中等" : val >= 2.0 ? "偏弱" : "弱";
    if (scale === 5) return val >= 4.3 ? "优秀" : val >= 3.8 ? "良好" : val >= 3.2 ? "中等" : val >= 2.6 ? "偏弱" : "弱";
    if (scale === 100) return val >= 85 ? "优秀" : val >= 75 ? "良好" : val >= 65 ? "中等" : val >= 55 ? "偏弱" : "弱";
  }
  return null;
}

function classifyEliteTier(school: V31ReportSchoolCard): "985" | "211" | null {
  const lvl = String(school.level ?? "").toLowerCase();
  const base = normalizeSchoolBaseName(school.name_cn);
  if (lvl === "985" || PROJECT_985_SCHOOLS.has(base)) return "985";
  if (lvl === "211" || PROJECT_211_ONLY_SCHOOLS.has(base)) return "211";
  return null;
}

function sanitizePayloadForStudent(data: V31ReportPayload): V31ReportPayload {
  const copy = structuredClone(data);
  if (copy.student.run_mode) {
    copy.student.run_mode = "标准全网客观匹配（学生评估版）";
  }
  for (const bucket of [copy.tiers.reach, copy.tiers.match, copy.tiers.safety]) {
    bucket.schools = bucket.schools.map((sch) => {
      const next = { ...sch };
      delete next.is_partner;
      delete next.partner_tier;
      delete next.partner_contact;
      delete next.partner_note;
      return next;
    });
  }
  copy.historical_candidates = copy.historical_candidates.map((item) => {
    const next = { ...item };
    delete next.partner_tag;
    return next;
  });
  return copy;
}

function buildStudentHeader(student: V31ReportPayload["student"]): string {
  const fields: Array<[string, string | undefined, boolean]> = [
    ["学生姓名", student.name, false],
    ["原始成绩", student.gpa, true],
    ["成绩档位", student.gpa_band, false],
    ["学历层次", student.degree, false],
    ["申请专业", student.major, true],
    ["国籍", student.nationality, false],
    ["授课语言", student.language, false],
    ["语言成绩", student.language_score, false],
    ["奖学金需求", student.scholarship, false],
    ["目标入学", student.intake, false],
  ];
  const cards = fields
    .filter(([, value]) => Boolean(value))
    .map(([label, value, hl]) => {
      const valHtml = hl ? `<span class="highlight-red">${esc(value)}</span>` : esc(value);
      return `<div class="info-card"><div class="label">${esc(label)}</div><div class="value">${valHtml}</div></div>`;
    });

  let hardHtml = "";
  if (Array.isArray(student.hard_requirements) && student.hard_requirements.length > 0) {
    const tags = student.hard_requirements.map((h) => `<span class="hard-tag">${esc(h)}</span>`).join("");
    hardHtml = `<div class="hard-req-bar"><span class="hard-req-title">硬性条件（不满足即淘汰）</span><div class="hard-req-tags">${tags}</div></div>`;
  } else if (Array.isArray(student.hard_requirements)) {
    hardHtml = '<div class="hard-req-bar relaxed"><span class="hard-req-title">硬性条件</span><div class="hard-req-tags"><span class="hard-tag" style="color:#047857;border-color:#a7f3d0;">仅保留学历与专业基本匹配（其余均设为偏好）</span></div></div>';
  }

  const footnotes: string[] = [];
  if (student.intake_note) footnotes.push(`<div class="intake-footnote"><strong>批次口径说明：</strong>${esc(student.intake_note)}</div>`);
  if (student.note) footnotes.push(`<div class="report-note">${esc(student.note)}</div>`);
  const footnotesHtml = footnotes.length ? `<div class="header-footnotes">${footnotes.join("\n")}</div>` : "";

  const searchDate = student.search_date || new Date().toLocaleDateString("zh-CN");
  const matchMode = student.match_mode || "模糊匹配（默认）";
  const runModeHtml = student.run_mode ? `<span>·</span><span>运行模式：${esc(student.run_mode)}</span>` : "";

  return `<div class="report-header">
<div class="header-top">
<h1>留学项目匹配评估报告</h1>
<div class="header-meta">
<span>日期：${esc(searchDate)}</span>
<span>·</span>
<span>模式：${esc(matchMode)}</span>
${runModeHtml}
<span>·</span>
<span>注：Safety 仅代表相对低风险，非录取保证</span>
</div>
</div>
<div class="student-info">
${cards.join("\n")}
</div>
${hardHtml}
${footnotesHtml}
</div>`;
}

function buildOverview(tiers: V31ReportPayload["tiers"]): string {
  const items: Array<[keyof V31ReportPayload["tiers"], string, string, string]> = [
    ["reach", "冲 Reach", "池内竞争较高", "var(--reach-color)"],
    ["match", "稳 Match", "竞争力较匹配", "var(--match-color)"],
    ["safety", "保 Safety", "相对低风险 · 非保录", "var(--safety-color)"],
  ];
  const parts = items.map(([key, label, sub, color]) => {
    const count = tiers[key]?.schools.length ?? 0;
    return `<a class="overview-card ${key}" href="#tier-${key}"><div class="ov-left"><div class="label">${label}</div><div class="sublabel">${sub}</div></div><div class="count" style="color:${color}">${count}</div></a>`;
  });
  return `<div class="overview">${parts.join("\n")}</div>`;
}

function renderReportCore(
  data: V31ReportPayload,
): {
  html: string;
  fabricationWarnings: string[];
  policyWarnings: string[];
} {
  const fabricationWarnings: string[] = [];
  const policyWarnings: string[] = [];
  const sourcesMap = new Map<number, V31SourceItem>();
  for (const s of data.sources ?? []) sourcesMap.set(s.id, s);
  const targetYear = extractYear(data.student.intake);

  const checkLongTermRule = (school: V31ReportSchoolCard) => {
    if (!school.long_term_rule) return true;
    const ev = String(school.long_term_evidence ?? "").trim();
    let ok = true;
    if (ev.length < 12) {
      policyWarnings.push(`${school.name_cn}: 标记 long_term_rule 但缺少充分的 long_term_evidence 依据说明（须≥12字）`);
      ok = false;
    }
    if (getWindowStatus(school) === "wait") {
      policyWarnings.push(`${school.name_cn}: window_status=wait 禁止标记 long_term_rule 混入正式梯队`);
      ok = false;
    }
    return ok;
  };

  const checkDataYearBadge = (school: V31ReportSchoolCard): string => {
    if (school.long_term_rule) return "";
    const dy = extractYear(school.data_year);
    const expected = targetYear ?? new Date().getFullYear();
    if (dy == null) {
      policyWarnings.push(`${school.name_cn}: 未标 data_year，正式梯队必须标明目标批次年份`);
      return '<span class="badge" style="background:#f39c12;color:#fff;font-size:13px;padding:4px 12px;border-radius:12px;font-weight:700;">⚠ 批次待核实</span>';
    }
    if (dy !== expected) {
      policyWarnings.push(`${school.name_cn}: data_year=${dy} 与目标入学批次${expected}不一致`);
      return `<span class="badge" style="background:#f39c12;color:#fff;font-size:13px;padding:4px 12px;border-radius:12px;font-weight:700;">⚠ 非目标批次(${dy})</span>`;
    }
    return "";
  };

  const tierList: Array<[keyof V31ReportPayload["tiers"], string]> = [
    ["reach", "冲"],
    ["match", "稳"],
    ["safety", "保"],
  ];

  // Cross-school comparison table
  const allSchools: Array<[string, string, V31ReportSchoolCard]> = [];
  for (const [tk, label] of tierList) {
    for (const s of data.tiers[tk]?.schools ?? []) {
      allSchools.push([tk, label, s]);
    }
  }
  const basesWithNum = new Set<string>();
  const totals: number[] = [];
  for (const [, , s] of allSchools) {
    if (s.costs?.total_num != null) {
      basesWithNum.add(inferCostBasis(s.costs));
      totals.push(s.costs.total_num);
    }
  }
  const mixedBasis = basesWithNum.size > 1;
  if (mixedBasis) {
    policyWarnings.push(`跨校费用对比存在不同计费口径混填 total_num (${[...basesWithNum].join(",")})`);
  }
  const minTotal = !mixedBasis && totals.length >= 2 ? Math.min(...totals) : null;
  const maxTotal = !mixedBasis && totals.length >= 2 && minTotal !== Math.max(...totals) ? Math.max(...totals) : null;

  const windowOrder: Record<string, number> = { open: 0, upcoming: 1 };
  const sortedForCmp = [...allSchools].sort(
    (a, b) =>
      (windowOrder[getWindowStatus(a[2]) ?? ""] ?? 2) - (windowOrder[getWindowStatus(b[2]) ?? ""] ?? 2)
      || getSchoolPartnerRank(b[2]) - getSchoolPartnerRank(a[2]),
  );

  const levelMap: Record<string, string> = {
    "985": "985",
    "211": "211",
    double_first_class: "双一流",
    normal: "普通大学",
    college: "本科学院",
    joint: "中外合作",
  };
  const windowCells: Record<string, string> = {
    open: '<span class="cmp-w-open">● 开放中</span>',
    upcoming: '<span class="cmp-w-upcoming">● 即将开放</span>',
    wait: '<span class="cmp-wait">● 待下轮</span>',
  };
  const eligMap: Record<string, [string, string]> = {
    eligible: ["符合已公开资格", "eligibility-eligible"],
    conditional: ["条件性候选", "eligibility-conditional"],
    unverified: ["资格待核实", "eligibility-unverified"],
  };

  let comparisonHtml = "";
  if (sortedForCmp.length > 0) {
    const cmpRows = sortedForCmp.map(([tk, tLabel, s]) => {
      const anchor = schoolAnchorId(tk, s.name_cn);
      const pLabel = formatPartnerLabel(s);
      const pChip = getSchoolPartnerRank(s) > 0
        ? `<span class="cmp-chip cmp-partner">${esc(pLabel)}</span>`
        : pLabel ? `<span class="cmp-chip">${esc(pLabel)}</span>` : "";
      const [eligTxt, eligCls] = eligMap[s.eligibility_status] ?? ["资格待核实", "eligibility-unverified"];
      const matchNote = s.match_rows.find((mr) => mr.dimension === "专业")?.note ?? "";
      const totalRaw = s.costs?.total ?? "";
      const totalNum = s.costs?.total_num;
      let costHtml = `<span class="cmp-main" style="font-weight:600;">${esc(totalRaw)}</span>`;
      if (totalNum != null && !mixedBasis) {
        if (totalNum === minTotal) costHtml = `<span class="cmp-best">${esc(totalRaw)}</span>`;
        else if (totalNum === maxTotal) costHtml = `<span class="cmp-worst">${esc(totalRaw)}</span>`;
      }
      const gates: string[] = [];
      if (s.needs_supervisor) gates.push('<span class="cmp-gate-warn">需导师函</span>');
      for (const ir of s.info_rows) {
        if (ir.label.includes("CSCA") && !/(?:不需要|否|未提及|未公布)/u.test(ir.value)) {
          gates.push('<span class="cmp-gate-warn">须 CSCA</span>');
        }
      }
      const ws = getWindowStatus(s);
      const dlRaw = s.info_rows.find((ir) => ir.label.includes("截止") || ir.label.includes("申请时间"))?.value ?? "—";
      return `<tr>
<th><div class="cmp-school-cell"><a class="cmp-school-name" href="#${anchor}">${esc(s.name_cn)}</a><div class="cmp-school-meta"><span class="tier-tag tier-${tk}">${tLabel}</span>${pChip}<span class="cmp-chip">${esc(levelMap[s.level] ?? "普通大学")}</span><span class="cmp-chip">证据 ${esc(s.evidence_grade)} 级</span></div></div></th>
<td><div class="cmp-stack"><span class="badge ${eligCls} cmp-nowrap">${esc(eligTxt)}</span><span class="cmp-sub">${esc(s.admission_competitiveness)}</span></div></td>
<td><span class="cmp-main">${esc(matchNote || "—")}</span></td>
<td><div class="cmp-stack">${costHtml}</div></td>
<td><span class="cmp-main">${esc(s.scholarship_assessment)}</span></td>
<td>${gates.length ? `<div class="cmp-stack">${gates.join("")}</div>` : '<span class="cmp-gate-ok">无额外前置</span>'}</td>
<td><div class="cmp-stack">${ws ? (windowCells[ws] ?? "—") : "—"}<span class="cmp-sub">${esc(dlRaw)}</span></div></td>
</tr>`;
    }).join("\n");

    comparisonHtml = `<div class="comparison-section">
<div class="panel-header"><h2>跨校核心指标横向对比</h2></div>
<div class="comparison-desc">点击校名可直接跳转至下方详情卡片；仅计费周期相同的项目参与费用高低标注。</div>
<div style="overflow-x:auto;"><table class="comparison-table">
<thead><tr><th style="width:19%;">学校与梯队</th><th style="width:14%;">资格与竞争力</th><th style="width:12%;">专业匹配</th><th style="width:15%;">核心费用</th><th style="width:16%;">奖学金评估</th><th style="width:9%;">关键门槛</th><th style="width:15%;">申请窗口与截止</th></tr></thead>
<tbody>${cmpRows}</tbody>
</table></div>
<div class="cmp-note">注：申请窗口状态以报告生成日期为准；Safety 仅表示相对低风险，不构成录取保证。</div>
</div>`;
  }

  const tierSections = (["reach", "match", "safety"] as const).map((tk) => {
    const meta = {
      reach: ["冲 Reach", "候选池内竞争较高"],
      match: ["稳 Match", "候选池内竞争力较匹配"],
      safety: ["保 Safety", "相对低风险 · 非录取保证"],
    }[tk];
    const bucket = data.tiers[tk] ?? { schools: [] };
    const srcMap: Record<string, [string, string]> = {
      official: ["official", "官网核实"],
      unverified: ["third", "官网无法访问·待核实"],
      mixed: ["mixed", "官网核实+待更新字段"],
      third: ["third", "官网无法访问·待核实"],
    };
    const [srcCls, srcLabel] = srcMap[bucket.source_type ?? "official"] ?? srcMap.official;

    let schoolsHtml = "";
    let tierNoteHtml = "";
    if (!bucket.schools.length) {
      const reason = bucket.empty_reason || bucket.tier_note || "当前目标批次未找到符合全部硬性条件与成绩档位的已核实项目";
      schoolsHtml = `<div class="callout callout-warn" style="margin-top:0;">${esc(reason)}</div>`;
    } else {
      if (bucket.tier_note) {
        tierNoteHtml = `<div class="tier-note-bar"><strong>本层说明：</strong>${esc(bucket.tier_note)}</div>`;
      }
      const ordered = [...bucket.schools].sort(
        (a, b) => (windowOrder[getWindowStatus(a) ?? ""] ?? 2) - (windowOrder[getWindowStatus(b) ?? ""] ?? 2) || getSchoolPartnerRank(b) - getSchoolPartnerRank(a),
      );
      schoolsHtml = ordered.map((school, idx) => {
        checkLongTermRule(school);
        const badges: string[] = [];
        const pLabel = formatPartnerLabel(school);
        if (pLabel) {
          const rank = getSchoolPartnerRank(school);
          if (rank > 0) {
            badges.push(`<span class="badge ${rank >= 3 ? "badge-partner badge-partner-top" : "badge-partner"}">${esc(pLabel)}</span>`);
          } else {
            badges.push(`<span class="badge badge-non-partner">${esc(pLabel)}</span>`);
          }
        }
        const badgeClsMap: Record<string, string> = {
          "985": "badge-985",
          "211": "badge-211",
          double_first_class: "badge-211",
          normal: "badge-normal",
          college: "badge-college",
          joint: "badge-normal",
        };
        const badgeLblMap: Record<string, string> = {
          "985": "985",
          "211": "211",
          double_first_class: "双一流",
          normal: "普通大学",
          college: "本科院校(学院)",
          joint: "中外合作大学",
        };
        badges.push(`<span class="badge ${badgeClsMap[school.level] ?? "badge-normal"}">${esc(badgeLblMap[school.level] ?? school.level)}</span>`);
        if (school.city) badges.push(`<span class="badge badge-city">${esc(school.city)}</span>`);
        const [elLbl, elCls] = eligMap[school.eligibility_status] ?? ["资格待核实", "eligibility-unverified"];
        badges.push(`<span class="badge ${elCls}">${esc(elLbl)}</span>`);
        const ws = getWindowStatus(school);
        if (ws && WINDOW_BADGES[ws]) badges.push(WINDOW_BADGES[ws]);
        if (school.needs_supervisor) badges.push('<span class="badge badge-supervisor">需导师接收函</span>');
        if (school.deadline_urgent) badges.push('<span class="badge badge-deadline">即将截止</span>');
        if (school.long_term_rule) badges.push('<span class="badge badge-longterm">现行常设规则页</span>');
        const yBadge = checkDataYearBadge(school);
        if (yBadge) badges.push(yBadge);

        const infoRowsHtml = school.info_rows.map((row) => {
          const clean = sanitizeValue(row.label, row.value, row.source_id, school.name_cn, row.status, fabricationWarnings);
          let valHtml = clean.blocked
            ? `<span class="blocked-value">${esc(clean.value)}</span>`
            : row.is_fee
              ? `<span class="fee">${esc(clean.value)}</span>`
              : row.highlight
                ? `<span class="highlight-red">${esc(clean.value)}</span>`
                : row.is_empty
                  ? `<span class="empty-data">${esc(row.empty_text || "官网无内容")}</span>`
                  : esc(clean.value);
          if (row.status && WINDOW_BADGES[row.status]) valHtml += ` ${WINDOW_BADGES[row.status]}`;
          if (row.source_id != null) {
            const url = sourcesMap.get(row.source_id)?.url ?? "#";
            const targetAttr = /^https?:\/\//i.test(url) ? ' target="_blank"' : "";
            valHtml += ` <a class="source-ref" href="${esc(url)}"${targetAttr}>[${row.source_id}]</a>`;
          }
          return `<tr><th>${esc(row.label)}</th><td>${valHtml}</td></tr>`;
        }).join("\n");

        const iconMap: Record<string, string> = {
          yes: '<span class="match-icon match-yes">✓</span>',
          warn: '<span class="match-icon match-warn">△</span>',
          no: '<span class="match-icon match-no">✗</span>',
          unknown: '<span class="match-icon match-unknown">○</span>',
        };
        const matchRowsHtml = school.match_rows.map((mr) => {
          const sv = mr.student_highlight ? `<span class="highlight-red">${esc(mr.student)}</span>` : esc(mr.student);
          const scv = mr.school_highlight ? `<span class="highlight-red">${esc(mr.school)}</span>` : esc(mr.school);
          return `<tr><td>${esc(mr.dimension)}</td><td>${sv}</td><td>${scv}</td><td>${iconMap[mr.match_type] ?? iconMap.unknown} ${esc(mr.note)}</td></tr>`;
        }).join("\n");

        let costPanel = "";
        if (school.costs) {
          let tuitionVal = school.costs.tuition;
          if (tuitionVal && !KNOWN_EMPTY_PREFIX.some((p) => tuitionVal.startsWith(p)) && FABRIC_MARKERS.some((m) => tuitionVal.includes(m))) {
            fabricationWarnings.push(`${school.name_cn} · costs.tuition: 原值'${tuitionVal}' 含估算措辞，已替换为'未公布，需向学校确认'`);
            tuitionVal = "未公布，需向学校确认";
          }
          const tHtml = tuitionVal === "未公布，需向学校确认"
            ? `<span class="blocked-value">${esc(tuitionVal)}</span>`
            : school.costs.tuition_hl ? `<span class="fee">${esc(tuitionVal)}</span>` : esc(tuitionVal);
          const totHtml = school.costs.total_hl ? `<span class="fee">${esc(school.costs.total)}</span>` : esc(school.costs.total);
          costPanel = `<div class="info-section sub-panel"><h4 class="section-label">费用明细</h4><table class="cost-table">
<tr><th>${esc(school.costs.tuition_label || "学费（年）")}</th><td>${tHtml}</td></tr>
<tr><th>${esc(school.costs.accommodation_label || "住宿费（年）")}</th><td>${esc(school.costs.accommodation)}</td></tr>
<tr><th>${esc(school.costs.insurance_label || "保险费（年）")}</th><td>${esc(school.costs.insurance)}</td></tr>
<tr><th>${esc(school.costs.living_label || "生活费估算（年）")}</th><td>${esc(school.costs.living)}</td></tr>
<tr class="total-row"><th>${esc(school.costs.total_label || "年度总费用")}</th><td>${totHtml}</td></tr>
</table>${school.costs.note ? `<div class="cost-note">${esc(school.costs.note)}</div>` : ""}</div>`;
        }

        let timelinePanel = "";
        if (school.timeline?.length) {
          const tagMap: Record<string, string> = { deadline: "截止", now: "当前", milestone: "节点" };
          const itemsHtml = school.timeline.map((t) => `<div class="timeline-item timeline-${t.type}"><div class="timeline-date">${esc(t.date)} <span class="timeline-tag ${t.type}">${tagMap[t.type] ?? ""}</span></div><div class="timeline-task">${esc(t.task)}</div></div>`).join("\n");
          timelinePanel = `<div class="info-section sub-panel"><h4 class="section-label">申请时间线</h4><div class="timeline">${itemsHtml}</div></div>`;
        }
        const bottomHtml = costPanel && timelinePanel
          ? `<hr class="section-divider"><div class="card-bottom-grid">${costPanel}${timelinePanel}</div>`
          : costPanel || timelinePanel
            ? `<hr class="section-divider"><div class="card-bottom-grid single-col">${costPanel}${timelinePanel}</div>`
            : "";

        const partnerNotice = school.partner_note
          ? `<div class="partner-notice"><strong>🤝 内部合作与渠道台账：</strong>${esc(school.partner_note)}</div>`
          : "";
        const longTermNotice = school.long_term_rule
          ? `<div class="longterm-notice"><strong>依据官网现行常设规则页（非目标年份专项简章）：</strong>${esc(school.long_term_evidence)}</div>`
          : "";

        return `<details class="school-card" id="${schoolAnchorId(tk, school.name_cn)}" ${idx === 0 ? "open" : ""}>
<summary class="card-header">
<div class="card-title-group">
<div class="card-title-row"><h3>${esc(school.name_cn)}</h3>${school.name_en ? `<span class="card-name-en">${esc(school.name_en)}</span>` : ""}</div>
<div class="card-badges">${badges.join(" ")}</div>
</div>
<span class="toggle-icon">▼</span>
</summary>
<div class="card-body">
${partnerNotice}
${longTermNotice}
<div class="info-section"><h4 class="section-label">项目核心事实</h4><table class="info-table">${infoRowsHtml}</table></div>
<hr class="section-divider">
<div class="analysis-section"><h4 class="section-label">匹配评估与结论</h4><table class="match-table"><tr><th>维度</th><th>学生条件</th><th>学校要求</th><th>匹配度</th></tr>${matchRowsHtml}</table>
<div class="callout ${tk === "reach" ? "callout-warn" : "callout-success"}">
<div class="verdict-metrics">
<div class="verdict-item"><span class="verdict-k">录取竞争力</span><span class="verdict-v">${esc(school.admission_competitiveness)}</span></div>
<div class="verdict-item"><span class="verdict-k">证据等级</span><span class="verdict-v">${esc(school.evidence_grade)} 级</span></div>
<div class="verdict-item"><span class="verdict-k">奖学金评估</span><span class="verdict-v">${esc(school.scholarship_assessment)}</span></div>
</div>
<div class="verdict-rows">
<div class="verdict-row"><strong>分层理由：</strong>${esc(school.tier_reason ?? "")}</div>
<div class="verdict-row"><strong>风险提示：</strong>${esc(school.risk_note ?? "")}</div>
</div>
</div>
</div>
${bottomHtml}
</div>
</details>`;
      }).join("\n");
    }

    return `<div class="section-title ${tk}" id="tier-${tk}"><div class="section-title-main"><span class="tier-heading">${meta[0]}</span><span class="tier-sub">${meta[1]}</span></div><span class="source-badge ${srcCls}">${srcLabel}</span></div>${tierNoteHtml}${schoolsHtml}`;
  }).join("\n");

  const historicalHtml = data.historical_candidates?.length
    ? `<div class="panel-section"><div class="panel-header"><h2>历史规则预匹配候选（目标批次简章待发布）</h2></div><div class="panel-desc">非淘汰院校，亦非目标年份正式录取结论；以下高校最近一届官网规则已核实，可用于提前备选，旧年份数据须待新简章发布后更新。</div><div style="overflow-x:auto;"><table class="source-table"><tr><th style="width:15%;">学校</th><th style="width:15%;">项目</th><th style="width:68px;">批次</th><th style="width:11%;">预估梯度</th><th>往年官网规则摘要</th><th style="width:16%;">下一步</th><th style="width:88px;">官网来源</th></tr>${data.historical_candidates.map((e) => {
        const sHtml = esc(e.school) + (e.partner_tag ? ` <span class="cmp-chip cmp-partner">🤝 ${esc(e.partner_tag)}</span>` : "");
        const srcHtml = e.source_url && /^https?:\/\//i.test(e.source_url) ? `<a class="ext-link-btn" href="${esc(e.source_url)}" target="_blank">查看官网 ↗</a>` : "—";
        return `<tr><td><strong>${sHtml}</strong></td><td>${esc(e.program)}</td><td style="white-space:nowrap;">${esc(e.reference_year)}</td><td>${esc(e.preliminary_tier)}</td><td>${esc(e.historical_summary)}</td><td>${esc(e.next_action || `等待${e.target_year}招生简章发布后重核`)}</td><td style="white-space:nowrap;">${srcHtml}</td></tr>`;
      }).join("\n")}</table></div></div>`
    : "";

  const eliminatedHtml = data.eliminated?.length
    ? `<div class="panel-section"><div class="panel-header"><h2>已淘汰候选及原因</h2></div><div class="panel-desc">以下候选因硬性条件（成绩档位差≥2档、授课语言不符、预算超限、国籍限制或当年未开放招生等）被过滤，留存透明取舍记录。</div><div style="overflow-x:auto;"><table class="source-table"><tr><th style="width:18%;">学校</th><th style="width:13%;">原拟层次</th><th>淘汰原因</th><th style="width:88px;">官网来源</th></tr>${data.eliminated.map((e) => {
        const srcHtml = e.source_url && /^https?:\/\//i.test(e.source_url) ? `<a class="ext-link-btn" href="${esc(e.source_url)}" target="_blank">查看官网 ↗</a>` : "—";
        return `<tr><td><strong>${esc(e.school)}</strong></td><td style="white-space:nowrap;color:var(--text-light);">${esc(e.tier_label || "—")}</td><td>${esc(e.reason)}</td><td style="white-space:nowrap;">${srcHtml}</td></tr>`;
      }).join("\n")}</table></div></div>`
    : "";

  const risksHtml = data.risks?.length
    ? `<div class="panel-section"><div class="panel-header"><h2>风险提示与数据局限</h2></div><div class="risk-list">${data.risks.map((r) => `<div class="callout callout-${r.type || "warn"}">${r.content}</div>`).join("\n")}</div></div>`
    : "";

  const sourcesHtml = data.sources?.length
    ? `<div class="panel-section" id="report-sources"><div class="panel-header"><h2>数据来源汇总</h2></div><div style="overflow-x:auto;"><table class="source-table"><tr><th style="width:60px;">编号</th><th style="width:28%;">来源名称</th><th style="width:76px;">类型</th><th>来源链接 / 说明</th></tr>${[...data.sources].sort((a, b) => a.id - b.id).map((s) => {
        const linkCell = /^https?:\/\//i.test(s.url)
          ? `<a href="${esc(s.url)}" target="_blank">${esc(s.url)}</a>`
          : `<span style="color:var(--text-light);">系统内部已归档（申请前须同步核验学校官网当年简章）</span>`;
        return `<tr><td style="white-space:nowrap;color:var(--text-light);font-weight:600;">[${s.id}]</td><td>${esc(s.name)}</td><td style="white-space:nowrap;">${esc(s.type)}</td><td>${linkCell}</td></tr>`;
      }).join("\n")}</table></div></div>`
    : "";

  const progressHtml = data.progress
    ? `<details class="progress-summary"><summary><div><span>检索与核验过程审计</span><span class="progress-summary-brief">已完成 ${data.progress.steps.filter((s) => s.status === "done").length}/${data.progress.steps.length} 个阶段 · 点击展开核查明细</span></div><span class="toggle-icon">▼</span></summary><div class="progress-body"><div class="progress-steps">${data.progress.steps.map((s) => `<span class="progress-step ${s.status}">${esc(s.label)}</span>`).join("\n")}</div>${data.progress.meta ? `<div class="progress-meta">${Object.entries(data.progress.meta).map(([k, v]) => `<div class="progress-meta-item"><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`).join("\n")}</div>` : ""}</div></details>`
    : "";

  const content = [
    buildStudentHeader(data.student),
    buildOverview(data.tiers),
    comparisonHtml,
    tierSections,
    historicalHtml,
    eliminatedHtml,
    risksHtml,
    sourcesHtml,
    progressHtml,
  ].filter(Boolean).join("\n");

  const html = V31_REPORT_HTML_TEMPLATE
    .replace("{{REPORT_TITLE}}", esc(data.report_title))
    .replace("{{REPORT_CONTENT}}", content);

  return { html, fabricationWarnings, policyWarnings };
}

export function runV31ReportGates(data: V31ReportPayload): V31GateReport {
  const { html, fabricationWarnings, policyWarnings } = renderReportCore(data);
  const formalSchools = [...data.tiers.reach.schools, ...data.tiers.match.schools, ...data.tiers.safety.schools];
  const hasFormal = formalSchools.length > 0;

  const isApplyingVocational = /(?:专科|高职|associate|diploma)/i.test(data.student.degree ?? "") || Boolean(data.student.allow_vocational_fallback);
  const vocationalViolation = !isApplyingVocational && formalSchools.some((sch) => VOCATIONAL_SCHOOL_MARKERS.some((m) => sch.name_cn.includes(m)));

  if (data.student.engine_state === "CIRCUIT_BREAKER" && formalSchools.length > 0) {
    policyWarnings.push(`硬熔断劝退态（CIRCUIT_BREAKER）违规泄露了 ${formalSchools.length} 所推荐院校`);
  }
  if (/(?:校外打工|打工赚学费|兼职覆盖学费|一边打工一边读书|校外兼职补贴|半工半读覆盖)/u.test(html) && !html.includes("严禁以校外打工")) {
    policyWarnings.push("报告正文包含违规校外打工诱导措辞");
  }

  const studentBand = inferStudentGpaBand(data.student);
  const isBachelorApp = /本科|bachelor|ug/i.test(data.student.degree ?? "");
  const collegeTierOk = (() => {
    if (!isBachelorApp || !["中等", "偏弱", "弱"].includes(studentBand ?? "")) return true;
    if (formalSchools.some((s) => s.level === "college" || s.name_cn.includes("学院"))) return true;
    const blob = JSON.stringify({
      historical: data.historical_candidates,
      eliminated: data.eliminated,
      risks: data.risks,
    });
    return blob.includes("学院");
  })();

  const gpaAlignmentOk = (() => {
    if (!["中等", "偏弱", "弱"].includes(studentBand ?? "")) return true;
    let ok = true;
    for (const sch of formalSchools) {
      const elite = classifyEliteTier(sch);
      if (!elite) continue;
      if ((studentBand === "偏弱" || studentBand === "弱") && (elite === "985" || elite === "211")) {
        policyWarnings.push(`${sch.name_cn}(${elite}) 跨档推荐给【${studentBand}】档学生`);
        ok = false;
      } else if (studentBand === "中等" && elite === "985") {
        policyWarnings.push(`${sch.name_cn}(985) 跨≥2档推荐给【中等】档学生`);
        ok = false;
      }
    }
    return ok;
  })();

  const tierFillOk = (["reach", "match", "safety"] as const).every((tk) => {
    const bucket = data.tiers[tk];
    if (bucket.schools.length >= 2) return true;
    const note = String(bucket.tier_note || bucket.empty_reason || "").trim();
    if (note.length < 8) {
      policyWarnings.push(`${tk} 仅 ${bucket.schools.length} 所，且未填 tier_note / empty_reason 说明原因`);
      return false;
    }
    return true;
  });

  const requiredSup = formalSchools.filter((s) => s.needs_supervisor).length;
  const renderedSup = (html.match(/class="badge badge-supervisor"/g) ?? []).length;
  const basesWithNum = new Set(
    formalSchools
      .filter((s) => s.costs?.total_num != null)
      .map((s) => inferCostBasis(s.costs)),
  );

  const hasPublishedTuition = formalSchools.some((s) =>
    s.info_rows.some((r) => r.is_fee && !r.is_empty) || Boolean(s.costs?.tuition_hl),
  );

  const checks: V31GateCheckResult[] = [
    { name: "导师接收函badge完整", passed: renderedSup >= requiredSup },
    { name: "核心信息标红", passed: html.includes('class="highlight-red"') },
    { name: "学费标红", passed: !hasFormal || !hasPublishedTuition || html.includes('class="fee"') },
    { name: "官网来源引用链接", passed: !hasFormal || html.includes('class="source-ref"') || data.sources.length === 0 },
    { name: "卡片两大板块分隔线", passed: !hasFormal || html.includes('class="section-divider"') },
    { name: "卡片两大板块结构", passed: !hasFormal || (html.includes('class="info-section"') && html.includes('class="analysis-section"')) },
    { name: "搜索进度概览", passed: html.includes('class="progress-summary"') },
    { name: "费用信息表", passed: !hasFormal || (html.includes('class="cost-table"') && html.includes('class="total-row"')) },
    { name: "申请时间线", passed: !hasFormal || html.includes('class="timeline"') },
    { name: "跨校横向对比表", passed: !hasFormal || html.includes('class="comparison-table"') },
    {
      name: "未使用数字录取概率字段",
      passed: formalSchools.every((s) => !("%" in s) && !String(s.admission_competitiveness ?? "").includes("%")),
    },
    { name: "未核实项目未混入正式梯队", passed: formalSchools.every((s) => s.eligibility_status !== "unverified") },
    { name: "证据等级A/B/C已标注", passed: formalSchools.every((s) => s.evidence_grade === "A" || s.evidence_grade === "B" || s.evidence_grade === "C") },
    { name: "录取竞争力已标注", passed: formalSchools.every((s) => Boolean(s.admission_competitiveness)) },
    { name: "奖学金评估已标注", passed: formalSchools.every((s) => Boolean(s.scholarship_assessment)) },
    { name: "Safety项目均已满足公开资格", passed: data.tiers.safety.schools.every((s) => s.eligibility_status === "eligible") },
    { name: "硬性条件清单(hard_requirements)已声明", passed: Array.isArray(data.student.hard_requirements) },
    { name: "无专科/高职院校误混入本科及以上推荐池", passed: !vocationalViolation },
    { name: "申请截止窗口状态(open/upcoming/wait)已完整标注", passed: formalSchools.every(hasValidDeadlineAnnotation) },
    { name: "候选池院校层次覆盖符合学生成绩档位(v2.4.1)", passed: collegeTierOk },
    { name: "无跨成绩档位乱推985/211(偏弱/弱禁985/211，中等禁985)", passed: gpaAlignmentOk },
    { name: "跨校费用横向对比口径一致(未混比总学费与年费)", passed: basesWithNum.size <= 1 },
    { name: "long_term_rule 均有可核查依据", passed: formalSchools.every((s) => !s.long_term_rule || ((s.long_term_evidence?.trim().length ?? 0) >= 12 && getWindowStatus(s) !== "wait")) },
    { name: "各梯队数量达标或已结构化说明原因", passed: tierFillOk },
    { name: "数据批次年份与结构策略零违规", passed: policyWarnings.length === 0 },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  return {
    passedCount,
    totalCount: checks.length,
    allPassed: passedCount === checks.length && fabricationWarnings.length === 0 && policyWarnings.length === 0,
    checks,
    fabricationWarnings,
    policyWarnings,
  };
}

export function renderV31ReportHtml(
  data: V31ReportPayload,
  options: { variant: "advisor" | "student" } = { variant: "student" },
): string {
  const payload = options.variant === "student" ? sanitizePayloadForStudent(data) : data;
  return renderReportCore(payload).html;
}

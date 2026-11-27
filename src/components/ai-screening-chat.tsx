"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, Check, ChevronDown, ClipboardList, Download, ExternalLink, FileText, Globe, GraduationCap, History, MessageSquare, PencilLine, Plus, Settings2, ShieldAlert, SlidersHorizontal, Sparkles, Square, X } from "lucide-react";
import { PlanDraftPane, type SavedPlan } from "@/components/ai-screening-plan";
import { SessionHistorySidebar } from "@/components/ai-screening-history";
import { LiveResearchProgress } from "@/components/ai-screening-progress";
import type { AdmissionDiagnostic } from "@/lib/admission-rule-engine";
import { criteriaSchema, hasCriteriaValue, schoolIdentityKey, type ChatCriteria, type ResultCard } from "@/lib/ai-screening";
import type { ScreeningResponse, ScreeningRunMode, SearchEvent } from "@/lib/ai-screening-events";
import type { ExternalProgramItem, ExternalScreeningResult } from "@/lib/ai-screening-external";
import type { PartnerSearchPayload } from "@/lib/partner-school-engine";
import type { PersistedTurn, ScreeningSessionRecord, ScreeningSessionSummary } from "@/lib/ai-screening-sessions";
import { renderV31ReportHtml, type V31GateReport, type V31ReportPayload } from "@/lib/v31-report-render";
import type { WorkbookInfo, WorkbookPreview } from "@/lib/ai-screening-workbook";
import { moveDraftSchool, removePlanCandidate, togglePlanCandidate, type DraftPlan } from "@/lib/ai-screening-plan";
import { admissionGroupLabel, admissionListLabel, comparisonCards, displayProgramName, isCandidate, outcomeSummary, presentedProgramIds, presentedSchoolNames, resultSchoolKey, summarizePoints } from "@/lib/ai-screening-presentation";
import type { AdmissionTier } from "@/lib/screening-ranking";
import "./ai-screening.css";
import { DEFAULT_DISPLAY_SCHOOL_COUNT } from "@/lib/recommendation-profile";
import { useT, useTv, useTm, useLocale } from "@/lib/i18n/locale-context";

type Turn = PersistedTurn;
type RightDrawerMode = "none" | "draft" | "report";
const PROFILE_STORAGE_KEY = "school-syt.ai-screening-profile.v2";
const ACTIVE_SESSION_STORAGE_KEY = "school-syt.ai-screening-active-session.v1";
const SESSIONS_CACHE_KEY = "school-syt.ai-screening-sessions-cache.v1";
const SESSIONS_SYNC_KEY = "school-syt.ai-screening-sessions-sync.v1";
const HISTORY_OPEN_KEY = "school-syt.ai-screening-history-open.v1";
const PlanSelectionContext = createContext<{
  selectedIds: ReadonlySet<string>;
  saving: boolean;
  toggle: (card: ResultCard, result: ScreeningResponse) => void;
} | null>(null);
const ActiveResultContext = createContext<ScreeningResponse | null>(null);
const ReportPreviewContext = createContext<((report: V31ReportPayload, variant: "student" | "advisor") => void) | null>(null);

const RUN_MODE_OPTIONS: Array<{ value: ScreeningRunMode; title: string; compactTitle: string; shortDesc: string }> = [
  { value: "partner_priority", title: "模式二 · 合作优先+全网补齐", compactTitle: "合作优先+全网", shortDesc: "优先匹配合作院校占位，缺口自动 .edu.cn 全网补齐并沉淀" },
  { value: "standard_all", title: "模式一 · 全网客观匹配", compactTitle: "全网客观", shortDesc: "不偏重合作关系，纯按成绩档位与官网事实客观冲稳保" },
  { value: "partner_quick", title: "模式三 · 合作库快检", compactTitle: "合作库快检", shortDesc: "秒查内部合作台账、风控与不合作预警（免全网搜索）" },
];
const FeedbackContext = createContext<{
  saved: Record<string, "relevant" | "not_relevant">;
  pending: Set<string>;
  submit: (programId: string, value: "relevant" | "not_relevant") => void;
} | null>(null);

const degrees: Record<string, string> = { UG: "本科", MASTER: "硕士", PHD: "博士", LONG_TERM: "长期进修", SHORT_TERM: "短期项目" };
const seasons: Record<string, string> = { SPRING: "春季", SUMMER: "夏季", AUTUMN: "秋季", WINTER: "冬季" };

const tierMeta: Record<AdmissionTier, { zh: string; en: string; descZh: string; descEn: string; className: string }> = {
  REACH: { zh: "冲刺 Reach", en: "Reach", descZh: "同档择优冲刺，竞争相对较高（最多 3 所）", descEn: "Competitive options within band (max 3)", className: "is-reach" },
  TARGET: { zh: "稳妥 Match", en: "Match", descZh: "成绩与门槛契合，核心主申（最多 3 所）", descEn: "Well aligned with student profile (max 3)", className: "is-target" },
  SAFE: { zh: "保底 Safe", en: "Safe", descZh: "相对低风险备选，非录取保证（最多 3 所）", descEn: "Lower-risk options, not guaranteed (max 3)", className: "is-safe" },
};

const academicLevelLabels: Record<string, { zh: string; en: string }> = {
  EXCELLENT: { zh: "成绩优秀", en: "Academic: Excellent" },
  GOOD: { zh: "成绩良好", en: "Academic: Good" },
  MEDIUM: { zh: "成绩中等", en: "Academic: Medium" },
  WEAK: { zh: "成绩偏弱", en: "Academic: Weak" },
  POOR: { zh: "成绩较弱", en: "Academic: Low" },
};

function criteriaLabels(criteria: ChatCriteria, locale: "zh" | "en" = "zh") {
  const majorText = criteria.targetMajors?.length ? criteria.targetMajors.join(" / ") : criteria.targetMajor;
  const cityText = criteria.cities?.length ? criteria.cities.join("、") : criteria.city;
  if (locale === "en") return [
    criteria.programType && ({ UG: "Bachelor’s", MASTER: "Master’s", PHD: "Doctorate", LONG_TERM: "Long-term study", SHORT_TERM: "Short-term program" } as Record<string, string>)[criteria.programType],
    majorText && (criteria.strictMajor ? `Only ${majorText}` : `Major: ${majorText}`),
    criteria.teachingLanguage && (criteria.teachingLanguage === "ENGLISH" ? "English-taught" : "Chinese-taught"),
    criteria.budget != null && `First-year budget: CNY ${criteria.budget.toLocaleString("en-US")}`,
    (criteria.intakeYear != null || criteria.intakeSeason) && `Intake: ${criteria.intakeSeason ? ({ SPRING: "Spring", SUMMER: "Summer", AUTUMN: "Autumn", WINTER: "Winter" } as Record<string, string>)[criteria.intakeSeason] : ""} ${criteria.intakeYear ?? ""}`.trim(),
    criteria.gpa != null && `GPA ${criteria.gpa}${criteria.gpaScale != null ? `/${criteria.gpaScale}` : ""}`,
    criteria.academicLevel && academicLevelLabels[criteria.academicLevel]?.en,
    criteria.hskLevel != null && `HSK level ${criteria.hskLevel}${criteria.hskScore != null ? `, score ${criteria.hskScore}` : ""}`,
    criteria.hskLevel == null && criteria.hskScore != null && `HSK score ${criteria.hskScore}`,
    criteria.ielts != null && `IELTS ${criteria.ielts}`,
    criteria.toefl != null && `TOEFL ${criteria.toefl}`,
    criteria.duolingo != null && `Duolingo ${criteria.duolingo}`,
    criteria.plannedExams && `Planned exams: ${criteria.plannedExams}`,
    criteria.hasCsca != null && (criteria.hasCsca ? "Has CSCA" : "No CSCA"),
    criteria.cscaRequirement && (criteria.cscaRequirement === "NOT_REQUIRED" ? "School does not require CSCA" : "School requires CSCA"),
    criteria.excludeSelfFunded && "Scholarship required (no self-funded)",
    !criteria.excludeSelfFunded && criteria.scholarshipType && (criteria.scholarshipType === "full" ? "Full scholarship needed" : "Scholarship needed"),
    criteria.scholarshipPreferences?.length && `Scholarships: ${criteria.scholarshipPreferences.join(", ")}`,
    criteria.publicOnly && "Public universities only",
    criteria.noFoundation && "Direct Year 1 (no foundation)",
    criteria.accommodationRequired && "Accommodation needed",
    criteria.age != null && `Age ${criteria.age}`,
    criteria.nationality && `Nationality: ${criteria.nationality}`,
    criteria.province,
    cityText && `Priority cities: ${cityText}`,
    criteria.fallbackCities?.length && `Fallback cities: ${criteria.fallbackCities.join(", ")}`,
    criteria.targetSchools?.length && `Target pool: ${criteria.targetSchools.slice(0, 4).join(", ")}${criteria.targetSchools.length > 4 ? ` (+${criteria.targetSchools.length - 4})` : ""}`,
    criteria.wantTiering && "Reach / Target / Safe tiers",
  ].filter((item): item is string => Boolean(item));
  return [
    criteria.programType && degrees[criteria.programType],
    majorText && (criteria.strictMajor ? `只看 ${majorText}` : `${majorText}方向`),
    criteria.teachingLanguage && `${criteria.teachingLanguage === "ENGLISH" ? "英文" : "中文"}授课`,
    criteria.budget != null && `首年预算 ${criteria.budget.toLocaleString("zh-CN")} 元`,
    (criteria.intakeYear != null || criteria.intakeSeason) && `${criteria.intakeYear != null ? `${criteria.intakeYear} 年` : ""}${criteria.intakeSeason ? seasons[criteria.intakeSeason] : ""}入学`,
    criteria.gpa != null && `GPA ${criteria.gpa}${criteria.gpaScale != null ? `/${criteria.gpaScale}` : ""}`,
    criteria.academicLevel && academicLevelLabels[criteria.academicLevel]?.zh,
    criteria.hskLevel != null && `HSK ${criteria.hskLevel} 级${criteria.hskScore != null ? ` ${criteria.hskScore} 分` : ""}`,
    criteria.hskLevel == null && criteria.hskScore != null && `HSK ${criteria.hskScore} 分`,
    criteria.ielts != null && `雅思 ${criteria.ielts}`,
    criteria.toefl != null && `托福 ${criteria.toefl}`,
    criteria.duolingo != null && `多邻国 ${criteria.duolingo}`,
    criteria.plannedExams && `计划考试：${criteria.plannedExams}`,
    criteria.hasCsca != null && (criteria.hasCsca ? "已有 CSCA" : "暂无 CSCA"),
    criteria.cscaRequirement && (criteria.cscaRequirement === "NOT_REQUIRED" ? "学校不要求 CSCA" : "学校要求 CSCA"),
    criteria.excludeSelfFunded && "过滤纯自费（须有奖学金）",
    !criteria.excludeSelfFunded && criteria.scholarshipType && (criteria.scholarshipType === "full" ? "需要全额奖学金" : "需要奖学金"),
    criteria.scholarshipPreferences?.length && `奖学金偏好：${criteria.scholarshipPreferences.join("、")}`,
    criteria.publicOnly && "仅公立大学",
    criteria.noFoundation && "直入正课（无预科）",
    criteria.accommodationRequired && "需要住宿",
    criteria.age != null && `${criteria.age} 岁`,
    criteria.nationality && `${criteria.nationality}籍`,
    criteria.province && `${criteria.province}`,
    cityText && `优先城市：${cityText}`,
    criteria.fallbackCities?.length && `备选城市：${criteria.fallbackCities.join("、")}`,
    criteria.targetSchools?.length && `参考池：${criteria.targetSchools.slice(0, 4).join("、")}${criteria.targetSchools.length > 4 ? ` 等 ${criteria.targetSchools.length} 所` : ""}`,
    criteria.wantTiering && "冲刺/匹配/稳妥分档",
  ].filter((item): item is string => Boolean(item));
}

function draftValue(value: string | number | boolean | null | undefined) {
  return value == null ? "" : String(value);
}

function CriteriaBar({ criteria, busy, onApply }: { criteria: ChatCriteria; busy: boolean; onApply: (criteria: ChatCriteria) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const locale = useLocale();
  const labels = criteriaLabels(criteria, locale);
  const fields = {
    programType: draftValue(criteria.programType),
    teachingLanguage: draftValue(criteria.teachingLanguage),
    targetMajor: draftValue(criteria.targetMajor),
    budget: draftValue(criteria.budget),
    intakeYear: draftValue(criteria.intakeYear),
    intakeSeason: draftValue(criteria.intakeSeason),
    gpa: draftValue(criteria.gpa),
    gpaScale: draftValue(criteria.gpaScale),
    ielts: draftValue(criteria.ielts),
    toefl: draftValue(criteria.toefl),
    duolingo: draftValue(criteria.duolingo),
    hskLevel: draftValue(criteria.hskLevel),
    hskScore: draftValue(criteria.hskScore),
    hasCsca: draftValue(criteria.hasCsca),
    cscaRequirement: draftValue(criteria.cscaRequirement),
    scholarshipType: draftValue(criteria.scholarshipType),
    accommodationRequired: draftValue(criteria.accommodationRequired),
    age: draftValue(criteria.age),
    province: draftValue(criteria.province),
    city: draftValue(criteria.city),
  };

  function openEditor() {
    setDraft(fields);
    setEditing(true);
  }

  function change(key: keyof typeof fields, value: string) {
    setDraft((old) => ({ ...old, [key]: value }));
  }

  function numberOrNull(key: keyof typeof fields) {
    const raw = draft[key]?.trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function booleanOrNull(key: keyof typeof fields) {
    const raw = draft[key]?.trim();
    if (!raw) return null;
    return raw === "true";
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: ChatCriteria = {
      ...criteria,
      programType: draft.programType ? draft.programType as ChatCriteria["programType"] : null,
      teachingLanguage: draft.teachingLanguage ? draft.teachingLanguage as ChatCriteria["teachingLanguage"] : null,
      targetMajor: draft.targetMajor?.trim() || null,
      budget: numberOrNull("budget"),
      intakeYear: numberOrNull("intakeYear") == null ? null : Math.trunc(numberOrNull("intakeYear")!),
      intakeSeason: draft.intakeSeason ? draft.intakeSeason as ChatCriteria["intakeSeason"] : null,
      gpa: numberOrNull("gpa"),
      gpaScale: numberOrNull("gpaScale"),
      ielts: numberOrNull("ielts"),
      toefl: numberOrNull("toefl"),
      duolingo: numberOrNull("duolingo"),
      hskLevel: numberOrNull("hskLevel") == null ? null : Math.trunc(numberOrNull("hskLevel")!),
      hskScore: numberOrNull("hskScore"),
      hasCsca: booleanOrNull("hasCsca"),
      cscaRequirement: draft.cscaRequirement ? draft.cscaRequirement as ChatCriteria["cscaRequirement"] : null,
      scholarshipType: draft.scholarshipType ? draft.scholarshipType as ChatCriteria["scholarshipType"] : null,
      accommodationRequired: booleanOrNull("accommodationRequired"),
      age: numberOrNull("age") == null ? null : Math.trunc(numberOrNull("age")!),
      province: draft.province?.trim() || null,
      city: draft.city?.trim() || null,
    };
    if (!Object.values(next).some(hasCriteriaValue)) return;
    setEditing(false);
    onApply(next);
  }

  if (!labels.length && !editing) return null;
  return <section className="agent-profile" aria-label={t("当前申请条件")}>
    <div className="agent-profile-summary">
      <div><strong>{t("当前申请条件")}</strong>{labels.length > 0 && <div className="agent-criteria">{labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>}</div>
      <button type="button" onClick={openEditor} disabled={busy}><PencilLine size={14} aria-hidden="true" />{t("调整条件")}</button>
    </div>
    {editing && <form className="agent-profile-form" onSubmit={submit}>
      <label>{t("申请学历")}<select value={draft.programType} onChange={(event) => change("programType", event.target.value)}><option value="">{t("不限")}</option><option value="UG">{t("本科")}</option><option value="MASTER">{t("硕士")}</option><option value="PHD">{t("博士")}</option><option value="LONG_TERM">{t("长期进修")}</option><option value="SHORT_TERM">{t("短期项目")}</option></select></label>
      <label>{t("目标专业")}<input value={draft.targetMajor} maxLength={100} onChange={(event) => change("targetMajor", event.target.value)} placeholder={t("如计算机")} /></label>
      <label>{t("授课语言")}<select value={draft.teachingLanguage} onChange={(event) => change("teachingLanguage", event.target.value)}><option value="">{t("不限")}</option><option value="ENGLISH">{t("英文")}</option><option value="CHINESE">{t("中文")}</option></select></label>
      <label>{t("首年预算（元）")}<input type="number" min="0" value={draft.budget} onChange={(event) => change("budget", event.target.value)} placeholder={t("如 80000")} /></label>
      <label>{t("入学年份")}<input type="number" min="2020" max="2100" value={draft.intakeYear} onChange={(event) => change("intakeYear", event.target.value)} placeholder={t("如 2027")} /></label>
      <label>{t("入学季")}<select value={draft.intakeSeason} onChange={(event) => change("intakeSeason", event.target.value)}><option value="">{t("不限")}</option><option value="SPRING">{t("春季")}</option><option value="SUMMER">{t("夏季")}</option><option value="AUTUMN">{t("秋季")}</option><option value="WINTER">{t("冬季")}</option></select></label>
      <label>GPA<input type="number" min="0" step="0.01" value={draft.gpa} onChange={(event) => change("gpa", event.target.value)} placeholder={t("如 3.5")} /></label>
      <label>{t("GPA 满分")}<input type="number" min="0" step="0.01" value={draft.gpaScale} onChange={(event) => change("gpaScale", event.target.value)} placeholder={t("如 4")} /></label>
      <label>{t("雅思")}<input type="number" min="0" max="9" step="0.5" value={draft.ielts} onChange={(event) => change("ielts", event.target.value)} placeholder={t("如 6.5")} /></label>
      <label>{t("托福")}<input type="number" min="0" max="120" value={draft.toefl} onChange={(event) => change("toefl", event.target.value)} placeholder={t("如 90")} /></label>
      <label>{t("多邻国")}<input type="number" min="0" max="160" value={draft.duolingo} onChange={(event) => change("duolingo", event.target.value)} placeholder={t("如 120")} /></label>
      <label>{t("HSK 等级")}<input type="number" min="1" max="9" value={draft.hskLevel} onChange={(event) => change("hskLevel", event.target.value)} placeholder={t("如 5")} /></label>
      <label>{t("HSK 分数")}<input type="number" min="0" max="300" value={draft.hskScore} onChange={(event) => change("hskScore", event.target.value)} placeholder={t("如 250")} /></label>
      <label>{t("CSCA 状态")}<select value={draft.hasCsca} onChange={(event) => change("hasCsca", event.target.value)}><option value="">{t("未确认")}</option><option value="true">{t("已有 CSCA")}</option><option value="false">{t("暂无 CSCA")}</option></select></label>
      <label>{t("学校 CSCA 要求")}<select value={draft.cscaRequirement} onChange={(event) => change("cscaRequirement", event.target.value)}><option value="">{t("不限")}</option><option value="NOT_REQUIRED">{t("只看不要求")}</option><option value="REQUIRED">{t("只看要求")}</option></select></label>
      <label>{t("奖学金")}<select value={draft.scholarshipType} onChange={(event) => change("scholarshipType", event.target.value)}><option value="">{t("不限")}</option><option value="full">{t("需要全额奖学金")}</option><option value="any">{t("需要奖学金")}</option></select></label>
      <label>{t("住宿")}<select value={draft.accommodationRequired} onChange={(event) => change("accommodationRequired", event.target.value)}><option value="">{t("不限")}</option><option value="true">{t("需要学校住宿")}</option><option value="false">{t("不需要住宿")}</option></select></label>
      <label>{t("年龄")}<input type="number" min="1" max="120" value={draft.age} onChange={(event) => change("age", event.target.value)} placeholder={t("如 22")} /></label>
      <label>{t("省份")}<input value={draft.province} maxLength={30} onChange={(event) => change("province", event.target.value)} placeholder={t("如 北京")} /></label>
      <label>{t("城市")}<input value={draft.city} maxLength={30} onChange={(event) => change("city", event.target.value)} placeholder={t("如 上海")} /></label>
      <div className="agent-profile-actions"><button type="submit" disabled={busy}><Check size={14} aria-hidden="true" />{t("按这些条件重新筛选")}</button><button type="button" onClick={() => setEditing(false)} disabled={busy}>{t("取消")}</button><small>{t("条件会暂存在当前浏览器标签页。")}</small></div>
    </form>}
  </section>;
}

function UserQuestionBubble({ question }: { question: string }) {
  const t = useT();
  const lines = question.split(/\r?\n/);
  const isLong = question.length > 220 || lines.length > 5;
  const [expanded, setExpanded] = useState(false);

  if (!isLong) {
    return <p className="agent-user"><span className="sr-only">{t("顾问：")}</span>{question}</p>;
  }

  return (
    <div className={`agent-user agent-user-collapsible${expanded ? " is-expanded" : ""}`}>
      <span className="sr-only">{t("顾问：")}</span>
      <div className="agent-user-body">{question}</div>
      <button
        type="button"
        className="agent-user-expand-btn"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "收起长条件" : `展开全部筛选条件（${lines.length} 行 · ${question.length} 字）`}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function CandidatePlanButton({ card }: { card: ResultCard }) {
  const t = useT();
  const selection = useContext(PlanSelectionContext);
  const result = useContext(ActiveResultContext);
  if (!selection || !result?.source || !card.programId || !card.schoolId || !isCandidate(card)) return null;
  const selected = selection.selectedIds.has(card.programId);
  return <button type="button" className="agent-plan-toggle" aria-pressed={selected} disabled={selection.saving}
    onClick={() => selection.toggle(card, result)}
    aria-label={`${t(selected ? "移出方案" : "加入方案")}：${card.name} · ${displayProgramName(card.name, card.program)}`}>
    {selected ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
    {t(selected ? "已加入" : "加入方案")}
  </button>;
}

function AdmissionsNotice({ warnings }: { warnings: string[] }) {
  const t = useT();
  const tv = useTv();
  if (!warnings.length) return null;
  const prefix = "敏感信息，需人工核实：";
  const sources = warnings.filter((warning) => warning.startsWith(prefix));
  return <div className="agent-alert">
    <ShieldAlert size={15} aria-hidden="true" />
    <div>
      <strong>{t("有内部招生注意事项")}</strong>
      {sources.length > 0 ? <details>
        <summary>{tv("查看 {count} 条来源与备注", { count: sources.length })}</summary>
        {sources.map((warning) => <p key={warning}>{warning.slice(prefix.length)}</p>)}
      </details> : <p>{t("请联系有权限的同事核实。")}</p>}
    </div>
  </div>;
}

function CscaBasis({ card }: { card: ResultCard }) {
  const point = card.points.find((point) => point.level === "PASS" && ["学校 CSCA 要求", "CSCA"].includes(point.label) && point.source);
  return point ? <p className="agent-reason"><strong>CSCA 依据：</strong>{point.text}。来源：{point.source}。</p> : null;
}

function CandidateDetails({ card }: { card: ResultCard }) {
  const t = useT();
  const { matches, concerns, highlights, firstConcern } = summarizePoints(card.points);
  const tableNotes = card.evidence.filter((item) => item.startsWith("名单第"));
  const feedback = useContext(FeedbackContext);
  const feedbackValue = card.programId ? feedback?.saved[card.programId] : undefined;
  const feedbackPending = card.programId ? feedback?.pending.has(card.programId) : false;
  return <div className="agent-candidate-body" data-result-school={card.name} data-result-program={card.programId}>
    <div className="agent-candidate-action"><p className="agent-program">{displayProgramName(card.name, card.program)}</p><CandidatePlanButton card={card} /></div>
    <p className={`agent-verification ${card.verified ? "is-verified" : ""}`}>{t(card.verified ? "项目资料已人工核实" : "项目资料待人工核实")}</p>
    {card.programId && isCandidate(card) && feedback && <div className="agent-feedback">
      <button type="button" aria-pressed={feedbackValue === "relevant"} onClick={() => feedback.submit(card.programId!, "relevant")} disabled={feedbackPending || feedbackValue === "relevant"}>
        {t(feedbackValue === "relevant" ? "已标记有帮助" : feedbackPending ? "正在记录…" : "有帮助")}
      </button>
      <button type="button" aria-pressed={feedbackValue === "not_relevant"} onClick={() => feedback.submit(card.programId!, "not_relevant")} disabled={feedbackPending || feedbackValue === "not_relevant"}>
        {t(feedbackValue === "not_relevant" ? "已标记不合适" : feedbackPending ? "正在记录…" : "不合适")}
      </button>
      <span>{t("反馈只调整后续排序，不会删除项目。")}</span>
    </div>}
    {isCandidate(card) && highlights.length > 0 && <p className="agent-reason"><strong>匹配：</strong>{highlights.map((point) => point.text).join("；")}</p>}
    {card.kind === "project" && (!isCandidate(card) || !highlights.length) && <p className="agent-reason">{t("核心条件资料不足，暂时无法推荐。")}</p>}
    {firstConcern && <p className="agent-unresolved"><strong>待确认：</strong>{firstConcern.text}{concerns.length > 1 && `；另 ${concerns.length - 1} 项`}</p>}
    <CscaBasis card={card} />
    <AdmissionsNotice warnings={card.warning} />
    <details className="agent-detail"><summary>{t("查看完整依据")} <ChevronDown size={14} aria-hidden="true" /></summary>
      <div className="agent-detail-content">
        {matches.length > 0 && <p><strong>匹配：</strong>{matches.map((point) => point.text).join("；")}</p>}
        {concerns.length > 0 && <p><strong>待确认：</strong>{concerns.map((point) => point.text).join("；")}</p>}
        <p>来源：{card.sources.join("、")}{card.schoolId && !card.sources.includes("知识库项目") ? "、知识库" : ""}{card.yellow ? "；原表标黄" : ""}</p>
        {tableNotes.map((note, index) => <p key={index}>{note}</p>)}
        {card.image && <p>原表含图片信息，内容需要人工查看。</p>}
        {card.kind === "school" && <p>未找到符合本次条件的知识库项目，请核对学校名称、校区及项目资料。</p>}
      </div>
    </details>
  </div>;
}

function comparisonCost(card: ResultCard) {
  const facts = card.facts;
  if (facts?.tuitionStatus === "known" && facts.tuition != null) return `学费 ${facts.tuition.toLocaleString("zh-CN")} 元/年，批次待核`;
  if (card.comparableCost != null) {
    const freshness = facts?.feeFreshness === "historical" ? "旧年资料，" : facts?.feeFreshness === "unknown" ? "未注明年份，" : "";
    return `首年约 ${card.comparableCost.toLocaleString("zh-CN")} 元（${freshness}待核）`;
  }
  return "费用资料不足";
}

function comparisonLanguage(card: ResultCard) {
  const facts = card.facts;
  if (!facts) return "待核实";
  const language = facts.teachingLanguage === "ENGLISH" ? "英文授课" : facts.teachingLanguage === "CHINESE" ? "中文授课" : "授课语言待确认";
  const scores = [
    facts.ielts != null && `雅思 ${facts.ielts}`,
    facts.toefl != null && `托福 ${facts.toefl}`,
    facts.hskLevel != null && `HSK ${facts.hskLevel} 级`,
  ].filter((item): item is string => Boolean(item));
  return scores.length ? `${language}；${scores.join(" / ")}` : language;
}

function comparisonPoint(card: ResultCard, labels: string[]) {
  for (const label of labels) {
    const point = card.points.find((item) => item.label === label);
    if (point) return point.text.replace(/[。；;]+$/u, "");
  }
  return "待核实";
}

function CandidateComparison({ result }: { result: ScreeningResponse }) {
  const t = useT();
  const cards = comparisonCards(result);
  if (cards.length < 2) return null;
  return <details className="agent-compare">
    <summary><span>并排对比当前 {cards.length} 所候选</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="agent-compare-grid">
      {cards.map((card) => {
        const concern = summarizePoints(card.points).firstConcern;
        return <article className="agent-compare-card" key={card.programId ?? card.name}>
          <div className="agent-compare-heading"><h4>{card.schoolId ? <Link href={`/schools/${encodeURIComponent(card.schoolId)}`}>{card.name}</Link> : card.name}</h4><span className={`agent-verification ${card.verified ? "is-verified" : ""}`}>{t(card.verified ? "已人工核实" : "待人工核实")}</span></div>
          <p className="agent-program">{displayProgramName(card.name, card.program)}</p>
          <dl>
            <div><dt>{t("首年费用")}</dt><dd>{comparisonCost(card)}</dd></div>
            <div><dt>{t("申请截止")}</dt><dd>{comparisonPoint(card, ["申请截止"])}</dd></div>
            <div><dt>{t("入学批次")}</dt><dd>{comparisonPoint(card, ["入学季", "入学年份"])}</dd></div>
            <div><dt>{t("语言要求")}</dt><dd>{comparisonLanguage(card)}</dd></div>
            <div><dt>{t("主要待确认")}</dt><dd>{concern?.text ?? "资料尚未发现明确冲突"}</dd></div>
            <div><dt>{t("合作状态")}</dt><dd>{card.cooperation === "project_confirmed" ? "项目合作已记录" : card.cooperation === "listed" ? "学校在合作名单" : card.cooperation === "not_cooperating" ? "名单标注不合作" : "合作状态待核"}</dd></div>
          </dl>
        </article>;
      })}
    </div>
    <p className="agent-compare-note">{t("对比只使用当前可核验资料；费用、截止日期和开班批次仍需按目标招生季确认。")}</p>
  </details>;
}

function ResultSection({ title, cards, repeatedStatus, hideHeading = false }: { title: string; cards: ResultCard[]; repeatedStatus?: string; hideHeading?: boolean }) {
  const t = useT();
  const tv = useTv();
  if (!cards.length) return null;
  const groups = new Map<string, ResultCard[]>();
  cards.forEach((card) => {
    const key = resultSchoolKey(card);
    groups.set(key, [...(groups.get(key) ?? []), card]);
  });
  const schools = [...groups.entries()];
  const renderSchool = ([name, items]: [string, ResultCard[]]) => <article className="agent-result" data-result-school={items[0].name} key={name}>
    <div className="agent-result-heading">
      <h4>{items[0].schoolId ? <Link href={`/schools/${encodeURIComponent(items[0].schoolId)}`}>{items[0].name}</Link> : items[0].name}</h4>
      <div className="agent-result-badges">
        {items[0].tier && <span className={`agent-tier-badge ${tierMeta[items[0].tier].className}`}>{tierMeta[items[0].tier].zh}</span>}
        {typeof items[0].score === "number" && <span className="agent-score-badge">{items[0].score} 分</span>}
        {items[0].fit !== repeatedStatus && <span className={`agent-status ${items[0].fit === "已知条件符合" ? "agent-status-good" : ""}`}>{t(items[0].fit === "合作及招生条件待核实" ? "合作待核实" : items[0].fit === "合作不可用或存在冲突，需核实" ? "合作状态有冲突" : items[0].fit)}</span>}
      </div>
    </div>
    <CandidateDetails card={items[0]} />
    {items.length > 1 && <details className="agent-extra-programs"><summary>{tv("查看该校另外 {count} 个项目", { count: items.length - 1 })} <ChevronDown size={14} aria-hidden="true" /></summary>{items.slice(1).map((card, index) => <CandidateDetails key={`${card.program}-${index}`} card={card} />)}</details>}
  </article>;
  return <section className="agent-results">{!hideHeading && <div className="agent-section-title"><h3>{t(title)}</h3><span>{tv("{count} 所", { count: schools.length })}</span></div>}
    <div className="agent-result-list">{schools.slice(0, DEFAULT_DISPLAY_SCHOOL_COUNT).map(renderSchool)}{schools.length > DEFAULT_DISPLAY_SCHOOL_COUNT && <details className="agent-more"><summary>{tv("查看另外 {count} 所学校", { count: schools.length - DEFAULT_DISPLAY_SCHOOL_COUNT })} <ChevronDown size={15} aria-hidden="true" /></summary><div className="agent-result-list">{schools.slice(DEFAULT_DISPLAY_SCHOOL_COUNT).map(renderSchool)}</div></details>}</div>
  </section>;
}

function IncompleteResults({ title, cards }: { title: string; cards: ResultCard[] }) {
  if (!cards.length) return null;
  return <details className="agent-incomplete"><summary><span>{title}（{new Set(cards.map((card) => schoolIdentityKey(card.name))).size}）</span><ChevronDown size={16} aria-hidden="true" /></summary><ResultSection title={title} cards={cards} hideHeading /></details>;
}

function V31ReportToolbar({ report, gates, canExportAdvisor }: {
  report: V31ReportPayload;
  gates?: V31GateReport | null;
  canExportAdvisor: boolean;
}) {
  const openDrawerPreview = useContext(ReportPreviewContext);
  const [showGateDetails, setShowGateDetails] = useState(false);

  function openNewTab(variant: "student" | "advisor") {
    const html = renderV31ReportHtml(report, { variant });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function downloadHtml(variant: "student" | "advisor") {
    const html = renderV31ReportHtml(report, { variant });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = (report.report_title || "选校评估报告").replace(/[\\/:*?"<>|]+/g, "_");
    a.href = url;
    a.download = `${safeTitle}-${variant === "advisor" ? "顾问版" : "学生版"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const passCount = gates?.passedCount ?? 25;
  const totalCount = gates?.totalCount ?? 25;
  const gateWarnings = [
    ...(gates?.policyWarnings ?? []),
    ...(gates?.fabricationWarnings ?? []),
    ...(gates?.checks.filter((c) => !c.passed).map((c) => `规则未通过：${c.name}`) ?? []),
  ];

  return (
    <div className="agent-v31-toolbar-wrap">
      <div className="agent-v31-toolbar" aria-label="v3.1 评估报告与守门摘要">
        <div className="agent-v31-meta">
          {report.student.gpa_band && (
            <span className="agent-v31-pill is-band">成绩定档：{report.student.gpa_band}</span>
          )}
          <button
            type="button"
            className={`agent-v31-pill agent-v31-pill-btn ${gates?.allPassed ? "is-pass" : "is-warn"}`}
            aria-expanded={showGateDetails}
            onClick={() => setShowGateDetails((v) => !v)}
            title="点击查看 25 项零虚构与规则守门明细"
          >
            守门自检 {passCount}/{totalCount} {gates?.allPassed ? "通过" : `· ${gateWarnings.length} 条零虚构提示`}
            <ChevronDown size={11} aria-hidden="true" />
          </button>
          <span className="agent-v31-pill">
            正式 {report.tiers.reach.schools.length + report.tiers.match.schools.length + report.tiers.safety.schools.length} 所
            {report.historical_candidates.length > 0 ? ` · 历史预匹配 ${report.historical_candidates.length} 所` : ""}
          </span>
        </div>
        <div className="agent-v31-actions">
          <button
            type="button"
            className="is-primary-action"
            onClick={() => {
              const variant = canExportAdvisor ? "advisor" : "student";
              if (openDrawerPreview) openDrawerPreview(report, variant);
              else openNewTab(variant);
            }}
          >
            <FileText size={13} aria-hidden="true" /> 预览评估报告
          </button>
          <button type="button" onClick={() => downloadHtml("student")}>
            <Download size={13} aria-hidden="true" /> 学生版 HTML
          </button>
          {canExportAdvisor && (
            <button type="button" onClick={() => downloadHtml("advisor")}>
              <Download size={13} aria-hidden="true" /> 顾问版 HTML
            </button>
          )}
        </div>
      </div>

      {showGateDetails && (
        <div className="agent-v31-gate-drawer" role="region" aria-label="守门自检明细">
          {gateWarnings.length > 0 ? (
            <>
              <strong>零虚构与策略拦截说明（共 {gateWarnings.length} 条）：</strong>
              <ul>
                {gateWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </>
          ) : (
            <p>全部 {totalCount} 项结构、批次年份、成绩分档与零虚构检查均已通过，无替换告警。</p>
          )}
        </div>
      )}
    </div>
  );
}

function PartnerQuickSection({ data, onSwitchMode2 }: {
  data: PartnerSearchPayload;
  onSwitchMode2: () => void;
}) {
  return (
    <section className="agent-partner-quick" aria-label="内部合作院校快检结果">
      {data.nonPartnerWarnings.length > 0 && (
        <div className="agent-excluded-box">
          <strong>⛔ 非合作院校预警</strong>
          <ul>{data.nonPartnerWarnings.map((w) => <li key={w.school}><strong>{w.school}：</strong>{w.warning}</li>)}</ul>
        </div>
      )}

      {data.results.length > 0 ? (
        <div className="agent-ext-list" style={{ marginTop: 12 }}>
          {data.results.map((item) => (
            <article className="agent-ext-card" key={`${item.schoolName}-${item.matchedLevel}`}>
              <div className="agent-ext-head">
                <div className="agent-ext-title">
                  <h4>{item.schoolName} {item.nameEn ? <small style={{ fontWeight: 400, color: "#687b91" }}>({item.nameEn})</small> : null}</h4>
                  <p className="agent-program">{item.schoolLevelLabel} · {item.city || "城市待核"} · {item.matchedLevelLabel}</p>
                </div>
                <div className="agent-result-badges">
                  <span className="agent-tier-badge is-target">{item.partnerBadgeText}</span>
                  {item.spring2027Status === "published_27_spring" && <span className="agent-source-badge is-web">27春简章已出</span>}
                </div>
              </div>
              <dl className="agent-ext-grid">
                <div><dt>学费参考</dt><dd>{item.tuitionText || "详见台账"}</dd></div>
                <div><dt>奖学金</dt><dd>{item.scholarshipSummary || "未录入"}</dd></div>
                <div><dt>截止时间</dt><dd>{item.deadlineSummary || "未录入"}</dd></div>
              </dl>
              {item.majorMatchTag && <p className="agent-ext-note"><strong>专业方向：</strong>{item.majorMatchTag}</p>}
              {item.nationalityTag && <p className="agent-ext-note"><strong>生源提示：</strong>{item.nationalityTag}</p>}
              {item.budgetNote && <p className="agent-ext-caution"><strong>预算提示：</strong>{item.budgetNote}</p>}
              {item.requirementsSummary && <p className="agent-ext-fit"><strong>申请要求：</strong>{item.requirementsSummary.slice(0, 180)}</p>}
              {item.partnerNote && <p className="agent-ext-caution"><strong>台账备注：</strong>{item.partnerNote}</p>}
            </article>
          ))}
        </div>
      ) : (
        <div className="agent-empty-result" style={{ marginTop: 10 }}>
          <strong>内部合作库暂无完全匹配学校</strong>
          <p>建议放宽条件或切换模式二通过全网 .edu.cn 官网检索补齐。</p>
        </div>
      )}

      {(data.blockedByPolicy.length > 0 || data.blockedByGpaBand.length > 0) && (
        <details className="agent-incomplete" style={{ marginTop: 12 }}>
          <summary><span>已按政策或成绩档位拦截（{data.blockedByPolicy.length + data.blockedByGpaBand.length} 所）</span><ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="agent-excluded-box">
            <ul>
              {data.blockedByPolicy.map((b, i) => <li key={`p-${i}`}><strong>{b.school} ({b.partnerTier})：</strong>{b.reason}</li>)}
              {data.blockedByGpaBand.map((b, i) => <li key={`g-${i}`}><strong>{b.school} ({b.partnerTier})：</strong>{b.reason}</li>)}
            </ul>
          </div>
        </details>
      )}

      <div style={{ marginTop: 12 }}>
        <button type="button" className="agent-other-button" onClick={onSwitchMode2}>
          切换为「模式二：合作优先+全网补齐」继续深度核查
        </button>
      </div>
    </section>
  );
}

function HistoricalAndSourcesSection({ report }: { report: V31ReportPayload }) {
  if (!report.historical_candidates.length && !report.sources.length) return null;
  return (
    <div className="agent-v31-extra">
      {report.historical_candidates.length > 0 && (
        <details className="agent-incomplete" open>
          <summary><span>历史规则预匹配候选（{report.historical_candidates.length} 所 · 目标批次简章待发布）</span><ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="agent-ext-list" style={{ marginTop: 8 }}>
            {report.historical_candidates.map((item, idx) => (
              <div className="agent-ext-card" key={`${item.school}-${idx}`}>
                <div className="agent-ext-head">
                  <div className="agent-ext-title">
                    <h4>{item.school}</h4>
                    <p className="agent-program">{item.program} · 参考 {item.reference_year} 批次（目标 {item.target_year}）</p>
                  </div>
                  <div className="agent-result-badges">
                    <span className="agent-tier-badge is-target">{item.preliminary_tier}</span>
                    {item.partner_tag && <span className="agent-source-badge is-partner">{item.partner_tag}</span>}
                  </div>
                </div>
                <p className="agent-ext-fit">{item.historical_summary}</p>
                {item.source_url && <div className="agent-ext-sources"><a href={item.source_url} target="_blank" rel="noopener noreferrer">查看官网依据 <ExternalLink size={11} aria-hidden="true" /></a></div>}
              </div>
            ))}
          </div>
        </details>
      )}
      {report.sources.length > 0 && (
        <details className="agent-history">
          <summary><span>官网数据来源汇总（{report.sources.length} 条）</span><ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="agent-history-content">
            <ol>
              {report.sources.map((src) => (
                <li key={src.id}>[{src.id}] {src.name}（{src.type}）：<a href={src.url} target="_blank" rel="noopener noreferrer">{src.url}</a></li>
              ))}
            </ol>
          </div>
        </details>
      )}
    </div>
  );
}

function ExternalProgramCard({ item, locale }: { item: ExternalProgramItem; locale: "zh" | "en" }) {
  const tier = tierMeta[item.tier];
  const windowLabel = item.windowStatus === "open" ? "开放中" : item.windowStatus === "wait" ? "往年参考" : item.windowStatus === "upcoming" ? "即将开放" : null;
  return <article className="agent-ext-card" data-result-school={item.schoolName}>
    <div className="agent-ext-head">
      <div className="agent-ext-title">
        <h4>{item.schoolName}</h4>
        <p className="agent-program">{item.programName}</p>
      </div>
      <div className="agent-result-badges">
        <span className={`agent-tier-badge ${tier.className}`}>{locale === "en" ? tier.en : tier.zh}</span>
        {item.partnerBadge && <span className={`agent-source-badge ${item.isPartner ? "is-partner" : "is-kb"}`}>{item.partnerBadge}</span>}
        <span className="agent-score-badge">{item.score} 分</span>
        {windowLabel && <span className={`agent-source-badge ${item.windowStatus === "open" ? "is-web" : "is-ai"}`}>{windowLabel}</span>}
        <span className={`agent-source-badge ${item.groundedBySearch ? "is-web" : "is-ai"}`}>
          {item.officialVerified ? <><Globe size={11} aria-hidden="true" /> 官网核实</> : item.groundedBySearch ? <><Globe size={11} aria-hidden="true" /> 联网参考</> : <><Sparkles size={11} aria-hidden="true" /> AI 拓展</>}
        </span>
      </div>
    </div>
    <dl className="agent-ext-grid">
      <div><dt>所在城市 / 性质</dt><dd>{[item.city, item.schoolNature].filter(Boolean).join(" · ") || "—"}</dd></div>
      <div><dt>授课语言 / 学制</dt><dd>{[item.teachingLanguage, item.duration].filter(Boolean).join(" · ") || "—"}</dd></div>
      <div><dt>学费 / 奖学金</dt><dd>{item.tuitionText ? `${item.tuitionText}；` : ""}{item.scholarshipEligible ? `可申请：${item.scholarshipSummary}` : item.scholarshipSummary}</dd></div>
      <div><dt>申请截止参考</dt><dd>{item.deadline}</dd></div>
      <div><dt>硬性语言要求</dt><dd>{item.languageRequirement}</dd></div>
      <div><dt>官网 / 来源</dt><dd>{item.officialUrl ? <a href={item.officialUrl} target="_blank" rel="noopener noreferrer" className="agent-ext-link">{item.officialUrl.replace(/^https?:\/\//u, "").slice(0, 48)} <ExternalLink size={12} aria-hidden="true" /></a> : "请人工查询学校国际招生官网"}</dd></div>
    </dl>
    {item.partnerNote && <p className="agent-ext-caution"><strong>合作台账：</strong>{item.partnerNote}</p>}
    {item.degreeAndExamNotes && <p className="agent-ext-note"><strong>学位 / 考试说明：</strong>{item.degreeAndExamNotes}</p>}
    {item.fitReason && <p className="agent-ext-fit">{item.fitReason}</p>}
    {item.caution && <p className="agent-ext-caution"><strong>需核实：</strong>{item.caution}</p>}
    {item.sourceUrls.length > 0 && <div className="agent-ext-sources">
      <span>参考网页：</span>
      {item.sourceUrls.slice(0, 3).map((url, idx) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">来源 {idx + 1} <ExternalLink size={11} aria-hidden="true" /></a>)}
    </div>}
  </article>;
}

function ExternalScreeningSection({ external }: { external: ExternalScreeningResult }) {
  const locale = useLocale();
  const [groupByTier, setGroupByTier] = useState(true);
  const tiers: AdmissionTier[] = ["REACH", "TARGET", "SAFE"];
  const tierCounts = useMemo(() => ({
    REACH: external.programs.filter((item) => item.tier === "REACH").length,
    TARGET: external.programs.filter((item) => item.tier === "TARGET").length,
    SAFE: external.programs.filter((item) => item.tier === "SAFE").length,
  }), [external.programs]);
  const sortedByScore = useMemo(
    () => [...external.programs].sort((a, b) => b.score - a.score),
    [external.programs],
  );
  return <section className="agent-external-section" aria-label="库外院校拓展参考">
    <div className="agent-external-head">
      <div>
        <h3>
          {external.mode === "web_search"
            ? <><Globe size={15} aria-hidden="true" /> 库外院校公开检索（实时联网）</>
            : <><Sparkles size={15} aria-hidden="true" /> 库外院校公开拓展（AI 参考 · 需核实官网）</>}
        </h3>
        {external.summary && <p className="agent-external-summary">{external.summary}</p>}
        {external.programs.length > 0 && <p className="agent-tier-quota-summary">本组三档分布：冲 {tierCounts.REACH}/3 · 稳 {tierCounts.TARGET}/3 · 保 {tierCounts.SAFE}/3</p>}
      </div>
      {external.programs.length > 1 && <div className="agent-view-toggle" role="group" aria-label="排序方式">
        <button type="button" aria-pressed={groupByTier} onClick={() => setGroupByTier(true)}>三档分层</button>
        <button type="button" aria-pressed={!groupByTier} onClick={() => setGroupByTier(false)}>综合分排序</button>
      </div>}
    </div>

    {external.programs.length > 0 && (groupByTier ? (
      <div className="agent-tier-groups">
        {tiers.map((tierKey) => {
          const items = external.programs.filter((item) => item.tier === tierKey);
          if (!items.length) return null;
          const meta = tierMeta[tierKey];
          return <div className="agent-tier-block" key={tierKey}>
            <div className="agent-tier-heading">
              <span className={`agent-tier-badge ${meta.className}`}>{locale === "en" ? meta.en : meta.zh}</span>
              <span className="agent-tier-desc">{locale === "en" ? meta.descEn : meta.descZh}（{items.length}）</span>
            </div>
            <div className="agent-ext-list">
              {items.map((item, idx) => <ExternalProgramCard key={`${item.schoolName}-${item.programName}-${idx}`} item={item} locale={locale} />)}
            </div>
          </div>;
        })}
      </div>
    ) : (
      <div className="agent-ext-list">
        {sortedByScore.map((item, idx) => <ExternalProgramCard key={`${item.schoolName}-${item.programName}-${idx}`} item={item} locale={locale} />)}
      </div>
    ))}

    {external.excludedNotes && external.excludedNotes.length > 0 && <div className="agent-excluded-box">
      <strong>参考池排除说明</strong>
      <ul>{external.excludedNotes.map((note, idx) => <li key={idx}>{note}</li>)}</ul>
    </div>}

    {external.policyNotes.length > 0 && <div className="agent-policy-box">
      <strong>专项政策与核实建议</strong>
      <div className="agent-policy-list">
        {external.policyNotes.map((note, idx) => <div className="agent-policy-item" key={idx}>
          <h4>{note.title}</h4>
          <p>{note.content}</p>
          {note.sourceUrls && note.sourceUrls.length > 0 && <div className="agent-ext-sources">
            {note.sourceUrls.map((url, sIdx) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">参考链接 {sIdx + 1} <ExternalLink size={11} aria-hidden="true" /></a>)}
          </div>}
        </div>)}
      </div>
    </div>}

    <p className="agent-external-disclaimer">{external.disclaimer}</p>
  </section>;
}

function NarrativeSchoolGroups({ result }: { result: ScreeningResponse }) {
  const locale = useLocale();
  const highlights = result.narrative?.highlights ?? [];
  const [groupByTier, setGroupByTier] = useState(true);
  if (!highlights.length) return null;
  const cardBySchool = new Map<string, ResultCard>();
  const cardByProgram = new Map<string, ResultCard>();
  for (const card of [...result.results.confirmed, ...result.results.pending, ...result.results.other]) {
    const key = schoolIdentityKey(card.name);
    if (!cardBySchool.has(key)) cardBySchool.set(key, card);
    if (card.programId) cardByProgram.set(card.programId, card);
  }
  const hasTiers = highlights.some((item) => item.admissionTier);
  const tierCounts = {
    REACH: highlights.filter((item) => (item.admissionTier ?? "TARGET") === "REACH").length,
    TARGET: highlights.filter((item) => (item.admissionTier ?? "TARGET") === "TARGET").length,
    SAFE: highlights.filter((item) => (item.admissionTier ?? "TARGET") === "SAFE").length,
  };
  const hasMissingTierSlot = tierCounts.REACH < 3 || tierCounts.TARGET < 3 || tierCounts.SAFE < 3;

  const renderItem = (item: typeof highlights[number], index: number) => {
    const program = item.programId ? cardByProgram.get(item.programId) : undefined;
    const card = program ?? cardBySchool.get(schoolIdentityKey(item.name));
    const tier = item.admissionTier ? tierMeta[item.admissionTier] : null;
    const score = item.score ?? card?.score;
    return <article className="agent-school-item" data-result-school={item.name} data-result-program={program?.programId} key={`${item.name}-${index}`}>
      <div className="agent-school-heading"><div className="agent-school-title">
        <div className="agent-school-title-row">
          <h4>{card?.schoolId ? <Link href={`/schools/${encodeURIComponent(card.schoolId)}`}>{item.name}</Link> : item.name}</h4>
          <div className="agent-result-badges">
            {tier && <span className={`agent-tier-badge ${tier.className}`}>{locale === "en" ? tier.en : tier.zh}</span>}
            {typeof score === "number" && <span className="agent-score-badge">{score} 分</span>}
            <span className={`agent-source-badge ${item.group === "partner" ? "is-partner" : "is-kb"}`}>
              {item.notCooperating ? "标注不合作" : item.group === "partner" ? "合作院校" : "校内知识库"}
            </span>
          </div>
        </div>
        {program && <p className="agent-program">{displayProgramName(program.name, program.program)}{item.cityLabel ? ` · ${item.cityLabel}` : ""}{item.schoolTags ? ` · ${item.schoolTags}` : ""}</p>}
      </div>
        {program && <CandidatePlanButton card={program} />}
      </div>
      <p>{item.body}</p>
      {item.tierReason && <p className="agent-tier-reason">{item.tierReason}</p>}
      {program && <CscaBasis card={program} />}
      <AdmissionsNotice warnings={card?.warning ?? []} />
    </article>;
  };

  if (groupByTier && hasTiers) {
    const tiers: AdmissionTier[] = ["REACH", "TARGET", "SAFE"];
    return <div className="agent-school-groups">
      <div className="agent-local-toolbar">
        <span className="agent-local-toolbar-label">校内库核验候选（{highlights.length} 所 · 冲 {tierCounts.REACH}/3 · 稳 {tierCounts.TARGET}/3 · 保 {tierCounts.SAFE}/3）</span>
        <div className="agent-view-toggle" role="group" aria-label="校内结果视图">
          <button type="button" aria-pressed={true} onClick={() => setGroupByTier(true)}>三档分层</button>
          <button type="button" aria-pressed={false} onClick={() => setGroupByTier(false)}>按来源分组</button>
        </div>
      </div>
      {tiers.map((tierKey) => {
        const items = highlights.filter((item) => (item.admissionTier ?? "TARGET") === tierKey);
        if (!items.length) return null;
        const meta = tierMeta[tierKey];
        return <section className="agent-school-group" data-kind={tierKey.toLowerCase()} key={tierKey}>
          <h3><span className={`agent-tier-badge ${meta.className}`}>{locale === "en" ? meta.en : meta.zh}</span> {locale === "en" ? meta.descEn : meta.descZh}</h3>
          <div className="agent-school-list">{items.map(renderItem)}</div>
        </section>;
      })}
      {hasMissingTierSlot && <p className="agent-tier-gap-note">注：某档不足 3 所或未显示时，说明当前成绩档位与硬性条件下暂无更多合格院校，系统不跨档强行凑数。</p>}
    </div>;
  }

  const groups = [
    { key: "partner", title: admissionGroupLabel(result.source, "partner"), items: highlights.filter((item) => item.group === "partner" && !item.notCooperating) },
    { key: "other", title: admissionGroupLabel(result.source, "other"), items: highlights.filter((item) => item.group === "other" && !item.notCooperating) },
    { key: "blocked", title: `${admissionListLabel(result.source)} · 标注不合作`, items: highlights.filter((item) => item.notCooperating) },
  ].filter((group) => group.items.length > 0);
  return <div className="agent-school-groups">
    {hasTiers && highlights.length > 1 && <div className="agent-local-toolbar">
      <span className="agent-local-toolbar-label">校内库核验候选（{highlights.length} 所 · 按综合评分排序）</span>
      <div className="agent-view-toggle" role="group" aria-label="校内结果视图">
        <button type="button" aria-pressed={false} onClick={() => setGroupByTier(true)}>三档分层</button>
        <button type="button" aria-pressed={true} onClick={() => setGroupByTier(false)}>按来源分组</button>
      </div>
    </div>}
    {groups.map((group) => <section className="agent-school-group" data-kind={group.key} key={group.key} aria-label={group.title}>
      <h3>{group.title}</h3>
      <div className="agent-school-list">{group.items.map(renderItem)}</div>
    </section>)}
  </div>;
}

function DiagnosticBanner({ diagnostic }: { diagnostic: AdmissionDiagnostic }) {
  const tone =
    diagnostic.state === "CIRCUIT_BREAKER"
      ? "is-stop"
      : diagnostic.state === "DOWNGRADE_LOCK"
        ? "is-downgrade"
        : "is-normal";
  const hasTierShift = Boolean(
    diagnostic.initialTier && diagnostic.finalTier && diagnostic.initialTier !== diagnostic.finalTier,
  );
  const keyBottlenecks = diagnostic.bottlenecks.filter((b) => b.severity !== "WARN" || diagnostic.state === "NORMAL");

  return (
    <section className={`agent-diagnostic ${tone}`} aria-label="五阶段确定性资格定档与风控诊断">
      <div className="agent-diagnostic-head">
        <div className="agent-diagnostic-title">
          <span className={`agent-diagnostic-badge ${tone}`}>{diagnostic.stateLabel}</span>
          <strong>{diagnostic.advisory.headline}</strong>
        </div>
        <div className="agent-diagnostic-pills">
          {diagnostic.academic.normPct != null && (
            <span className="agent-diagnostic-pill">
              等效均分 {diagnostic.academic.normPct}%（{diagnostic.academic.systemLabel}）
            </span>
          )}
          {diagnostic.finalTier && (
            <span className="agent-diagnostic-pill is-tier">
              {hasTierShift ? `档位：${diagnostic.initialTier} → ${diagnostic.finalTier}` : `最终定档：${diagnostic.finalTier}`}
            </span>
          )}
          {diagnostic.state !== "CIRCUIT_BREAKER" && diagnostic.tierWindow.matchTier && (
            <span className="agent-diagnostic-pill">
              锁池：冲 {diagnostic.tierWindow.reachTier ?? "—"} / 稳 {diagnostic.tierWindow.matchTier} / 保 {diagnostic.tierWindow.safetyTier ?? "—"}
            </span>
          )}
          {diagnostic.englishExemption !== "NONE" && (
            <span className="agent-diagnostic-pill">
              {diagnostic.englishExemption === "NATIVE_EXEMPT" ? "6国英语豁免" : "MOI高风控审查"}
            </span>
          )}
        </div>
      </div>

      <p className="agent-diagnostic-desc">{diagnostic.advisory.diagnosisParagraph}</p>

      {diagnostic.pathwayLockLabels.length > 0 && diagnostic.state !== "CIRCUIT_BREAKER" && (
        <div className="agent-diagnostic-locks">
          <span>允许路径：</span>
          {diagnostic.pathwayLockLabels.map((label) => (
            <span className="agent-diagnostic-lock-chip" key={label}>{label}</span>
          ))}
        </div>
      )}

      {keyBottlenecks.length > 0 && (
        <ul className="agent-diagnostic-list">
          {keyBottlenecks.slice(0, 5).map((hit, idx) => (
            <li key={`${hit.code}-${idx}`}>
              <strong>{hit.summary}：</strong>{hit.effect}
            </li>
          ))}
        </ul>
      )}

      {diagnostic.modifiers.length > 0 && (
        <div className="agent-diagnostic-modifiers">
          {diagnostic.modifiers.map((m) => (
            <p key={m.type}><strong>{m.summary}：</strong>{m.action}</p>
          ))}
        </div>
      )}

      {diagnostic.state === "DOWNGRADE_LOCK" && diagnostic.curatedFallbacks.length > 0 && (
        <div className="agent-diagnostic-fallbacks">
          <strong>结构化承接院校参考（符合当前路径锁与预算/年龄底线）</strong>
          <div className="agent-diagnostic-fallback-grid">
            {diagnostic.curatedFallbacks.map((item) => (
              <div className="agent-diagnostic-fallback-card" key={`${item.schoolName}-${item.pathway}`}>
                <div className="agent-diagnostic-fallback-head">
                  <span>{item.schoolName}</span>
                  <small>{item.city} · {item.tier} · {item.pathwayLabel}</small>
                </div>
                <p>{item.reason}</p>
                <p className="agent-diagnostic-fallback-cost">首年参考：{item.estimatedFirstYearCost} · {item.caution}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {diagnostic.advisory.actionPlan.length > 0 && (
        <div className="agent-diagnostic-plan">
          <strong>{diagnostic.state === "CIRCUIT_BREAKER" ? "1 年期提升与重启行动计划" : "顾问下一步行动清单"}</strong>
          <ul>
            {diagnostic.advisory.actionPlan.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}

      <details className="agent-diagnostic-details">
        <summary>
          <span>查看真实首年账单、续奖年审风险、缺失槽位假设（已收口 {diagnostic.slotAudit.filledCount}/{diagnostic.slotAudit.totalCount} 项）</span>
          <ChevronDown size={13} aria-hidden="true" />
        </summary>
        <div className="agent-diagnostic-details-body">
          <ul>
            {diagnostic.advisory.firstYearCostChecklist.map((item, i) => <li key={`cost-${i}`}>{item}</li>)}
          </ul>
          {diagnostic.slotAudit.explicitAssumptions.length > 0 && (
            <>
              <strong>显式假设与待补槽位：</strong>
              <ul>
                {diagnostic.slotAudit.explicitAssumptions.map((item, i) => <li key={`slot-${i}`}>{item}</li>)}
              </ul>
            </>
          )}
        </div>
      </details>

      <p className="agent-diagnostic-legal">{diagnostic.advisory.legalComplianceNotice}</p>
    </section>
  );
}

function Answer({ result, onOthers, onSwitchMode2, busy }: { result: ScreeningResponse; onOthers: () => void; onSwitchMode2: () => void; busy: boolean }) {
  const t = useT();
  const locale = useLocale();
  const { confirmed, pending, other, otherHidden } = result.results;
  const isCircuitBreaker = result.diagnostic?.state === "CIRCUIT_BREAKER";
  const showDiagnostic = Boolean(result.diagnostic && !result.conversation);
  const conditions = criteriaLabels(result.criteria, locale);
  const pendingProjects = pending.filter(isCandidate);
  const pendingSchools = pending.filter((card) => !isCandidate(card));
  const otherProjects = other.filter(isCandidate);
  const otherSchools = other.filter((card) => !isCandidate(card));
  const listName = admissionListLabel(result.source);
  const otherResults = <><ResultSection title={admissionGroupLabel(result.source, "other")} cards={otherProjects} /><IncompleteResults title="知识库院校资料不足" cards={otherSchools} /></>;
  const allResults = <>
    {result.otherRequested && otherResults}
    <ResultSection title={admissionGroupLabel(result.source, "partner")} cards={confirmed} />
    <ResultSection title={`${listName} · 条件待核实`} cards={pendingProjects} repeatedStatus="条件待核实" />
    <IncompleteResults title={`${listName} · 资料不足`} cards={pendingSchools} />
    {!result.otherRequested && otherResults}
  </>;
  const hasResults = !isCircuitBreaker && (confirmed.length > 0 || pending.length > 0 || other.length > 0);
  const hasExternal = !isCircuitBreaker && Boolean(result.external && (result.external.programs.length > 0 || result.external.policyNotes.length > 0 || result.external.excludedNotes?.length));
  const localOnlyEliminated = !hasExternal && (result.results.eliminatedNotes?.length ?? 0) > 0
    ? result.results.eliminatedNotes!
    : [];
  if (isCircuitBreaker && result.diagnostic) {
    return <div className="agent-answer">
      {result.v31Report && <V31ReportToolbar report={result.v31Report} gates={result.v31Gates} canExportAdvisor={Boolean(result.canExportAdvisorReport)} />}
      <DiagnosticBanner diagnostic={result.diagnostic} />
      {conditions.length > 0 && <div className="agent-criteria" aria-label={t("已识别的申请条件")}>{conditions.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>}
    </div>;
  }
  if (result.partnerQuick) {
    return <div className="agent-answer">
      {showDiagnostic && result.diagnostic && <DiagnosticBanner diagnostic={result.diagnostic} />}
      <div className="agent-answer-intro">
        <p className="agent-outcome">{result.answer?.lead}</p>
        {conditions.length > 0 && <div className="agent-criteria" aria-label={t("已识别的申请条件")}>{conditions.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>}
        {result.redactedContact && <p className="agent-context-note">{t("输入中的联系方式或证件信息已在发送模型前自动脱敏。")}</p>}
      </div>
      <PartnerQuickSection data={result.partnerQuick} onSwitchMode2={onSwitchMode2} />
    </div>;
  }
  if (result.answer) return <div className="agent-answer">{showDiagnostic && result.diagnostic && result.diagnostic.state !== "NORMAL" && <DiagnosticBanner diagnostic={result.diagnostic} />}<div className="agent-answer-intro"><p className="agent-outcome">{result.answer.lead}</p>{result.answer.details.length > 0 && <ul className="agent-followup-detail">{result.answer.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}{result.answer.note && <p className="agent-followup-note">{result.answer.note}</p>}{result.redactedContact && <p className="agent-context-note">{t("输入中的联系方式或证件信息已在发送模型前自动脱敏。")}</p>}{result.sensitiveContext && <p className="agent-context-note">{t("申请前请核实生源相关招生注意事项及适用批次。")}</p>}</div>{(confirmed.length > 0 || pending.length > 0 || other.length > 0 || otherHidden) && <details className="agent-incomplete"><summary><span>{t("查看本轮依据")}</span><ChevronDown size={16} aria-hidden="true" /></summary>{result.otherRequested && otherResults}<ResultSection title={admissionGroupLabel(result.source, "partner")} cards={confirmed} /><ResultSection title={`${listName} · 条件待核实`} cards={pendingProjects} repeatedStatus="条件待核实" /><IncompleteResults title={`${listName} · 资料不足`} cards={pendingSchools} />{!result.otherRequested && otherResults}{otherHidden && <button type="button" className="agent-other-button" onClick={onOthers} disabled={busy}>{t("查看知识库院校")}</button>}</details>}</div>;
  if (result.narrative) return <div className="agent-answer">
    {result.v31Report && <V31ReportToolbar report={result.v31Report} gates={result.v31Gates} canExportAdvisor={Boolean(result.canExportAdvisorReport)} />}
    {showDiagnostic && result.diagnostic && <DiagnosticBanner diagnostic={result.diagnostic} />}
    <div className="agent-answer-intro"><p className="agent-outcome">{result.narrative.lead}</p>
      {conditions.length > 0 && <div className="agent-criteria" aria-label={t("已识别的申请条件")}>{conditions.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>}
      {result.redactedContact && <p className="agent-context-note">{t("输入中的联系方式或证件信息已在发送模型前自动脱敏。")}</p>}
      {result.sensitiveContext && <p className="agent-context-note">{t("申请前请核实生源相关招生注意事项及适用批次。")}</p>}
    </div>
    <CandidateComparison result={result} />
    <NarrativeSchoolGroups result={result} />
    {localOnlyEliminated.length > 0 && <div className="agent-excluded-box">
      <strong>参考池 / 成绩档位淘汰说明</strong>
      <ul>{localOnlyEliminated.map((note, idx) => <li key={idx}>{note}</li>)}</ul>
    </div>}
    {hasExternal && result.external && <ExternalScreeningSection external={result.external} />}
    {result.v31Report && <HistoricalAndSourcesSection report={result.v31Report} />}
    {result.narrative.next && <p className="agent-narrative-next">{result.narrative.next}</p>}
    {hasResults && <details className="agent-narrative-results"><summary>{t("查看全部校内库候选与完整依据")} <ChevronDown size={15} aria-hidden="true" /></summary>
      {result.otherRequested && otherResults}<ResultSection title={admissionGroupLabel(result.source, "partner")} cards={confirmed} /><ResultSection title={`${listName} · 条件待核实`} cards={pendingProjects} repeatedStatus="条件待核实" /><IncompleteResults title={`${listName} · 资料不足`} cards={pendingSchools} />{!result.otherRequested && otherResults}
    </details>}
    {otherHidden && <button type="button" className="agent-other-button" onClick={onOthers} disabled={busy}>{t("查看知识库院校")}</button>}
  </div>;
  return <div className="agent-answer">
    {result.v31Report && <V31ReportToolbar report={result.v31Report} gates={result.v31Gates} canExportAdvisor={Boolean(result.canExportAdvisorReport)} />}
    {showDiagnostic && result.diagnostic && <DiagnosticBanner diagnostic={result.diagnostic} />}
    <div className="agent-answer-intro"><p className="agent-outcome">{outcomeSummary(result)}</p>
      {conditions.length > 3 ? <details className="agent-conditions"><summary aria-label={`查看全部 ${conditions.length} 项匹配条件`}>{conditions.slice(0, 3).join(" · ")} 等 {conditions.length} 项条件 <ChevronDown size={14} aria-hidden="true" /></summary><div className="agent-criteria" aria-label={t("已识别的申请条件")}>{conditions.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></details> : conditions.length > 0 && <p className="agent-conditions-line">{conditions.join(" · ")}</p>}
      {result.redactedContact && <p className="agent-context-note">{t("输入中的联系方式或证件信息已在发送模型前自动脱敏。")}</p>}
      {result.sensitiveContext && <p className="agent-context-note">{t("申请前请核实生源相关招生注意事项及适用批次。")}</p>}
    </div>
    <CandidateComparison result={result} />
    <ResultSection title="优先查看" cards={comparisonCards(result)} />
    {hasExternal && result.external && <ExternalScreeningSection external={result.external} />}
    {result.v31Report && <HistoricalAndSourcesSection report={result.v31Report} />}
    {hasResults && <details className="agent-narrative-results"><summary>{t("查看更多项目与匹配依据")} <ChevronDown size={15} aria-hidden="true" /></summary>{allResults}</details>}
    {!confirmed.length && !pending.length && !other.length && !hasExternal && <div className="agent-empty-result"><strong>{t("没有找到可展示的院校。")}</strong><p>{t("试试放宽专业、预算或入学时间。")}</p></div>}
    {otherHidden && <button type="button" className="agent-other-button" onClick={onOthers} disabled={busy}>{t("查看知识库院校")}</button>}
    {result.prompt.startsWith("想进一步") && <p className="agent-follow-up">{result.prompt}</p>}
  </div>;
}

function WorkbookManager({ canManage, refreshKey }: { canManage: boolean; refreshKey: number }) {
  const t = useT();
  const tm = useTm();
  const tv = useTv();
  const [info, setInfo] = useState<WorkbookInfo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<WorkbookPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ai-screening/workbook", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.ok) setInfo(await response.json() as WorkbookInfo);
      else setMessage("暂时无法读取当前名单状态。");
    }).catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage("暂时无法读取当前名单状态。"); });
    return () => controller.abort();
  }, [refreshKey]);

  async function update(action: "preview" | "update" | "restore") {
    if (!info || busy || (action !== "restore" && !file) || (action === "restore" && !info.version) || (action === "update" && !preview)) return;
    setBusy(true); setMessage("");
    try {
      let response: Response;
      if (action === "restore") response = await fetch("/api/ai-screening/workbook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", expectedVersion: info.version }) });
      else {
        const body = new FormData();
        const expectedVersion = action === "update" && preview ? preview.version : info.version;
        body.set("workbook", file!); body.set("expectedVersion", expectedVersion ?? ""); body.set("action", action);
        if (preview && action === "update") body.set("hash", preview.hash);
        response = await fetch("/api/ai-screening/workbook", { method: "POST", body });
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "名单更新未完成，请重试。");
      if (action === "preview") { setPreview(result as WorkbookPreview); return; }
      setInfo(result as WorkbookInfo); setFile(null); setPreview(null); setConfirmRestore(false);
      if (fileRef.current) fileRef.current.value = "";
      setMessage(action === "restore" ? "已恢复上一版，已有结果请重新查询。" : "名单已更新，所有顾问下次查询时生效。已有结果请重新查询。");
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "名单更新未完成，请重试。"); }
    finally { setBusy(false); }
  }

  return <div className="agent-workbook">
    <details><summary>{t(canManage ? "管理合作名单" : "查看合作名单")} <ChevronDown size={14} aria-hidden="true" /></summary>
      <p>{t("当前名单：")}{info ? info.available ? info.name : t("暂不可用") : t("正在读取…")}</p>
      {canManage && <div className="agent-workbook-form"><p>{t("更新后所有顾问使用新名单，原文件与历史版本保留。")}</p>
        <label htmlFor="agent-workbook-file">{t("选择 Excel 名单（.xlsx，最大 10 MB）")}</label>
        <input ref={fileRef} id="agent-workbook-file" type="file" accept=".xlsx" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setMessage(""); }} disabled={busy} />
        {preview && <div className="agent-workbook-preview" role="status"><strong>{tv("识别到 {schools} 所院校、{rows} 条记录", { schools: preview.schools, rows: preview.rows })}</strong><p>{preview.added == null ? t("当前名单无法对比，请仔细核对。") : tv("与当前名单相比：新增 {added} 所，移除 {removed} 所。", { added: preview.added, removed: preview.removed ?? 0 })} {preview.notCooperating > 0 && tv("{count} 所标记不合作。", { count: preview.notCooperating })}</p>{preview.missingColumns.length > 0 && <p>{tv("未识别到“{columns}”列，相关信息将按未知处理。", { columns: preview.missingColumns.join("、") })}</p>}</div>}
        <div className="agent-workbook-actions">{!preview ? <button type="button" onClick={() => void update("preview")} disabled={!info || !file || busy}>{t("检查名单")}</button> : <button type="button" onClick={() => void update("update")} disabled={busy}>{t("确认更新名单")}</button>}
          {info?.canRestore && !confirmRestore && <button type="button" onClick={() => setConfirmRestore(true)} disabled={busy}>{t("恢复上一版")}</button>}
          {info?.canRestore && confirmRestore && <><button type="button" onClick={() => void update("restore")} disabled={busy}>{t("确认恢复上一版")}</button><button type="button" onClick={() => setConfirmRestore(false)} disabled={busy}>{t("取消")}</button></>}
        </div>
      </div>}
    </details>
    {message && <p role="status" className="agent-workbook-message">{tm(message)}</p>}
  </div>;
}

function ReportPreviewDrawer({
  report,
  variant,
  canExportAdvisor,
  onChangeVariant,
  onClose,
}: {
  report: V31ReportPayload;
  variant: "student" | "advisor";
  canExportAdvisor: boolean;
  onChangeVariant: (v: "student" | "advisor") => void;
  onClose: () => void;
}) {
  const html = useMemo(() => renderV31ReportHtml(report, { variant }), [report, variant]);

  function openNewTab() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function downloadHtml() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = (report.report_title || "选校评估报告").replace(/[\\/:*?"<>|]+/g, "_");
    a.href = url;
    a.download = `${safeTitle}-${variant === "advisor" ? "顾问版" : "学生版"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <aside className="agent-report-drawer" aria-label="评估报告预览">
      <header className="agent-draft-head">
        <div className="agent-report-drawer-title">
          <FileText size={15} aria-hidden="true" />
          <h2>评估报告预览</h2>
        </div>
        <div className="agent-report-drawer-controls">
          {canExportAdvisor && (
            <div className="agent-view-toggle" role="group" aria-label="报告版本">
              <button type="button" aria-pressed={variant === "advisor"} onClick={() => onChangeVariant("advisor")}>顾问版</button>
              <button type="button" aria-pressed={variant === "student"} onClick={() => onChangeVariant("student")}>学生版</button>
            </div>
          )}
          <button type="button" className="agent-icon-btn" onClick={openNewTab} title="新标签页打开" aria-label="新标签页打开">
            <ExternalLink size={14} aria-hidden="true" />
          </button>
          <button type="button" className="agent-icon-btn" onClick={downloadHtml} title="下载 HTML 报告" aria-label="下载 HTML 报告">
            <Download size={14} aria-hidden="true" />
          </button>
          <button type="button" className="agent-icon-btn" onClick={onClose} title="关闭预览" aria-label="关闭预览">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <iframe
        title="选校评估报告实时预览"
        className="agent-report-iframe"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={html}
      />
    </aside>
  );
}

export function AiScreeningChat({ userId, canManageWorkbook, canSavePlans }: {
  userId: string;
  canManageWorkbook: boolean;
  canSavePlans: boolean;
}) {
  const t = useT();
  const tm = useTm();
  const [input, setInput] = useState("");
  const [runMode, setRunMode] = useState<ScreeningRunMode>("partner_priority");
  const [criteria, setCriteria] = useState<ChatCriteria>({});
  const [sensitiveContext, setSensitiveContext] = useState(false);
  const [focusSchool, setFocusSchool] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [rightDrawer, setRightDrawer] = useState<RightDrawerMode>("none");
  const [previewReport, setPreviewReport] = useState<{ report: V31ReportPayload; variant: "student" | "advisor" } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [sessions, setSessions] = useState<ScreeningSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState<string>("新选校对话");
  const [syncBadge, setSyncBadge] = useState<"" | "saving" | "saved">("");
  const [draft, setDraft] = useState<DraftPlan | null>(null);
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [draftNotice, setDraftNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [feedbackSaved, setFeedbackSaved] = useState<Record<string, "relevant" | "not_relevant">>({});
  const [feedbackPending, setFeedbackPending] = useState<Set<string>>(new Set());
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const sequence = useRef(0);
  const running = useRef<AbortController | null>(null);
  const lastScrolled = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef<HTMLDetailsElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const suppressSaveRef = useRef(false);
  const latest = turns[turns.length - 1];
  const selectedIds = useMemo(() => new Set(draft?.items.map((item) => item.programId)), [draft?.items]);
  const selectedSchoolCount = useMemo(() => new Set(draft?.items.map((item) => item.schoolId)).size, [draft?.items]);
  const profileKey = `${PROFILE_STORAGE_KEY}.${userId}`;
  const activeSessionKey = `${ACTIVE_SESSION_STORAGE_KEY}.${userId}`;
  const sessionsCacheKey = `${SESSIONS_CACHE_KEY}.${userId}`;
  const sessionsSyncKey = `${SESSIONS_SYNC_KEY}.${userId}`;
  const [hydrated, setHydrated] = useState(false);

  const canExportAdvisor = useMemo(
    () => turns.some((item) => item.result?.canExportAdvisorReport) || canManageWorkbook,
    [canManageWorkbook, turns],
  );

  const syncUrlSession = useCallback((sessionId: string | null) => {
    try {
      const url = new URL(window.location.href);
      if (sessionId) url.searchParams.set("session", sessionId);
      else url.searchParams.delete("session");
      window.history.replaceState({}, "", url.toString());
    } catch {
      // Ignore history restrictions.
    }
  }, []);

  const cacheSessionsLocal = useCallback((list: ScreeningSessionSummary[]) => {
    try {
      window.localStorage.setItem(sessionsCacheKey, JSON.stringify(list.slice(0, 60)));
    } catch {
      // Ignore storage quota errors.
    }
  }, [sessionsCacheKey]);

  const notifyCrossTabs = useCallback(() => {
    try {
      window.localStorage.setItem(sessionsSyncKey, String(Date.now()));
    } catch {
      // Ignore storage errors.
    }
  }, [sessionsSyncKey]);

  const refreshSessionList = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-screening/sessions", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json() as { sessions?: ScreeningSessionSummary[] };
      const list = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(list);
      cacheSessionsLocal(list);
      return list;
    } catch {
      return null;
    }
  }, [cacheSessionsLocal]);

  const applySessionRecord = useCallback((rec: ScreeningSessionRecord) => {
    suppressSaveRef.current = true;
    setActiveSessionId(rec.id);
    setActiveSessionTitle(rec.title || "选校对话");
    setRunMode(rec.runMode ?? "partner_priority");
    setCriteria(rec.criteria ?? {});
    setSensitiveContext(Boolean(rec.sensitiveContext));
    setFocusSchool(rec.focusSchool ?? null);
    setTurns(Array.isArray(rec.turns) ? rec.turns : []);
    setDraft(canSavePlans ? (rec.draft ?? null) : null);
    setSavedPlan(canSavePlans ? (rec.savedPlan ?? null) : null);
    setPreviewReport(null);
    setRightDrawer("none");
    setDraftNotice(null);
    setFeedbackStatus("");
    sequence.current = Math.max(0, ...(rec.turns ?? []).map((item) => item.id));
    lastScrolled.current = "";
    try {
      window.localStorage.setItem(activeSessionKey, rec.id);
    } catch {
      // Ignore storage errors.
    }
    syncUrlSession(rec.id);
    queueMicrotask(() => { suppressSaveRef.current = false; });
  }, [activeSessionKey, canSavePlans, syncUrlSession]);

  const loadSessionById = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/ai-screening/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!res.ok) return false;
      const data = await res.json() as { session?: ScreeningSessionRecord };
      if (!data.session) return false;
      applySessionRecord(data.session);
      return true;
    } catch {
      return false;
    }
  }, [applySessionRecord]);

  // Hydrate history sidebar preference, cached list, server list & active session on mount.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      try {
        const savedOpen = window.localStorage.getItem(HISTORY_OPEN_KEY);
        if (savedOpen !== null) {
          if (!cancelled) setHistoryOpen(savedOpen === "1");
        } else if (window.innerWidth < 1180) {
          if (!cancelled) setHistoryOpen(false);
        }
        const cachedRaw = window.localStorage.getItem(sessionsCacheKey);
        if (cachedRaw) {
          const cachedList = JSON.parse(cachedRaw) as ScreeningSessionSummary[];
          if (Array.isArray(cachedList) && !cancelled) setSessions(cachedList);
        }
      } catch {
        // Ignore storage failures.
      }

      const list = await refreshSessionList();
      if (cancelled) return;
      setSessionsLoading(false);

      const urlId = new URLSearchParams(window.location.search).get("session");
      let preferredId = urlId;
      if (!preferredId) {
        try { preferredId = window.localStorage.getItem(activeSessionKey); } catch { preferredId = null; }
      }
      const candidateId = preferredId && (list ?? []).some((s) => s.id === preferredId) ? preferredId : null;
      if (candidateId) {
        await loadSessionById(candidateId);
      } else {
        try {
          const raw = window.sessionStorage.getItem(profileKey);
          const parsed = raw ? criteriaSchema.safeParse(JSON.parse(raw)) : null;
          if (parsed?.success && !cancelled) setCriteria(parsed.data);
        } catch {
          // Ignore storage error.
        }
      }
      if (!cancelled) setHydrated(true);
    })();

    const onStorage = (e: StorageEvent) => {
      if (e.key === sessionsSyncKey) {
        void refreshSessionList();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      running.current?.abort();
      window.removeEventListener("storage", onStorage);
    };
  }, [activeSessionKey, loadSessionById, profileKey, refreshSessionList, sessionsCacheKey, sessionsSyncKey]);

  // Persist history sidebar preference.
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(HISTORY_OPEN_KEY, historyOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [historyOpen, hydrated]);

  // Auto-collapse session history when expanding the outer workspace sidebar on tighter viewports.
  useEffect(() => {
    const onWorkspaceSidebarToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed?: boolean }>).detail;
      if (detail && detail.collapsed === false) {
        const threshold = rightDrawer !== "none" ? 1680 : 1440;
        if (window.innerWidth < threshold) {
          setHistoryOpen(false);
        }
      }
    };
    window.addEventListener("workspace:sidebar-toggle", onWorkspaceSidebarToggle);
    return () => window.removeEventListener("workspace:sidebar-toggle", onWorkspaceSidebarToggle);
  }, [rightDrawer]);

  // Persist criteria in sessionStorage as lightweight fallback.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (Object.values(criteria).some(hasCriteriaValue)) {
        window.sessionStorage.setItem(profileKey, JSON.stringify(criteria));
      } else {
        window.sessionStorage.removeItem(profileKey);
      }
    } catch {
      // Storage can be unavailable in private contexts.
    }
  }, [criteria, hydrated, profileKey]);

  // Auto-persist session to server whenever turns/draft/criteria settle (cross-window safe).
  useEffect(() => {
    if (!hydrated || busy || suppressSaveRef.current) return;
    const hasMeaningfulTurns = turns.some((item) => item.result || item.error);
    if (!hasMeaningfulTurns && !activeSessionId) return;
    if (turns.length === 0) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        setSyncBadge("saving");
        try {
          const res = await fetch("/api/ai-screening/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: activeSessionId ?? undefined,
              runMode,
              criteria,
              sensitiveContext,
              focusSchool,
              turns,
              draft: canSavePlans ? draft : null,
              savedPlan: canSavePlans ? savedPlan : null,
            }),
          });
          if (!res.ok) {
            setSyncBadge("");
            return;
          }
          const data = await res.json() as { session?: ScreeningSessionSummary };
          if (data.session) {
            const savedSummary = data.session;
            setActiveSessionId(savedSummary.id);
            setActiveSessionTitle(savedSummary.title);
            setSessions((prev) => {
              const next = [savedSummary, ...prev.filter((s) => s.id !== savedSummary.id)];
              next.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
              cacheSessionsLocal(next);
              return next;
            });
            try { window.localStorage.setItem(activeSessionKey, savedSummary.id); } catch { /* ignore */ }
            syncUrlSession(savedSummary.id);
            notifyCrossTabs();
            setSyncBadge("saved");
          }
        } catch {
          setSyncBadge("");
        }
      })();
    }, 350);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [activeSessionId, activeSessionKey, busy, cacheSessionsLocal, canSavePlans, criteria, draft, focusSchool, hydrated, notifyCrossTabs, runMode, savedPlan, sensitiveContext, syncUrlSession, turns]);

  // Auto-grow composer textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(168, Math.max(42, el.scrollHeight))}px`;
  }, [input]);

  useEffect(() => {
    if (!latest || !threadRef.current?.clientHeight) return;
    const key = `${latest.id}:${latest.result || latest.error ? "complete" : "pending"}`;
    if (key === lastScrolled.current) return;
    const viewport = threadRef.current;
    const turn = document.getElementById(`agent-turn-${latest.id}`);
    if (!turn) return;
    lastScrolled.current = key;
    viewport.scrollTop += turn.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16;
  }, [latest, rightDrawer]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    function rememberRevealed(event: Event) {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      const turnNode = details.closest<HTMLElement>(".agent-turn");
      if (!turnNode) return;
      const turnId = Number(turnNode.id.replace(/^agent-turn-/, ""));
      const visible = [...turnNode.querySelectorAll<HTMLElement>("[data-result-school], [data-result-program]")]
        .filter((element) => !element.closest("details:not([open])")
          && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      const programIds = visible.flatMap((element) => element.dataset.resultProgram ? [element.dataset.resultProgram] : []);
      const schoolNames = visible.flatMap((element) => element.dataset.resultSchool ? [element.dataset.resultSchool] : []);
      setTurns((old) => old.map((turn) => turn.id === turnId ? {
        ...turn,
        revealed: {
          programIds: [...new Set([...(turn.revealed?.programIds ?? []), ...programIds])],
          schoolNames: [...new Set([...(turn.revealed?.schoolNames ?? []), ...schoolNames])],
        },
      } : turn));
    }
    thread.addEventListener("toggle", rememberRevealed, true);
    return () => thread.removeEventListener("toggle", rememberRevealed, true);
  }, []);

  async function run(message: string, previous: ChatCriteria, showOther = false, previousSensitive = sensitiveContext, previousFocus = focusSchool, providedCriteria: ChatCriteria | null = null, overrideMode?: ScreeningRunMode) {
    if (!message.trim() || running.current) return;
    const effectiveMode = overrideMode ?? runMode;
    const controller = new AbortController();
    running.current = controller;
    const id = ++sequence.current;
    const startedAt = Date.now();
    setBusy(true);
    setTurns((old) => [...old, { id, question: message, runMode: effectiveMode, criteriaBefore: previous, sensitiveBefore: previousSensitive, focusBefore: previousFocus, showOther, providedCriteria: providedCriteria ?? undefined, steps: [], startedAt }]);
    const update = (fn: (turn: Turn) => Turn) => setTurns((old) => old.map((turn) => turn.id === id ? fn(turn) : turn));
    let receivedResult = false;
    try {
      const lastResult = [...turns].reverse().find((turn) => turn.result?.source)?.result;
      const lastSearch = [...turns].reverse().find((turn) => turn.result?.shown || turn.result?.narrative)?.result;
      const previousProgramIds = providedCriteria ? [] : (lastSearch?.shown?.programIds ?? lastSearch?.narrative?.highlights.flatMap((item) => item.programId ? [item.programId] : []) ?? []);
      const seenProgramIds = providedCriteria ? [] : [...new Set(turns.flatMap((turn) => [...presentedProgramIds(turn.result), ...(turn.revealed?.programIds ?? [])]))].slice(-200);
      const seenSchoolNames = providedCriteria ? [] : [...new Set(turns.flatMap((turn) => [...presentedSchoolNames(turn.result), ...(turn.revealed?.schoolNames ?? [])]))].slice(-200);
      const history = providedCriteria ? [] : turns.filter((turn) => turn.result).flatMap((turn) => {
        const assistantSummary = turn.result?.answer?.lead
          ? turn.result.answer.lead
          : turn.result?.narrative?.lead
            ? `${turn.result.narrative.lead.split("\n")[0]}${turn.result.narrative.highlights.length ? `（已展示 ${turn.result.narrative.highlights.length} 所候选）` : ""}`
            : null;
        return [
          { role: "user" as const, content: turn.question.slice(0, 500) },
          ...(assistantSummary ? [{ role: "assistant" as const, content: assistantSummary.slice(0, 500) }] : []),
        ];
      }).slice(-8);
      const response = await fetch("/api/ai-screening", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ message, runMode: effectiveMode, criteria: providedCriteria ?? previous, ...(providedCriteria ? { criteriaOverride: providedCriteria } : {}), showOther: providedCriteria ? false : showOther, sensitiveContext: previousSensitive, hasPrevious: providedCriteria ? false : Boolean(lastResult), previousOtherRequested: providedCriteria ? false : lastResult?.otherRequested ?? false, focusSchool: providedCriteria ? null : previousFocus, previousProgramIds, seenProgramIds, seenSchoolNames, history }) });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || "请求没有完成，请重试。"); }
      if (!response.body) throw new Error("没有收到完整的检索结果，请重试。");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (line: string) => {
        if (!line.trim()) return;
        let event: SearchEvent;
        try {
          event = JSON.parse(line) as SearchEvent;
        } catch {
          // A single malformed line must not abort the whole NDJSON stream;
          // the remaining progress/result events are still usable.
          return;
        }
        if (event.type === "progress") update((turn) => ({ ...turn, steps: [...turn.steps.filter((step) => step.id !== event.step.id), event.step] }));
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "result") {
          receivedResult = true;
          setCriteria(event.result.criteria);
          setSensitiveContext(event.result.sensitiveContext);
          setFocusSchool(event.result.focusSchool ?? null);
          update((turn) => ({ ...turn, result: event.result, durationMs: Date.now() - startedAt }));
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handle);
        if (done) { handle(buffer); break; }
      }
      if (!receivedResult) throw new Error("检索中断了，请重试。");
    } catch (error) {
      const msg = controller.signal.aborted ? "已停止检索。" : error instanceof Error && !/failed to fetch|networkerror|load failed|unexpected token|json/i.test(error.message) ? error.message : "暂时无法连接选校服务，请检查网络后重试。";
      if (!receivedResult) update((turn) => ({ ...turn, error: msg, durationMs: Date.now() - startedAt }));
    } finally {
      if (!receivedResult) controller.abort();
      running.current = null;
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    void run(message, criteria);
  }

  const submitFeedback = useCallback(async (programId: string, value: "relevant" | "not_relevant") => {
    if (feedbackPending.has(programId) || feedbackSaved[programId] === value) return;
    setFeedbackPending((old) => new Set(old).add(programId));
    setFeedbackStatus("");
    try {
      const response = await fetch("/api/ai-screening/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "反馈未保存。");
      setFeedbackSaved((old) => ({ ...old, [programId]: value }));
      setFeedbackStatus("已记录反馈，后续检索会参考你的选择调整排序。");
    } catch (error) {
      setFeedbackStatus(error instanceof Error ? error.message : "反馈未保存。");
    } finally {
      setFeedbackPending((old) => {
        const next = new Set(old);
        next.delete(programId);
        return next;
      });
    }
  }, [feedbackPending, feedbackSaved]);

  function newConversation() {
    if (busy) return;
    suppressSaveRef.current = true;
    setActiveSessionId(null);
    setActiveSessionTitle("新选校对话");
    setTurns([]);
    setInput("");
    setCriteria({});
    setSensitiveContext(false);
    setFocusSchool(null);
    setFeedbackStatus("");
    setPreviewReport(null);
    setRightDrawer("none");
    setSyncBadge("");
    sequence.current = 0;
    lastScrolled.current = "";
    setDraftNotice(draft?.items.length ? { message: "已开启新对话，原草稿仍保留。" } : null);
    try { window.localStorage.removeItem(activeSessionKey); } catch { /* ignore */ }
    syncUrlSession(null);
    queueMicrotask(() => { suppressSaveRef.current = false; });
    inputRef.current?.focus();
  }

  async function handleSelectSession(sessionId: string) {
    if (busy || sessionId === activeSessionId) return;
    await loadSessionById(sessionId);
    if (window.innerWidth < 1120) setHistoryOpen(false);
  }

  async function handleRenameSession(sessionId: string, title: string) {
    try {
      const res = await fetch(`/api/ai-screening/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      const data = await res.json() as { session?: ScreeningSessionSummary };
      if (data.session) {
        setSessions((prev) => {
          const next = prev.map((s) => s.id === sessionId ? data.session! : s);
          cacheSessionsLocal(next);
          return next;
        });
        if (sessionId === activeSessionId) setActiveSessionTitle(data.session.title);
        notifyCrossTabs();
      }
    } catch {
      // Ignore transient failure.
    }
  }

  async function handleTogglePin(sessionId: string, pinned: boolean) {
    try {
      const res = await fetch(`/api/ai-screening/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) return;
      const data = await res.json() as { session?: ScreeningSessionSummary };
      if (data.session) {
        setSessions((prev) => {
          const next = prev.map((s) => s.id === sessionId ? data.session! : s)
            .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
          cacheSessionsLocal(next);
          return next;
        });
        notifyCrossTabs();
      }
    } catch {
      // Ignore transient failure.
    }
  }

  async function handleDeleteSession(sessionId: string) {
    try {
      const res = await fetch(`/api/ai-screening/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      if (!res.ok) return;
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        cacheSessionsLocal(next);
        return next;
      });
      notifyCrossTabs();
      if (sessionId === activeSessionId) {
        newConversation();
      }
    } catch {
      // Ignore transient failure.
    }
  }

  const openRightDrawer = useCallback((mode: RightDrawerMode) => {
    setRightDrawer(mode);
    if (mode !== "none" && window.innerWidth < 1440) {
      setHistoryOpen(false);
    }
  }, []);

  const selectCandidate = useCallback((card: ResultCard, result: ScreeningResponse) => {
    if (savingPlan) return;
    setDraft((current) => {
      const next = togglePlanCandidate(current, card, result);
      setDraftNotice({ message: next.notice, error: next.error });
      if (!next.error && (next.draft?.items.length ?? 0) > (current?.items.length ?? 0)) {
        openRightDrawer("draft");
      }
      return next.draft;
    });
  }, [openRightDrawer, savingPlan]);

  const handleOpenReportPreview = useCallback((report: V31ReportPayload, variant: "student" | "advisor") => {
    setPreviewReport({ report, variant });
    openRightDrawer("report");
  }, [openRightDrawer]);

  const feedbackContextValue = useMemo(
    () => ({ saved: feedbackSaved, pending: feedbackPending, submit: (programId: string, value: "relevant" | "not_relevant") => void submitFeedback(programId, value) }),
    [feedbackSaved, feedbackPending, submitFeedback],
  );
  const planSelectionContextValue = useMemo(
    () => (canSavePlans ? { selectedIds, saving: savingPlan, toggle: selectCandidate } : null),
    [canSavePlans, selectedIds, savingPlan, selectCandidate],
  );

  const activeCriteriaCount = criteriaLabels(criteria).length;

  return (
    <FeedbackContext.Provider value={feedbackContextValue}>
      <PlanSelectionContext.Provider value={planSelectionContextValue}>
        <ReportPreviewContext.Provider value={handleOpenReportPreview}>
          <div className="agent-page agent-immersive">
            <div className={`agent-workbench${historyOpen ? " has-history" : ""}${rightDrawer !== "none" ? ` has-drawer is-drawer-${rightDrawer}` : ""}`}>
              <SessionHistorySidebar
                sessions={sessions}
                activeSessionId={activeSessionId}
                loading={sessionsLoading}
                busy={busy}
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                onSelect={(sid) => void handleSelectSession(sid)}
                onNew={newConversation}
                onRename={(sid, title) => void handleRenameSession(sid, title)}
                onTogglePin={(sid, pinned) => void handleTogglePin(sid, pinned)}
                onDelete={(sid) => void handleDeleteSession(sid)}
              />
              {historyOpen && (
                <button
                  type="button"
                  className="agent-history-backdrop"
                  aria-label="收起选校历史"
                  onClick={() => setHistoryOpen(false)}
                />
              )}

              <section className="agent-chat-panel" id="agent-chat-panel" aria-label={t("选校对话")}>
                <header className="agent-chat-head">
                  <div className="agent-chat-head-left">
                    {!historyOpen && (
                      <button
                        type="button"
                        className="agent-head-btn agent-history-open-btn"
                        onClick={() => setHistoryOpen(true)}
                        title="展开选校历史对话"
                        aria-label="展开选校历史对话"
                      >
                        <MessageSquare size={14} aria-hidden="true" />
                        <span>历史</span>
                        {sessions.length > 0 && <em className="agent-history-count">{sessions.length}</em>}
                      </button>
                    )}
                    <strong className="agent-session-title" title={activeSessionTitle}>
                      <GraduationCap size={16} aria-hidden="true" />
                      <span>{activeSessionTitle}</span>
                    </strong>
                    {syncBadge === "saving" && <span className="agent-sync-badge">保存中…</span>}
                    {syncBadge === "saved" && <span className="agent-sync-badge is-saved">已同步</span>}
                  </div>

                  <div className="agent-chat-head-right">
                    <details className="agent-controls" ref={toolRef}>
                      <summary>
                        <SlidersHorizontal size={14} aria-hidden="true" />
                        <span>{t("条件与资料")}{activeCriteriaCount ? ` · ${activeCriteriaCount}` : ""}</span>
                        <ChevronDown size={13} aria-hidden="true" />
                      </summary>
                      <div className="agent-control-body">
                        <CriteriaBar criteria={criteria} busy={busy} onApply={(next) => {
                          setCriteria(next);
                          if (toolRef.current) toolRef.current.open = false;
                          void run("按已更新的申请条件重新筛选。", criteria, false, sensitiveContext, focusSchool, next);
                        }} />
                        <WorkbookManager canManage={canManageWorkbook} refreshKey={latest?.result ? latest.id : 0} />
                        {canManageWorkbook && <Link className="agent-settings-link" href="/settings"><Settings2 size={14} aria-hidden="true" />{t("API 设置")}</Link>}
                      </div>
                    </details>

                    {canSavePlans && (
                      <button
                        type="button"
                        className={`agent-head-btn${rightDrawer === "draft" ? " is-active" : ""}`}
                        onClick={() => openRightDrawer(rightDrawer === "draft" ? "none" : "draft")}
                        aria-pressed={rightDrawer === "draft"}
                      >
                        <ClipboardList size={14} aria-hidden="true" />
                        <span>{t("方案草稿")}</span>
                        {selectedSchoolCount > 0 && <em className="agent-head-count">{selectedSchoolCount}</em>}
                      </button>
                    )}

                    {canSavePlans && (
                      <Link href="/recommendations" prefetch={false} className="agent-head-btn agent-head-link">
                        <History size={14} aria-hidden="true" />
                        <span>{t("方案记录")}</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      className="agent-head-btn is-new"
                      onClick={newConversation}
                      disabled={busy || savingPlan || (!turns.length && !input.trim() && !activeCriteriaCount)}
                    >
                      <Plus size={14} aria-hidden="true" />
                      <span>{t("新对话")}</span>
                    </button>
                  </div>
                </header>

                <div className="agent-thread" ref={threadRef} tabIndex={0} aria-label={t("对话消息")}>
                  {!turns.length ? (
                    <section className="agent-intro" aria-labelledby="agent-intro-title">
                      <span className="agent-intro-icon"><GraduationCap size={26} aria-hidden="true" /></span>
                      <h2 id="agent-intro-title">{t("想找什么样的院校项目？")}</h2>
                      <p>{t("直接粘贴完整学生条件或简短描述学历、专业、预算与国籍即可开始；支持双源检索、.edu.cn 官网实时核验与评估报告导出。")}</p>
                    </section>
                  ) : (
                    <div className="agent-conversation">
                      {turns.map((turn, index) => {
                        const isRunningTurn = busy && index === turns.length - 1;
                        return (
                          <article id={`agent-turn-${turn.id}`} className="agent-turn" key={turn.id}>
                            <UserQuestionBubble question={turn.question} />
                            <div className="agent-response">
                              <p className="agent-response-label"><GraduationCap size={16} aria-hidden="true" /> {t("选校助手")}</p>
                              <LiveResearchProgress
                                steps={turn.steps}
                                busy={isRunningTurn}
                                startedAt={turn.startedAt}
                                durationMs={turn.durationMs}
                                source={turn.result?.source}
                              />
                              {turn.error && <div className="agent-error" role="alert">
                                <strong>{t(turn.error === "已停止检索。" ? "检索已停止" : "这次没有完成")}</strong>
                                {turn.error !== "已停止检索。" && <p>{tm(turn.error)}</p>}
                                <div className="agent-error-actions">
                                  {!/移除|输入内容无效/.test(turn.error) && <button type="button" onClick={() => void run(turn.question, turn.criteriaBefore, turn.showOther, turn.sensitiveBefore, turn.focusBefore, turn.providedCriteria ?? null, turn.runMode)} disabled={busy}>{t("重试检索")}</button>}
                                  <button type="button" onClick={() => { setInput(turn.question); inputRef.current?.focus(); }} disabled={busy}>{t("修改输入")}</button>
                                </div>
                              </div>}
                              {turn.result && <ActiveResultContext.Provider value={turn.result}>
                                <Answer result={turn.result} busy={busy || index < turns.length - 1}
                                  onOthers={() => void run("请查看其他院校", turn.result!.criteria, true, turn.result!.sensitiveContext)}
                                  onSwitchMode2={() => {
                                    setRunMode("partner_priority");
                                    void run("切换为模式二：合作院校优先并全网补齐冲稳保", turn.result!.criteria, true, turn.result!.sensitiveContext, focusSchool, null, "partner_priority");
                                  }} />
                              </ActiveResultContext.Provider>}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="agent-compose-area">
                  {draftNotice && <div className={`agent-compose-notice${draftNotice.error ? " is-error" : ""}`} role={draftNotice.error ? "alert" : "status"}>
                    <span>{tm(draftNotice.message)}</span>
                    {selectedIds.size > 0 && rightDrawer !== "draft" && (
                      <button type="button" className="agent-inline-link-btn" onClick={() => openRightDrawer("draft")}>
                        {t("打开方案草稿")} <ArrowRight size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>}
                  {feedbackStatus && <p className="agent-feedback-status" role="status">{tm(feedbackStatus)}</p>}

                  <form className="agent-composer" method="post" onSubmit={submit}>
                    <label className="sr-only" htmlFor="agent-input">{t("输入学生申请需求")}</label>
                    <textarea ref={inputRef} id="agent-input" aria-describedby="agent-input-help" value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder={t(turns.length ? "继续追问，或粘贴新条件调整选校…" : "描述学生条件或直接粘贴完整筛选需求（支持多城市、院校参考池、奖学金与冲稳保三档）…")}
                      rows={1} maxLength={6000}
                      onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
                    />
                    <div className="agent-composer-footer">
                      <div className="agent-mode-bar" role="group" aria-label="选校运行模式">
                        {RUN_MODE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className="agent-mode-pill"
                            aria-pressed={runMode === opt.value}
                            title={`${opt.title}：${opt.shortDesc}`}
                            disabled={busy}
                            onClick={() => setRunMode(opt.value)}
                          >
                            {opt.compactTitle}
                          </button>
                        ))}
                      </div>
                      <div className="agent-composer-right">
                        <span
                          id="agent-input-help"
                          className="agent-privacy-hint"
                          title="手机号、邮箱和证件信息会在发送模型前自动脱敏；支持库内核验与库外拓展双源检索。"
                        >
                          <ShieldAlert size={12} aria-hidden="true" />
                          <span>自动脱敏 · Enter 发送</span>
                        </span>
                        {busy ? (
                          <button className="agent-send-btn agent-stop" type="button" aria-label={t("停止检索")} title={t("停止检索")} onClick={() => running.current?.abort()}>
                            <Square size={13} fill="currentColor" aria-hidden="true" />
                          </button>
                        ) : (
                          <button className="agent-send-btn primary" type="submit" disabled={!input.trim()} aria-label={t("发送")} title={t("发送")}>
                            <ArrowUp size={17} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                </div>
              </section>

              {canSavePlans && rightDrawer === "draft" && (
                <aside className="agent-draft-panel" id="agent-draft-panel" aria-label={t("选校方案草稿")}>
                  <div className="agent-drawer-close-bar">
                    <span>方案草稿</span>
                    <button type="button" className="agent-icon-btn" onClick={() => setRightDrawer("none")} title="收起方案草稿" aria-label="收起方案草稿">
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <PlanDraftPane draft={draft} saved={savedPlan} saving={savingPlan}
                    onChange={(fields) => setDraft((current) => current ? { ...current, ...fields } : null)}
                    onRemove={(programId) => { setDraft((current) => removePlanCandidate(current, programId)); setDraftNotice(null); }}
                    onMove={(schoolId, offset) => setDraft((current) => current ? moveDraftSchool(current, schoolId, offset) : null)}
                    onClear={() => { setDraft(null); setDraftNotice(null); }}
                    onSaving={setSavingPlan}
                    onSaved={(plan) => { setSavedPlan(plan); setDraft(null); setDraftNotice({ message: "已保存到方案记录。" }); }}
                  />
                  <Link href="/recommendations" prefetch={false} className="agent-draft-records">{t("查看方案记录")} <ArrowRight size={15} aria-hidden="true" /></Link>
                </aside>
              )}

              {rightDrawer === "report" && previewReport && (
                <ReportPreviewDrawer
                  report={previewReport.report}
                  variant={previewReport.variant}
                  canExportAdvisor={canExportAdvisor}
                  onChangeVariant={(v) => setPreviewReport((prev) => prev ? { ...prev, variant: v } : null)}
                  onClose={() => setRightDrawer("none")}
                />
              )}
            </div>
          </div>
        </ReportPreviewContext.Provider>
      </PlanSelectionContext.Provider>
    </FeedbackContext.Provider>
  );
}

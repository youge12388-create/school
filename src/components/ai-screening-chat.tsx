"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, Check, ChevronDown, ClipboardList, Download, ExternalLink, FileText, GraduationCap, History, MessageSquare, PencilLine, Plus, Settings2, ShieldAlert, SlidersHorizontal, Square, X } from "lucide-react";
import { PlanDraftPane, type SavedPlan } from "@/components/ai-screening-plan";
import { SessionHistorySidebar } from "@/components/ai-screening-history";
import { LiveResearchProgress } from "@/components/ai-screening-progress";
import { criteriaSchema, hasCriteriaValue, schoolIdentityKey, type ChatCriteria, type ResultCard } from "@/lib/ai-screening";
import type { ScreeningResponse, ScreeningRunMode, SearchEvent } from "@/lib/ai-screening-events";
import type { PersistedTurn, ScreeningSessionRecord, ScreeningSessionSummary } from "@/lib/ai-screening-sessions";
import { renderV31ReportHtml, type V31ReportPayload } from "@/lib/v31-report-render";
import type { WorkbookInfo, WorkbookPreview } from "@/lib/ai-screening-workbook";
import { moveDraftSchool, removePlanCandidate, togglePlanCandidate, type DraftPlan } from "@/lib/ai-screening-plan";
import { admissionGroupLabel, admissionListLabel, comparisonCards, displayProgramName, isCandidate, presentedProgramIds, presentedSchoolNames, resultSchoolKey, summarizePoints } from "@/lib/ai-screening-presentation";
import { buildAdvisorView, type AdvisorCitation, type AdvisorConditionStatus, type AdvisorSchoolMatch } from "@/lib/ai-screening-advisor-view";
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
  REACH: { zh: "冲刺", en: "Reach", descZh: "门槛略高，值得争取", descEn: "Competitive options within band", className: "is-reach" },
  TARGET: { zh: "稳妥", en: "Match", descZh: "条件契合，适合主申", descEn: "Well aligned with student profile", className: "is-target" },
  SAFE: { zh: "保底", en: "Safe", descZh: "风险较低，适合托底", descEn: "Lower-risk fallback options", className: "is-safe" },
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

const CITATION_KIND_LABEL: Record<AdvisorCitation["kind"], string> = {
  official: "官网",
  kb: "校内档案",
  web: "联网来源",
  list: "合作名单",
  partner: "合作台账",
};

const CONDITION_STATUS_CLASS: Record<AdvisorConditionStatus, string> = {
  good: "is-good",
  match: "is-match",
  tight: "is-tight",
  limit: "is-limit",
  info: "is-info",
};

function CitationLinks({
  ids,
  citationMap,
  turnId,
  onJumpAnchor,
}: {
  ids: number[];
  citationMap: ReadonlyMap<number, AdvisorCitation>;
  turnId: number;
  onJumpAnchor: (id: number) => void;
}) {
  if (!ids.length) return null;
  return (
    <span className="agent-cite-group" aria-label="依据溯源">
      {ids.map((id) => {
        const cite = citationMap.get(id);
        if (!cite) return null;
        const tip = [
          `[${cite.id}] ${cite.title}`,
          cite.domain ? `(${cite.domain})` : null,
          cite.detail ? `· ${cite.detail}` : null,
        ].filter(Boolean).join(" ");

        if (cite.href && cite.isExternal) {
          return (
            <a
              key={id}
              href={cite.href}
              target="_blank"
              rel="noopener noreferrer"
              className="agent-cite-link"
              title={`${tip}（点击打开来源网页）`}
              aria-label={tip}
            >
              [{id}]
            </a>
          );
        }
        if (cite.href && !cite.isExternal) {
          return (
            <Link
              key={id}
              href={cite.href}
              target="_blank"
              rel="noopener noreferrer"
              className="agent-cite-link is-kb"
              title={`${tip}（点击查看校内档案）`}
              aria-label={tip}
            >
              [{id}]
            </Link>
          );
        }
        return (
          <a
            key={id}
            href={`#turn-${turnId}-cite-${id}`}
            className="agent-cite-link is-anchor"
            title={`${tip}（点击定位到参考来源）`}
            aria-label={tip}
            onClick={(event) => {
              event.preventDefault();
              onJumpAnchor(id);
            }}
          >
            [{id}]
          </a>
        );
      })}
    </span>
  );
}

function AdvisorSchoolCard({
  item,
  citationMap,
  turnId,
  onJumpAnchor,
}: {
  item: AdvisorSchoolMatch;
  citationMap: ReadonlyMap<number, AdvisorCitation>;
  turnId: number;
  onJumpAnchor: (id: number) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const feedback = useContext(FeedbackContext);
  const tier = item.tier ? tierMeta[item.tier] : null;
  const feedbackValue = item.programId ? feedback?.saved[item.programId] : undefined;
  const feedbackPending = item.programId ? feedback?.pending.has(item.programId) : false;

  return (
    <article
      className={`agent-advisor-card${item.notCooperating ? " is-blocked" : ""}`}
      data-result-school={item.schoolName}
      data-result-program={item.programId}
    >
      <div className="agent-advisor-card-head">
        <div className="agent-advisor-card-title">
          <div className="agent-school-title-row">
            <h4>
              {item.schoolHref ? (
                <Link href={item.schoolHref} target="_blank" rel="noopener noreferrer">
                  {item.schoolName}
                </Link>
              ) : item.officialUrl ? (
                <a href={item.officialUrl} target="_blank" rel="noopener noreferrer">
                  {item.schoolName}
                </a>
              ) : (
                item.schoolName
              )}
            </h4>
            <div className="agent-result-badges">
              {tier && <span className={`agent-tier-badge ${tier.className}`}>{locale === "en" ? tier.en : tier.zh}</span>}
              <span className={`agent-source-badge is-${item.sourceTone}`}>{item.sourceKindLabel}</span>
            </div>
          </div>
          <p className="agent-advisor-program">
            {item.programName}
            {item.cityLabel ? ` · ${item.cityLabel}` : ""}
            {item.schoolNature ? ` · ${item.schoolNature}` : ""}
          </p>
        </div>
        {item.localCard && <CandidatePlanButton card={item.localCard} />}
      </div>

      {item.keyFacts.length > 0 && (
        <div className="agent-advisor-facts" aria-label="关键信息">
          {item.keyFacts.map((fact) => (
            <span className="agent-advisor-fact" key={`${fact.label}-${fact.value}`}>
              <em>{fact.label}</em>
              <span>{fact.value}</span>
            </span>
          ))}
        </div>
      )}

      {item.reasons.length > 0 && (
        <div className="agent-advisor-evidence">
          <strong className="agent-advisor-evidence-title">为什么适合你</strong>
          <ul className="agent-advisor-reasons">
            {item.reasons.map((reason, idx) => (
              <li key={`${reason.label}-${idx}`}>
                <span className="agent-reason-tag">{reason.label}</span>
                <span className="agent-reason-text">
                  {reason.text}
                  <CitationLinks ids={reason.citationIds} citationMap={citationMap} turnId={turnId} onJumpAnchor={onJumpAnchor} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.cautions.length > 0 && (
        <ul className="agent-advisor-cautions" aria-label="需注意与核实">
          {item.cautions.map((caution, idx) => (
            <li key={`${caution.label}-${idx}`}>
              <strong>{caution.label}：</strong>
              <span>
                {caution.text}
                <CitationLinks ids={caution.citationIds} citationMap={citationMap} turnId={turnId} onJumpAnchor={onJumpAnchor} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <AdmissionsNotice warnings={item.warnings} />

      {((item.programId && item.localCard && isCandidate(item.localCard) && feedback) || item.officialUrl || item.schoolHref) && (
        <div className="agent-advisor-card-foot">
          <div className="agent-advisor-card-links">
            {item.schoolHref && (
              <Link href={item.schoolHref} target="_blank" rel="noopener noreferrer" className="agent-card-micro-link">
                校内档案 <ExternalLink size={11} aria-hidden="true" />
              </Link>
            )}
            {item.officialUrl && (
              <a href={item.officialUrl} target="_blank" rel="noopener noreferrer" className="agent-card-micro-link">
                学校官网 <ExternalLink size={11} aria-hidden="true" />
              </a>
            )}
          </div>
          {item.programId && item.localCard && isCandidate(item.localCard) && feedback && (
            <div className="agent-advisor-feedback">
              <button
                type="button"
                aria-pressed={feedbackValue === "relevant"}
                onClick={() => feedback.submit(item.programId!, "relevant")}
                disabled={feedbackPending || feedbackValue === "relevant"}
              >
                {t(feedbackValue === "relevant" ? "已标记有帮助" : "有帮助")}
              </button>
              <button
                type="button"
                aria-pressed={feedbackValue === "not_relevant"}
                onClick={() => feedback.submit(item.programId!, "not_relevant")}
                disabled={feedbackPending || feedbackValue === "not_relevant"}
              >
                {t(feedbackValue === "not_relevant" ? "已标记不合适" : "不合适")}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function AdvisorCitationsFooter({
  citations,
  turnId,
  expanded,
  highlightedId,
  onToggleExpand,
}: {
  citations: AdvisorCitation[];
  turnId: number;
  expanded: boolean;
  highlightedId: number | null;
  onToggleExpand: () => void;
}) {
  if (!citations.length) return null;
  const visible = expanded || citations.length <= 6 ? citations : citations.slice(0, 6);
  return (
    <section className="agent-sources-footer" aria-label="依据与参考来源">
      <div className="agent-sources-head">
        <strong>参考来源与溯源（{citations.length}）</strong>
        {citations.length > 6 && (
          <button type="button" className="agent-sources-toggle" onClick={onToggleExpand}>
            {expanded ? "收起部分来源" : `展开全部 ${citations.length} 条`}
          </button>
        )}
      </div>
      <ol className="agent-sources-list">
        {visible.map((cite) => (
          <li
            key={cite.id}
            id={`turn-${turnId}-cite-${cite.id}`}
            className={highlightedId === cite.id ? "is-highlighted" : undefined}
          >
            <span className="agent-source-num">[{cite.id}]</span>
            <span className={`agent-source-kind is-${cite.kind}`}>{CITATION_KIND_LABEL[cite.kind]}</span>
            <span className="agent-source-body">
              {cite.href && cite.isExternal ? (
                <a href={cite.href} target="_blank" rel="noopener noreferrer">
                  {cite.title}
                  {cite.domain ? <small> ({cite.domain})</small> : null}
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              ) : cite.href && !cite.isExternal ? (
                <Link href={cite.href} target="_blank" rel="noopener noreferrer">
                  {cite.title}
                  <ExternalLink size={11} aria-hidden="true" />
                </Link>
              ) : (
                <span>
                  {cite.title}
                  {cite.schoolHref && (
                    <>
                      {" · "}
                      <Link href={cite.schoolHref} target="_blank" rel="noopener noreferrer">
                        打开校内档案 <ExternalLink size={10} aria-hidden="true" />
                      </Link>
                    </>
                  )}
                </span>
              )}
              {cite.detail && <em className="agent-source-detail">{cite.detail}</em>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReportExportBar({
  report,
  canExportAdvisor,
}: {
  report: V31ReportPayload;
  canExportAdvisor: boolean;
}) {
  const openDrawerPreview = useContext(ReportPreviewContext);

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

  return (
    <div className="agent-report-bar" aria-label="导出完整评估报告">
      <span className="agent-report-bar-label">需要发给学生或归档？</span>
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
          <FileText size={13} aria-hidden="true" /> 预览报告
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
  );
}

function Answer({
  turnId,
  result,
  onOthers,
  onSwitchMode2,
  busy,
}: {
  turnId: number;
  result: ScreeningResponse;
  onOthers: () => void;
  onSwitchMode2: () => void;
  busy: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [groupByTier, setGroupByTier] = useState(true);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [highlightedCite, setHighlightedCite] = useState<number | null>(null);
  const highlightTimer = useRef<number | null>(null);

  const view = useMemo(() => buildAdvisorView(result), [result]);
  const citationMap = useMemo(
    () => new Map(view.citations.map((item) => [item.id, item])),
    [view.citations],
  );

  useEffect(() => {
    return () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    };
  }, []);

  const handleJumpCitation = useCallback((id: number) => {
    setSourcesExpanded(true);
    setHighlightedCite(id);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`turn-${turnId}-cite-${id}`);
      if (el) el.scrollIntoView({ behavior: "auto", block: "center" });
    });
    highlightTimer.current = window.setTimeout(() => setHighlightedCite(null), 2000);
  }, [turnId]);

  const { confirmed, pending, other, otherHidden } = result.results;
  const pendingProjects = pending.filter(isCandidate);
  const pendingSchools = pending.filter((card) => !isCandidate(card));
  const otherProjects = other.filter(isCandidate);
  const otherSchools = other.filter((card) => !isCandidate(card));
  const listName = admissionListLabel(result.source);
  const hasRawLocal = confirmed.length > 0 || pending.length > 0 || other.length > 0;
  const rawLocalResults = (
    <>
      {result.otherRequested && (
        <>
          <ResultSection title={admissionGroupLabel(result.source, "other")} cards={otherProjects} />
          <IncompleteResults title="知识库院校资料不足" cards={otherSchools} />
        </>
      )}
      <ResultSection title={admissionGroupLabel(result.source, "partner")} cards={confirmed} />
      <ResultSection title={`${listName} · 条件待核实`} cards={pendingProjects} repeatedStatus="条件待核实" />
      <IncompleteResults title={`${listName} · 资料不足`} cards={pendingSchools} />
      {!result.otherRequested && (
        <>
          <ResultSection title={admissionGroupLabel(result.source, "other")} cards={otherProjects} />
          <IncompleteResults title="知识库院校资料不足" cards={otherSchools} />
        </>
      )}
    </>
  );

  // 1. 纯对话
  if (view.mode === "conversation" && view.followUp) {
    return (
      <div className="agent-answer">
        <p className="agent-advisor-headline">{view.followUp.lead}</p>
      </div>
    );
  }

  // 2. 追问回答（带尾部 [1][2] 可点击溯源）
  if (view.mode === "follow_up" && view.followUp) {
    return (
      <div className="agent-answer">
        <div className="agent-advisor-summary">
          <p className="agent-advisor-headline">
            {view.followUp.lead}
            <CitationLinks
              ids={view.followUp.leadCitationIds}
              citationMap={citationMap}
              turnId={turnId}
              onJumpAnchor={handleJumpCitation}
            />
          </p>
          {view.followUp.details.length > 0 && (
            <ul className="agent-followup-detail">
              {view.followUp.details.map((detail, idx) => (
                <li key={idx}>
                  {detail.text}
                  <CitationLinks
                    ids={detail.citationIds}
                    citationMap={citationMap}
                    turnId={turnId}
                    onJumpAnchor={handleJumpCitation}
                  />
                </li>
              ))}
            </ul>
          )}
          {view.followUp.note && <p className="agent-followup-note">{view.followUp.note}</p>}
          {result.redactedContact && <p className="agent-context-note">{t("输入中的联系方式或证件信息已在发送模型前自动脱敏。")}</p>}
        </div>

        <AdvisorCitationsFooter
          citations={view.citations}
          turnId={turnId}
          expanded={sourcesExpanded}
          highlightedId={highlightedCite}
          onToggleExpand={() => setSourcesExpanded((v) => !v)}
        />

        {(hasRawLocal || otherHidden) && (
          <details className="agent-secondary-drawer">
            <summary>
              <span>{t("查看本轮原始记录")}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            {rawLocalResults}
            {otherHidden && (
              <button type="button" className="agent-other-button" onClick={onOthers} disabled={busy}>
                {t("查看知识库院校")}
              </button>
            )}
          </details>
        )}
      </div>
    );
  }

  // 3. 硬熔断（直指缺口与可行补齐路径）
  if (view.mode === "circuit_breaker" && view.circuitBreakerBanner) {
    return (
      <div className="agent-answer">
        <section className="agent-advisor-stop" aria-label="申请条件暂不达标说明">
          <p className="agent-advisor-headline">{view.headline}</p>
          <p className="agent-advisor-stop-reason">{view.circuitBreakerBanner.reason}</p>

          {view.conditionChecks.length > 0 && (
            <ul className="agent-condition-grid" aria-label="输入条件检索表现">
              {view.conditionChecks.map((check) => (
                <li key={check.dimension} className={`agent-condition-item ${CONDITION_STATUS_CLASS[check.status]}`}>
                  <div className="agent-condition-head">
                    <span className="agent-condition-dot" aria-hidden="true" />
                    <strong>{check.dimension}</strong>
                    <span className="agent-condition-input">{check.input}</span>
                  </div>
                  <p>{check.verdict}</p>
                </li>
              ))}
            </ul>
          )}

          {view.circuitBreakerBanner.actions.length > 0 && (
            <div className="agent-advisor-stop-actions">
              <strong>建议先做这几步：</strong>
              <ul>
                {view.circuitBreakerBanner.actions.map((line, idx) => <li key={idx}>{line}</li>)}
              </ul>
            </div>
          )}
          <p className="agent-advisor-legal">{view.circuitBreakerBanner.legalNotice}</p>
        </section>

        {result.v31Report && (
          <ReportExportBar report={result.v31Report} canExportAdvisor={Boolean(result.canExportAdvisorReport)} />
        )}
      </div>
    );
  }

  // 4. 常规 / 降级 / 模式三：统一的顾问视角三段式回答（条件怎么样 -> 匹配到哪些院校 & 为什么适合 -> 参考来源 [1][2]）
  const hasTiers = view.schools.some((s) => Boolean(s.tier));
  const tiers: AdmissionTier[] = ["REACH", "TARGET", "SAFE"];

  return (
    <div className="agent-answer">
      {/* 第一段：你的条件在检索中怎么样 */}
      <section className="agent-advisor-summary" aria-label="条件检索情况">
        <p className="agent-advisor-headline">{view.headline}</p>
        {view.subline && <p className="agent-advisor-subline">{view.subline}</p>}

        {view.conditionChecks.length > 0 && (
          <ul className="agent-condition-grid" aria-label="各条件在检索中的表现">
            {view.conditionChecks.map((check) => (
              <li key={check.dimension} className={`agent-condition-item ${CONDITION_STATUS_CLASS[check.status]}`}>
                <div className="agent-condition-head">
                  <span className="agent-condition-dot" aria-hidden="true" />
                  <strong>{check.dimension}</strong>
                  <span className="agent-condition-input">{check.input}</span>
                </div>
                <p>{check.verdict}</p>
              </li>
            ))}
          </ul>
        )}

        {view.downgradeLockBanner && (
          <div className="agent-advisor-downgrade">
            <strong>{view.downgradeLockBanner.title}</strong>
            <p>{view.downgradeLockBanner.reason}</p>
            {view.downgradeLockBanner.actions.length > 0 && (
              <ul>
                {view.downgradeLockBanner.actions.map((action, idx) => <li key={idx}>{action}</li>)}
              </ul>
            )}
            {view.downgradeLockBanner.fallbacks.length > 0 && (
              <div className="agent-diagnostic-fallback-grid">
                {view.downgradeLockBanner.fallbacks.map((fb) => (
                  <div className="agent-diagnostic-fallback-card" key={`${fb.schoolName}-${fb.pathway}`}>
                    <div className="agent-diagnostic-fallback-head">
                      <span>{fb.schoolName}</span>
                      <small>{fb.city} · {fb.pathwayLabel}</small>
                    </div>
                    <p>{fb.reason}</p>
                    <p className="agent-diagnostic-fallback-cost">首年参考：{fb.estimatedFirstYearCost}</p>
                  </div>
                ))}
              </div>
            )}
            {view.downgradeLockBanner.legalNotice && (
              <p className="agent-advisor-legal">{view.downgradeLockBanner.legalNotice}</p>
            )}
          </div>
        )}

        {view.nonPartnerWarnings.length > 0 && (
          <div className="agent-excluded-box">
            <strong>非合作院校提醒</strong>
            <ul>
              {view.nonPartnerWarnings.map((w) => <li key={w.school}><strong>{w.school}：</strong>{w.warning}</li>)}
            </ul>
          </div>
        )}

        {(view.eliminatedNotes.length > 0 || view.blockedPartners.length > 0) && (
          <details className="agent-eliminated-toggle">
            <summary>
              <span>已筛除 {view.eliminatedNotes.length + view.blockedPartners.length} 条不符合条件的院校记录（查看原因）</span>
              <ChevronDown size={13} aria-hidden="true" />
            </summary>
            <ul>
              {view.eliminatedNotes.map((note, idx) => <li key={`el-${idx}`}>{note}</li>)}
              {view.blockedPartners.map((b, idx) => <li key={`bp-${idx}`}><strong>{b.school}：</strong>{b.reason}</li>)}
            </ul>
          </details>
        )}

        {result.redactedContact && <p className="agent-context-note">{t("输入中的联系方式或证件信息已在发送模型前自动脱敏。")}</p>}
      </section>

      {/* 第二段：匹配到的院校与具体推荐依据 */}
      {view.schools.length > 0 ? (
        <section className="agent-advisor-matches" aria-label="匹配院校与推荐依据">
          <div className="agent-local-toolbar">
            <span className="agent-local-toolbar-label">
              匹配院校（{view.schools.length} 所
              {hasTiers ? ` · 冲 ${view.counts.reach} · 稳 ${view.counts.target} · 保 ${view.counts.safe}` : ""}
              ）
            </span>
            {hasTiers && view.schools.length > 1 && (
              <div className="agent-view-toggle" role="group" aria-label="展示方式">
                <button type="button" aria-pressed={groupByTier} onClick={() => setGroupByTier(true)}>按冲稳保分层</button>
                <button type="button" aria-pressed={!groupByTier} onClick={() => setGroupByTier(false)}>综合排序</button>
              </div>
            )}
          </div>

          {hasTiers && groupByTier ? (
            <div className="agent-advisor-tier-groups">
              {tiers.map((tierKey) => {
                const items = view.schools.filter((s) => (s.tier ?? "TARGET") === tierKey);
                if (!items.length) return null;
                const meta = tierMeta[tierKey];
                return (
                  <div className="agent-advisor-tier-section" key={tierKey}>
                    <div className="agent-tier-heading">
                      <span className={`agent-tier-badge ${meta.className}`}>{locale === "en" ? meta.en : meta.zh}</span>
                      <span className="agent-tier-desc">{locale === "en" ? meta.descEn : meta.descZh}（{items.length} 所）</span>
                    </div>
                    <div className="agent-advisor-card-list">
                      {items.map((item) => (
                        <AdvisorSchoolCard
                          key={item.key}
                          item={item}
                          citationMap={citationMap}
                          turnId={turnId}
                          onJumpAnchor={handleJumpCitation}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="agent-advisor-card-list">
              {view.schools.map((item) => (
                <AdvisorSchoolCard
                  key={item.key}
                  item={item}
                  citationMap={citationMap}
                  turnId={turnId}
                  onJumpAnchor={handleJumpCitation}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="agent-empty-result">
          <strong>{t("没有找到可直接推荐的院校。")}</strong>
          <p>{t("可以放宽专业、城市或预算，或点击下方查看更多院校。")}</p>
        </div>
      )}

      {/* 仅当用户追问专项政策或触发实质规则时展示 */}
      {view.policyNotes.length > 0 && (
        <section className="agent-policy-box" aria-label="专项问题核查">
          <strong>专项问题核查</strong>
          <div className="agent-policy-list">
            {view.policyNotes.map((note, idx) => (
              <div className="agent-policy-item" key={idx}>
                <h4>{note.title}</h4>
                <p>
                  {note.content}
                  <CitationLinks ids={note.citationIds} citationMap={citationMap} turnId={turnId} onJumpAnchor={handleJumpCitation} />
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 第三段：可点击溯源的文末参考来源 */}
      <AdvisorCitationsFooter
        citations={view.citations}
        turnId={turnId}
        expanded={sourcesExpanded}
        highlightedId={highlightedCite}
        onToggleExpand={() => setSourcesExpanded((v) => !v)}
      />

      {view.nextHint && <p className="agent-narrative-next">{view.nextHint}</p>}

      {/* 底部按需展开工具：历史简章 / 并排对比 / 原始库记录 / 导出报告 */}
      <div className="agent-advisor-tools">
        {view.historicalItems.length > 0 && (
          <details className="agent-secondary-drawer">
            <summary>
              <span>往年简章参考（{view.historicalItems.length} 所 · 目标批次简章暂未发布）</span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <ul className="agent-historical-list">
              {view.historicalItems.map((h, idx) => (
                <li key={`${h.schoolName}-${idx}`}>
                  <strong>{h.schoolName}</strong> · {h.programName}（参考 {h.referenceYear} 批次）：{h.summary}
                  <CitationLinks ids={h.citationIds} citationMap={citationMap} turnId={turnId} onJumpAnchor={handleJumpCitation} />
                </li>
              ))}
            </ul>
          </details>
        )}

        <CandidateComparison result={result} />

        {hasRawLocal && (
          <details className="agent-secondary-drawer">
            <summary>
              <span>{t("查看校内库原始明细")}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            {rawLocalResults}
          </details>
        )}

        <div className="agent-advisor-action-row">
          {view.mode === "partner_quick" && (
            <button type="button" className="agent-other-button" onClick={onSwitchMode2} disabled={busy}>
              切换「合作优先+全网」继续核查更多院校
            </button>
          )}
          {otherHidden && view.mode !== "partner_quick" && (
            <button type="button" className="agent-other-button" onClick={onOthers} disabled={busy}>
              {t("查看校内知识库其他院校")}
            </button>
          )}
        </div>

        {result.v31Report && (
          <ReportExportBar report={result.v31Report} canExportAdvisor={Boolean(result.canExportAdvisorReport)} />
        )}
      </div>
    </div>
  );
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
                                <Answer turnId={turn.id} result={turn.result} busy={busy || index < turns.length - 1}
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

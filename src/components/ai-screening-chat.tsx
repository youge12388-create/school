"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUp, Check, ChevronDown, LoaderCircle, MessageCircle, PencilLine, RotateCcw, ShieldAlert, UserRound } from "lucide-react";
import { criteriaSchema, schoolIdentityKey, type ChatCriteria, type ResultCard } from "@/lib/ai-screening";
import type { ScreeningResponse, SearchEvent, SearchStep } from "@/lib/ai-screening-events";
import type { WorkbookInfo, WorkbookPreview } from "@/lib/ai-screening-workbook";
import { admissionGroupLabel, admissionListLabel, candidateRevision, displayProgramName, isCandidate, outcomeSummary, summarizePoints } from "@/lib/ai-screening-presentation";
import "./ai-screening.css";

type Turn = { id: number; question: string; criteriaBefore: ChatCriteria; sensitiveBefore: boolean; focusBefore: string | null; showOther: boolean; providedCriteria?: ChatCriteria; steps: SearchStep[]; result?: ScreeningResponse; error?: string };
type ConversationSnapshot = { input: string; criteria: ChatCriteria; sensitiveContext: boolean; focusSchool: string | null; turns: Turn[] };
let conversationSnapshot: ConversationSnapshot | null = null;
const PROFILE_STORAGE_KEY = "school-syt.ai-screening-profile.v1";

const degrees: Record<string, string> = { UG: "本科", MASTER: "硕士", PHD: "博士", LONG_TERM: "长期进修", SHORT_TERM: "短期项目" };
const seasons: Record<string, string> = { SPRING: "春季", SUMMER: "夏季", AUTUMN: "秋季", WINTER: "冬季" };

function criteriaLabels(criteria: ChatCriteria) {
  return [
    criteria.programType && degrees[criteria.programType],
    criteria.targetMajor && `${criteria.targetMajor}专业`,
    criteria.teachingLanguage && `${criteria.teachingLanguage === "ENGLISH" ? "英文" : "中文"}授课`,
    criteria.budget != null && `首年预算 ${criteria.budget.toLocaleString("zh-CN")} 元`,
    (criteria.intakeYear != null || criteria.intakeSeason) && `${criteria.intakeYear != null ? `${criteria.intakeYear} 年` : ""}${criteria.intakeSeason ? seasons[criteria.intakeSeason] : ""}入学`,
    criteria.gpa != null && `GPA ${criteria.gpa}${criteria.gpaScale != null ? `/${criteria.gpaScale}` : ""}`,
    criteria.hskLevel != null && `HSK ${criteria.hskLevel} 级${criteria.hskScore != null ? ` ${criteria.hskScore} 分` : ""}`,
    criteria.hskLevel == null && criteria.hskScore != null && `HSK ${criteria.hskScore} 分`,
    criteria.ielts != null && `雅思 ${criteria.ielts}`,
    criteria.toefl != null && `托福 ${criteria.toefl}`,
    criteria.duolingo != null && `多邻国 ${criteria.duolingo}`,
    criteria.hasCsca != null && (criteria.hasCsca ? "已有 CSCA" : "暂无 CSCA"),
    criteria.cscaRequirement && (criteria.cscaRequirement === "NOT_REQUIRED" ? "学校不要求 CSCA" : "学校要求 CSCA"),
    criteria.scholarshipType && (criteria.scholarshipType === "full" ? "需要全额奖学金" : "需要奖学金"),
    criteria.accommodationRequired && "需要住宿",
    criteria.age != null && `${criteria.age} 岁`,
    criteria.province && `${criteria.province}`,
    criteria.city && `${criteria.city}`,
  ].filter((item): item is string => Boolean(item));
}

function draftValue(value: string | number | null | undefined) {
  return value == null ? "" : String(value);
}

function CriteriaBar({ criteria, busy, onApply }: { criteria: ChatCriteria; busy: boolean; onApply: (criteria: ChatCriteria) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const labels = criteriaLabels(criteria);
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
    if (!Object.values(next).some((value) => value != null && value !== "")) return;
    setEditing(false);
    onApply(next);
  }

  if (!labels.length && !editing) return null;
  return <section className="agent-profile" aria-label="当前申请条件">
    <div className="agent-profile-summary">
      <div><strong>当前申请条件</strong>{labels.length > 0 && <div className="agent-criteria">{labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>}</div>
      <button type="button" onClick={openEditor} disabled={busy}><PencilLine size={14} aria-hidden="true" />调整条件</button>
    </div>
    {editing && <form className="agent-profile-form" onSubmit={submit}>
      <label>申请学历<select value={draft.programType} onChange={(event) => change("programType", event.target.value)}><option value="">不限</option><option value="UG">本科</option><option value="MASTER">硕士</option><option value="PHD">博士</option><option value="LONG_TERM">长期进修</option><option value="SHORT_TERM">短期项目</option></select></label>
      <label>目标专业<input value={draft.targetMajor} maxLength={100} onChange={(event) => change("targetMajor", event.target.value)} placeholder="如计算机" /></label>
      <label>授课语言<select value={draft.teachingLanguage} onChange={(event) => change("teachingLanguage", event.target.value)}><option value="">不限</option><option value="ENGLISH">英文</option><option value="CHINESE">中文</option></select></label>
      <label>首年预算（元）<input type="number" min="0" value={draft.budget} onChange={(event) => change("budget", event.target.value)} placeholder="如 80000" /></label>
      <label>入学年份<input type="number" min="2020" max="2100" value={draft.intakeYear} onChange={(event) => change("intakeYear", event.target.value)} placeholder="如 2027" /></label>
      <label>入学季<select value={draft.intakeSeason} onChange={(event) => change("intakeSeason", event.target.value)}><option value="">不限</option><option value="SPRING">春季</option><option value="SUMMER">夏季</option><option value="AUTUMN">秋季</option><option value="WINTER">冬季</option></select></label>
      <label>GPA<input type="number" min="0" step="0.01" value={draft.gpa} onChange={(event) => change("gpa", event.target.value)} placeholder="如 3.5" /></label>
      <label>GPA 满分<input type="number" min="0" step="0.01" value={draft.gpaScale} onChange={(event) => change("gpaScale", event.target.value)} placeholder="如 4" /></label>
      <label>雅思<input type="number" min="0" max="9" step="0.5" value={draft.ielts} onChange={(event) => change("ielts", event.target.value)} placeholder="如 6.5" /></label>
      <label>托福<input type="number" min="0" max="120" value={draft.toefl} onChange={(event) => change("toefl", event.target.value)} placeholder="如 90" /></label>
      <label>多邻国<input type="number" min="0" max="160" value={draft.duolingo} onChange={(event) => change("duolingo", event.target.value)} placeholder="如 120" /></label>
      <label>HSK 等级<input type="number" min="1" max="9" value={draft.hskLevel} onChange={(event) => change("hskLevel", event.target.value)} placeholder="如 5" /></label>
      <label>HSK 分数<input type="number" min="0" max="300" value={draft.hskScore} onChange={(event) => change("hskScore", event.target.value)} placeholder="如 250" /></label>
      <label>CSCA 状态<select value={draft.hasCsca} onChange={(event) => change("hasCsca", event.target.value)}><option value="">未确认</option><option value="true">已有 CSCA</option><option value="false">暂无 CSCA</option></select></label>
      <label>学校 CSCA 要求<select value={draft.cscaRequirement} onChange={(event) => change("cscaRequirement", event.target.value)}><option value="">不限</option><option value="NOT_REQUIRED">只看不要求</option><option value="REQUIRED">只看要求</option></select></label>
      <label>奖学金<select value={draft.scholarshipType} onChange={(event) => change("scholarshipType", event.target.value)}><option value="">不限</option><option value="full">需要全额奖学金</option><option value="any">需要奖学金</option></select></label>
      <label>住宿<select value={draft.accommodationRequired} onChange={(event) => change("accommodationRequired", event.target.value)}><option value="">不限</option><option value="true">需要学校住宿</option><option value="false">不需要住宿</option></select></label>
      <label>年龄<input type="number" min="1" max="120" value={draft.age} onChange={(event) => change("age", event.target.value)} placeholder="如 22" /></label>
      <label>省份<input value={draft.province} maxLength={30} onChange={(event) => change("province", event.target.value)} placeholder="如 北京" /></label>
      <label>城市<input value={draft.city} maxLength={30} onChange={(event) => change("city", event.target.value)} placeholder="如 上海" /></label>
      <div className="agent-profile-actions"><button type="submit" disabled={busy}><Check size={14} aria-hidden="true" />按这些条件重新筛选</button><button type="button" onClick={() => setEditing(false)} disabled={busy}>取消</button><small>条件会自动保存在当前浏览器，也可关联客户档案。</small></div>
    </form>}
  </section>;
}

type CustomerProfile = {
  id: string;
  name: string;
  customerNo: string;
  criteria: ChatCriteria;
};

function ProfileLinker({
  criteria,
  busy,
  onLoad,
}: {
  criteria: ChatCriteria;
  busy: boolean;
  onLoad: (criteria: ChatCriteria) => void;
}) {
  const [customers, setCustomers] = useState<CustomerProfile[] | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const hasCriteria = Object.values(criteria).some(
    (value) => value != null && value !== "",
  );

  async function loadCustomers() {
    if (customers) return;
    try {
      const response = await fetch("/api/ai-screening/profile", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取客户画像失败。");
      setCustomers(data.customers as CustomerProfile[]);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "读取客户画像失败。",
      );
    }
  }

  function applyCustomerProfile() {
    const customer = customers?.find((item) => item.id === customerId);
    if (!customer) return;
    onLoad(customer.criteria);
    const loaded = criteriaLabels(customer.criteria);
    setMessage(
      loaded.length
        ? `已载入 ${customer.name} 的 ${loaded.length} 项条件；点击“调整条件”可继续修改。`
        : `${customer.name} 的档案还没有可用的申请条件。`,
    );
  }

  async function saveProfile() {
    if (!customerId || !hasCriteria || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/ai-screening/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, criteria }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "画像未保存。");
      const customer = customers?.find((item) => item.id === customerId);
      setCustomers((old) =>
        old?.map((item) =>
          item.id === customerId ? { ...item, criteria } : item,
        ) ?? old,
      );
      setMessage(
        `已保存到 ${customer?.name ?? "客户档案"}。${
          data.unsupportedFields?.length
            ? ` ${data.unsupportedFields.join("、")}仍只保存在当前浏览器。`
            : ""
        }`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "画像未保存。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details
      className="agent-profile-link"
      onToggle={(event) => {
        if (event.currentTarget.open) void loadCustomers();
      }}
    >
      <summary>
        <UserRound size={14} aria-hidden="true" />
        关联客户画像
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="agent-profile-link-body">
        <p>
          可把当前条件保存到客户档案，或从已有客户载入。客户档案未覆盖的字段仍只保存在当前浏览器。
        </p>
        <div className="agent-profile-link-actions">
          <label>
            客户
            <select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setMessage("");
              }}
              disabled={saving || busy || customers === null}
            >
              <option value="">
                {customers === null ? "正在读取客户…" : "请选择客户"}
              </option>
              {customers?.map((customer) => (
                <option value={customer.id} key={customer.id}>
                  {customer.name} · {customer.customerNo}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={applyCustomerProfile}
            disabled={!customerId || busy || saving}
          >
            载入条件
          </button>
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={!customerId || !hasCriteria || busy || saving}
          >
            {saving ? "正在保存…" : "保存当前条件"}
          </button>
        </div>
        {customers?.length === 0 && (
          <p>
            还没有客户，可先
            <Link href="/customers/new">新建客户</Link>。
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}

function SearchTrace({ steps, busy }: { steps: SearchStep[]; busy: boolean }) {
  if (!busy) return null;
  const current = [...steps].reverse().find((step) => step.status === "active");
  const message = current?.id === "cooperation" ? "正在检索内部合作院校…" : current?.message ?? (steps.length ? "正在整理选校结果…" : "正在连接选校服务…");
  return <div className="agent-searching" role="status"><LoaderCircle className="agent-spin" size={15} aria-hidden="true" />{message}</div>;
}

function SearchHistory({ steps, source }: { steps: SearchStep[]; source?: string }) {
  if (!steps.length && !source) return null;
  const labels: Record<SearchStep["id"], string> = { understand: "理解需求", cooperation: "合作院校", alternatives: "其他院校", summary: "整理结果" };
  return <details className="agent-history"><summary>查看检索过程与来源 <ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="agent-history-content"><ol>{steps.map((step) => <li key={step.id}><strong>{labels[step.id]}：</strong>{step.status === "active" ? "未完成" : step.message}</li>)}</ol>{source && <p>来源：{source}、学校知识库</p>}</div>
  </details>;
}

function CandidateDetails({ card }: { card: ResultCard }) {
  const { matches, concerns, highlights, firstConcern } = summarizePoints(card.points);
  const tableNotes = card.evidence.filter((item) => item.startsWith("名单第"));
  return <div className="agent-candidate-body">
    <p className="agent-program">{displayProgramName(card.name, card.program)}</p>
    <p className={`agent-verification ${card.verified ? "is-verified" : ""}`}>{card.verified ? "项目资料已人工核实" : "项目资料待人工核实"}</p>
    {isCandidate(card) && highlights.length > 0 && <p className="agent-reason"><strong>匹配：</strong>{highlights.map((point) => point.text).join("；")}</p>}
    {card.kind === "project" && (!isCandidate(card) || !highlights.length) && <p className="agent-reason">核心条件资料不足，暂时无法推荐。</p>}
    {firstConcern && <p className="agent-unresolved"><strong>待确认：</strong>{firstConcern.text}{concerns.length > 1 && `；另 ${concerns.length - 1} 项`}</p>}
    {card.warning.length > 0 && <div className="agent-alert"><ShieldAlert size={15} aria-hidden="true" /><div><strong>敏感信息，需人工核实</strong>{card.warning.some((warning) => warning.startsWith("敏感信息，需人工核实：")) ? <details><summary>查看 {card.warning.length} 条内部注意事项</summary>{card.warning.map((warning, index) => <p key={index}>{warning.replace(/^敏感信息，需人工核实：/, "")}</p>)}</details> : <p>请联系有权限的同事核实。</p>}</div></div>}
    <details className="agent-detail"><summary>查看完整依据 <ChevronDown size={14} aria-hidden="true" /></summary>
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
  const { confirmed, pending, other } = result.results;
  const ordered = result.otherRequested ? [...other, ...confirmed, ...pending] : [...confirmed, ...pending, ...other];
  const seen = new Set<string>();
  const cards = ordered.filter(isCandidate).filter((card) => {
    const key = schoolIdentityKey(card.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
  if (cards.length < 2) return null;
  return <details className="agent-compare">
    <summary><span>并排对比当前 {cards.length} 所候选</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="agent-compare-grid">
      {cards.map((card) => {
        const concern = summarizePoints(card.points).firstConcern;
        return <article className="agent-compare-card" key={card.programId ?? card.name}>
          <div className="agent-compare-heading"><h4>{card.schoolId ? <Link href={`/schools/${encodeURIComponent(card.schoolId)}`}>{card.name}</Link> : card.name}</h4><span className={`agent-verification ${card.verified ? "is-verified" : ""}`}>{card.verified ? "已人工核实" : "待人工核实"}</span></div>
          <p className="agent-program">{displayProgramName(card.name, card.program)}</p>
          <dl>
            <div><dt>首年费用</dt><dd>{comparisonCost(card)}</dd></div>
            <div><dt>申请截止</dt><dd>{comparisonPoint(card, ["申请截止"])}</dd></div>
            <div><dt>入学批次</dt><dd>{comparisonPoint(card, ["入学季", "入学年份"])}</dd></div>
            <div><dt>语言要求</dt><dd>{comparisonLanguage(card)}</dd></div>
            <div><dt>主要待确认</dt><dd>{concern?.text ?? "资料尚未发现明确冲突"}</dd></div>
            <div><dt>合作状态</dt><dd>{card.cooperation === "project_confirmed" ? "项目合作已记录" : card.cooperation === "listed" ? "学校在合作名单" : card.cooperation === "not_cooperating" ? "名单标注不合作" : "合作状态待核"}</dd></div>
          </dl>
        </article>;
      })}
    </div>
    <p className="agent-compare-note">对比只使用当前可核验资料；费用、截止日期和开班批次仍需按目标招生季确认。</p>
  </details>;
}

function ResultSection({ title, cards, repeatedStatus, hideHeading = false }: { title: string; cards: ResultCard[]; repeatedStatus?: string; hideHeading?: boolean }) {
  if (!cards.length) return null;
  const groups = new Map<string, ResultCard[]>();
  cards.forEach((card) => {
    const key = schoolIdentityKey(card.name);
    groups.set(key, [...(groups.get(key) ?? []), card]);
  });
  const schools = [...groups.entries()];
  const renderSchool = ([name, items]: [string, ResultCard[]]) => <article className="agent-result" key={name}>
    <div className="agent-result-heading"><h4>{items[0].schoolId ? <Link href={`/schools/${encodeURIComponent(items[0].schoolId)}`}>{name}</Link> : name}</h4>{items[0].fit !== repeatedStatus && <span className={`agent-status ${items[0].fit === "已知条件符合" ? "agent-status-good" : ""}`}>{items[0].fit === "合作及招生条件待核实" ? "合作待核实" : items[0].fit === "合作不可用或存在冲突，需核实" ? "合作状态有冲突" : items[0].fit}</span>}</div>
    <CandidateDetails card={items[0]} />
    {items.length > 1 && <details className="agent-extra-programs"><summary>查看该校另外 {items.length - 1} 个项目 <ChevronDown size={14} aria-hidden="true" /></summary>{items.slice(1).map((card, index) => <CandidateDetails key={`${card.program}-${index}`} card={card} />)}</details>}
  </article>;
  return <section className="agent-results">{!hideHeading && <div className="agent-section-title"><h3>{title}</h3><span>{schools.length} 所</span></div>}
    <div className="agent-result-list">{schools.slice(0, 3).map(renderSchool)}{schools.length > 3 && <details className="agent-more"><summary>查看另外 {schools.length - 3} 所学校 <ChevronDown size={15} aria-hidden="true" /></summary><div className="agent-result-list">{schools.slice(3).map(renderSchool)}</div></details>}</div>
  </section>;
}

function IncompleteResults({ title, cards }: { title: string; cards: ResultCard[] }) {
  if (!cards.length) return null;
  return <details className="agent-incomplete"><summary><span>{title}（{new Set(cards.map((card) => schoolIdentityKey(card.name))).size}）</span><ChevronDown size={16} aria-hidden="true" /></summary><ResultSection title={title} cards={cards} hideHeading /></details>;
}

function NarrativeSchoolGroups({ result }: { result: ScreeningResponse }) {
  const highlights = result.narrative?.highlights ?? [];
  if (!highlights.length) return null;
  const cardBySchool = new Map<string, ResultCard>();
  for (const card of [...result.results.confirmed, ...result.results.pending, ...result.results.other]) {
    if (card.schoolId) cardBySchool.set(schoolIdentityKey(card.name), card);
  }
  const groups = [
    { key: "partner", title: admissionGroupLabel(result.source, "partner"), items: highlights.filter((item) => item.group === "partner") },
    { key: "other", title: admissionGroupLabel(result.source, "other"), items: highlights.filter((item) => item.group === "other" && !item.notCooperating) },
    { key: "blocked", title: `${admissionListLabel(result.source)} · 标注不合作`, items: highlights.filter((item) => item.notCooperating) },
  ].filter((group) => group.items.length > 0);
  return <div className="agent-school-groups">{groups.map((group) => <section className="agent-school-group" data-kind={group.key} key={group.key} aria-label={group.title}>
    <h3>{group.title}</h3>
    <div className="agent-school-list">{group.items.map((item, index) => {
      const card = cardBySchool.get(schoolIdentityKey(item.name));
      return <article className="agent-school-item" key={`${item.name}-${index}`}>
        <div className="agent-school-heading"><h4>{card?.schoolId ? <Link href={`/schools/${encodeURIComponent(card.schoolId)}`}>{item.name}</Link> : item.name}</h4>
          {item.attention && <span className="agent-school-risk"><ShieldAlert size={14} aria-hidden="true" />需内部核实</span>}
        </div>
        <p>{item.body}</p>
      </article>;
    })}</div>
  </section>)}</div>;
}

function Answer({ result, onOthers, busy }: { result: ScreeningResponse; onOthers: () => void; busy: boolean }) {
  const { confirmed, pending, other, otherHidden } = result.results;
  const conditions = criteriaLabels(result.criteria);
  const pendingProjects = pending.filter(isCandidate);
  const pendingSchools = pending.filter((card) => !isCandidate(card));
  const otherProjects = other.filter(isCandidate);
  const otherSchools = other.filter((card) => !isCandidate(card));
  const listName = admissionListLabel(result.source);
  const otherResults = <><ResultSection title={admissionGroupLabel(result.source, "other")} cards={otherProjects} /><IncompleteResults title="知识库院校资料不足" cards={otherSchools} /></>;
  if (result.answer) return <div className="agent-answer"><div className="agent-answer-intro"><p className="agent-outcome">{result.answer.lead}</p>{result.answer.details.length > 0 && <p className="agent-followup-detail">{result.answer.details.join(" ")}</p>}{result.answer.note && <p className="agent-followup-note">{result.answer.note}</p>}{result.sensitiveContext && <p className="agent-context-note">生源相关限制未自动筛选，请人工核实。</p>}</div>{(confirmed.length > 0 || pending.length > 0 || other.length > 0 || otherHidden) && <details className="agent-incomplete"><summary><span>查看本轮依据</span><ChevronDown size={16} aria-hidden="true" /></summary>{result.otherRequested && otherResults}<ResultSection title={admissionGroupLabel(result.source, "partner")} cards={confirmed} /><ResultSection title={`${listName} · 条件待核实`} cards={pendingProjects} repeatedStatus="条件待核实" /><IncompleteResults title={`${listName} · 资料不足`} cards={pendingSchools} />{!result.otherRequested && otherResults}{otherHidden && <button type="button" className="agent-other-button" onClick={onOthers} disabled={busy}>查看知识库院校</button>}</details>}</div>;
  if (result.narrative) return <div className="agent-answer">
    <div className="agent-answer-intro"><p className="agent-outcome">{result.narrative.lead}</p>
      {result.sensitiveContext && <p className="agent-context-note">生源相关限制未自动筛选，请人工核实。</p>}
    </div>
    <CandidateComparison result={result} />
    <NarrativeSchoolGroups result={result} />
    {result.narrative.next && <p className="agent-narrative-next">{result.narrative.next}</p>}
    {(confirmed.length > 0 || pending.length > 0 || other.length > 0) && <details className="agent-narrative-results"><summary>查看全部依据 <ChevronDown size={15} aria-hidden="true" /></summary>
      {conditions.length > 0 && <div className="agent-criteria" aria-label="已识别的申请条件">{conditions.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>}
      {result.otherRequested && otherResults}<ResultSection title={admissionGroupLabel(result.source, "partner")} cards={confirmed} /><ResultSection title={`${listName} · 条件待核实`} cards={pendingProjects} repeatedStatus="条件待核实" /><IncompleteResults title={`${listName} · 资料不足`} cards={pendingSchools} />{!result.otherRequested && otherResults}
    </details>}
    {otherHidden && <button type="button" className="agent-other-button" onClick={onOthers} disabled={busy}>查看知识库院校</button>}
  </div>;
  return <div className="agent-answer">
    <div className="agent-answer-intro"><p className="agent-outcome">{outcomeSummary(result)}</p>
      {conditions.length > 3 ? <details className="agent-conditions"><summary aria-label={`查看全部 ${conditions.length} 项匹配条件`}>{conditions.slice(0, 3).join(" · ")} 等 {conditions.length} 项条件 <ChevronDown size={14} aria-hidden="true" /></summary><div className="agent-criteria" aria-label="已识别的申请条件">{conditions.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></details> : conditions.length > 0 && <p className="agent-conditions-line">{conditions.join(" · ")}</p>}
      {result.sensitiveContext && <p className="agent-context-note">生源相关限制未自动筛选，请人工核实。</p>}
    </div>
    <CandidateComparison result={result} />
    {result.otherRequested && otherResults}
    <ResultSection title={admissionGroupLabel(result.source, "partner")} cards={confirmed} />
    <ResultSection title={`${listName} · 条件待核实`} cards={pendingProjects} repeatedStatus="条件待核实" />
    <IncompleteResults title={`${listName} · 资料不足`} cards={pendingSchools} />
    {!result.otherRequested && otherResults}
    {!confirmed.length && !pending.length && !other.length && <div className="agent-empty-result"><strong>没有找到可展示的院校。</strong><p>试试放宽专业、预算或入学时间。</p></div>}
    {otherHidden && <button type="button" className="agent-other-button" onClick={onOthers} disabled={busy}>查看知识库院校</button>}
    {result.prompt.startsWith("想进一步") && <p className="agent-follow-up">{result.prompt}</p>}
  </div>;
}

function PlanBuilder({ result, disabled }: { result: ScreeningResponse; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string; customerNo: string }[] | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState(`${result.criteria.intakeYear ? `${result.criteria.intakeYear} 年` : ""}选校方案`);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [customerAttempt, setCustomerAttempt] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ id: string; customerId: string } | null>(null);
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const { confirmed, pending, other } = result.results;
  const partner = [...confirmed, ...pending].filter(isCandidate);
  const alternatives = other.filter(isCandidate);
  const seen = new Set<string>();
  const choices = (result.otherRequested ? [...alternatives, ...partner] : [...partner, ...alternatives]).filter((card) => {
    if (!card.programId || seen.has(card.programId)) return false;
    seen.add(card.programId);
    return true;
  });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch("/api/ai-screening/recommendations", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("无法读取客户列表，请稍后重试。");
      const data = await response.json() as { customers: { id: string; name: string; customerNo: string }[] };
      setCustomers(data.customers); setError("");
    }).catch((cause) => { if (cause instanceof Error && cause.name !== "AbortError") setError(cause.message); });
    return () => controller.abort();
  }, [open, customerAttempt]);

  if (!choices.length) return null;

  function changeSelection(id: string, checked: boolean) {
    requestId.current = null; setSaved(null); setError("");
    setSelected((old) => checked ? [...old, id] : old.filter((item) => item !== id));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !customerId || !title.trim() || !selected.length) return;
    submitting.current = true; setSaving(true); setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/ai-screening/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        requestId: requestId.current, customerId, title: title.trim(), criteria: result.criteria, source: result.source,
        showOther: alternatives.length > 0 || result.otherRequested,
        items: choices.filter((card) => selected.includes(card.programId!)).map((card) => ({ programId: card.programId, revision: candidateRevision(card) })),
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "方案未保存，请重试。");
      setSaved({ id: data.id, customerId: data.customerId });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "方案未保存，请重试。"); }
    finally { submitting.current = false; setSaving(false); }
  }

  return <details className="agent-plan" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>整理并保存选校方案 <ChevronDown size={15} aria-hidden="true" /></summary>
    <form onSubmit={save} className="agent-plan-form">
      <fieldset><legend>选择项目</legend><div className="agent-plan-choices">{choices.map((card) => <label className="agent-plan-choice" key={card.programId}>
        <input type="checkbox" checked={selected.includes(card.programId!)} onChange={(event) => changeSelection(card.programId!, event.target.checked)} disabled={saving || disabled || (selected.length >= 30 && !selected.includes(card.programId!))} />
        <span><strong>{card.name}</strong><span>{displayProgramName(card.name, card.program)} · {card.cooperation === "not_cooperating" ? "名单标注不合作" : card.cooperation === "unknown" ? "其他院校" : "合作名单"} · {card.fit}</span></span>
      </label>)}</div></fieldset>
      <div className="agent-plan-fields"><label>保存到客户<select value={customerId} required disabled={saving || disabled || customers === null} onChange={(event) => { requestId.current = null; setSaved(null); setCustomerId(event.target.value); }}><option value="">{customers === null ? "正在读取客户…" : "请选择客户"}</option>{customers?.map((customer) => <option value={customer.id} key={customer.id}>{customer.name} · {customer.customerNo}</option>)}</select></label>
        <label>方案名称<input value={title} maxLength={80} required disabled={saving || disabled} onChange={(event) => { requestId.current = null; setSaved(null); setTitle(event.target.value); }} /></label></div>
      {customers?.length === 0 && <p>还没有客户，可先<Link href="/customers/new">新建客户</Link>。</p>}
      {selected.length >= 30 && <p>每份方案最多选择 30 个项目。</p>}
      <button type="submit" disabled={saving || disabled || !customerId || !selected.length || !title.trim()}>{saving ? "正在保存…" : `保存方案${selected.length ? `（${selected.length}）` : ""}`}</button>
      {error && <p className="agent-plan-error" role="alert">{error}</p>}
      {error && customers === null && <button type="button" onClick={() => { setError(""); setCustomerAttempt((value) => value + 1); }}>重新读取客户</button>}
      {saved && <p className="agent-plan-success" role="status">已保存。<Link href={`/recommendations/${saved.id}/print`}>查看并打印方案</Link> <Link href={`/customers/${saved.customerId}`}>打开客户档案</Link></p>}
    </form>
  </details>;
}

function WorkbookManager({ canManage, refreshKey }: { canManage: boolean; refreshKey: number }) {
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
    <details><summary>{canManage ? "管理合作名单" : "查看合作名单"} <ChevronDown size={14} aria-hidden="true" /></summary>
      <p>当前名单：{info ? info.available ? info.name : "暂不可用" : "正在读取…"}</p>
      {canManage && <div className="agent-workbook-form"><p>更新后所有顾问使用新名单，原文件与历史版本保留。</p>
        <label htmlFor="agent-workbook-file">选择 Excel 名单（.xlsx，最大 10 MB）</label>
        <input ref={fileRef} id="agent-workbook-file" type="file" accept=".xlsx" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setMessage(""); }} disabled={busy} />
        {preview && <div className="agent-workbook-preview" role="status"><strong>识别到 {preview.schools} 所院校、{preview.rows} 条记录</strong><p>{preview.added == null ? "当前名单无法对比，请仔细核对。" : `与当前名单相比：新增 ${preview.added} 所，移除 ${preview.removed} 所。`} {preview.notCooperating > 0 && `${preview.notCooperating} 所标记不合作。`}</p>{preview.missingColumns.length > 0 && <p>未识别到“{preview.missingColumns.join("、")}”列，相关信息将按未知处理。</p>}</div>}
        <div className="agent-workbook-actions">{!preview ? <button type="button" onClick={() => void update("preview")} disabled={!info || !file || busy}>检查名单</button> : <button type="button" onClick={() => void update("update")} disabled={busy}>确认更新名单</button>}
          {info?.canRestore && !confirmRestore && <button type="button" onClick={() => setConfirmRestore(true)} disabled={busy}>恢复上一版</button>}
          {info?.canRestore && confirmRestore && <><button type="button" onClick={() => void update("restore")} disabled={busy}>确认恢复上一版</button><button type="button" onClick={() => setConfirmRestore(false)} disabled={busy}>取消</button></>}
        </div>
      </div>}
    </details>
    {message && <p role="status" className="agent-workbook-message">{message}</p>}
  </div>;
}

export function AiScreeningChat({ canManageWorkbook }: { canManageWorkbook: boolean }) {
  const [input, setInput] = useState("");
  const [criteria, setCriteria] = useState<ChatCriteria>({});
  const [sensitiveContext, setSensitiveContext] = useState(false);
  const [focusSchool, setFocusSchool] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const running = useRef(false);
  const lastScrolled = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latest = turns[turns.length - 1];
  const snapshotRef = useRef<ConversationSnapshot>({ input, criteria, sensitiveContext, focusSchool, turns });
  const restoring = useRef(false);
  const profileRestored = useRef(false);

  useEffect(() => {
    if (conversationSnapshot) {
      const saved = conversationSnapshot;
      restoring.current = true;
      snapshotRef.current = saved;
      queueMicrotask(() => {
        setInput(saved.input); setCriteria(saved.criteria); setSensitiveContext(saved.sensitiveContext); setFocusSchool(saved.focusSchool); setTurns(saved.turns);
        sequence.current = Math.max(0, ...saved.turns.map((turn) => turn.id));
        restoring.current = false;
      });
    } else {
      try {
        const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
        const parsed = raw ? criteriaSchema.safeParse(JSON.parse(raw)) : null;
        if (parsed?.success) queueMicrotask(() => setCriteria(parsed.data));
      } catch {
        window.localStorage.removeItem(PROFILE_STORAGE_KEY);
      }
    }
    profileRestored.current = true;
    return () => { conversationSnapshot = snapshotRef.current; };
  }, []);

  useEffect(() => {
    if (!restoring.current) snapshotRef.current = { input, criteria, sensitiveContext, focusSchool, turns };
  }, [input, criteria, sensitiveContext, focusSchool, turns]);

  useEffect(() => {
    if (!profileRestored.current) return;
    try {
      if (Object.values(criteria).some((value) => value != null && value !== "")) {
        window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(criteria));
      }
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }, [criteria]);

  useEffect(() => {
    if ((!latest?.result && !latest?.error) || latest.id === lastScrolled.current) return;
    lastScrolled.current = latest.id;
    document.getElementById(`agent-turn-${latest.id}`)?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [latest]);

  async function run(message: string, previous: ChatCriteria, showOther = false, previousSensitive = sensitiveContext, previousFocus = focusSchool, providedCriteria: ChatCriteria | null = null) {
    if (!message.trim() || running.current) return;
    running.current = true;
    const id = ++sequence.current;
    setBusy(true);
    setTurns((old) => [...old, { id, question: message, criteriaBefore: previous, sensitiveBefore: previousSensitive, focusBefore: previousFocus, showOther, providedCriteria: providedCriteria ?? undefined, steps: [] }]);
    const update = (fn: (turn: Turn) => Turn) => setTurns((old) => old.map((turn) => turn.id === id ? fn(turn) : turn));
    let receivedResult = false;
    try {
      const lastResult = [...turns].reverse().find((turn) => turn.result?.source)?.result;
      const lastNarrative = [...turns].reverse().find((turn) => turn.result?.narrative)?.result?.narrative;
      const previousProgramIds = providedCriteria ? [] : lastNarrative?.highlights.flatMap((item) => item.programId ? [item.programId] : []) ?? [];
      const seenProgramIds = providedCriteria ? [] : [...new Set(turns.flatMap((turn) => turn.result?.shown?.programIds ?? []))].slice(-200);
      const seenSchoolNames = providedCriteria ? [] : [...new Set(turns.flatMap((turn) => turn.result?.shown?.schoolNames ?? []))].slice(-200);
      const history = providedCriteria ? [] : turns.filter((turn) => turn.result).flatMap((turn) => [
        { role: "user" as const, content: turn.question.slice(0, 500) },
        ...(turn.result?.conversation && turn.result.answer?.lead ? [{ role: "assistant" as const, content: turn.result.answer.lead.slice(0, 500) }] : []),
      ]).slice(-8);
      const response = await fetch("/api/ai-screening", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ message, criteria: providedCriteria ?? previous, ...(providedCriteria ? { criteriaOverride: providedCriteria } : {}), showOther: providedCriteria ? false : showOther, sensitiveContext: previousSensitive, hasPrevious: providedCriteria ? false : Boolean(lastResult), previousOtherRequested: providedCriteria ? false : lastResult?.otherRequested ?? false, focusSchool: providedCriteria ? null : previousFocus, previousProgramIds, seenProgramIds, seenSchoolNames, history }) });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || "请求没有完成，请重试。"); }
      if (!response.body) throw new Error("没有收到完整的检索结果，请重试。");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as SearchEvent;
        if (event.type === "progress") update((turn) => ({ ...turn, steps: [...turn.steps.filter((step) => step.id !== event.step.id), event.step] }));
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "result") { receivedResult = true; setCriteria(event.result.criteria); setSensitiveContext(event.result.sensitiveContext); setFocusSchool(event.result.focusSchool ?? null); update((turn) => ({ ...turn, result: event.result })); }
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
      const message = error instanceof Error && !/failed to fetch|networkerror|load failed|unexpected token|json/i.test(error.message) ? error.message : "暂时无法连接选校服务，请检查网络后重试。";
      update((turn) => ({ ...turn, error: message }));
    } finally { running.current = false; setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    void run(message, criteria);
  }

  return <div className="agent-page">
    <div className="agent-heading"><div className="agent-title-row"><MessageCircle aria-hidden="true" /><h1>AI 选校</h1></div><button type="button" className="agent-reset" onClick={() => { setTurns([]); setCriteria({}); setSensitiveContext(false); setFocusSchool(null); setInput(""); try { window.localStorage.removeItem(PROFILE_STORAGE_KEY); } catch {} inputRef.current?.focus(); }} disabled={busy}><RotateCcw size={15} aria-hidden="true" />新对话</button></div>
    <div className="agent-privacy">请使用脱敏信息，勿输入姓名、联系方式或证件信息；当前及近期对话会发送至 AI 服务。</div>
    <WorkbookManager canManage={canManageWorkbook} refreshKey={latest?.result ? latest.id : 0} />
    <CriteriaBar criteria={criteria} busy={busy} onApply={(next) => { setCriteria(next); void run("按已更新的申请条件重新筛选。", criteria, false, sensitiveContext, focusSchool, next); }} />
    <ProfileLinker criteria={criteria} busy={busy} onLoad={setCriteria} />
    {turns.length === 0 && <div className="agent-empty"><h2>告诉我学生想申请什么</h2><p>输入学历、专业、预算等，条件不全也可以先查。我会先查合作院校，必要时再查其他院校。</p><button type="button" onClick={() => { setInput("想申请英文授课的计算机硕士，雅思 6.5，首年预算 8 万，2027 年春季入学。"); inputRef.current?.focus(); }}>填入示例需求</button></div>}
    <div className="agent-conversation" aria-live="polite">{turns.map((turn, index) => <div id={`agent-turn-${turn.id}`} className="agent-turn" key={turn.id}><p className="agent-user">{turn.question}</p><div className="agent-response"><SearchTrace steps={turn.steps} busy={busy && index === turns.length - 1} />{turn.error && <div className="agent-error" role="alert"><strong>这次没有完成</strong><p>{turn.error}</p><div className="agent-error-actions">{!/移除|输入内容无效/.test(turn.error) && <button type="button" onClick={() => void run(turn.question, turn.criteriaBefore, turn.showOther, turn.sensitiveBefore, turn.focusBefore, turn.providedCriteria ?? null)} disabled={busy}>重新试一次</button>}<button type="button" onClick={() => { setInput(turn.question); inputRef.current?.focus(); }} disabled={busy}>修改输入</button></div></div>}{turn.result && <Answer result={turn.result} busy={busy || index < turns.length - 1} onOthers={() => void run("请查看其他院校", turn.result!.criteria, true, turn.result!.sensitiveContext)} />}{turn.result && <div className="agent-answer-footer"><SearchHistory steps={turn.steps} source={turn.result.source} />{index === turns.length - 1 && <PlanBuilder result={turn.result} disabled={busy} />}</div>}{!turn.result && turn.error && <SearchHistory steps={turn.steps} source={undefined} />}</div></div>)}</div>
    <form className="agent-composer" onSubmit={submit}><label className="sr-only" htmlFor="agent-input">输入学生申请需求</label><span className="sr-only" id="agent-input-help">按 Enter 发送，按 Shift 加 Enter 换行。</span><textarea ref={inputRef} id="agent-input" aria-describedby="agent-input-help" value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入学生的申请需求…" rows={1} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" disabled={busy || !input.trim()} aria-label="发送"><ArrowUp size={19} /></button></form>
  </div>;
}

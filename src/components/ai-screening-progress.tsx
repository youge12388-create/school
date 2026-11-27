"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, ExternalLink, Globe, LoaderCircle, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { SearchStep, SearchStepId, SearchStepMetrics } from "@/lib/ai-screening-events";

const STEP_ORDER: SearchStepId[] = ["understand", "cooperation", "alternatives", "external", "verify", "summary"];

const STEP_LABELS: Record<SearchStepId, string> = {
  understand: "解析申请条件",
  cooperation: "检索合作院校名单",
  alternatives: "检索校内院校库",
  external: "全网检索匹配院校",
  verify: "直连高校官网核实信息",
  summary: "整理匹配依据与来源",
};

function formatElapsed(ms: number): string {
  const sec = Math.max(0, ms) / 1000;
  return sec < 10 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`;
}

export function LiveResearchProgress({
  steps,
  busy,
  startedAt,
  durationMs,
  source,
}: {
  steps: SearchStep[];
  busy: boolean;
  startedAt?: number;
  durationMs?: number;
  source?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [busy]);

  const elapsedMs = useMemo(() => {
    if (!busy && typeof durationMs === "number" && durationMs > 0) return durationMs;
    if (startedAt) return Math.max(0, now - startedAt);
    return 0;
  }, [busy, durationMs, now, startedAt]);

  const orderedSteps = useMemo(() => {
    const byId = new Map<SearchStepId, SearchStep>();
    for (const s of steps) byId.set(s.id, s);
    return STEP_ORDER.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  }, [steps]);

  const activeStep = useMemo(
    () => [...orderedSteps].reverse().find((s) => s.status === "active") ?? orderedSteps[orderedSteps.length - 1],
    [orderedSteps],
  );

  const mergedMetrics = useMemo<SearchStepMetrics>(() => {
    const m: SearchStepMetrics = {};
    for (const s of orderedSteps) {
      if (!s.metrics) continue;
      Object.assign(m, s.metrics);
    }
    return m;
  }, [orderedSteps]);

  const allQueries = useMemo(() => {
    const list: string[] = [];
    for (const s of orderedSteps) {
      if (s.queries?.length) list.push(...s.queries);
    }
    return [...new Set(list)].slice(0, 6);
  }, [orderedSteps]);

  const verifyStep = useMemo(() => orderedSteps.find((s) => s.id === "verify"), [orderedSteps]);

  const progressPercent = useMemo(() => {
    if (!busy) return 100;
    const base = Math.max(8, ...orderedSteps.map((s) => s.progress ?? 0));
    // Gentle visual pulse up to +6% while waiting on long web search / official fetch steps.
    const stepStarted = activeStep?.timestamp ?? startedAt ?? now;
    const waitSec = Math.max(0, (now - stepStarted) / 1000);
    const creep = Math.min(7, Math.floor(waitSec * 0.7));
    return Math.min(96, base + creep);
  }, [activeStep?.timestamp, busy, now, orderedSteps, startedAt]);

  if (!busy && !orderedSteps.length && !source) return null;

  const metricPills = [
    mergedMetrics.partners != null && mergedMetrics.partners > 0 ? `合作校 ${mergedMetrics.partners}` : null,
    mergedMetrics.localKb != null && mergedMetrics.localKb > 0 ? `知识库 ${mergedMetrics.localKb}` : null,
    mergedMetrics.factDb != null && mergedMetrics.factDb > 0 ? `官网事实库 ${mergedMetrics.factDb}` : null,
    mergedMetrics.webPrograms != null && mergedMetrics.webPrograms > 0 ? `联网候选 ${mergedMetrics.webPrograms}` : null,
    mergedMetrics.verifiedSites != null && mergedMetrics.verifiedSites > 0 ? `官网核实 ${mergedMetrics.verifiedSites} 所` : null,
    mergedMetrics.persistedFacts != null && mergedMetrics.persistedFacts > 0 ? `新沉淀 ${mergedMetrics.persistedFacts} 条` : null,
  ].filter((x): x is string => Boolean(x));

  // Completed compact summary capsule (expandable to inspect full research trace)
  if (!busy) {
    const queryCount = allQueries.length;
    const verifiedCount = mergedMetrics.verifiedSites ?? 0;
    const summaryText = [
      "已完成选校检索",
      elapsedMs > 0 ? `耗时 ${formatElapsed(elapsedMs)}` : null,
      queryCount > 0 ? `全网搜索 ${queryCount} 组词` : null,
      verifiedCount > 0 ? `直连核验 ${verifiedCount} 所官网` : null,
    ].filter(Boolean).join(" · ");

    return (
      <div className={`agent-progress-card is-complete${expanded ? " is-open" : ""}`}>
        <button
          type="button"
          className="agent-progress-summary-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="agent-progress-summary-left">
            <ShieldCheck size={15} className="agent-progress-ok-icon" aria-hidden="true" />
            <span className="agent-progress-summary-title">{summaryText}</span>
            {metricPills.slice(0, 3).map((pill) => (
              <span className="agent-progress-mini-pill" key={pill}>{pill}</span>
            ))}
          </span>
          <ChevronDown size={15} className={`agent-progress-chevron${expanded ? " is-rotated" : ""}`} aria-hidden="true" />
        </button>

        {expanded && (
          <div className="agent-progress-body">
            <ol className="agent-timeline">
              {orderedSteps.map((step) => (
                <li key={step.id} data-stage={step.status}>
                  <span className="agent-timeline-icon" aria-hidden="true">
                    {step.status === "done" ? <CheckCircle2 size={14} /> :
                      step.status === "warning" ? <AlertTriangle size={14} /> :
                      <span className="agent-stage-dot" />}
                  </span>
                  <div className="agent-timeline-content">
                    <div className="agent-timeline-head">
                      <strong>{STEP_LABELS[step.id]}</strong>
                      <span>{step.status === "active" ? "未完成" : step.message}</span>
                    </div>
                    {step.queries && step.queries.length > 0 && (
                      <div className="agent-query-chips">
                        {step.queries.slice(0, 5).map((q) => (
                          <span className="agent-query-chip" key={q}><Search size={11} aria-hidden="true" />{q}</span>
                        ))}
                      </div>
                    )}
                    {step.items && step.items.length > 0 && (
                      <div className="agent-verify-chips">
                        {step.items.map((item) => (
                          <span className={`agent-verify-chip is-${item.status}`} key={item.label}>
                            {item.url ? (
                              <a href={item.url} target="_blank" rel="noopener noreferrer">
                                {item.label} <ExternalLink size={10} aria-hidden="true" />
                              </a>
                            ) : item.label}
                            {item.note && <small> · {item.note}</small>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {source && (
              <p className="agent-progress-source">
                数据来源：{source}、学校知识库{orderedSteps.some((s) => s.id === "external" && s.status === "done") ? "、DeepSeek 全网检索与 .edu.cn 官网核验" : ""}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Live running research console
  const activeHeadline = activeStep?.message || "正在连接智能选校引擎…";

  return (
    <section className="agent-progress-card is-running" aria-label="实时选校进度" role="status" aria-live="polite">
      <div className="agent-progress-live-head">
        <div className="agent-progress-live-title">
          <span className="agent-live-pulse" aria-hidden="true" />
          <strong>{activeHeadline}</strong>
        </div>
        <div className="agent-progress-live-meta">
          <span className="agent-progress-timer"><Clock size={12} aria-hidden="true" /> {formatElapsed(elapsedMs)}</span>
          <span className="agent-progress-pct">{progressPercent}%</span>
        </div>
      </div>

      <div className="agent-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
        <div className="agent-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      {metricPills.length > 0 && (
        <div className="agent-progress-metrics">
          {metricPills.map((pill) => (
            <span className="agent-progress-metric-badge" key={pill}>
              <Sparkles size={11} aria-hidden="true" /> {pill}
            </span>
          ))}
        </div>
      )}

      <ol className="agent-timeline">
        {orderedSteps.map((step) => (
          <li key={step.id} data-stage={step.status}>
            <span className="agent-timeline-icon" aria-hidden="true">
              {step.status === "active" ? <LoaderCircle size={14} className="agent-spin" /> :
                step.status === "done" ? <CheckCircle2 size={14} /> :
                step.status === "warning" ? <AlertTriangle size={14} /> :
                <span className="agent-stage-dot" />}
            </span>
            <div className="agent-timeline-content">
              <div className="agent-timeline-head">
                <strong>{STEP_LABELS[step.id]}</strong>
                <span>{step.message}</span>
              </div>
              {step.queries && step.queries.length > 0 && (
                <div className="agent-query-chips">
                  {step.queries.slice(0, 5).map((q) => (
                    <span className="agent-query-chip" key={q}><Search size={11} aria-hidden="true" />{q}</span>
                  ))}
                </div>
              )}
              {step.id === "verify" && verifyStep?.items && verifyStep.items.length > 0 && (
                <div className="agent-verify-chips">
                  {verifyStep.items.map((item) => (
                    <span className={`agent-verify-chip is-${item.status}`} key={item.label}>
                      {item.status === "running" ? <LoaderCircle size={11} className="agent-spin" aria-hidden="true" /> : <Globe size={11} aria-hidden="true" />}
                      <span>{item.label}</span>
                      {item.note && <small> · {item.note}</small>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

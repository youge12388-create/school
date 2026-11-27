"use client";

import { Check, CircleAlert, LoaderCircle, Trash2 } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import type { SearchGovernanceConfig, SearchGovernanceStatus } from "@/lib/ai-search-governance";
import { useT, useTv } from "@/lib/i18n/locale-context";

type ActionIntent = "save" | "clear_cache" | "test_search";
type Feedback = { tone: "success" | "error"; message: string };

export function AiSearchGovernanceForm({ initial }: { initial: SearchGovernanceStatus }) {
  const t = useT();
  const tv = useTv();
  const [status, setStatus] = useState<SearchGovernanceStatus>(initial);
  const [draft, setDraft] = useState<SearchGovernanceConfig>(initial.config);
  const [pending, setPending] = useState<ActionIntent | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const submitting = useRef(false);

  const changed =
    draft.externalEnabled !== status.config.externalEnabled
    || draft.webSearchEnabled !== status.config.webSearchEnabled
    || draft.dailySearchLimit !== status.config.dailySearchLimit
    || draft.cacheTtlHours !== status.config.cacheTtlHours;

  async function runAction(intent: ActionIntent) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(intent);
    setFeedback(null);
    try {
      const payload = intent === "save"
        ? {
            intent: "save" as const,
            externalEnabled: draft.externalEnabled,
            webSearchEnabled: draft.webSearchEnabled,
            dailySearchLimit: Number.isFinite(draft.dailySearchLimit)
              ? Math.max(0, Math.min(50000, Math.trunc(draft.dailySearchLimit)))
              : status.config.dailySearchLimit,
            cacheTtlHours: Number.isFinite(draft.cacheTtlHours)
              ? Math.max(0, Math.min(168, Math.trunc(draft.cacheTtlHours)))
              : status.config.cacheTtlHours,
          }
        : { intent };

      const response = await fetch("/api/admin/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        message?: string;
        status?: SearchGovernanceStatus;
      } | null;

      if (result?.status) {
        setStatus(result.status);
        if (intent === "save") setDraft(result.status.config);
      }

      if (!response.ok) {
        setFeedback({ tone: "error", message: result?.error ?? "操作未完成，请刷新页面后重试。" });
        return;
      }

      if (intent === "test_search") {
        setFeedback({
          tone: result?.ok ? "success" : "error",
          message: result?.message ?? result?.error ?? "联网搜索测试未通过。",
        });
        return;
      }

      setFeedback({
        tone: "success",
        message: intent === "save" ? "联网与费用管控设置已保存。" : "已清空本地联网搜索缓存。",
      });
    } catch {
      setFeedback({ tone: "error", message: "操作未完成，请刷新页面后重试。" });
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed) return;
    void runAction("save");
  }

  const limitReached = status.today.usedCalls >= status.config.dailySearchLimit && status.config.webSearchEnabled;

  return (
    <form className="provider-form" method="post" aria-busy={pending !== null} onSubmit={handleSubmit}>
      <div className="provider-status search-governance-status">
        <span className="provider-status-label">{t("今日用量")}</span>
        <span className={`provider-state${limitReached ? "" : " is-ready"}`}>
          <span aria-hidden="true" />
          {tv("今日联网请求：{used} / {limit} 次", {
            used: status.today.usedCalls,
            limit: status.config.dailySearchLimit,
          })}
        </span>
        <span className="search-governance-metrics">
          {tv("预估搜索花费：¥{cost}", { cost: status.today.estimatedCostCny.toFixed(2) })}
          {" · "}
          {tv("今日缓存命中：{hits} 次（缓存池 {entries} 条）", {
            hits: status.today.cacheHits,
            entries: status.activeCacheEntries,
          })}
        </span>
      </div>

      <fieldset disabled={pending !== null} className="provider-fields">
        <label>
          <span>{t("库外院校拓展")}</span>
          <select
            name="externalEnabled"
            value={draft.externalEnabled ? "enabled" : "disabled"}
            onChange={(event) => {
              const enabled = event.target.value === "enabled";
              setDraft((old) => ({ ...old, externalEnabled: enabled }));
              setFeedback(null);
            }}
          >
            <option value="enabled">{t("启用双源拓展（校内核验 + 库外参考）")}</option>
            <option value="disabled">{t("仅查校内知识库（关闭库外拓展）")}</option>
          </select>
        </label>

        <label>
          <span>{t("DeepSeek 实时联网检索")}</span>
          <select
            name="webSearchEnabled"
            disabled={!draft.externalEnabled}
            value={draft.webSearchEnabled ? "enabled" : "disabled"}
            onChange={(event) => {
              setDraft((old) => ({ ...old, webSearchEnabled: event.target.value === "enabled" }));
              setFeedback(null);
            }}
          >
            <option value="enabled">{t("启用实时联网（优先搜官网）")}</option>
            <option value="disabled">{t("关闭联网（仅用 AI 知识整理，0 搜索费）")}</option>
          </select>
        </label>

        <label>
          <span>{t("每日联网搜索上限（次）")}</span>
          <input
            type="number"
            name="dailySearchLimit"
            min={0}
            max={50000}
            step={1}
            required
            value={draft.dailySearchLimit}
            onChange={(event) => {
              const val = Number(event.target.value);
              setDraft((old) => ({ ...old, dailySearchLimit: Number.isNaN(val) ? 0 : val }));
              setFeedback(null);
            }}
          />
          <small>{t("按官方 ¥0.005/次计，300 次约 ¥1.50/天；达上限后自动降级为 AI 知识拓展，不中断选校。")}</small>
        </label>

        <label>
          <span>{t("搜索缓存时长（小时）")}</span>
          <input
            type="number"
            name="cacheTtlHours"
            min={0}
            max={168}
            step={1}
            required
            value={draft.cacheTtlHours}
            onChange={(event) => {
              const val = Number(event.target.value);
              setDraft((old) => ({ ...old, cacheTtlHours: Number.isNaN(val) ? 0 : val }));
              setFeedback(null);
            }}
          />
          <small>{t("相同检索词在有效期内直接复用本地缓存，不重复计费；设为 0 则关闭缓存。")}</small>
        </label>
      </fieldset>

      {feedback && (
        <p className={`settings-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
          {feedback.tone === "error" ? <CircleAlert size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
          {feedback.message}
        </p>
      )}

      <div className="provider-actions">
        <button type="button" disabled={pending !== null} onClick={() => void runAction("test_search")}>
          {pending === "test_search" && <LoaderCircle className="provider-spinner" size={15} aria-hidden="true" />}
          {t(pending === "test_search" ? "正在测试联网…" : "测试联网检索")}
        </button>
        <button type="button" disabled={pending !== null || status.activeCacheEntries === 0} onClick={() => void runAction("clear_cache")}>
          {pending === "clear_cache"
            ? <LoaderCircle className="provider-spinner" size={15} aria-hidden="true" />
            : <Trash2 size={14} aria-hidden="true" />}
          {t(pending === "clear_cache" ? "正在清空…" : "清空缓存")}
        </button>
        <button className="primary" type="submit" disabled={pending !== null || !changed}>
          {pending === "save" && <LoaderCircle className="provider-spinner" size={15} aria-hidden="true" />}
          {t(pending === "save" ? "正在保存…" : "保存管控设置")}
        </button>
      </div>
    </form>
  );
}

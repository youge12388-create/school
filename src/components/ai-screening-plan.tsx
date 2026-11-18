"use client";

import { ArrowRight, Check, ClipboardList, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { DraftPlan, DraftPlanFields } from "@/lib/ai-screening-plan";

type CustomerOption = { id: string; name: string; customerNo: string };
export type SavedPlan = { id: string; title: string };

export function PlanDraftPane({
  draft, saved, saving, canCreateCustomer, onChange, onRemove, onClear, onSaving, onSaved,
}: {
  draft: DraftPlan | null;
  saved: SavedPlan | null;
  saving: boolean;
  canCreateCustomer: boolean;
  onChange: (fields: Partial<DraftPlanFields>) => void;
  onRemove: (programId: string) => void;
  onClear: () => void;
  onSaving: (value: boolean) => void;
  onSaved: (plan: SavedPlan) => void;
}) {
  const [customers, setCustomers] = useState<CustomerOption[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const previousRequest = useRef<{ body: string; id: string } | null>(null);
  const hasItems = Boolean(draft?.items.length);
  const canSave = Boolean(draft?.title.trim() && customers?.some((customer) => customer.id === draft.customerId));

  useEffect(() => {
    if (!hasItems) return;
    const controller = new AbortController();
    void fetch("/api/ai-screening/recommendations", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "无法读取客户，请重试。");
        setCustomers(data.customers);
        setLoadError("");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "无法读取客户，请重试。");
      });
    return () => controller.abort();
  }, [hasItems, attempt]);

  function change(fields: Partial<DraftPlanFields>) {
    setError("");
    onChange(fields);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.items.length || !canSave || inFlight.current) return;
    inFlight.current = true;
    setError("");
    onSaving(true);
    const payload = {
      title: draft.title.trim(), customerId: draft.customerId, notes: draft.notes.trim(),
      criteria: draft.criteria, source: draft.source, showOther: draft.items.some((item) => item.requiresOtherResults),
      items: draft.items.map(({ programId, revision }) => ({ programId, revision })),
    };
    const body = JSON.stringify(payload);
    try {
      if (previousRequest.current?.body !== body) previousRequest.current = { body, id: crypto.randomUUID() };
      const response = await fetch("/api/ai-screening/recommendations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: previousRequest.current.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存未完成，请重试。");
      previousRequest.current = null;
      onSaved({ id: data.id, title: payload.title });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存未完成，请重试。");
    } finally {
      inFlight.current = false;
      onSaving(false);
    }
  }

  return (
    <section className="agent-draft" aria-labelledby="agent-draft-title">
      <header className="agent-draft-head">
        <div><ClipboardList size={17} aria-hidden="true" /><h2 id="agent-draft-title">方案草稿</h2>
          {hasItems && <span>{draft!.items.length}</span>}
        </div>
        {draft && <button type="button" className="agent-text-action" disabled={saving} onClick={() => { setError(""); onClear(); }}>清空</button>}
      </header>
      {saved && <div className="agent-draft-saved" role="status">
        <p><Check size={16} aria-hidden="true" /> 方案已保存</p>
        <Link href={`/recommendations/${saved.id}/print`}>{saved.title} <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>}
      {!hasItems ? <div className="agent-draft-empty">
        <strong>还没有候选项目</strong>
        <p>在检索结果中点「加入方案」，这里会汇总你选中的项目。</p>
      </div> : (
        <form method="post" className="agent-draft-form" onSubmit={save} aria-busy={saving}>
          <ol className="agent-draft-items" aria-label="已选项目">
            {draft!.items.map((item) => (
              <li key={item.programId}>
                <div><strong>{item.name}</strong><span>{item.program}</span><small>{item.fit}</small></div>
                <button type="button" className="agent-icon-action" disabled={saving} aria-label={`移除 ${item.name} · ${item.program}`}
                  onClick={() => { setError(""); onRemove(item.programId); }}>
                  <X size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          <div className="agent-draft-fields">
            <label>方案名称<input name="plan-title" value={draft!.title} maxLength={80} required disabled={saving}
              placeholder="例如：春季计算机硕士备选" onChange={(event) => change({ title: event.target.value })} /></label>
            <label>关联客户<select name="plan-customer" value={draft!.customerId} required disabled={saving || !customers?.length || Boolean(loadError)}
              onChange={(event) => change({ customerId: event.target.value })}>
              <option value="">{loadError ? "客户列表读取失败" : customers === null ? "正在读取客户…" : "请选择客户"}</option>
              {customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.customerNo}</option>)}
            </select></label>
            {loadError && <div className="agent-draft-error" role="alert">{loadError} <button type="button" onClick={() => { setLoadError(""); setAttempt((value) => value + 1); }}>重试</button></div>}
            {customers !== null && !loadError && <div className="agent-draft-hint">
              {customers.length === 0 && <>暂无可用客户。{canCreateCustomer && <Link href="/customers/new" target="_blank" rel="noopener">先新建客户</Link>}</>}
              <button className="agent-text-action" type="button" disabled={saving}
                onClick={() => { setCustomers(null); setAttempt((value) => value + 1); }}>刷新客户列表</button>
            </div>}
            <label>顾问备注 <small>选填 · 不随方案打印</small>
              <textarea name="plan-notes" rows={2} maxLength={600} value={draft!.notes} disabled={saving}
                placeholder="记录取舍、待确认事项或下一步" onChange={(event) => change({ notes: event.target.value })} />
            </label>
            {error && <p className="agent-draft-error" role="alert">{error}</p>}
          </div>
          <div className="agent-draft-actions"><button className="primary" type="submit" disabled={saving || !canSave || Boolean(loadError)}>
            {saving && <LoaderCircle size={15} aria-hidden="true" className="agent-spin" />}{saving ? "正在保存…" : "保存方案"}
          </button></div>
        </form>
      )}
    </section>
  );
}

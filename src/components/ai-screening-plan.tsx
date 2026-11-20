"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, Check, ClipboardList, LoaderCircle, X } from "lucide-react";

import { useT, useTv, useTm } from "@/lib/i18n/locale-context";
import { PlanProfileFields } from "@/components/plan-profile-fields";
import type { DraftPlan, DraftPlanFields } from "@/lib/ai-screening-plan";
import { groupPlanSchools, RECOMMENDED_SCHOOL_COUNT, RECOMMENDATION_FIELD_LIMITS } from "@/lib/recommendation-profile";

export type SavedPlan = { id: string; title: string };

export function PlanDraftPane({ draft, saved, saving, onChange, onRemove, onMove, onClear, onSaving, onSaved }: {
  draft: DraftPlan | null;
  saved: SavedPlan | null;
  saving: boolean;
  onChange: (fields: Partial<DraftPlanFields>) => void;
  onRemove: (programId: string) => void;
  onMove: (schoolId: string, offset: -1 | 1) => void;
  onClear: () => void;
  onSaving: (value: boolean) => void;
  onSaved: (plan: SavedPlan) => void;
}) {
  const t = useT();
  const tv = useTv();
  const tm = useTm();
  const inFlight = useRef(false);
  const previousRequest = useRef<{ body: string; id: string } | null>(null);
  const [error, setError] = useState("");
  const schools = groupPlanSchools(draft?.items ?? []);
  const canSave = Boolean(schools.length && draft?.studentName.trim() && draft.title.trim());

  function change(fields: Partial<DraftPlanFields>) {
    setError("");
    onChange(fields);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !canSave || inFlight.current) return;
    inFlight.current = true;
    setError("");
    onSaving(true);
    const payload = {
      title: draft.title.trim(), studentName: draft.studentName.trim(),
      studentRegion: draft.studentRegion.trim(), preferredRegion: draft.preferredRegion.trim(), notes: draft.notes.trim(),
      criteria: draft.criteria, source: draft.source, showOther: draft.items.some((item) => item.requiresOtherResults),
      items: schools.flat().map(({ programId, revision }) => ({ programId, revision })),
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
        <div><ClipboardList size={17} aria-hidden="true" /><h2 id="agent-draft-title">{t("方案草稿")}</h2></div>
        {draft && <button type="button" className="agent-text-action" disabled={saving} onClick={() => {
          setError(""); previousRequest.current = null; onClear();
        }}>{t("清空")}</button>}
      </header>
      {saved && <div className="agent-draft-saved" role="status">
        <p><Check size={16} aria-hidden="true" /> {t("方案已保存")}</p>
        <Link href={`/recommendations/${saved.id}/print`}>{saved.title} <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>}
      {!draft || !schools.length ? <div className="agent-draft-empty">
        <strong>{t("还没有选定院校")}</strong>
        <p>{tv("从结果点「加入方案」。建议选 {count} 所，可按需要调整。", { count: RECOMMENDED_SCHOOL_COUNT })}</p>
      </div> : (
        <form method="post" className="agent-draft-form" onSubmit={save} aria-busy={saving}>
          <div className="agent-draft-count">
            <strong>{tv("已选 {count} 所学校", { count: schools.length })}</strong>
            <span>{tv("建议 {count} 所，可调整", { count: RECOMMENDED_SCHOOL_COUNT })}</span>
          </div>
          <ol className="agent-draft-items" aria-label={t("已选学校及项目")}>
            {schools.map((projects, index) => {
              const school = projects[0];
              return <li className="agent-draft-school" key={school.schoolId}>
                <div className="agent-draft-school-head">
                  <strong><span>{index + 1}.</span> {school.name}</strong>
                  {schools.length > 1 && <div className="agent-draft-order">
                    <button type="button" className="agent-icon-action" disabled={saving || index === 0}
                      aria-label={tv("上移 {name}", { name: school.name })} title={t("上移")} onClick={() => onMove(school.schoolId, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                    <button type="button" className="agent-icon-action" disabled={saving || index === schools.length - 1}
                      aria-label={tv("下移 {name}", { name: school.name })} title={t("下移")} onClick={() => onMove(school.schoolId, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                  </div>}
                </div>
                <ul className="agent-draft-projects">
                  {projects.map((item) => <li key={item.programId}>
                    <div><span>{item.program}</span><small>{item.fit}</small></div>
                    <button type="button" className="agent-icon-action" disabled={saving} aria-label={tv("移除 {name} · {program}", { name: item.name, program: item.program })}
                      onClick={() => { setError(""); onRemove(item.programId); }}><X size={15} aria-hidden="true" /></button>
                  </li>)}
                </ul>
              </li>;
            })}
          </ol>
          <div className="agent-draft-fields">
            <label>{t("方案名称")}<input name="title" value={draft.title} maxLength={RECOMMENDATION_FIELD_LIMITS.title} required disabled={saving}
              onChange={(event) => change({ title: event.target.value })} /></label>
            <PlanProfileFields profile={draft} onChange={change} disabled={saving} />
            {error && <p className="agent-draft-error" role="alert">{tm(error)}</p>}
          </div>
          <div className="agent-draft-actions"><button className="primary" type="submit" disabled={saving || !canSave}>
            {saving && <LoaderCircle size={15} aria-hidden="true" className="agent-spin" />}{t(saving ? "正在保存…" : "保存方案")}
          </button></div>
        </form>
      )}
    </section>
  );
}

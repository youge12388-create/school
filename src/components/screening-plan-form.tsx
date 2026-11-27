"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ClipboardList } from "lucide-react";
import Link from "next/link";

import { saveScreeningPlanAction } from "@/app/recommendation-record-actions";
import { PlanProfileFields } from "@/components/plan-profile-fields";
import { useT, useTv } from "@/lib/i18n/locale-context";
import {
  groupPlanSchools,
  MAX_PLAN_ITEMS,
  RECOMMENDATION_FIELD_LIMITS,
  RECOMMENDED_PER_TIER_COUNT,
  RECOMMENDED_SCHOOL_COUNT,
} from "@/lib/recommendation-profile";
import "./screening-plan-form.css";

type Selection = { programId: string; schoolId: string; name: string };

export function ScreeningPlanForm({ children, criteriaJson, requestId, title, preferredRegion }: {
  children: ReactNode;
  criteriaJson: string;
  requestId: string;
  title: string;
  preferredRegion: string;
}) {
  const t = useT();
  const tv = useTv();
  const [selected, setSelected] = useState<Selection[]>([]);
  const [editing, setEditing] = useState(false);
  const [state, save, pending] = useActionState(saveScreeningPlanAction, { error: "" });
  const schools = groupPlanSchools(selected);
  const canSave = selected.length > 0 && selected.length <= MAX_PLAN_ITEMS;

  function syncSelection(event: FormEvent<HTMLFormElement>) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.name !== "programIds" || !field.dataset.schoolId) return;
    const { value: programId, checked, dataset: { schoolId, schoolName } } = field;
    setSelected((current) => checked
      ? [...current, { programId, schoolId, name: schoolName || "" }]
      : current.filter((item) => item.programId !== programId));
  }

  function moveSchool(index: number, offset: -1 | 1) {
    const reordered = [...schools];
    const target = index + offset;
    if (target < 0 || target >= reordered.length) return;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setSelected(reordered.flat());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !canSave || pending) return;
    const form = event.currentTarget;
    const payload = new FormData();
    const append = (name: string) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) payload.set(name, field.value);
    };
    ["requestId", "criteriaJson", "title", "studentName", "studentRegion", "preferredRegion", "notes"].forEach(append);
    for (const { programId } of schools.flat()) {
      payload.append("programIds", programId);
      append(`reason_${programId}`);
    }
    startTransition(() => save(payload));
  }

  return <form action={save} onSubmit={submit} onChange={syncSelection} aria-busy={pending}>
    <section className={`card manual-plan${editing ? " is-open" : ""}`} aria-label={t("方案草稿")}>
      <div className="manual-plan-header">
        <div className="manual-plan-count">
          <ClipboardList size={17} aria-hidden="true" />
          <strong aria-live="polite">{tv("已选 {n} 所学校", { n: schools.length })}</strong>
          <small>{tv("冲稳保各 {perTier} 所（最多 {n} 所）", { perTier: RECOMMENDED_PER_TIER_COUNT, n: RECOMMENDED_SCHOOL_COUNT })}</small>
        </div>
        <div className="manual-plan-actions">
          <Link href="/recommendations">{t("方案记录")}</Link>
          <button type="button" className={editing ? undefined : "primary"} disabled={pending || (!canSave && !editing)}
            aria-controls="manual-plan-fields" aria-expanded={editing}
            onClick={() => setEditing(!editing)}>{t(editing ? "收起" : "填写方案")}</button>
        </div>
      </div>
      {selected.length > MAX_PLAN_ITEMS && <p className="manual-plan-error" role="alert">{t("每份方案最多 30 个项目。")}</p>}
      <div className="manual-plan-body" id="manual-plan-fields" hidden={!editing}>
        {schools.length > 0 && <ol className="manual-plan-order" aria-label={t("已选学校及顺序")}>
          {schools.map((projects, index) => {
            const school = projects[0];
            return <li key={school.schoolId}>
              <span><strong>{school.name}</strong> <small>{tv("{n} 个项目", { n: projects.length })}</small></span>
              {schools.length > 1 && <div>
                <button type="button" disabled={index === 0 || pending} aria-label={tv("上移 {school}", { school: school.name })}
                  onClick={() => moveSchool(index, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                <button type="button" disabled={index === schools.length - 1 || pending} aria-label={tv("下移 {school}", { school: school.name })}
                  onClick={() => moveSchool(index, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
              </div>}
            </li>;
          })}
        </ol>}
        <fieldset className="manual-plan-fields" disabled={!editing || pending}>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="criteriaJson" value={criteriaJson} />
          <label>{t("方案名称")}<input name="title" required maxLength={RECOMMENDATION_FIELD_LIMITS.title} defaultValue={title} /></label>
          <PlanProfileFields profile={{ preferredRegion }} />
        </fieldset>
        <div className="manual-plan-submit">
          {state.error && <p className="manual-plan-error" role="alert">{state.error}</p>}
          <button type="submit" className="primary" disabled={!canSave || pending}>
            {t(pending ? "正在保存…" : "保存并查看方案")}
          </button>
        </div>
      </div>
    </section>
    {children}
  </form>;
}

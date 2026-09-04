"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useEditMode } from "@/components/edit-mode";
import { KnowledgeFieldGrid, UNKNOWN_TEXT, displayValue, displayValueLocalized } from "@/components/knowledge-fields";
import { Badge } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { useLocale, useT, useTv, useTm } from "@/lib/i18n/locale-context";
import { formatDate, formatMoney } from "@/lib/utils";

function hasValidDate(value: Date | null) {
  return Boolean(value && Number.isFinite(value.getTime()));
}

function deadlineTone(deadlineDate: Date | null) {
  if (!hasValidDate(deadlineDate)) return "gray" as const;
  return deadlineDate!.getTime() >= Date.now() ? ("green" as const) : ("red" as const);
}

function deadlineLabel(deadlineDate: Date | null, en: boolean) {
  if (!hasValidDate(deadlineDate)) {
    return en ? "Deadline unknown" : "截止日期未知";
  }
  const date = formatDate(deadlineDate);
  if (deadlineDate!.getTime() >= Date.now()) {
    return en ? `Due ${date}` : `截止 ${date}`;
  }
  return en ? `Closed ${date}` : `已截止 ${date}`;
}

export type ProgramCardData = {
  id: string;
  schoolId: string;
  name: string;
  programType: string;
  teachingLanguage: string;
  duration: string | null;
  tuitionText: string;
  firstYearCostMax: number | null;
  deadlineDate: number | null;
  applicationTimeText: string | null;
  majorText: string | null;
  requirementsText: string | null;
  introduction: string | null;
  scholarshipContent: string | null;
  reviewStatus: string;
};

const EDIT_KEYS = [
  "name",
  "programType",
  "teachingLanguage",
  "duration",
  "tuitionText",
  "firstYearCostMax",
  "deadlineDate",
  "applicationTimeText",
  "majorText",
  "requirementsText",
  "introduction",
  "scholarshipContent",
] as const;

export function SchoolProgramCard({
  program,
  index,
  knowledge,
  marketManagerView,
  coreFields,
  longFields,
  open: openProp,
}: {
  program: ProgramCardData;
  index: number;
  knowledge: Record<string, unknown>;
  marketManagerView: boolean;
  coreFields: readonly string[];
  longFields: readonly string[];
  open?: boolean;
}) {
  const router = useRouter();
  const { editingMode, markDirty } = useEditMode();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const t = useT();
  const tm = useTm();
  const tv = useTv();
  const locale = useLocale();
  const en = locale === "en";
  const deadlineDate = program.deadlineDate ? new Date(program.deadlineDate) : null;
  const cardKey = `program-${program.id}`;

  async function save(formData: FormData) {
    setLoading(true);
    setMessage("");
    const payload: Record<string, unknown> = {};
    for (const key of EDIT_KEYS) {
      payload[key] = formData.get(key) ?? "";
    }
    try {
      const response = await fetch(`/api/programs/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("保存失败"));
      markDirty(cardKey, false);
      setMessage("");
      setSavedAt((version) => version + 1);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? tm(error.message) : t("保存失败"));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    formRef.current?.reset();
    markDirty(cardKey, false);
    setMessage("");
  }

  return (
    <details
      id={`program-${program.id}`}
      className="card card-compact school-program-card school-program-collapsible"
      open={editingMode ? true : openProp}
    >
      <summary className="card-header school-program-header school-program-summary">
        <div className="school-program-summary-main">
          <span className="small muted">{tv("项目 {n}", { n: index + 1 })}</span>
          <h3>{program.name}</h3>
          {!marketManagerView ? (
            <div className="result-meta">
              <span>{t(PROGRAM_TYPE_LABELS[program.programType] ?? program.programType)}</span>
              <span>{t(LANGUAGE_LABELS[program.teachingLanguage] ?? program.teachingLanguage)}</span>
              <span>{tv("首年上限：{n}", { n: formatMoney(program.firstYearCostMax) })}</span>
            </div>
          ) : null}
          {marketManagerView && displayValue(knowledge["专业列表"]) !== UNKNOWN_TEXT ? (
            <p className="program-summary-major">{displayValueLocalized(knowledge["专业列表"], t)}</p>
          ) : null}
        </div>
        <div className="school-program-badges">
          <Badge tone={deadlineTone(deadlineDate)}>{deadlineLabel(deadlineDate, en)}</Badge>
          {!marketManagerView ? (
            <Badge
              tone={
                program.reviewStatus === "VERIFIED"
                  ? "green"
                  : program.reviewStatus === "NEEDS_REVIEW"
                    ? "amber"
                    : "blue"
              }
            >
              {program.reviewStatus === "VERIFIED"
                ? t("已复核")
                : program.reviewStatus === "NEEDS_REVIEW"
                  ? t("待复核")
                  : t("自动解析")}
            </Badge>
          ) : null}
        </div>
      </summary>
      <div className="school-program-expanded">
        {editingMode ? (
          <form
            ref={formRef}
            key={savedAt}
            action={save}
            onChange={() => markDirty(cardKey, true)}
            className="inline-edit-form"
          >
            <div className="form-grid">
              <label>
                {t("项目名称")}
                <input name="name" required defaultValue={program.name} />
              </label>
              <label>
                {t("申请学历")}
                <select name="programType" defaultValue={program.programType}>
                  {Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("授课语言")}
                <select name="teachingLanguage" defaultValue={program.teachingLanguage}>
                  {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("学制")}
                <input name="duration" defaultValue={program.duration ?? ""} />
              </label>
              <label>
                {t("学费说明")}
                <input name="tuitionText" defaultValue={program.tuitionText} />
              </label>
              <label>
                {t("首年费用上限（元）")}
                <input
                  name="firstYearCostMax"
                  type="number"
                  defaultValue={program.firstYearCostMax ?? ""}
                />
              </label>
              <label>
                {t("截止日期")}
                <input
                  name="deadlineDate"
                  type="date"
                  defaultValue={
                    program.deadlineDate
                      ? new Date(program.deadlineDate).toISOString().slice(0, 10)
                      : ""
                  }
                />
              </label>
              <label>
                {t("申请时间说明")}
                <input name="applicationTimeText" defaultValue={program.applicationTimeText ?? ""} />
              </label>
            </div>
            <label className="wide">
              {t("专业列表")}
              <textarea name="majorText" rows={3} defaultValue={program.majorText ?? ""} />
            </label>
            <label className="wide">
              {t("申请要求及材料")}
              <textarea
                name="requirementsText"
                rows={3}
                defaultValue={program.requirementsText ?? ""}
              />
            </label>
            <label className="wide">
              {t("项目介绍")}
              <textarea name="introduction" rows={2} defaultValue={program.introduction ?? ""} />
            </label>
            <label className="wide">
              {t("奖学金内容")}
              <textarea
                name="scholarshipContent"
                rows={2}
                defaultValue={program.scholarshipContent ?? ""}
              />
            </label>
            <div className="form-actions">
              <button className="primary" disabled={loading} type="submit">
                {loading ? t("保存中…") : t("保存本区")}
              </button>
              <button disabled={loading} type="button" onClick={resetForm}>
                {t("还原")}
              </button>
            </div>
            {message ? (
              <div aria-live="polite" className="alert">
                {message}
              </div>
            ) : null}
          </form>
        ) : (
          <>
            <div className="program-core-grid">
              {coreFields
                .filter((label) => displayValue(knowledge[label]) !== UNKNOWN_TEXT)
                .map((label) => {
                  return (
                    <div className="detail-field" key={label}>
                      <span className="label">{t(label)}</span>
                      <p className="value">{displayValueLocalized(knowledge[label], t)}</p>
                    </div>
                  );
                })}
            </div>
            {!marketManagerView &&
            displayValue(knowledge["申请要求及材料"]) !== UNKNOWN_TEXT ? (
              <div className="program-material-section">
                <h4>{t("申请要求及材料")}</h4>
                <p className="program-material-body">{displayValueLocalized(knowledge["申请要求及材料"], t)}</p>
              </div>
            ) : null}
            <details className="program-long-section">
              <summary>{t("展开项目详情（项目介绍 / 专业 / 学期 / 奖学金 / 费用备注）")}</summary>
              <div className="program-long-body">
                <KnowledgeFieldGrid fields={longFields} data={knowledge} hideEmpty />
              </div>
            </details>
          </>
        )}
      </div>
    </details>
  );
}

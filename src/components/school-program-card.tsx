"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useEditMode } from "@/components/edit-mode";
import { KnowledgeFieldGrid, displayValue } from "@/components/knowledge-fields";
import { Badge } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/utils";

function hasValidDate(value: Date | null) {
  return Boolean(value && Number.isFinite(value.getTime()));
}

function deadlineTone(deadlineDate: Date | null) {
  if (!hasValidDate(deadlineDate)) return "gray" as const;
  return deadlineDate!.getTime() >= Date.now() ? ("green" as const) : ("red" as const);
}

function deadlineLabel(deadlineDate: Date | null) {
  if (!hasValidDate(deadlineDate)) return "截止日期未知";
  return deadlineDate!.getTime() >= Date.now()
    ? `截止 ${formatDate(deadlineDate)}`
    : `已截止 ${formatDate(deadlineDate)}`;
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
      if (!response.ok) throw new Error(result.error ?? "保存失败");
      markDirty(cardKey, false);
      setMessage("");
      setSavedAt((version) => version + 1);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
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
          <span className="small muted">项目 {index + 1}</span>
          <h3>{program.name}</h3>
          {!marketManagerView ? (
            <div className="result-meta">
              <span>{PROGRAM_TYPE_LABELS[program.programType] ?? program.programType}</span>
              <span>{LANGUAGE_LABELS[program.teachingLanguage] ?? program.teachingLanguage}</span>
              <span>首年上限：{formatMoney(program.firstYearCostMax)}</span>
            </div>
          ) : null}
          {marketManagerView && displayValue(knowledge["专业列表"]) !== "数据库未有相关信息" ? (
            <p className="program-summary-major">{displayValue(knowledge["专业列表"])}</p>
          ) : null}
        </div>
        <div className="school-program-badges">
          <Badge tone={deadlineTone(deadlineDate)}>{deadlineLabel(deadlineDate)}</Badge>
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
                ? "已复核"
                : program.reviewStatus === "NEEDS_REVIEW"
                  ? "待复核"
                  : "自动解析"}
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
                项目名称
                <input name="name" required defaultValue={program.name} />
              </label>
              <label>
                申请学历
                <select name="programType" defaultValue={program.programType}>
                  {Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                授课语言
                <select name="teachingLanguage" defaultValue={program.teachingLanguage}>
                  {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                学制
                <input name="duration" defaultValue={program.duration ?? ""} />
              </label>
              <label>
                学费说明
                <input name="tuitionText" defaultValue={program.tuitionText} />
              </label>
              <label>
                首年费用上限（元）
                <input
                  name="firstYearCostMax"
                  type="number"
                  defaultValue={program.firstYearCostMax ?? ""}
                />
              </label>
              <label>
                截止日期
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
                申请时间说明
                <input name="applicationTimeText" defaultValue={program.applicationTimeText ?? ""} />
              </label>
            </div>
            <label className="wide">
              专业列表
              <textarea name="majorText" rows={3} defaultValue={program.majorText ?? ""} />
            </label>
            <label className="wide">
              申请要求及材料
              <textarea
                name="requirementsText"
                rows={3}
                defaultValue={program.requirementsText ?? ""}
              />
            </label>
            <label className="wide">
              项目介绍
              <textarea name="introduction" rows={2} defaultValue={program.introduction ?? ""} />
            </label>
            <label className="wide">
              奖学金内容
              <textarea
                name="scholarshipContent"
                rows={2}
                defaultValue={program.scholarshipContent ?? ""}
              />
            </label>
            <div className="form-actions">
              <button className="primary" disabled={loading} type="submit">
                {loading ? "保存中…" : "保存本区"}
              </button>
              <button disabled={loading} type="button" onClick={resetForm}>
                还原
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
                .filter((label) => displayValue(knowledge[label]) !== "数据库未有相关信息")
                .map((label) => {
                  const text = displayValue(knowledge[label]);
                  return (
                    <div className="detail-field" key={label}>
                      <span className="label">{label}</span>
                      <p className="value">{text}</p>
                    </div>
                  );
                })}
            </div>
            {!marketManagerView &&
            displayValue(knowledge["申请要求及材料"]) !== "数据库未有相关信息" ? (
              <div className="program-material-section">
                <h4>申请要求及材料</h4>
                <p className="program-material-body">{displayValue(knowledge["申请要求及材料"])}</p>
              </div>
            ) : null}
            <details className="program-long-section">
              <summary>展开项目详情（项目介绍 / 专业 / 学期 / 奖学金 / 费用备注）</summary>
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

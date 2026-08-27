"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useEditMode } from "@/components/edit-mode";
import { KnowledgeFieldGrid, displayValue } from "@/components/knowledge-fields";
import { Badge } from "@/components/ui";

type ConfidentialFieldDef = {
  key: string;
  label: string;
  area?: boolean;
};

type ConfidentialSection = "cooperation" | "secret";

const SECTION_DEFS: Record<
  ConfidentialSection,
  {
    title: string;
    badge: string;
    badgeTone: "blue" | "red";
    description: string;
    groups: { title: string; fields: ConfidentialFieldDef[] }[];
  }
> = {
  cooperation: {
    title: "合作关系",
    badge: "内部资料",
    badgeTone: "blue",
    description: "申请通道与合作说明，仅内部管理员可见，不参与学生资格自动判断。点击展开。",
    groups: [
      {
        title: "申请通道",
        fields: [
          { key: "groupApplicationAccount", label: "团体申请账号" },
          { key: "collectionServiceText", label: "是否可代收" },
          { key: "scholarshipDisbursementText", label: "奖学金发放形式" },
          { key: "cooperationDeadlineText", label: "合作截止日期" },
        ],
      },
      {
        title: "合作说明",
        fields: [
          { key: "recruitmentPreferenceText", label: "招生偏向", area: true },
          { key: "cooperationNote", label: "合作备注", area: true },
          { key: "specialCaseNote", label: "特殊情况备注", area: true },
        ],
      },
    ],
  },
  secret: {
    title: "机密字段",
    badge: "仅管理员",
    badgeTone: "red",
    description: "招生计划与考核安排，仅高级管理员可见，点击展开。",
    groups: [
      {
        title: "招生计划",
        fields: [
          { key: "companyRecruitmentQuotaText", label: "公司招生名额" },
          { key: "schoolRecruitmentPlanText", label: "学校招生计划" },
          { key: "applicationUpdateFrequency", label: "学校申请更新频率" },
        ],
      },
      {
        title: "考核安排",
        fields: [
          { key: "languageStudentAssessmentText", label: "语言生面试、笔试", area: true },
          { key: "degreeStudentAssessmentText", label: "学历生面试、笔试", area: true },
        ],
      },
      {
        title: "合作收费",
        fields: [{ key: "cooperationFeeText", label: "合作收费", area: true }],
      },
    ],
  },
};

export function SchoolConfidentialCard({
  schoolId,
  section,
  data,
  canEdit,
}: {
  schoolId: string;
  section: ConfidentialSection;
  data: Record<string, unknown>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { editingMode, markDirty } = useEditMode();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const def = SECTION_DEFS[section];
  const cardKey = `school-${section}`;
  const editable = editingMode && canEdit;

  async function save(formData: FormData) {
    setLoading(true);
    setMessage("");
    const payload: Record<string, unknown> = {};
    for (const field of def.groups.flatMap((group) => group.fields)) {
      payload[field.key] = formData.get(field.key) ?? "";
    }
    try {
      const response = await fetch(`/api/schools/${schoolId}/confidential`, {
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
    <details className="card card-compact school-cooperation-card" open={editingMode || undefined}>
      <summary className="card-header school-knowledge-header">
        <div>
          <h3>{def.title}</h3>
          <p className="small muted">{def.description}</p>
        </div>
        <Badge tone={def.badgeTone}>{def.badge}</Badge>
      </summary>
      <div className="card-body cooperation-field-groups">
        {editable ? (
          <form
            ref={formRef}
            key={savedAt}
            action={save}
            onChange={() => markDirty(cardKey, true)}
            className="inline-edit-form"
          >
            {def.groups.map((group) => (
              <section className="inline-edit-group" key={group.title}>
                <h4>{group.title}</h4>
                <div className="form-grid">
                  {group.fields.map((field) => (
                    <label className={field.area ? "wide" : undefined} key={field.key}>
                      {field.label}
                      {field.area ? (
                        <textarea
                          name={field.key}
                          rows={2}
                          defaultValue={
                            displayValue(data[field.label]) === "数据库未有相关信息"
                              ? ""
                              : String(data[field.label] ?? "")
                          }
                        />
                      ) : (
                        <input
                          name={field.key}
                          defaultValue={
                            displayValue(data[field.label]) === "数据库未有相关信息"
                              ? ""
                              : String(data[field.label] ?? "")
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
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
          def.groups.map((group) => (
            <section className="cooperation-field-group" key={group.title}>
              <h4>{group.title}</h4>
              <KnowledgeFieldGrid
                data={data}
                fields={group.fields.map((field) => field.label)}
              />
            </section>
          ))
        )}
      </div>
    </details>
  );
}

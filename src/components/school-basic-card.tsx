"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useEditMode } from "@/components/edit-mode";
import { KnowledgeFieldGrid } from "@/components/knowledge-fields";
import { SchoolNoteSection } from "@/components/school-note-section";
import { Badge } from "@/components/ui";
import { useT, useTm } from "@/lib/i18n/locale-context";

const CARD_KEY = "school-basic";

export type BasicCardSchool = {
  id: string;
  nameZh: string;
  name: string | null;
  category: string | null;
  province: string | null;
  city: string | null;
  website: string | null;
  qsRanking: number | null;
  rankingInfo: string | null;
  partnershipRating: number;
  cscaStatus: string;
  tags: string | null;
  description: string | null;
  cooperationPrograms: string | null;
  reviewStatus: string;
  infoNote: string | null;
};

export function SchoolBasicCard({
  school,
  canEditNote,
  fields,
}: {
  school: BasicCardSchool;
  canEditNote: boolean;
  fields: readonly string[];
}) {
  const router = useRouter();
  const { editingMode, markDirty } = useEditMode();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const t = useT();
  const tm = useTm();

  const knowledge: Record<string, unknown> = {
    学校中文名: school.nameZh,
    学校名称: school.name,
    学校分类: school.category,
    省份: school.province,
    城市: school.city,
    官网: school.website,
    QS排名: school.qsRanking,
    排名信息: school.rankingInfo,
    合作星级: school.partnershipRating,
    CSCA:
      school.cscaStatus === "REQUIRED"
        ? "是"
        : school.cscaStatus === "NOT_REQUIRED"
          ? "否"
          : null,
    标签: school.tags,
    学校简介: school.description,
    合作项目: school.cooperationPrograms,
  };

  async function save(formData: FormData) {
    setLoading(true);
    setMessage("");
    const keys = [
      "nameZh",
      "name",
      "category",
      "province",
      "city",
      "website",
      "qsRanking",
      "rankingInfo",
      "partnershipRating",
      "cscaStatus",
      "tags",
      "description",
      "cooperationPrograms",
    ];
    const payload: Record<string, unknown> = {};
    for (const key of keys) {
      payload[key] = formData.get(key) ?? "";
    }
    try {
      const response = await fetch(`/api/schools/${school.id}/basic`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("保存失败"));
      markDirty(CARD_KEY, false);
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
    markDirty(CARD_KEY, false);
    setMessage("");
  }

  const reviewBadge =
    school.reviewStatus === "VERIFIED"
      ? t("已复核")
      : school.reviewStatus === "NEEDS_REVIEW"
        ? t("待复核")
        : t("自动导入");

  return (
    <section className="card card-compact school-knowledge-card">
      <div className="card-header school-knowledge-header">
        <div>
          <h3>{t("院校基本信息")}</h3>
        </div>
        <Badge
          tone={
            school.reviewStatus === "VERIFIED"
              ? "green"
              : school.reviewStatus === "NEEDS_REVIEW"
                ? "amber"
                : "blue"
          }
        >
          {reviewBadge}
        </Badge>
      </div>
      <div className="card-body">
        {editingMode ? (
          <form
            ref={formRef}
            key={savedAt}
            action={save}
            onChange={() => markDirty(CARD_KEY, true)}
            className="inline-edit-form"
          >
            <div className="form-grid">
              <label>
                {t("学校中文名")}
                <input name="nameZh" required defaultValue={school.nameZh} />
              </label>
              <label>
                {t("学校英文名")}
                <input name="name" defaultValue={school.name ?? ""} />
              </label>
              <label>
                {t("学校分类")}
                <input name="category" defaultValue={school.category ?? ""} />
              </label>
              <label>
                {t("省份")}
                <input name="province" defaultValue={school.province ?? ""} />
              </label>
              <label>
                {t("城市")}
                <input name="city" defaultValue={school.city ?? ""} />
              </label>
              <label>
                {t("官网")}
                <input name="website" defaultValue={school.website ?? ""} placeholder="https://" />
              </label>
              <label>
                {t("QS 排名")}
                <input name="qsRanking" type="number" defaultValue={school.qsRanking ?? ""} />
              </label>
              <label>
                {t("排名信息")}
                <input name="rankingInfo" defaultValue={school.rankingInfo ?? ""} placeholder={t("可填写其他排名")} />
              </label>
              <label>
                {t("合作星级")}
                <input name="partnershipRating" type="number" min="0" max="5" defaultValue={school.partnershipRating} />
              </label>
              <label>
                {t("CSCA 状态")}
                <select name="cscaStatus" defaultValue={school.cscaStatus}>
                  <option value="UNKNOWN">{t("未知")}</option>
                  <option value="REQUIRED">{t("要求")}</option>
                  <option value="NOT_REQUIRED">{t("不要求")}</option>
                </select>
              </label>
              <label>
                {t("标签")}
                <input name="tags" defaultValue={school.tags ?? ""} />
              </label>
            </div>
            <label className="wide">
              {t("学校简介")}
              <textarea name="description" defaultValue={school.description ?? ""} rows={3} />
            </label>
            <label className="wide">
              {t("合作项目")}
              <textarea
                name="cooperationPrograms"
                defaultValue={school.cooperationPrograms ?? ""}
                rows={2}
                placeholder={t("列出已合作的项目")}
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
            <KnowledgeFieldGrid fields={fields} data={knowledge} hideEmpty />
            {canEditNote || school.infoNote ? (
              <SchoolNoteSection schoolId={school.id} note={school.infoNote} canEdit={canEditNote} />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";

import { useT, useTv, useTm } from "@/lib/i18n/locale-context";

type ImportSummary = {
  imported: number;
  updated: number;
  schoolNotFound: number;
  skipped: number;
  skippedRows?: number;
};

export function SchoolUpdateImportPanel() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const t = useT();
  const tm = useTm();
  const tv = useTv();

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    setSummary(null);
    try {
      const response = await fetch("/api/school-updates/import", {
        method: "POST",
        body: formData,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("导入失败"));
      setSummary(body.summary);
      setMessage(t("导入完成，学校详情页的院校信息更新已刷新。"));
    } catch (error) {
      setMessage(error instanceof Error ? tm(error.message) : t("导入失败"));
    } finally {
      setLoading(false);
    }
  }

  const totalSkipped = summary
    ? summary.skipped + (summary.skippedRows ?? 0)
    : 0;

  return (
    <form action={submit} className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <h3>{t("导入院校信息更新台账")}</h3>
        <a className="button" href="/api/templates/school-updates">
          {t("下载模板")}
        </a>
      </div>
      <div className="card-body">
        <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
          {t("请先下载模板，按\u201C字段说明\u201D填写后再上传；\u201C院校名称\u201D必填，且需与知识库中的学校中文名完全一致。")}
        </p>
        <label>
          {t("选择\u201C院校信息更新\u201DExcel（内部资料仅机密人员可见）")}
          <input name="file" type="file" accept=".xlsx,.xls" required />
        </label>
        <div className="form-actions">
          <button className="primary" disabled={loading} type="submit">
            {loading ? t("导入中…") : t("导入台账")}
          </button>
        </div>
        {summary ? (
          <div className="alert success" style={{ marginTop: 12 }}>
            {tv("新增 {a} · 更新 {b} · 未匹配学校 {c} · 跳过 {d}", {
              a: summary.imported,
              b: summary.updated,
              c: summary.schoolNotFound,
              d: totalSkipped,
            })}
          </div>
        ) : null}
        {message ? (
          <div aria-live="polite" className="alert" style={{ marginTop: 12 }}>
            {message}
          </div>
        ) : null}
      </div>
    </form>
  );
}

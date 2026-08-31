"use client";

import { useState } from "react";

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
      if (!response.ok) throw new Error(body.error ?? "导入失败");
      setSummary(body.summary);
      setMessage("导入完成，学校详情页的院校信息更新已刷新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={submit} className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <h3>导入院校信息更新台账</h3>
        <a className="button" href="/api/templates/school-updates">
          下载模板
        </a>
      </div>
      <div className="card-body">
        <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
          请先下载模板，按“字段说明”填写后再上传；“院校名称”必填，且需与知识库中的学校中文名完全一致。
        </p>
        <label>
          选择“院校信息更新”Excel（内部资料仅机密人员可见）
          <input name="file" type="file" accept=".xlsx,.xls" required />
        </label>
        <div className="form-actions">
          <button className="primary" disabled={loading} type="submit">
            {loading ? "导入中…" : "导入台账"}
          </button>
        </div>
        {summary ? (
          <div className="alert success" style={{ marginTop: 12 }}>
            新增 {summary.imported} · 更新 {summary.updated} · 未匹配学校{" "}
            {summary.schoolNotFound} · 跳过 {summary.skipped + (summary.skippedRows ?? 0)}
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

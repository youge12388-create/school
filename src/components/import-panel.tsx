"use client";

import { useState } from "react";

import { ImportMethodTabs } from "@/components/import-method-tabs";

type Preview = {
  batchId: string;
  sourceNames: string[];
  summary: {
    schools: Record<string, number>;
    programs: Record<string, number>;
    sourceDuplicates: number;
    needsReview: number;
  };
  entries: Array<{ key: string; action: string; details: string }>;
};

export function ImportPanel() {
  return (
    <>
      <ImportMethodTabs active="excel" />
      <ExcelImportPanel />
    </>
  );
}

function ExcelImportPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function previewFiles(formData: FormData) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "生成预览失败");
      setPreview(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成预览失败");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "确认导入失败");
      setMessage("导入完成，学校库和项目库已更新。");
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "确认导入失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid cols-2">
      <form className="card" action={previewFiles}>
        <div className="card-header"><h3>选择 Excel 文件</h3></div>
        <div className="card-body">
          <label>
            高校汇总
            <input name="schoolFile" type="file" accept=".xlsx" required />
          </label>
          <label style={{ marginTop: 12 }}>
            高校项目汇总
            <input name="programFile" type="file" accept=".xlsx" required />
          </label>
          <p className="small muted" style={{ marginTop: 10 }}>
            系统先生成新增、修改、重复和冲突预览；确认前不会更改知识库。
          </p>
          <div className="form-actions">
            <button className="primary" disabled={loading} type="submit">
              {loading ? "处理中…" : "生成导入预览"}
            </button>
          </div>
          {message ? <div className="alert" style={{ marginTop: 12 }}>{message}</div> : null}
        </div>
      </form>
      <div className="card">
        <div className="card-header"><h3>预览结果</h3></div>
        <div className="card-body">
          {!preview ? (
            <div className="empty">选择两份表格并生成预览</div>
          ) : (
            <>
              <div className="grid cols-2">
                <div>
                  <strong>学校</strong>
                  <p>新增 {preview.summary.schools.NEW} · 修改 {preview.summary.schools.MODIFIED}</p>
                  <p>重复 {preview.summary.schools.DUPLICATE} · 冲突 {preview.summary.schools.CONFLICT}</p>
                </div>
                <div>
                  <strong>项目</strong>
                  <p>新增 {preview.summary.programs.NEW} · 修改 {preview.summary.programs.MODIFIED}</p>
                  <p>重复 {preview.summary.programs.DUPLICATE} · 冲突 {preview.summary.programs.CONFLICT}</p>
                </div>
              </div>
              <p style={{ marginTop: 12 }}>
                源文件完全重复行：{preview.summary.sourceDuplicates}；待人工复核项目：{preview.summary.needsReview}
              </p>
              <div className="table-wrap" style={{ maxHeight: 310, marginTop: 12 }}>
                <table>
                  <thead><tr><th>记录</th><th>动作</th><th>说明</th></tr></thead>
                  <tbody>
                    {preview.entries.map((entry, index) => (
                      <tr key={`${entry.key}-${index}`}>
                        <td>{entry.key}</td>
                        <td>{entry.action}</td>
                        <td>{entry.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button className="primary" disabled={loading} onClick={confirm} type="button">
                  确认写入知识库
                </button>
                <button onClick={() => setPreview(null)} type="button">取消</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

import { ImportMethodTabs } from "@/components/import-method-tabs";
import { useT, useTv } from "@/lib/i18n/locale-context";

type Preview = {
  batchId: string;
  sourceNames: string[];
  summary: {
    schools: Record<string, number>;
    programs: Record<string, number>;
    sourceDuplicates: number;
    needsReview: number;
    fileConflicts?: number;
    fileSkipped?: number;
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
  const t = useT();
  const tv = useTv();

  async function previewFiles(formData: FormData) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("生成预览失败"));
      setPreview(result);
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t("生成预览失败"));
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
      if (!response.ok) throw new Error(result.error ?? t("确认导入失败"));
      setMessage(t("导入完成，学校库和学校筛查数据已更新。"));
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t("确认导入失败"));
    } finally {
      setLoading(false);
    }
  }

  const s = preview?.summary;

  return (
    <div className="grid cols-2">
      <form className="card" action={previewFiles}>
        <div className="card-header"><h3>{t("选择 Excel 文件")}</h3></div>
        <div className="card-body">
          <label>
            {t("高校项目汇总（支持单表\u201C高校项目\u201D，或双表\u201C高校汇总\u201D+\u201C高校项目\u201D）")}
            <input name="file" type="file" accept=".xlsx,.xls" required />
          </label>
          <p className="small muted" style={{ marginTop: 10 }}>
            {t("与导出的格式一致即可直接维护；确认前不会更改知识库。")}
          </p>
          <div className="form-actions">
            <button className="primary" disabled={loading} type="submit">
              {loading ? t("处理中…") : t("生成导入预览")}
            </button>
          </div>
          {message ? <div className="alert" style={{ marginTop: 12 }}>{message}</div> : null}
        </div>
      </form>
      <div className="card">
        <div className="card-header"><h3>{t("预览结果")}</h3></div>
        <div className="card-body">
          {!preview || !s ? (
            <div className="empty">{t("选择高校汇总并生成预览")}</div>
          ) : (
            <>
              <div className="grid cols-2">
                <div>
                  <strong>{t("学校")}</strong>
                  <p>{tv("新增 {n} · 修改 {m}", { n: s.schools.NEW, m: s.schools.MODIFIED })}</p>
                  <p>{tv("重复 {n} · 冲突 {m}", { n: s.schools.DUPLICATE, m: s.schools.CONFLICT })}</p>
                </div>
                <div>
                  <strong>{t("项目")}</strong>
                  <p>{tv("新增 {n} · 修改 {m}", { n: s.programs.NEW, m: s.programs.MODIFIED })}</p>
                  <p>{tv("重复 {n} · 冲突 {m}", { n: s.programs.DUPLICATE, m: s.programs.CONFLICT })}</p>
                </div>
              </div>
              <p style={{ marginTop: 12 }}>
                {tv("源文件完全重复行：{n}；待人工复核项目：{r}", {
                  n: s.sourceDuplicates,
                  r: s.needsReview,
                })}
                {s.fileConflicts
                  ? tv("；文件内同名冲突行：{n}（保留首个值）", { n: s.fileConflicts })
                  : ""}
                {s.fileSkipped
                  ? tv("；缺关键信息跳过行：{n}", { n: s.fileSkipped })
                  : ""}
              </p>
              <div className="table-wrap" style={{ maxHeight: 310, marginTop: 12 }}>
                <table>
                  <thead><tr><th>{t("记录")}</th><th>{t("动作")}</th><th>{t("说明")}</th></tr></thead>
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
                  {t("确认写入知识库")}
                </button>
                <button onClick={() => setPreview(null)} type="button">{t("取消")}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

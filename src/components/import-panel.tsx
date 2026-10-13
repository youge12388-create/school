"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ImportMethodTabs } from "@/components/import-method-tabs";
import { useT, useTv, useTm } from "@/lib/i18n/locale-context";

type ImportCounts = Record<string, number>;

type Preview = {
  batchId: string;
  sourceNames: string[];
  summary: {
    schools: ImportCounts;
    programs: ImportCounts;
    sourceDuplicates: number;
    needsReview: number;
    fileConflicts?: number;
    fileSkipped?: number;
  };
  entries: Array<{ key: string; action: string; details: string }>;
};

type MessageTone = "success" | "error" | null;
const actionLabels: Record<string, string> = {
  NEW: "新增",
  MODIFIED: "修改",
  DUPLICATE: "重复",
  CONFLICT: "冲突",
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
  const [messageTone, setMessageTone] = useState<MessageTone>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useT();
  const tm = useTm();
  const tv = useTv();

  async function previewFiles(formData: FormData) {
    setLoading(true);
    setMessage("");
    setMessageTone(null);
    try {
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("生成预览失败"));
      setPreview(result);
    } catch (error) {
      setMessage(error instanceof Error ? tm(error.message) : t("生成预览失败"));
      setMessageTone("error");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setLoading(true);
    setMessage("");
    setMessageTone(null);
    try {
      const response = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("确认导入失败"));
      setMessage(t("导入完成，学校库和学校筛查数据已更新。"));
      setMessageTone("success");
      setPreview(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? tm(error.message) : t("确认导入失败"));
      setMessageTone("error");
    } finally {
      setLoading(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    setMessage("");
    setMessageTone(null);
  }

  const s = preview?.summary;

  return (
    <section className="card import-workflow" aria-busy={loading}>
      <div className="card-header">
        <h3>{t(preview ? "预览结果" : "选择 Excel 文件")}</h3>
      </div>
      <div className="card-body">
        {message ? (
          <div
            aria-live="polite"
            className={`alert ${messageTone ?? ""}`}
            role={messageTone === "error" ? "alert" : "status"}
          >
            {message}
          </div>
        ) : null}

        {!preview ? (
          <form action={previewFiles} className="import-upload-form">
            <label className="import-file-control">
              <span>{t("高校项目 Excel 文件")}</span>
              <input name="file" type="file" accept=".xlsx,.xls" required />
            </label>
            <p className="small muted">
              {t("支持维护模板格式，确认预览前不会写入数据。")}
            </p>
            <div className="form-actions">
              <button className="primary" disabled={loading} type="submit">
                {loading ? t("处理中…") : t("生成导入预览")}
              </button>
            </div>
          </form>
        ) : s ? (
          <div className="import-preview">
            <div className="import-preview-files">
              <span className="muted">{t("文件")}</span>
              <strong>{preview.sourceNames.join("、")}</strong>
            </div>
            <div className="import-preview-summary">
              {(["schools", "programs"] as const).map((key) => {
                const counts = s[key];
                return (
                  <div className="import-summary-group" key={key}>
                    <strong>{t(key === "schools" ? "学校" : "项目")}</strong>
                    <span>{tv("新增 {n}", { n: counts.NEW ?? 0 })}</span>
                    <span>{tv("修改 {n}", { n: counts.MODIFIED ?? 0 })}</span>
                    <span>{tv("重复 {n}", { n: counts.DUPLICATE ?? 0 })}</span>
                    <span>{tv("冲突 {n}", { n: counts.CONFLICT ?? 0 })}</span>
                  </div>
                );
              })}
            </div>
            <p className="small muted import-preview-notes">
              {tv("源文件重复 {n} 条 · 待复核 {r} 条", {
                n: s.sourceDuplicates,
                r: s.needsReview,
              })}
              {s.fileConflicts
                ? tv(" · 文件内冲突 {n} 条", { n: s.fileConflicts })
                : ""}
              {s.fileSkipped ? tv(" · 缺少必填信息跳过 {n} 条", { n: s.fileSkipped }) : ""}
            </p>
            {preview.entries.length ? (
              <>
                <div className="table-wrap import-preview-table desktop-only">
                  <table>
                    <thead><tr><th>{t("记录")}</th><th>{t("动作")}</th><th>{t("说明")}</th></tr></thead>
                    <tbody>
                      {preview.entries.map((entry, index) => (
                        <tr key={`${entry.key}-${index}`}>
                          <td>{entry.key}</td>
                          <td>{t(actionLabels[entry.action] ?? entry.action)}</td>
                          <td>{entry.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="import-preview-mobile mobile-only">
                  {preview.entries.map((entry, index) => (
                    <article className="import-preview-mobile-item" key={`${entry.key}-${index}`}>
                      <strong>{entry.key}</strong>
                      <span>{t(actionLabels[entry.action] ?? entry.action)} · {entry.details}</span>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty">{t("没有可预览的记录")}</div>
            )}
            <div className="form-actions import-preview-actions">
              <button className="primary" disabled={loading || !preview.entries.length} onClick={confirm} type="button">
                {loading ? t("处理中…") : t("确认写入知识库")}
              </button>
              <button disabled={loading} onClick={cancelPreview} type="button">{t("取消")}</button>
            </div>
          </div>
        ) : (
          <div className="import-preview-empty">
            <div className="empty">{t("预览数据不可用，请重新选择文件。")}</div>
            <div className="form-actions">
              <button onClick={cancelPreview} type="button">{t("取消")}</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

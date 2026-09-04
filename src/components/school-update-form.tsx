"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { SchoolUpdateView } from "@/lib/school-updates";
import { useT } from "@/lib/i18n/locale-context";

export function SchoolUpdateForm({
  schoolId,
  initial = null,
  onSaved,
}: {
  schoolId: string;
  initial?: SchoolUpdateView | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const t = useT();
  const isEdit = Boolean(initial);

  async function uploadAttachment(
    schoolUpdateId: string,
    group: "PUBLIC" | "SECRET",
    file: File,
  ) {
    const form = new FormData();
    form.set("file", file);
    form.set("schoolUpdateId", schoolUpdateId);
    form.set("group", group);
    const response = await fetch("/api/school-updates/attachments", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? t("附件上传失败"));
    }
  }

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    try {
      const payload: Record<string, unknown> = {
        title: formData.get("title") || null,
        submitter: formData.get("submitter") || null,
        publicContent: formData.get("publicContent") || null,
        publicUrl: formData.get("publicUrl") || null,
        publicOperator: formData.get("publicOperator") || null,
        publicUpdatedAt: formData.get("publicUpdatedAt") || null,
        secretContent: formData.get("secretContent") || null,
        secretUrl: formData.get("secretUrl") || null,
        secretOperator: formData.get("secretOperator") || null,
        secretUpdatedAt: formData.get("secretUpdatedAt") || null,
      };
      const url = isEdit
        ? `/api/school-updates/${initial!.id}`
        : `/api/schools/${schoolId}/updates`;
      const response = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        id?: string;
        error?: string;
      };
      if (!response.ok || !result.id) {
        throw new Error(result.error ?? t("保存失败"));
      }
      const publicFile = formData.get("publicAttachment");
      const secretFile = formData.get("secretAttachment");
      if (publicFile instanceof File && publicFile.size > 0) {
        await uploadAttachment(result.id, "PUBLIC", publicFile);
      }
      if (secretFile instanceof File && secretFile.size > 0) {
        await uploadAttachment(result.id, "SECRET", secretFile);
      }
      setMessage(isEdit ? t("修改已保存") : t("更新记录已保存"));
      formRef.current?.reset();
      router.refresh();
      if (onSaved) {
        setTimeout(onSaved, 700);
      }
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t("保存失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={submit} className="update-form" ref={formRef}>
      <div className="update-form-main">
        <label>
          {t("标题")}
          <input
            name="title"
            defaultValue={initial?.title ?? ""}
            placeholder={t("例如：2026 秋季招生政策更新")}
          />
        </label>
        <label>
          {t("普通更新内容")}
          <textarea
            name="publicContent"
            rows={3}
            defaultValue={initial?.publicContent ?? ""}
            placeholder={t("对外可见的更新内容")}
          />
        </label>
        <label>
          {t("内部备注")}
          <textarea
            name="secretContent"
            rows={2}
            defaultValue={initial?.secretContent ?? ""}
            placeholder={t("仅机密人员可见")}
          />
        </label>
        <details className="update-form-more">
          <summary>{t("更多字段（提交人、操作人、时间、网址、附件）")}</summary>
          <div className="form-grid">
            <label>
              {t("提交人")}
              <input name="submitter" defaultValue={initial?.submitter ?? ""} />
            </label>
            <label>
              {t("普通操作人")}
              <input
                name="publicOperator"
                defaultValue={initial?.publicOperator ?? ""}
              />
            </label>
            <label>
              {t("普通更新时间")}
              <input
                name="publicUpdatedAt"
                type="datetime-local"
                defaultValue={
                  initial?.publicUpdatedAt
                    ? new Date(initial.publicUpdatedAt).toISOString().slice(0, 16)
                    : ""
                }
              />
            </label>
            <label>
              {t("普通网址")}
              <input
                name="publicUrl"
                type="url"
                defaultValue={initial?.publicUrl ?? ""}
                placeholder="https://"
              />
            </label>
            <label className="update-form-attachment">
              {t("普通附件（图片）")}
              <input
                name="publicAttachment"
                type="file"
                accept="image/*,.pdf,.docx,.xlsx"
              />
            </label>
            <label>
              {t("内部备注人")}
              <input
                name="secretOperator"
                defaultValue={initial?.secretOperator ?? ""}
              />
            </label>
            <label>
              {t("内部更新时间")}
              <input
                name="secretUpdatedAt"
                type="datetime-local"
                defaultValue={
                  initial?.secretUpdatedAt
                    ? new Date(initial.secretUpdatedAt).toISOString().slice(0, 16)
                    : ""
                }
              />
            </label>
            <label>
              {t("内部链接")}
              <input
                name="secretUrl"
                type="url"
                defaultValue={initial?.secretUrl ?? ""}
                placeholder="https://"
              />
            </label>
            <label className="update-form-attachment">
              {t("内部附件")}
              <input
                name="secretAttachment"
                type="file"
                accept="image/*,.pdf,.docx,.xlsx"
              />
            </label>
          </div>
        </details>
        <div className="form-actions">
          <button className="primary" disabled={loading} type="submit">
            {loading ? t("保存中…") : isEdit ? t("保存修改") : t("保存更新记录")}
          </button>
          <button
            disabled={loading}
            onClick={() => formRef.current?.reset()}
            type="button"
          >
            {t("清空")}
          </button>
        </div>
        {message ? (
          <div aria-live="polite" className="alert">
            {message}
          </div>
        ) : null}
      </div>
    </form>
  );
}

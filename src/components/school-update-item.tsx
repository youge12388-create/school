"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { SchoolUpdateView } from "@/lib/school-updates";
import { useT, useTv } from "@/lib/i18n/locale-context";

import { SchoolUpdateForm } from "@/components/school-update-form";

function formatDateTime(value: number | null | undefined) {
  if (value == null) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function UpdateLinks({
  url,
  attachments,
}: {
  url: string | null | undefined;
  attachments: { id: string; originalName: string }[];
}) {
  if (!url && !attachments.length) return null;
  return (
    <div className="update-links">
      {url ? (
        /^https?:\/\//i.test(url) ? (
          <a href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
        ) : (
          // 非 http(s) 链接不渲染为可点击链接（防 javascript: 等 scheme）。
          <span className="small muted">{url}</span>
        )
      ) : null}
      {attachments.map((attachment) => (
        <a
          href={`/api/school-updates/attachments/${attachment.id}`}
          target="_blank"
          rel="noreferrer"
          key={attachment.id}
        >
          {attachment.originalName}
        </a>
      ))}
    </div>
  );
}

export function SchoolUpdateItem({
  view,
  canManage,
}: {
  view: SchoolUpdateView;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const t = useT();
  const tv = useTv();

  const publicAttachments = view.attachments.filter(
    (attachment) => attachment.groupName === "PUBLIC",
  );
  const secretAttachments = view.attachments.filter(
    (attachment) => attachment.groupName === "SECRET",
  );
  const hasSecret = Boolean(
    view.secretContent ||
      view.secretUrl ||
      view.secretOperator ||
      view.secretUpdatedAt ||
      secretAttachments.length,
  );
  const personnelText =
    [
      view.submitter ? tv("提交人 {n}", { n: view.submitter }) : null,
      view.publicOperator ? tv("操作人 {n}", { n: view.publicOperator }) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  async function remove() {
    if (!window.confirm(t("确认删除这条更新记录？"))) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/school-updates/${view.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        window.alert(body.error ? t(body.error) : t("删除失败"));
        return;
      }
      router.refresh();
    } catch {
      window.alert(t("删除失败"));
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="update-item update-item-editing">
        <SchoolUpdateForm
          schoolId={view.schoolId}
          initial={view}
          onSaved={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <article className={`update-item${hasSecret ? " has-secret" : ""}`}>
      <div className="update-item-body">
        <div className="update-item-head">
          <strong>{view.title ?? t("院校信息更新")}</strong>
          <span className="update-item-time">{formatDateTime(view.createdAt)}</span>
          {canManage ? (
            <div className="update-actions">
              <button type="button" onClick={() => setEditing(true)}>
                {t("编辑")}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={remove}
                className="danger"
              >
                {t("删除")}
              </button>
            </div>
          ) : null}
        </div>
        {view.publicContent ? (
          <p className="update-content">{view.publicContent}</p>
        ) : null}
        <UpdateLinks url={view.publicUrl} attachments={publicAttachments} />
        {view.secretContent !== undefined && hasSecret ? (
          <div className="update-secret">
            <span className="update-secret-label">{t("内部备注")}</span>
            {view.secretContent ? (
              <p className="update-secret-content">{view.secretContent}</p>
            ) : null}
            <UpdateLinks url={view.secretUrl} attachments={secretAttachments} />
            {view.secretOperator ? (
              <p className="small muted">
                {tv("内部备注人：{n}", { n: view.secretOperator })}
              </p>
            ) : null}
          </div>
        ) : null}
        {view.secretContent !== undefined && personnelText ? (
          <p className="small muted update-personnel">{personnelText}</p>
        ) : null}
      </div>
    </article>
  );
}

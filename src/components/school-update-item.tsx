"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { SchoolUpdateView } from "@/lib/school-updates";

import { SchoolUpdateForm } from "@/components/school-update-form";

function formatDay(value: number | null | undefined) {
  if (value == null) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

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

  async function remove() {
    if (!window.confirm("确认删除这条更新记录？")) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/school-updates/${view.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        window.alert(body.error ?? "删除失败");
        return;
      }
      router.refresh();
    } catch {
      window.alert("删除失败");
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
      <div className="update-item-date">
        <span>{formatDay(view.createdAt)}</span>
      </div>
      <div className="update-item-body">
        <div className="update-item-head">
          <strong>{view.title ?? "院校信息更新"}</strong>
          <span className="small muted">{formatDateTime(view.createdAt)}</span>
        </div>
        {view.publicContent ? (
          <p className="update-content">{view.publicContent}</p>
        ) : null}
        {view.publicUrl ? (
          <p className="small">
            <a href={view.publicUrl} target="_blank" rel="noreferrer">
              {view.publicUrl}
            </a>
          </p>
        ) : null}
        {publicAttachments.length ? (
          <div className="update-attachments">
            {publicAttachments.map((attachment) => (
              <a
                className="update-attachment-link"
                href={`/api/school-updates/attachments/${attachment.id}`}
                target="_blank"
                rel="noreferrer"
                key={attachment.id}
              >
                {attachment.originalName}
              </a>
            ))}
          </div>
        ) : null}
        {view.secretContent !== undefined ? (
          <>
            {hasSecret ? (
              <div className="update-secret">
                <span className="update-secret-label">内部备注</span>
                {view.secretContent ? (
                  <p className="update-content">{view.secretContent}</p>
                ) : null}
                {view.secretUrl ? (
                  <p className="small">
                    <a href={view.secretUrl} target="_blank" rel="noreferrer">
                      {view.secretUrl}
                    </a>
                  </p>
                ) : null}
                {secretAttachments.length ? (
                  <div className="update-attachments">
                    {secretAttachments.map((attachment) => (
                      <a
                        className="update-attachment-link"
                        href={`/api/school-updates/attachments/${attachment.id}`}
                        target="_blank"
                        rel="noreferrer"
                        key={attachment.id}
                      >
                        {attachment.originalName}
                      </a>
                    ))}
                  </div>
                ) : null}
                {view.secretOperator ? (
                  <p className="small muted">内部备注人：{view.secretOperator}</p>
                ) : null}
              </div>
            ) : null}
            <p className="small muted update-personnel">
              {[
                view.submitter ? `提交人 ${view.submitter}` : null,
                view.publicOperator ? `操作人 ${view.publicOperator}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || null}
            </p>
          </>
        ) : null}
        {canManage ? (
          <div className="update-actions">
            <button type="button" onClick={() => setEditing(true)}>
              编辑
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={remove}
              className="danger"
            >
              删除
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function SchoolNoteSection({
  schoolId,
  note,
  canEdit = true,
}: {
  schoolId: string;
  note: string | null;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  async function save(formData: FormData) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/schools/${schoolId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infoNote: String(formData.get("infoNote") ?? "") }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "保存失败");
      }
      setEditing(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="school-note-section">
      <div className="school-note-head">
        <h4>备注</h4>
        {editing ? null : canEdit ? (
          <button className="school-note-edit" type="button" onClick={() => setEditing(true)}>
            {note ? "编辑备注" : "添加备注"}
          </button>
        ) : null}
      </div>
      {editing ? (
        <form ref={formRef} key={savedAt} action={save} className="school-note-editor">
          <textarea
            name="infoNote"
            rows={4}
            defaultValue={note ?? ""}
            placeholder="例如：每周同步申请进度；常见咨询口径；材料提交提醒。"
          />
          <div className="form-actions">
            <button className="primary" disabled={loading} type="submit">
              {loading ? "保存中…" : "保存备注"}
            </button>
            <button disabled={loading} type="button" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
          {message ? (
            <div aria-live="polite" className="alert">
              {message}
            </div>
          ) : null}
        </form>
      ) : note ? (
        <p className="school-note-content">{note}</p>
      ) : null}
    </div>
  );
}

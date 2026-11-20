"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { deleteRecommendationRecordAction } from "@/app/recommendation-record-actions";
import { useT, useTm, useTv } from "@/lib/i18n/locale-context";

export function DeleteRecommendationRecordButton({
  id,
  title,
  version,
  compact = false,
  redirectTo,
}: {
  id: string;
  title: string;
  version: number;
  compact?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const t = useT();
  const tm = useTm();
  const tv = useTv();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (deleting) return;
    if (!window.confirm(tv("确认删除方案“{title}”？删除后无法恢复。", { title }))) return;
    setDeleting(true);
    const data = new FormData();
    data.set("version", String(version));
    try {
      const result = await deleteRecommendationRecordAction(id, { error: "" }, data);
      if (result.error) {
        window.alert(tm(result.error));
        router.refresh();
        return;
      }
      if (redirectTo) router.replace(redirectTo);
      else router.refresh();
    } catch {
      window.alert(t("删除失败"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      className={compact ? "plan-index-delete" : "button danger"}
      disabled={deleting}
      onClick={remove}
      aria-label={`${t("删除方案")}：${title}`}
      title={t("删除方案")}
    >
      <Trash2 size={compact ? 14 : 16} aria-hidden="true" />
      <span>{t(deleting ? "正在删除…" : compact ? "删除" : "删除方案")}</span>
    </button>
  );
}

"use client";

import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";

import { updateRecommendationRecordAction } from "@/app/recommendation-record-actions";
import { PlanProfileFields } from "@/components/plan-profile-fields";
import { useT } from "@/lib/i18n/locale-context";
import type { RecommendationProfile } from "@/lib/recommendation-profile";

export function RecommendationRecordEditor({ id, version, profile }: {
  id: string;
  version: number;
  profile: RecommendationProfile;
}) {
  const t = useT();
  const router = useRouter();
  const [state, save, pending] = useActionState(updateRecommendationRecordAction.bind(null, id), { error: "", saved: false });

  useEffect(() => {
    if (state.saved) router.refresh();
  }, [router, state.saved]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => save(data));
  }

  return <details className="plan-detail-editor no-print">
    <summary><PencilLine size={15} aria-hidden="true" />{t("编辑记录")}</summary>
    <form action={save} onSubmit={submit} aria-busy={pending}>
      <fieldset className="plan-detail-form" disabled={pending}>
        <input type="hidden" name="version" value={version} />
        <PlanProfileFields profile={profile} />
      </fieldset>
      <div className="plan-detail-edit-actions">
        {state.error && <p className="plan-detail-error" role="alert">{state.error}</p>}
        {state.saved && !pending && <p className="plan-detail-saved" role="status">{t("修改已保存")}</p>}
        <button type="submit" className="primary" disabled={pending}>{t(pending ? "正在保存…" : "保存修改")}</button>
      </div>
    </form>
  </details>;
}

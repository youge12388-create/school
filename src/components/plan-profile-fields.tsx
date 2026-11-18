"use client";

import { useT } from "@/lib/i18n/locale-context";
import { RECOMMENDATION_FIELD_LIMITS as limits, type RecommendationProfile } from "@/lib/recommendation-profile";

export function PlanProfileFields({ profile, onChange, disabled }: {
  profile?: Partial<RecommendationProfile>;
  onChange?: (change: Partial<RecommendationProfile>) => void;
  disabled?: boolean;
}) {
  const t = useT();
  function field(key: keyof RecommendationProfile) {
    return onChange
      ? { value: profile?.[key] ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ [key]: event.target.value }) }
      : { defaultValue: profile?.[key] ?? "" };
  }

  return <>
    <label>
      <span>{t("学生姓名")}</span>
      <input name="studentName" required maxLength={limits.studentName} disabled={disabled} {...field("studentName")} />
    </label>
    <label>
      <span>{t("学生所在国家或地区")} <small>{t("选填")}</small></span>
      <input name="studentRegion" maxLength={limits.region} disabled={disabled} {...field("studentRegion")} />
    </label>
    <label>
      <span>{t("意向就读地区")} <small>{t("选填")}</small></span>
      <input name="preferredRegion" maxLength={limits.region} disabled={disabled} {...field("preferredRegion")} />
    </label>
    <label className="plan-notes-field">
      <span>{t("顾问备注")} <small>{t("选填 · 不随方案打印")}</small></span>
      <textarea name="notes" rows={2} maxLength={limits.notes} disabled={disabled}
        placeholder={t("记录推荐取舍或待确认事项")} {...field("notes")} />
    </label>
  </>;
}

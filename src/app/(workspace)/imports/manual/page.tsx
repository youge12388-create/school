import { ImportMethodTabs } from "@/components/import-method-tabs";
import { ManualEntryForm } from "@/components/manual-entry-form";
import { PageHeading } from "@/components/ui";
import { userHasPermission } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { makeT } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";

export default async function ManualImportPage() {
  const user = await requirePermission("DATA_IMPORT");
  const t = makeT(await getUiLocale());

  return (
    <>
      <PageHeading
        title={t("手动录入数据")}
        description={t("录入一所学校及其项目资料；仅学校中文名必填，其余字段可后续补充。")}
      />
      <ImportMethodTabs active="manual" />
      <ManualEntryForm
        canEditConfidential={userHasPermission(user, "SCHOOL_EDIT_CONFIDENTIAL")}
      />
    </>
  );
}

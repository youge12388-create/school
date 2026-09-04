import { ImportMethodTabs } from "@/components/import-method-tabs";
import { ManualEntryForm } from "@/components/manual-entry-form";
import { PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { makeT } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import {
  canEditConfidentialSchoolFields,
  IMPORT_ROLES,
} from "@/lib/permissions";

export default async function ManualImportPage() {
  const user = await requireRole([...IMPORT_ROLES]);
  const t = makeT(await getUiLocale());

  return (
    <>
      <PageHeading
        title={t("手动录入数据")}
        description={t("录入一所学校及其项目资料；仅学校中文名必填，其余字段可后续补充。")}
      />
      <ImportMethodTabs active="manual" />
      <ManualEntryForm
        canEditConfidential={canEditConfidentialSchoolFields(user.role)}
      />
    </>
  );
}

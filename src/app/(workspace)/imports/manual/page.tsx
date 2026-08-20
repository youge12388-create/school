import { ImportMethodTabs } from "@/components/import-method-tabs";
import { ManualEntryForm } from "@/components/manual-entry-form";
import { PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import {
  canViewConfidentialSchoolFields,
  IMPORT_ROLES,
} from "@/lib/permissions";

export default async function ManualImportPage() {
  const user = await requireRole([...IMPORT_ROLES]);

  return (
    <>
      <PageHeading
        title="手动录入数据"
        description="录入一所学校及其项目资料；仅学校中文名必填，其余字段可后续补充。"
      />
      <ImportMethodTabs active="manual" />
      <ManualEntryForm
        canEditConfidential={canViewConfidentialSchoolFields(user.role)}
      />
    </>
  );
}

import { ImportMethodTabs } from "@/components/import-method-tabs";
import { ManualEntryForm } from "@/components/manual-entry-form";
import { PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export default async function ManualImportPage() {
  await requireRole(["ADMIN", "DATA_MANAGER"]);

  return (
    <>
      <PageHeading
        title="手动录入数据"
        description="录入一所学校及其项目资料；仅学校中文名必填，其余字段可后续补充。"
      />
      <ImportMethodTabs active="manual" />
      <ManualEntryForm />
    </>
  );
}

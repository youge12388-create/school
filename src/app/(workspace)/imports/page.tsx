import { ImportPanel } from "@/components/import-panel";
import { SchoolUpdateImportPanel } from "@/components/school-update-import-panel";
import { Badge, PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { makeT } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import {
  canManageSchoolUpdates,
  IMPORT_ROLES,
} from "@/lib/permissions";
import { listImports } from "@/lib/queries";
import { formatDate, safeJson } from "@/lib/utils";

export default async function ImportsPage() {
  const user = await requireRole([...IMPORT_ROLES]);
  const locale = await getUiLocale();
  const t = makeT(locale);
  const canImportSchoolUpdates = canManageSchoolUpdates(user.role);
  const batches = await listImports();
  return (
    <>
      <PageHeading
        title={t("数据录入")}
        description={t("支持 Excel 批量导入或手动录入一条。人工确认的数据不会被后续批量导入自动覆盖。")}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <a className="button" href="/api/templates/maintenance">{t("下载维护模板")}</a>
            <a className="button" href="/api/templates/programs">{t("导出完整数据")}</a>
          </div>
        }
      />
      <ImportPanel />
      {canImportSchoolUpdates ? <SchoolUpdateImportPanel /> : null}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>{t("导入历史")}</h3></div>
        <div className="card-body">
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t("文件")}</th><th>{t("状态")}</th><th>{t("摘要")}</th><th>{t("时间")}</th></tr></thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.sourceName}</td>
                    <td>
                      <Badge tone={batch.status === "CONFIRMED" ? "green" : "amber"}>
                        {batch.status === "CONFIRMED" ? t("已确认") : t("仅预览")}
                      </Badge>
                    </td>
                    <td className="small">
                      {JSON.stringify(safeJson(batch.summaryJson, {}))}
                    </td>
                    <td>{formatDate(batch.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

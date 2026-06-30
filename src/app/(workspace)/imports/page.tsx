import { ImportPanel } from "@/components/import-panel";
import { Badge, PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { listImports } from "@/lib/queries";
import { formatDate, safeJson } from "@/lib/utils";

export default async function ImportsPage() {
  await requireRole(["ADMIN", "DATA_MANAGER"]);
  const batches = await listImports();
  return (
    <>
      <PageHeading
        title="数据录入"
        description="支持 Excel 批量导入或手动录入一条。人工确认的数据不会被后续批量导入自动覆盖。"
        action={<a className="button" href="/api/templates/programs">下载维护模板</a>}
      />
      <ImportPanel />
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>导入历史</h3></div>
        <div className="card-body">
          <div className="table-wrap">
            <table>
              <thead><tr><th>文件</th><th>状态</th><th>摘要</th><th>时间</th></tr></thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.sourceName}</td>
                    <td>
                      <Badge tone={batch.status === "CONFIRMED" ? "green" : "amber"}>
                        {batch.status === "CONFIRMED" ? "已确认" : "仅预览"}
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

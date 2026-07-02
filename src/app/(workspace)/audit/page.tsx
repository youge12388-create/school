import { Pagination } from "@/components/pagination";
import { PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { listAuditLogs } from "@/lib/queries";
import { formatDate, safeJson } from "@/lib/utils";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole(["ADMIN", "DATA_MANAGER"]);
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const result = await listAuditLogs(page);
  const rows = result.rows;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <>
      <PageHeading
        title="操作审计"
        description="日志仅追加，不提供网页删除或修改入口。重点记录登录、客户、申请、文件和数据导入操作。"
      />
      <div className="table-wrap">
        <table>
          <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>详情</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((log) => (
              <tr key={log.id}>
                <td className="nowrap">{formatDate(log.createdAt)}</td>
                <td>{log.displayName || "系统/匿名"}</td>
                <td><strong>{log.action}</strong></td>
                <td>{log.entityType}<div className="small muted">{log.entityId || "—"}</div></td>
                <td className="small">{JSON.stringify(safeJson(log.detailsJson, {}))}</td>
                <td>{log.ipAddress || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} basePath="/audit" />
      ) : null}
    </>
  );
}

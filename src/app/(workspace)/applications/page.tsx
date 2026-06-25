import { Badge, PageHeading } from "@/components/ui";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/constants";
import { listApplications } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "" } = await searchParams;
  const rows = await listApplications(status);
  return (
    <>
      <PageHeading
        title="申请流程"
        description="每个学校项目建立独立申请；状态可回退或跳转，但必须填写原因。"
      />
      <form className="toolbar">
        <label>
          申请状态
          <select name="status" defaultValue={status}>
            <option value="">全部</option>
            {APPLICATION_STATUSES.map((value) => (
              <option value={value} key={value}>{APPLICATION_STATUS_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <button type="submit">筛选</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>客户</th>
              <th>学校 / 项目</th>
              <th>状态</th>
              <th>负责人</th>
              <th>最近更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((application) => (
              <tr key={application.id}>
                <td>
                  <a href={`/customers/${application.customerId}`}>
                    <strong>{application.customerName}</strong>
                    <div className="small muted">{application.customerNo}</div>
                  </a>
                </td>
                <td>
                  <a href={`/applications/${application.id}`}>
                    <strong>{application.schoolName}</strong>
                    <div className="small muted">{application.programName}</div>
                  </a>
                </td>
                <td>
                  <Badge tone="blue">
                    {APPLICATION_STATUS_LABELS[application.status as ApplicationStatus] ?? application.status}
                  </Badge>
                </td>
                <td>{application.ownerName || "—"}</td>
                <td>{formatDate(application.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

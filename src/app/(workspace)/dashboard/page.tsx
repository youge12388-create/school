import Link from "next/link";

import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { getDashboardData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const data = await getDashboardData();
  return (
    <>
      <PageHeading
        title="今日工作台"
        description="集中查看待跟进客户、临近截止项目、补件申请和数据复核任务。"
        action={
          <Link className="button primary" href="/screening">
            开始筛查
          </Link>
        }
      />
      <section className="grid cols-4">
        <div className="card stat">
          <div className="stat-label">学校</div>
          <div className="stat-number">{data.counts.schools}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">项目</div>
          <div className="stat-number">{data.counts.programs}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">有效客户</div>
          <div className="stat-number">{data.counts.customers}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">待复核项目</div>
          <div className="stat-number">{data.counts.needsReview}</div>
        </div>
      </section>

      <section className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3>7 天内待跟进</h3>
            <Link href="/customers">全部客户</Link>
          </div>
          <div className="card-body">
            {data.dueCustomers.length ? (
              <table>
                <tbody>
                  {data.dueCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <Link href={`/customers/${customer.id}`}>
                          <strong>{customer.name}</strong>
                          <div className="small muted">{customer.customerNo}</div>
                        </Link>
                      </td>
                      <td className="nowrap">{formatDate(customer.nextFollowUpAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState>暂无到期跟进事项</EmptyState>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3>30 天内截止项目</h3>
          </div>
          <div className="card-body">
            {data.deadlines.length ? (
              <table>
                <tbody>
                  {data.deadlines.map((program) => (
                    <tr key={program.id}>
                      <td>
                        <strong>{program.schoolName}</strong>
                        <div className="small muted">{program.name}</div>
                      </td>
                      <td className="nowrap">
                        <Badge tone="amber">{formatDate(program.deadlineDate)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState>暂无已结构化的临近截止项目</EmptyState>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3>待补件申请</h3>
            <Link href="/applications?status=SUPPLEMENT_REQUIRED">查看流程</Link>
          </div>
          <div className="card-body">
            {data.supplementApplications.length ? (
              <table>
                <tbody>
                  {data.supplementApplications.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/applications/${item.id}`}>
                          <strong>{item.customerName}</strong>
                          <div className="small muted">{item.programName}</div>
                        </Link>
                      </td>
                      <td>
                        <Badge tone="amber">补件</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState>暂无待补件申请</EmptyState>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3>最近操作</h3>
            <Link href="/audit">操作审计</Link>
          </div>
          <div className="card-body">
            {data.recentAudit.length ? (
              <table>
                <tbody>
                  {data.recentAudit.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <strong>{log.displayName ?? "系统"}</strong>
                        <div className="small muted">
                          {log.action} · {log.entityType}
                        </div>
                      </td>
                      <td className="small nowrap">{formatDate(log.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState>暂无操作记录</EmptyState>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

import Link from "next/link";

import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { getDashboardData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import {
  Building2,
  ClipboardList,
  FileClock,
  GraduationCap,
  LayoutList,
  Users,
} from "lucide-react";

export default async function DashboardPage() {
  const data = await getDashboardData();
  return (
    <>
      <PageHeading
        title="今日工作"
        description="集中查看待跟进客户、临近截止项目、补件申请和数据复核任务。"
        action={
          <Link className="button primary" href="/screening">
            开始筛查
          </Link>
        }
      />

      <section className="grid cols-4 desktop-only">
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

      <section className="mobile-only mobile-dashboard-stats">
        <div className="mobile-stat-card">
          <div>
            <div className="mobile-stat-label">学校</div>
            <div className="mobile-stat-number">{data.counts.schools}</div>
          </div>
          <Building2 aria-hidden="true" />
        </div>
        <div className="mobile-stat-card">
          <div>
            <div className="mobile-stat-label">项目</div>
            <div className="mobile-stat-number">{data.counts.programs}</div>
          </div>
          <GraduationCap aria-hidden="true" />
        </div>
        <div className="mobile-stat-card">
          <div>
            <div className="mobile-stat-label">有效客户</div>
            <div className="mobile-stat-number">{data.counts.customers}</div>
          </div>
          <Users aria-hidden="true" />
        </div>
        <div className="mobile-stat-card">
          <div>
            <div className="mobile-stat-label">待复核项目</div>
            <div className="mobile-stat-number">{data.counts.needsReview}</div>
          </div>
          <LayoutList aria-hidden="true" />
        </div>
      </section>

      <section className="grid cols-2 desktop-only" style={{ marginTop: 16 }}>
        <DashboardCard
          title="7 天内待跟进"
          moreHref="/customers"
          moreLabel="全部客户"
          empty={<EmptyState>暂无到期跟进事项</EmptyState>}
        >
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
        </DashboardCard>
        <DashboardCard
          title="30 天内截止项目"
          empty={<EmptyState>暂无已结构化的临近截止项目</EmptyState>}
        >
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
        </DashboardCard>
        <DashboardCard
          title="待补件申请"
          moreHref="/applications?status=SUPPLEMENT_REQUIRED"
          moreLabel="查看流程"
          empty={<EmptyState>暂无待补件申请</EmptyState>}
        >
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
        </DashboardCard>
        <DashboardCard
          title="最近操作"
          moreHref="/audit"
          moreLabel="操作审计"
          empty={<EmptyState>暂无操作记录</EmptyState>}
        >
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
        </DashboardCard>
      </section>

      <section className="mobile-only mobile-dashboard-sections">
        <MobileSection title="7 天内待跟进" href="/customers" more="全部客户">
          {data.dueCustomers.length ? (
            data.dueCustomers.map((customer) => (
              <Link key={customer.id} href={`/customers/${customer.id}`} className="mobile-list-item">
                <div>
                  <strong>{customer.name}</strong>
                  <div className="small muted">{customer.customerNo}</div>
                </div>
                <span className="small muted">{formatDate(customer.nextFollowUpAt)}</span>
              </Link>
            ))
          ) : (
            <div className="mobile-empty"><ClipboardList aria-hidden="true" /> 暂无须跟进事项</div>
          )}
        </MobileSection>

        <MobileSection title="30 天内截止项目">
          {data.deadlines.length ? (
            data.deadlines.map((program) => (
              <div key={program.id} className="mobile-list-item">
                <div>
                  <strong>{program.schoolName}</strong>
                  <div className="small muted">{program.name}</div>
                </div>
                <Badge tone="amber">{formatDate(program.deadlineDate)}</Badge>
              </div>
            ))
          ) : (
            <div className="mobile-empty">暂无已结构化的临近截止项目</div>
          )}
          {data.deadlines.length ? (
            <Link href="/screening" className="mobile-section-more">查看全部</Link>
          ) : null}
        </MobileSection>

        <MobileSection title="待补件申请" href="/applications?status=SUPPLEMENT_REQUIRED" more="查看流程">
          {data.supplementApplications.length ? (
            data.supplementApplications.map((item) => (
              <Link key={item.id} href={`/applications/${item.id}`} className="mobile-list-item">
                <div>
                  <strong>{item.customerName}</strong>
                  <div className="small muted">{item.programName}</div>
                </div>
                <Badge tone="amber">补件</Badge>
              </Link>
            ))
          ) : (
            <div className="mobile-empty"><FileClock aria-hidden="true" /> 暂无待补件申请</div>
          )}
        </MobileSection>

        <MobileSection title="最近操作" href="/audit" more="操作审计">
          {data.recentAudit.map((log) => (
            <div key={log.id} className="mobile-list-item">
              <div>
                <strong>{log.displayName ?? "系统"}</strong>
                <div className="small muted">{log.action} · {log.entityType}</div>
              </div>
              <span className="small muted">{formatDate(log.createdAt)}</span>
            </div>
          ))}
          {data.recentAudit.length ? (
            <Link href="/audit" className="mobile-section-more">查看全部</Link>
          ) : null}
        </MobileSection>
      </section>
    </>
  );
}

function DashboardCard({
  title,
  moreHref,
  moreLabel,
  empty,
  children,
}: {
  title: string;
  moreHref?: string;
  moreLabel?: string;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="card">
      <div className="card-header">
        <h3>{title}</h3>
        {moreHref ? <Link href={moreHref}>{moreLabel}</Link> : null}
      </div>
      <div className="card-body">
        {hasChildren ? <table><tbody>{children}</tbody></table> : empty}
      </div>
    </div>
  );
}

function MobileSection({
  title,
  href,
  more,
  children,
}: {
  title: string;
  href?: string;
  more?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mobile-section">
      <div className="mobile-section-header">
        <h3>{title}</h3>
        {href ? <Link href={href}>{more}</Link> : null}
      </div>
      <div className="mobile-section-body">{children}</div>
    </div>
  );
}

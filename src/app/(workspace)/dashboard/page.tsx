import Link from "next/link";

import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { AUDIT_ACTION_LABELS, ENTITY_TYPE_LABELS } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { isMarketManager } from "@/lib/permissions";
import { getDashboardData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import {
  Building2,
  GraduationCap,
  LayoutList,
  Users,
} from "lucide-react";

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getT();
  const marketManagerView = isMarketManager(user.role);
  const data = await getDashboardData();
  return (
    <>
      <PageHeading
        title={t("今日工作")}
        description={
          marketManagerView
            ? t("查看学校项目与临近截止信息。")
            : t("集中查看临近截止项目和数据复核任务。")
        }
        action={
          <Link className="button primary" href="/screening">
            {t("开始筛查")}
          </Link>
        }
      />

      <section className="grid cols-4 desktop-only">
        <div className="card stat">
          <div className="stat-label">{t("学校")}</div>
          <div className="stat-number">{data.counts.schools}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("项目")}</div>
          <div className="stat-number">{data.counts.programs}</div>
        </div>
        {!marketManagerView ? (
          <>
            <div className="card stat">
              <div className="stat-label">{t("有效客户")}</div>
              <div className="stat-number">{data.counts.customers}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">{t("待复核项目")}</div>
              <div className="stat-number">{data.counts.needsReview}</div>
            </div>
          </>
        ) : null}
      </section>

      <section className="mobile-only mobile-dashboard-stats">
        <div className="mobile-stat-card">
          <div>
            <div className="mobile-stat-label">{t("学校")}</div>
            <div className="mobile-stat-number">{data.counts.schools}</div>
          </div>
          <Building2 aria-hidden="true" />
        </div>
        <div className="mobile-stat-card">
          <div>
            <div className="mobile-stat-label">{t("项目")}</div>
            <div className="mobile-stat-number">{data.counts.programs}</div>
          </div>
          <GraduationCap aria-hidden="true" />
        </div>
        {!marketManagerView ? (
          <>
            <div className="mobile-stat-card">
              <div>
                <div className="mobile-stat-label">{t("有效客户")}</div>
                <div className="mobile-stat-number">{data.counts.customers}</div>
              </div>
              <Users aria-hidden="true" />
            </div>
            <div className="mobile-stat-card">
              <div>
                <div className="mobile-stat-label">{t("待复核项目")}</div>
                <div className="mobile-stat-number">{data.counts.needsReview}</div>
              </div>
              <LayoutList aria-hidden="true" />
            </div>
          </>
        ) : null}
      </section>

      <section className="grid cols-2 desktop-only" style={{ marginTop: 16 }}>
        <DashboardCard
          title={t("30 天内截止项目")}
          empty={<EmptyState>{t("暂无已结构化的临近截止项目")}</EmptyState>}
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
        {!marketManagerView ? (
          <DashboardCard
            title={t("最近操作")}
            moreHref="/audit"
            moreLabel={t("操作审计")}
            empty={<EmptyState>{t("暂无操作记录")}</EmptyState>}
          >
            {data.recentAudit.map((log) => (
              <tr key={log.id}>
                <td>
                  <strong>{log.displayName ?? t("系统")}</strong>
                  <div className="small muted">
                    {t(AUDIT_ACTION_LABELS[log.action] || log.action)} · {t(ENTITY_TYPE_LABELS[log.entityType as keyof typeof ENTITY_TYPE_LABELS] || log.entityType)}
                  </div>
                </td>
                <td className="small nowrap">{formatDate(log.createdAt)}</td>
              </tr>
            ))}
          </DashboardCard>
        ) : null}
      </section>

      <section className="mobile-only mobile-dashboard-sections">
        <MobileSection title={t("30 天内截止项目")}>
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
            <div className="mobile-empty">{t("暂无已结构化的临近截止项目")}</div>
          )}
          {data.deadlines.length ? (
            <Link href="/screening" className="mobile-section-more">{t("查看全部")}</Link>
          ) : null}
        </MobileSection>

        {!marketManagerView ? (
          <MobileSection title={t("最近操作")} href="/audit" more={t("操作审计")}>
            {data.recentAudit.map((log) => (
              <div key={log.id} className="mobile-list-item">
                <div>
                  <strong>{log.displayName ?? t("系统")}</strong>
                  <div className="small muted">{t(AUDIT_ACTION_LABELS[log.action] || log.action)} · {t(ENTITY_TYPE_LABELS[log.entityType as keyof typeof ENTITY_TYPE_LABELS] || log.entityType)}</div>
                </div>
                <span className="small muted">{formatDate(log.createdAt)}</span>
              </div>
            ))}
            {data.recentAudit.length ? (
              <Link href="/audit" className="mobile-section-more">{t("查看全部")}</Link>
            ) : null}
          </MobileSection>
        ) : null}
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

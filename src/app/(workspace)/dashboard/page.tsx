import { ArrowRight, CalendarClock, History } from "lucide-react";
import Link from "next/link";

import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { getUserPermissions } from "@/lib/access-control";
import { AUDIT_ACTION_LABELS, ENTITY_TYPE_LABELS, type AuditEntityType } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { hasPermission, isMarketManager } from "@/lib/permissions";
import { getDashboardData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requirePermission("WORKSPACE_VIEW");
  const t = await getT();
  const marketManagerView = isMarketManager(user.role);
  const permissions = getUserPermissions(user);
  const canViewScreening = hasPermission(permissions, "SCREENING_VIEW");
  const canViewAudit = hasPermission(permissions, "AUDIT_VIEW");
  const { counts, deadlines, recentAudit } = await getDashboardData({ includeAudit: canViewAudit });
  const stats = [
    { label: "学校", value: counts.schools, tone: "blue" },
    { label: "项目", value: counts.programs, tone: "green" },
    ...(!marketManagerView ? [
      { label: "有效客户", value: counts.customers, tone: "indigo" },
      { label: "待复核项目", value: counts.needsReview, tone: "amber" },
    ] : []),
  ];

  return (
    <>
      <PageHeading
        title={t("今日工作")}
        description={marketManagerView ? t("查看学校项目与临近截止信息。") : t("集中查看临近截止项目和数据复核任务。")}
        action={canViewScreening ? (
          <Link className="button primary" href="/screening">
            {t("开始筛查")} <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ) : undefined}
      />

      <section className="dashboard-overview" aria-labelledby="dashboard-overview-title">
        <h2 id="dashboard-overview-title">{t("资源概览")}</h2>
        <dl className={`dashboard-metrics${marketManagerView ? " is-compact" : ""}`}>
          {stats.map(({ label, value, tone }) => (
            <div key={label} data-tone={tone}>
              <dt>{t(label)}</dt>
              <dd>{value.toLocaleString("en-US")}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className={`dashboard-panels${canViewAudit ? "" : " is-single"}`}>
        <section className="card dashboard-panel" aria-labelledby="dashboard-deadlines-title">
          <header className="card-header">
            <h2 id="dashboard-deadlines-title"><CalendarClock size={18} aria-hidden="true" /> {t("30 天内截止项目")}</h2>
            {canViewScreening && <Link href="/screening">{t("前往筛查")} <ArrowRight size={14} aria-hidden="true" /></Link>}
          </header>
          {deadlines.length ? (
            <ul className="dashboard-records">
              {deadlines.map((program) => (
                <li key={program.id}>
                  <div><strong>{program.schoolName}</strong><span>{program.name}</span></div>
                  <Badge tone="amber">{formatDate(program.deadlineDate)}</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyState>{t("暂无已结构化的临近截止项目")}</EmptyState>}
        </section>
        {canViewAudit && (
          <section className="card dashboard-panel" aria-labelledby="dashboard-audit-title">
            <header className="card-header">
              <h2 id="dashboard-audit-title"><History size={18} aria-hidden="true" /> {t("最近操作")}</h2>
              <Link href="/audit">{t("操作审计")} <ArrowRight size={14} aria-hidden="true" /></Link>
            </header>
            {recentAudit.length ? (
              <ul className="dashboard-records">
                {recentAudit.map((log) => (
                  <li key={log.id}>
                    <div>
                      <strong>{t(AUDIT_ACTION_LABELS[log.action] || log.action)}</strong>
                      <span>{log.displayName ?? t("系统")} · {t(ENTITY_TYPE_LABELS[log.entityType as AuditEntityType] || log.entityType)}</span>
                    </div>
                    <span className="dashboard-record-date small muted">{formatDate(log.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState>{t("暂无操作记录")}</EmptyState>}
          </section>
        )}
      </div>
    </>
  );
}

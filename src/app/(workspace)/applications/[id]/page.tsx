import { notFound } from "next/navigation";

import { updateApplicationStatusAction } from "@/app/actions";
import { Badge, EmptyState, PageHeading } from "@/components/ui";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/constants";
import { getApplication } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getApplication(id);
  if (!data) notFound();
  const application = data.application;
  const statusLabel = APPLICATION_STATUS_LABELS[application.status as ApplicationStatus] ?? application.status;
  const requirements = application.requirementsText || "数据库未有相关信息";
  return (
    <>
      <PageHeading
        title={application.schoolName}
        description={`${application.customerName}（${application.customerNo}）· ${application.programName}`}
        action={<Badge tone="blue">{statusLabel}</Badge>}
      />

      {/* 状态条：申请截止 + 当前状态，一眼定位 */}
      <div className="detail-status-bar">
        <div className="status-item">
          <span>当前状态</span>
          <Badge tone="blue">{statusLabel}</Badge>
        </div>
        <div className="status-item">
          <span>申请截止</span>
          <strong>{formatDate(application.deadlineDate)}</strong>
        </div>
        <div className="status-item">
          <span>客户</span>
          <strong>{application.customerName}（{application.customerNo}）</strong>
        </div>
        <div className="status-item">
          <span>项目</span>
          <strong>{application.programName}</strong>
        </div>
      </div>

      {/* 项目要求：重点信息，不折叠 */}
      <section className="card card-compact detail-section">
        <div className="card-header"><h3>项目要求及材料</h3></div>
        <div className="card-body">
          <p className="program-material-body">{requirements}</p>
        </div>
      </section>

      {/* 调整状态：操作卡，视觉权重低 */}
      <section className="detail-action-card detail-section">
        <div className="card-header"><h3>调整状态</h3></div>
        <div className="card-body">
          <form action={updateApplicationStatusAction} className="application-status-form">
            <input type="hidden" name="applicationId" value={id} />
            <label>
              新状态
              <select name="toStatus" defaultValue={application.status}>
                {APPLICATION_STATUSES.map((status) => (
                  <option value={status} key={status}>{APPLICATION_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
            <div className="form-actions"><button className="primary" type="submit">保存状态</button></div>
            <label className="wide">
              调整原因
              <textarea name="reason" required placeholder="回退、跳转和正常推进均需记录原因" />
            </label>
          </form>
        </div>
      </section>

      {/* 状态时间线 */}
      <section className="card card-compact detail-section">
        <div className="card-header">
          <h3>状态时间线</h3>
          <span className="small muted">{data.events.length} 条</span>
        </div>
        <div className="card-body">
          {data.events.length ? (
            <div className="detail-timeline">
              {data.events.map((event) => (
                <div className="detail-timeline-item" key={event.id}>
                  <strong>
                    {event.fromStatus
                      ? `${APPLICATION_STATUS_LABELS[event.fromStatus as ApplicationStatus] ?? event.fromStatus} → `
                      : ""}
                    {APPLICATION_STATUS_LABELS[event.toStatus as ApplicationStatus] ?? event.toStatus}
                  </strong>
                  <div className="small">{event.actorName} · {formatDate(event.createdAt)}</div>
                  <p>{event.reason}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState>暂无状态变更记录</EmptyState>}
        </div>
      </section>
    </>
  );
}

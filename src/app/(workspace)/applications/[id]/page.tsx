import { notFound } from "next/navigation";

import { updateApplicationStatusAction } from "@/app/actions";
import { Badge, PageHeading } from "@/components/ui";
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
  return (
    <>
      <PageHeading
        title={application.schoolName}
        description={`${application.customerName}（${application.customerNo}）· ${application.programName}`}
        action={
          <Badge tone="blue">
            {APPLICATION_STATUS_LABELS[application.status as ApplicationStatus] ?? application.status}
          </Badge>
        }
      />
      <section className="grid cols-2">
        <div className="card">
          <div className="card-header"><h3>调整状态</h3></div>
          <div className="card-body">
            <form action={updateApplicationStatusAction}>
              <input type="hidden" name="applicationId" value={id} />
              <label>
                新状态
                <select name="toStatus" defaultValue={application.status}>
                  {APPLICATION_STATUSES.map((status) => (
                    <option value={status} key={status}>{APPLICATION_STATUS_LABELS[status]}</option>
                  ))}
                </select>
              </label>
              <label style={{ marginTop: 12 }}>
                调整原因
                <textarea name="reason" required placeholder="回退、跳转和正常推进均需记录原因" />
              </label>
              <div className="form-actions"><button className="primary" type="submit">保存状态</button></div>
            </form>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>项目要求</h3></div>
          <div className="card-body">
            <p>申请截止：{formatDate(application.deadlineDate)}</p>
            <p style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>
              {application.requirementsText || "数据库未有相关信息"}
            </p>
          </div>
        </div>
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>状态时间线</h3></div>
        <div className="card-body">
          <div className="timeline">
            {data.events.map((event) => (
              <div className="timeline-item" key={event.id}>
                <strong>
                  {event.fromStatus
                    ? `${APPLICATION_STATUS_LABELS[event.fromStatus as ApplicationStatus] ?? event.fromStatus} → `
                    : ""}
                  {APPLICATION_STATUS_LABELS[event.toStatus as ApplicationStatus] ?? event.toStatus}
                </strong>
                <div className="small muted">{event.actorName} · {formatDate(event.createdAt)}</div>
                <p>{event.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

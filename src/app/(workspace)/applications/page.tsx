import Link from "next/link";

import { Badge, PageHeading } from "@/components/ui";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/constants";
import { makeT } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import { listApplications } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "" } = await searchParams;
  const locale = await getUiLocale();
  const t = makeT(locale);
  const rows = await listApplications(status);
  return (
    <>
      <PageHeading
        title={t("申请流程")}
        description={t("每个学校项目建立独立申请；状态可回退或跳转，但必须填写原因。")}
      />
      <form className="toolbar">
        <label>
          {t("申请状态")}
          <select name="status" defaultValue={status}>
            <option value="">{t("全部")}</option>
            {APPLICATION_STATUSES.map((value) => (
              <option value={value} key={value}>{t(APPLICATION_STATUS_LABELS[value])}</option>
            ))}
          </select>
        </label>
        <button type="submit">{t("筛选")}</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("客户")}</th>
              <th>{t("学校 / 项目")}</th>
              <th>{t("状态")}</th>
              <th>{t("负责人")}</th>
              <th>{t("最近更新")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((application) => (
              <tr key={application.id}>
                <td>
                  <Link href={`/customers/${application.customerId}`}>
                    <strong>{application.customerName}</strong>
                    <div className="small muted">{application.customerNo}</div>
                  </Link>
                </td>
                <td>
                  <Link href={`/applications/${application.id}`}>
                    <strong>{application.schoolName}</strong>
                    <div className="small muted">{application.programName}</div>
                  </Link>
                </td>
                <td>
                  <Badge tone="blue">
                    {t(APPLICATION_STATUS_LABELS[application.status as ApplicationStatus] ?? application.status)}
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

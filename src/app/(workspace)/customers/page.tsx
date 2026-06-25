import Link from "next/link";

import { Badge, EmptyState, PageHeading } from "@/components/ui";
import {
  ADMISSION_STATUS_LABELS,
  ADMISSION_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  PROGRAM_TYPE_LABELS,
  type AdmissionStatus,
  type ContractStatus,
} from "@/lib/constants";
import { listCustomerOwners, listCustomers } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

function contractTone(status: ContractStatus) {
  if (status === "SIGNED") return "green" as const;
  if (status === "NOT_SIGNED") return "amber" as const;
  return "gray" as const;
}

function admissionTone(status: AdmissionStatus) {
  if (status === "ADMITTED") return "green" as const;
  if (status === "IN_PROGRESS") return "blue" as const;
  if (status === "REJECTED") return "red" as const;
  return "gray" as const;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    ownerId?: string;
    contractStatus?: string;
    admissionStatus?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const ownerId = params.ownerId ?? "";
  const contractStatus = CONTRACT_STATUSES.includes(
    params.contractStatus as ContractStatus,
  )
    ? (params.contractStatus as ContractStatus)
    : "";
  const admissionStatus = ADMISSION_STATUSES.includes(
    params.admissionStatus as AdmissionStatus,
  )
    ? (params.admissionStatus as AdmissionStatus)
    : "";
  const [rows, owners] = await Promise.all([
    listCustomers({ query: q, ownerId, contractStatus, admissionStatus }),
    Promise.resolve(listCustomerOwners()),
  ]);

  return (
    <>
      <PageHeading
        title="客户管理"
        description="集中查看负责老师、签约进度、院校录取情况和后续跟进记录。"
        action={<Link className="button primary" href="/customers/new">新增客户</Link>}
      />

      <form className="toolbar customer-filter-toolbar">
        <label className="search">
          搜索客户
          <input name="q" defaultValue={q} placeholder="姓名、客户编号或电话" />
        </label>
        <label>
          负责老师
          <select name="ownerId" defaultValue={ownerId}>
            <option value="">全部老师</option>
            {owners.map((owner) => (
              <option value={owner.id} key={owner.id}>{owner.displayName}</option>
            ))}
          </select>
        </label>
        <label>
          签约状态
          <select name="contractStatus" defaultValue={contractStatus}>
            <option value="">全部状态</option>
            {CONTRACT_STATUSES.map((status) => (
              <option value={status} key={status}>{CONTRACT_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <label>
          院校录取情况
          <select name="admissionStatus" defaultValue={admissionStatus}>
            <option value="">全部情况</option>
            {ADMISSION_STATUSES.map((status) => (
              <option value={status} key={status}>{ADMISSION_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <div className="toolbar-actions">
          <button className="primary" type="submit">筛选</button>
          <Link className="button" href="/customers">重置</Link>
        </div>
      </form>

      <div className="table-wrap customer-table-wrap">
        {rows.length ? (
          <table className="customer-table">
            <thead>
              <tr>
                <th>客户</th>
                <th>申请目标</th>
                <th>负责老师</th>
                <th>签约状态</th>
                <th>院校录取情况</th>
                <th>后续跟进情况</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/customers/${customer.id}`}>
                      <strong>{customer.name}</strong>
                    </Link>
                    <div className="small muted">{customer.customerNo}</div>
                    <div className="small muted">{customer.nationality || "国籍未录入"}</div>
                  </td>
                  <td>
                    <strong>{PROGRAM_TYPE_LABELS[customer.targetDegree || ""] || "学历未确定"}</strong>
                    <div className="small muted">{customer.targetMajor || "专业未确定"}</div>
                  </td>
                  <td>{customer.ownerName || "未分配"}</td>
                  <td>
                    <Badge tone={contractTone(customer.contractStatus)}>
                      {CONTRACT_STATUS_LABELS[customer.contractStatus]}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={admissionTone(customer.admissionStatus)}>
                      {ADMISSION_STATUS_LABELS[customer.admissionStatus]}
                    </Badge>
                  </td>
                  <td className="customer-follow-up-cell">
                    {customer.latestFollowUpContent ? (
                      <>
                        <div className="follow-up-summary">
                          <strong>{customer.latestFollowUpChannel || "沟通记录"}</strong>
                          <span className="small muted">{formatDate(customer.latestFollowUpAt)}</span>
                        </div>
                        <p className="truncate">{customer.latestFollowUpContent}</p>
                      </>
                    ) : (
                      <span className="muted">暂无沟通记录</span>
                    )}
                    <div className="small muted">
                      计划跟进：{formatDate(customer.nextFollowUpAt)}
                    </div>
                  </td>
                  <td>
                    <Link className="button customer-detail-link" href={`/customers/${customer.id}`}>
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>没有符合当前筛选条件的客户。</EmptyState>
        )}
      </div>
    </>
  );
}

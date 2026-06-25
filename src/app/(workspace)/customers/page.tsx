import Link from "next/link";

import { PageHeading } from "@/components/ui";
import { listCustomers } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const rows = await listCustomers(q);
  return (
    <>
      <PageHeading
        title="客户管理"
        description="所有员工可查看全部客户；新增、跟进、材料下载和申请状态均记录操作日志。"
        action={<Link className="button primary" href="/customers/new">新增客户</Link>}
      />
      <form className="toolbar">
        <label className="search">
          搜索
          <input name="q" defaultValue={q} placeholder="姓名、客户编号或电话" />
        </label>
        <button type="submit">搜索</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>客户</th>
              <th>国籍</th>
              <th>目标学历</th>
              <th>目标专业</th>
              <th>负责人</th>
              <th>下次跟进</th>
              <th>建立日期</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <Link href={`/customers/${customer.id}`}>
                    <strong>{customer.name}</strong>
                    <div className="small muted">{customer.customerNo}</div>
                  </Link>
                </td>
                <td>{customer.nationality || "—"}</td>
                <td>{customer.targetDegree || "—"}</td>
                <td>{customer.targetMajor || "—"}</td>
                <td>{customer.ownerName || "—"}</td>
                <td>{formatDate(customer.nextFollowUpAt)}</td>
                <td>{formatDate(customer.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

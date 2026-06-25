import { notFound } from "next/navigation";

import {
  addFollowUpAction,
  archiveCustomerAction,
  createApplicationAction,
} from "@/app/actions";
import { Badge, EmptyState, PageHeading } from "@/components/ui";
import {
  APPLICATION_STATUS_LABELS,
  LANGUAGE_LABELS,
  PROGRAM_TYPE_LABELS,
  type ApplicationStatus,
} from "@/lib/constants";
import { getCustomer, listPrograms } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/utils";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCustomer(id);
  if (!data) notFound();
  const programOptions = await listPrograms({});
  const customer = data.customer;
  return (
    <>
      <PageHeading
        title={customer.name}
        description={`${customer.customerNo} · ${customer.nationality || "国籍未录入"}`}
        action={
          <form action={archiveCustomerAction}>
            <input type="hidden" name="customerId" value={id} />
            <button className="danger" type="submit">归档客户</button>
          </form>
        }
      />
      <section className="grid cols-3">
        <div className="card">
          <div className="card-header"><h3>联系信息</h3></div>
          <div className="card-body">
            <p>电话：{customer.phone || "—"}</p>
            <p>邮箱：{customer.email || "—"}</p>
            <p>微信：{customer.wechat || "—"}</p>
            <p>负责人：{customer.ownerId || "—"}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>申请目标</h3></div>
          <div className="card-body">
            <p>学历：{PROGRAM_TYPE_LABELS[customer.targetDegree || ""] || "—"}</p>
            <p>专业：{customer.targetMajor || "—"}</p>
            <p>语言：{LANGUAGE_LABELS[customer.teachingLanguage || ""] || "不限"}</p>
            <p>首年预算：{formatMoney(customer.firstYearBudget)}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>成绩条件</h3></div>
          <div className="card-body">
            <p>GPA：{customer.gpa ?? "—"} / {customer.gpaScale ?? "—"}</p>
            <p>HSK：{customer.hskLevel ? `${customer.hskLevel}级 ${customer.hskScore ?? ""}` : "—"}</p>
            <p>雅思 / 托福 / 多邻国：{customer.ielts ?? "—"} / {customer.toefl ?? "—"} / {customer.duolingo ?? "—"}</p>
            <p>CSCA：{customer.hasCsca == null ? "未确认" : customer.hasCsca ? "已有" : "目前没有"}</p>
          </div>
        </div>
      </section>

      <section className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header"><h3>沟通记录</h3></div>
          <div className="card-body">
            <form action={addFollowUpAction}>
              <input type="hidden" name="customerId" value={id} />
              <div className="form-grid">
                <label>
                  渠道
                  <select name="channel">
                    <option>企业微信</option>
                    <option>微信</option>
                    <option>电话</option>
                    <option>邮件</option>
                    <option>面谈</option>
                    <option>其他</option>
                  </select>
                </label>
                <label>下次跟进<input name="nextFollowUpAt" type="date" /></label>
                <label className="wide">沟通内容<textarea name="content" required /></label>
              </div>
              <div className="form-actions"><button type="submit">添加记录</button></div>
            </form>
            <div className="timeline" style={{ marginTop: 22 }}>
              {data.followUps.map((item) => (
                <div className="timeline-item" key={item.id}>
                  <strong>{item.channel} · {item.authorName}</strong>
                  <div className="small muted">{formatDate(item.createdAt)}</div>
                  <p>{item.content}</p>
                  {item.nextFollowUpAt ? <p className="small">下次跟进：{formatDate(item.nextFollowUpAt)}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>客户材料</h3></div>
          <div className="card-body">
            <form action="/api/documents/upload" method="post" encType="multipart/form-data">
              <input type="hidden" name="customerId" value={id} />
              <div className="form-grid">
                <label>
                  材料类别
                  <select name="category">
                    <option>护照</option>
                    <option>成绩单</option>
                    <option>毕业证</option>
                    <option>语言证书</option>
                    <option>体检表</option>
                    <option>无犯罪记录</option>
                    <option>其他</option>
                  </select>
                </label>
                <label>选择文件<input name="file" type="file" required /></label>
              </div>
              <p className="small muted">支持 PDF、JPG、PNG、DOCX、XLSX；单文件不超过 20 MB，落盘前加密。</p>
              <div className="form-actions"><button type="submit">加密上传</button></div>
            </form>
            <div style={{ marginTop: 18 }}>
              {data.documents.length ? (
                <table>
                  <tbody>
                    {data.documents.map((document) => (
                      <tr key={document.id}>
                        <td>
                          <strong>{document.category}</strong>
                          <div className="small muted">{document.originalName}</div>
                        </td>
                        <td>{Math.ceil(document.size / 1024)} KB</td>
                        <td><a className="button" href={`/api/documents/${document.id}`}>下载</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyState>尚未上传材料</EmptyState>}
            </div>
          </div>
        </div>
      </section>

      <section className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header"><h3>申请记录</h3></div>
          <div className="card-body">
            {data.applications.length ? (
              <table>
                <tbody>
                  {data.applications.map((application) => (
                    <tr key={application.id}>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState>尚未创建申请</EmptyState>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>新建申请</h3></div>
          <div className="card-body">
            <form action={createApplicationAction}>
              <input type="hidden" name="customerId" value={id} />
              <label>
                申请项目
                <select name="programId" required>
                  <option value="">请选择</option>
                  {programOptions.map((program) => (
                    <option value={program.id} key={program.id}>
                      {program.schoolName} · {PROGRAM_TYPE_LABELS[program.programType]} · {LANGUAGE_LABELS[program.teachingLanguage]}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ marginTop: 12 }}>备注<textarea name="notes" /></label>
              <div className="form-actions"><button type="submit">创建申请</button></div>
            </form>
          </div>
        </div>
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>已保存筛选方案</h3></div>
        <div className="card-body">
          {data.recommendations.length ? (
            <table>
              <tbody>
                {data.recommendations.map((recommendation) => (
                  <tr key={recommendation.id}>
                    <td><strong>{recommendation.title}</strong></td>
                    <td>{recommendation.itemCount} 个项目</td>
                    <td>{formatDate(recommendation.createdAt)}</td>
                    <td><a href={`/recommendations/${recommendation.id}/print`}>查看与打印</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState>尚未保存筛选方案</EmptyState>}
        </div>
      </section>
    </>
  );
}

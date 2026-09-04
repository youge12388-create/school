import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addFollowUpAction,
  archiveCustomerAction,
  createApplicationAction,
  updateCustomerManagementAction,
} from "@/app/actions";
import { Badge, EmptyState, PageHeading } from "@/components/ui";
import {
  APPLICATION_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  LANGUAGE_LABELS,
  PROGRAM_TYPE_LABELS,
  type ApplicationStatus,
} from "@/lib/constants";
import { getCustomer, listCustomerOwners, listPrograms } from "@/lib/queries";
import { canHandleCustomerCases } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { makeT, makeTv } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import { formatDate, formatMoney } from "@/lib/utils";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const locale = await getUiLocale();
  const t = makeT(locale);
  const tv = makeTv(locale);
  const canHandleCase = canHandleCustomerCases(user.role);
  const data = await getCustomer(id);
  if (!data) notFound();
  const [programOptions, owners] = await Promise.all([
    listPrograms({}),
    Promise.resolve(listCustomerOwners()),
  ]);
  const customer = data.customer;
  const contractLabel = t(CONTRACT_STATUS_LABELS[customer.contractStatus] ?? customer.contractStatus);
  return (
    <>
      <PageHeading
        title={customer.name}
        description={`${customer.customerNo} · ${customer.nationality || t("国籍未录入")}`}
        action={
          canHandleCase ? (
            <form action={archiveCustomerAction}>
              <input type="hidden" name="customerId" value={id} />
              <button className="danger" type="submit">{t("归档客户")}</button>
            </form>
          ) : null
        }
      />

      {/* 状态条：一行展示客户关键状态，便于一眼定位 */}
      <div className="detail-status-bar">
        <div className="status-item">
          <span>{t("客户编号")}</span>
          <strong>{customer.customerNo}</strong>
        </div>
        <div className="status-item">
          <span>{t("国籍")}</span>
          <strong>{customer.nationality || t("未录入")}</strong>
        </div>
        <div className="status-item">
          <span>{t("负责老师")}</span>
          <strong>{customer.ownerName || t("未分配")}</strong>
        </div>
        <div className="status-item">
          <span>{t("签约状态")}</span>
          <Badge tone={customer.contractStatus === "SIGNED" ? "green" : "amber"}>{contractLabel}</Badge>
        </div>
      </div>

      {/* 客户档案：合并联系信息 / 申请目标 / 成绩条件三组，紧凑字段网格 */}
      <section className="card card-compact detail-section">
        <div className="card-header"><h3>{t("客户档案")}</h3></div>
        <div className="card-body">
          <div className="detail-field-grid cols-3">
            <div className="detail-group-title">{t("联系信息")}</div>
            <div className="detail-field">
              <span className="label">{t("电话")}</span>
              <p className={`value${customer.phone ? "" : " muted"}`}>{customer.phone || "—"}</p>
            </div>
            <div className="detail-field">
              <span className="label">{t("邮箱")}</span>
              <p className={`value${customer.email ? "" : " muted"}`}>{customer.email || "—"}</p>
            </div>
            <div className="detail-field">
              <span className="label">{t("微信")}</span>
              <p className={`value${customer.wechat ? "" : " muted"}`}>{customer.wechat || "—"}</p>
            </div>

            <div className="detail-group-title">{t("申请目标")}</div>
            <div className="detail-field">
              <span className="label">{t("学历")}</span>
              <p className={`value${customer.targetDegree ? "" : " muted"}`}>
                {t(PROGRAM_TYPE_LABELS[customer.targetDegree || ""] || "—")}
              </p>
            </div>
            <div className="detail-field">
              <span className="label">{t("专业")}</span>
              <p className={`value${customer.targetMajor ? "" : " muted"}`}>{customer.targetMajor || "—"}</p>
            </div>
            <div className="detail-field">
              <span className="label">{t("语言")}</span>
              <p className={`value${customer.teachingLanguage ? "" : " muted"}`}>
                {t(LANGUAGE_LABELS[customer.teachingLanguage || ""] || "不限")}
              </p>
            </div>
            <div className="detail-field">
              <span className="label">{t("首年预算")}</span>
              <p className="value">{formatMoney(customer.firstYearBudget)}</p>
            </div>

            <div className="detail-group-title">{t("成绩条件")}</div>
            <div className="detail-field">
              <span className="label">GPA</span>
              <p className="value">{customer.gpa ?? "—"} / {customer.gpaScale ?? "—"}</p>
            </div>
            <div className="detail-field">
              <span className="label">HSK</span>
              <p className={`value${customer.hskLevel ? "" : " muted"}`}>
                {customer.hskLevel ? tv("{n}级 {s}", { n: customer.hskLevel, s: customer.hskScore ?? "" }) : "—"}
              </p>
            </div>
            <div className="detail-field">
              <span className="label">{t("雅思 / 托福 / 多邻国")}</span>
              <p className="value">{customer.ielts ?? "—"} / {customer.toefl ?? "—"} / {customer.duolingo ?? "—"}</p>
            </div>
            <div className="detail-field">
              <span className="label">CSCA</span>
              <p className="value">
                {customer.hasCsca == null ? t("未确认") : customer.hasCsca ? t("已有") : t("目前没有")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 跟进 + 材料：两列并排，已有列表优先，新建表单视觉权重低 */}
      <section className="grid cols-2 detail-section">
        <div className="card card-compact">
          <div className="card-header">
            <h3>{t("后续跟进情况")}</h3>
            <span className="small muted">{tv("{n} 条记录", { n: data.followUps.length })}</span>
          </div>
          <div className="card-body">
            <div className="detail-action-card">
              {canHandleCase ? (
                <form action={addFollowUpAction}>
                  <input type="hidden" name="customerId" value={id} />
                  <div className="form-grid">
                    <label>
                      {t("渠道")}
                      <select name="channel">
                        <option>{t("企业微信")}</option>
                        <option>{t("微信")}</option>
                        <option>{t("电话")}</option>
                        <option>{t("邮件")}</option>
                        <option>{t("面谈")}</option>
                        <option>{t("其他")}</option>
                      </select>
                    </label>
                    <label>{t("计划跟进日期")}<input name="nextFollowUpAt" type="date" /></label>
                    <label className="wide">{t("沟通内容")}<textarea name="content" required /></label>
                  </div>
                  <div className="form-actions"><button type="submit">{t("添加记录")}</button></div>
                </form>
              ) : (
                <p className="small muted">{t("当前角色为只读视图，无法新增跟进记录。")}</p>
              )}
            </div>
            <div className="detail-timeline" style={{ marginTop: 14 }}>
              {data.followUps.map((item) => (
                <div className="detail-timeline-item" key={item.id}>
                  <strong>{item.channel} · {item.authorName}</strong>
                  <div className="small">{formatDate(item.createdAt)}</div>
                  <p>{item.content}</p>
                  {item.nextFollowUpAt ? <p className="small">{tv("计划跟进：{d}", { d: formatDate(item.nextFollowUpAt) })}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card card-compact">
          <div className="card-header">
            <h3>{t("客户材料")}</h3>
            <span className="small muted">{tv("{n} 份", { n: data.documents.length })}</span>
          </div>
          <div className="card-body">
            <div className="detail-action-card">
              {canHandleCase ? (
                <form action="/api/documents/upload" method="post" encType="multipart/form-data">
                  <input type="hidden" name="customerId" value={id} />
                  <div className="form-grid">
                    <label>
                      {t("材料类别")}
                      <select name="category">
                        <option>{t("护照")}</option>
                        <option>{t("成绩单")}</option>
                        <option>{t("毕业证")}</option>
                        <option>{t("语言证书")}</option>
                        <option>{t("体检表")}</option>
                        <option>{t("无犯罪记录")}</option>
                        <option>{t("其他")}</option>
                      </select>
                    </label>
                    <label>{t("选择文件")}
                      <input
                        name="file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                        capture="environment"
                        required
                      />
                    </label>
                  </div>
                  <p className="small muted">{t("支持 PDF / JPG / PNG / DOCX / XLSX，单文件 ≤ 20 MB，落盘前加密。")}</p>
                  <div className="form-actions"><button type="submit">{t("加密上传")}</button></div>
                </form>
              ) : (
                <p className="small muted">{t("当前角色为只读视图，无法上传客户材料。")}</p>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              {data.documents.length ? (
                <ul className="detail-list">
                  {data.documents.map((document) => (
                    <li className="detail-list-row" key={document.id}>
                      <div>
                        <strong>{t(document.category)}</strong>
                        <div className="small muted">{document.originalName} · {Math.ceil(document.size / 1024)} KB</div>
                      </div>
                      {canHandleCase ? (
                        <a className="button" href={`/api/documents/${document.id}`}>{t("下载")}</a>
                      ) : (
                        <span className="small muted">{t("仅顾问可下载")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <EmptyState>{t("尚未上传材料")}</EmptyState>}
            </div>
          </div>
        </div>
      </section>

      {/* 申请记录 + 新建申请：信息卡 + 操作卡 */}
      <section className="grid cols-2 detail-section">
        <div className="card card-compact">
          <div className="card-header">
            <h3>{t("申请记录")}</h3>
            <span className="small muted">{tv("{n} 条", { n: data.applications.length })}</span>
          </div>
          <div className="card-body">
            {data.applications.length ? (
              <ul className="detail-list">
                {data.applications.map((application) => (
                  <li className="detail-list-row" key={application.id}>
                    <Link href={`/applications/${application.id}`}>
                      <strong>{application.schoolName}</strong>
                      <div className="small muted">{application.programName}</div>
                    </Link>
                    <Badge tone="blue">
                      {t(APPLICATION_STATUS_LABELS[application.status as ApplicationStatus] ?? application.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : <EmptyState>{t("尚未创建申请")}</EmptyState>}
          </div>
        </div>
        {canHandleCase ? (
          <div className="detail-action-card">
            <div className="card-header"><h3>{t("调整管理状态 / 新建申请")}</h3></div>
            <div className="card-body">
              <form action={updateCustomerManagementAction} style={{ marginBottom: 14 }}>
                <input type="hidden" name="customerId" value={id} />
                <div className="customer-management-fields">
                  <label>
                    {t("负责老师")}
                    <select name="ownerId" defaultValue={customer.ownerId || ""} required>
                      {owners.map((owner) => (
                        <option value={owner.id} key={owner.id}>{owner.displayName}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("签约状态")}
                    <select name="contractStatus" defaultValue={customer.contractStatus}>
                      {CONTRACT_STATUSES.map((status) => (
                        <option value={status} key={status}>{t(CONTRACT_STATUS_LABELS[status])}</option>
                      ))}
                    </select>
                  </label>
                  <button className="primary" type="submit">{t("更新")}</button>
                </div>
              </form>
              <form action={createApplicationAction}>
                <input type="hidden" name="customerId" value={id} />
                <label>
                  {t("申请项目")}
                  <select name="programId" required>
                    <option value="">{t("请选择")}</option>
                    {programOptions.map((program) => (
                      <option value={program.id} key={program.id}>
                        {program.schoolName} · {t(PROGRAM_TYPE_LABELS[program.programType])} · {t(LANGUAGE_LABELS[program.teachingLanguage])}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ marginTop: 10 }}>{t("备注")}<textarea name="notes" /></label>
                <div className="form-actions"><button type="submit">{t("创建申请")}</button></div>
              </form>
            </div>
          </div>
        ) : (
          <div className="detail-action-card">
            <div className="card-header"><h3>{t("调整管理状态 / 新建申请")}</h3></div>
            <div className="card-body">
              <p className="small muted">{t("当前角色为只读视图，无法改派负责老师、调整签约状态或创建申请。")}</p>
            </div>
          </div>
        )}
      </section>

      <section className="card card-compact detail-section">
        <div className="card-header">
          <h3>{t("已保存筛选方案")}</h3>
          <span className="small muted">{tv("{n} 个", { n: data.recommendations.length })}</span>
        </div>
        <div className="card-body">
          {data.recommendations.length ? (
            <ul className="detail-list">
              {data.recommendations.map((recommendation) => (
                <li className="detail-list-row" key={recommendation.id}>
                  <strong>{recommendation.title}</strong>
                  <span className="small muted">{tv("{n} 个项目 · {d}", { n: recommendation.itemCount, d: formatDate(recommendation.createdAt) })}</span>
                  <Link className="button" href={`/recommendations/${recommendation.id}/print`}>{t("查看与打印")}</Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState>{t("尚未保存筛选方案")}</EmptyState>}
        </div>
      </section>
    </>
  );
}

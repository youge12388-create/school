import Link from "next/link";

import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { makeT, makeTv } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import { getScreeningOperationsOverview } from "@/lib/screening-operations";

function percent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export default async function AnalyticsPage() {
  await requireRole(["ADMIN", "DATA_MANAGER"]);
  const locale = await getUiLocale();
  const t = makeT(locale);
  const tv = makeTv(locale);
  const data = getScreeningOperationsOverview();
  return (
    <>
      <PageHeading
        title={t("选校运营概览")}
        description={t(
          "最近 30 天方案与反馈，以及知识库上线质量。分析只使用本地业务数据，不包含聊天正文。",
        )}
      />

      <section className="grid cols-4">
        <div className="card stat">
          <div className="stat-label">{t("有效项目")}</div>
          <div className="stat-number">{data.quality.total}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("人工核实覆盖率")}</div>
          <div className="stat-number">
            {percent(data.quality.verified, data.quality.total)}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("30 天保存方案")}</div>
          <div className="stat-number">{data.savedPlans}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("逾期跟进")}</div>
          <div className="stat-number">{data.overdueFollowUps}</div>
        </div>
      </section>

      <section className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3>{t("上线质量")}</h3>
            <Link href="/schools">{t("前往学校库")}</Link>
          </div>
          <div className="card-body">
            <table>
              <tbody>
                <tr>
                  <td>{t("待人工核实项目")}</td>
                  <td><Badge tone="amber">{data.quality.unverified}</Badge></td>
                </tr>
                <tr>
                  <td>{t("费用缺失或口径不完整")}</td>
                  <td><Badge tone="amber">{data.quality.feeMissing}</Badge></td>
                </tr>
                <tr>
                  <td>{t("截止已过但状态未更新")}</td>
                  <td><Badge tone="red">{data.quality.expiredUnmarked}</Badge></td>
                </tr>
                <tr>
                  <td>{t("截止和批次说明均缺失")}</td>
                  <td><Badge tone="gray">{data.quality.batchMissing}</Badge></td>
                </tr>
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: 10 }}>
              {t(
                "这些指标只用于定位人工核实工作量，不代表系统已经确认当前招生批次。",
              )}
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>{t("最近 30 天顾问反馈")}</h3>
            <span className="small muted">
              {tv("{n} 条", { n: data.feedback.total })}
            </span>
          </div>
          <div className="card-body">
            <div className="grid cols-2">
              <div>
                <div className="small muted">{t("有帮助")}</div>
                <div className="stat-number">{data.feedback.relevant}</div>
              </div>
              <div>
                <div className="small muted">{t("不合适")}</div>
                <div className="stat-number">{data.feedback.not_relevant}</div>
              </div>
            </div>
            {data.feedback.negativePrograms.length ? (
              <div style={{ marginTop: 12 }}>
                <h4>{t("收到“不合适”反馈的项目")}</h4>
                <ul>
                  {data.feedback.negativePrograms.map((program) => (
                    <li key={program.id}>
                      {program.schoolName} · {program.programName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="small muted" style={{ marginTop: 12 }}>
                {t("暂无负向反馈。")}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>{t("最近 30 天进入方案次数最多的项目")}</h3>
          <Link href="/ai-screening">{t("前往 AI 选校")}</Link>
        </div>
        <div className="card-body">
          {data.topPrograms.length ? (
            <table>
              <thead>
                <tr>
                  <th>{t("学校")}</th>
                  <th>{t("项目")}</th>
                  <th>{t("进入方案次数")}</th>
                </tr>
              </thead>
              <tbody>
                {data.topPrograms.map((program) => (
                  <tr key={program.programId}>
                    <td>{program.schoolName}</td>
                    <td>{program.programName}</td>
                    <td>{program.selectedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState>{t("最近 30 天还没有保存选校方案。")}</EmptyState>
          )}
        </div>
      </section>
    </>
  );
}

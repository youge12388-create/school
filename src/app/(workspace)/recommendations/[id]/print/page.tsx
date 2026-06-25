import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Badge, PageHeading } from "@/components/ui";
import {
  LANGUAGE_LABELS,
  PROGRAM_TYPE_LABELS,
} from "@/lib/constants";
import { db } from "@/lib/db";
import {
  customers,
  programs,
  recommendationItems,
  recommendations,
  schools,
} from "@/lib/db/schema";
import { safeJson, formatDate, formatMoney } from "@/lib/utils";
import type { MatchEvidence } from "@/lib/matcher";

export default async function RecommendationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [header] = await db
    .select({
      title: recommendations.title,
      notes: recommendations.notes,
      createdAt: recommendations.createdAt,
      customerName: customers.name,
      customerNo: customers.customerNo,
      targetMajor: customers.targetMajor,
      targetDegree: customers.targetDegree,
      budget: customers.firstYearBudget,
    })
    .from(recommendations)
    .innerJoin(customers, eq(customers.id, recommendations.customerId))
    .where(eq(recommendations.id, id))
    .limit(1);
  if (!header) notFound();
  const items = await db
    .select({
      id: recommendationItems.id,
      rank: recommendationItems.rank,
      fitLevel: recommendationItems.fitLevel,
      reason: recommendationItems.reason,
      evidenceJson: recommendationItems.evidenceJson,
      schoolName: schools.nameZh,
      province: schools.province,
      city: schools.city,
      programType: programs.programType,
      language: programs.teachingLanguage,
      majorText: programs.majorText,
      tuitionText: programs.tuitionText,
      firstYearCostMax: programs.firstYearCostMax,
      deadlineDate: programs.deadlineDate,
    })
    .from(recommendationItems)
    .innerJoin(programs, eq(programs.id, recommendationItems.programId))
    .innerJoin(schools, eq(schools.id, programs.schoolId))
    .where(eq(recommendationItems.recommendationId, id))
    .orderBy(recommendationItems.rank);
  return (
    <>
      <div className="no-print">
        <PageHeading
          title={header.title}
          description="使用浏览器打印功能可保存为 PDF。"
          action={<button onClick={undefined}>请使用 Ctrl+P 打印</button>}
        />
      </div>
      <div className="print-only">
        <h1>{header.title}</h1>
        <p>{header.customerName} · {header.customerNo} · {formatDate(header.createdAt)}</p>
      </div>
      <section className="card">
        <div className="card-header"><h3>客户目标</h3></div>
        <div className="card-body">
          <p>申请学历：{PROGRAM_TYPE_LABELS[header.targetDegree || ""] || "未确定"}</p>
          <p>目标专业：{header.targetMajor || "未确定"}</p>
          <p>首年预算：{formatMoney(header.budget)}</p>
          {header.notes ? <p>方案备注：{header.notes}</p> : null}
        </div>
      </section>
      <section style={{ marginTop: 16 }}>
        {items.map((item) => {
          const evidence = safeJson<MatchEvidence[]>(item.evidenceJson, []);
          return (
            <article className="card result-card" key={item.id}>
              <div className="result-main">
                <div className="stat-number" style={{ fontSize: 28 }}>{item.rank}</div>
                <div>
                  <div className="result-title">{item.schoolName}</div>
                  <div className="result-meta">
                    <span>{[item.province, item.city].filter(Boolean).join(" · ")}</span>
                    <span>{PROGRAM_TYPE_LABELS[item.programType]}</span>
                    <span>{LANGUAGE_LABELS[item.language]}</span>
                    <span>首年上限：{formatMoney(item.firstYearCostMax)}</span>
                    <span>截止：{formatDate(item.deadlineDate)}</span>
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
                    {item.majorText || "数据库未有相关专业信息"}
                  </p>
                  {item.reason ? <p style={{ marginTop: 10 }}><strong>推荐理由：</strong>{item.reason}</p> : null}
                </div>
                <Badge tone={item.fitLevel === "MATCHED" ? "green" : item.fitLevel === "NOT_MATCHED" ? "red" : "amber"}>
                  {item.fitLevel === "MATCHED" ? "可直接考虑" : item.fitLevel === "NEEDS_ACTION" ? "需补条件" : item.fitLevel === "NOT_MATCHED" ? "不符合" : "需核实"}
                </Badge>
              </div>
              <div className="evidence-strip">
                {evidence.map((entry) => (
                  <div className={`evidence ${entry.level.toLowerCase()}`} key={entry.label}>
                    <strong>{entry.label}</strong>
                    <span className="small">{entry.detail}</span>
                  </div>
                ))}
              </div>
              <div className="card-body"><span className="small muted">原始学费说明：</span>{item.tuitionText}</div>
            </article>
          );
        })}
      </section>
    </>
  );
}

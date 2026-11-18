import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createApplicationFromRecommendationAction } from "@/app/ai-recommendation-actions";
import { PrintButton } from "@/components/print-button";
import { RecommendationFollowUp } from "@/components/recommendation-follow-up";
import { Badge, PageHeading } from "@/components/ui";
import { getUserPermissions } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import {
  LANGUAGE_LABELS,
  PROGRAM_TYPE_LABELS,
} from "@/lib/constants";
import { db } from "@/lib/db";
import {
  applications,
  customers,
  programs,
  recommendationItems,
  recommendations,
  schools,
} from "@/lib/db/schema";
import { safeJson, formatDate, formatMoney } from "@/lib/utils";
import type { MatchEvidence } from "@/lib/matcher";
import type { ChatCriteria } from "@/lib/ai-screening";
import { displayProgramName } from "@/lib/ai-screening-presentation";
import { getRecommendationFollowUp } from "@/lib/recommendation-records";

import "../../recommendations.css";

export default async function RecommendationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("CUSTOMER_VIEW");
  const permissions = getUserPermissions(user);
  const { id } = await params;
  const [header] = await db
    .select({
      title: recommendations.title,
      customerId: customers.id,
      criteriaJson: recommendations.criteriaJson,
      notes: recommendations.notes,
      createdAt: recommendations.createdAt,
      customerName: customers.name,
      customerNo: customers.customerNo,
      customerArchived: customers.archived,
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
      programId: recommendationItems.programId,
      rank: recommendationItems.rank,
      fitLevel: recommendationItems.fitLevel,
      reason: recommendationItems.reason,
      evidenceJson: recommendationItems.evidenceJson,
      schoolName: schools.nameZh,
      province: schools.province,
      city: schools.city,
      programType: programs.programType,
      programName: programs.name,
      programArchived: programs.archived,
      schoolArchived: schools.archived,
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
  const snapshot = safeJson<{ mode?: string; criteria?: ChatCriteria; source?: string } | null>(header.criteriaJson, {}) ?? {};
  const aiPlan = snapshot.mode === "AI_SCREENING";
  const criteria = aiPlan ? snapshot.criteria : undefined;
  const canApply = aiPlan && permissions.includes("APPLICATION_MANAGE");
  const activeApplications = canApply ? await db.select({ id: applications.id, programId: applications.programId })
    .from(applications)
    .where(and(eq(applications.customerId, header.customerId), eq(applications.archived, false)))
    .orderBy(desc(applications.createdAt)) : [];
  const applicationByProgram = new Map(activeApplications.reverse().map((entry) => [entry.programId, entry.id]));
  const existingFollowUp = aiPlan ? getRecommendationFollowUp(id, header.customerId) : undefined;
  return (
    <>
      <div className="no-print">
        <Link href="/recommendations" className="plan-detail-back"><ArrowLeft size={15} aria-hidden="true" /> 返回方案记录</Link>
        <PageHeading
          title={header.title}
          description={`${header.customerName} · ${header.customerNo} · ${items.length} 个项目 · ${formatDate(header.createdAt)}`}
          action={<div className="plan-detail-toolbar"><Link className="button" href={`/customers/${header.customerId}`}>客户档案</Link><PrintButton /></div>}
        />
      </div>
      <div className="print-only">
        <h1>{header.title}</h1>
        <p>{header.customerName} · {header.customerNo} · {formatDate(header.createdAt)}</p>
      </div>
      <section className="card">
        <div className="card-header"><h3>{aiPlan ? "本次选校条件" : "客户目标"}</h3></div>
        <div className="card-body">
          <dl className="plan-detail-summary">
            <div><dt>申请学历</dt><dd>{PROGRAM_TYPE_LABELS[(aiPlan ? criteria?.programType : header.targetDegree) || ""] || "未确定"}</dd></div>
            <div><dt>目标专业</dt><dd>{(aiPlan ? criteria?.targetMajor : header.targetMajor) || "未确定"}</dd></div>
            <div><dt>首年预算</dt><dd>{formatMoney(aiPlan ? criteria?.budget : header.budget)}</dd></div>
          </dl>
          {aiPlan && <p className="plan-detail-caption">匹配依据为保存时的记录。请在推荐或提交申请前核实最新招生条件。</p>}
          {header.notes ? <div className={`plan-detail-notes${aiPlan ? " no-print" : ""}`}>
            <strong>方案备注{aiPlan ? "（仅工作台可见）" : ""}</strong><p>{header.notes}</p>
          </div> : null}
          {aiPlan && <div className="no-print" style={{ marginTop: 14 }}>
            {header.customerArchived && <p className="plan-detail-caption">客户已归档，方案保留供查阅。</p>}
            <RecommendationFollowUp id={id} customerId={header.customerId} existing={existingFollowUp ? { id: existingFollowUp.id, nextFollowUpAt: existingFollowUp.nextFollowUpAt } : undefined}
              canCreate={!header.customerArchived && items.some((item) => !item.programArchived && !item.schoolArchived) && permissions.includes("FOLLOW_UP_MANAGE")} />
          </div>}
        </div>
      </section>
      <section className="plan-detail-items" style={{ marginTop: 16 }}>
        {!items.length && <p className="plan-detail-caption">该历史方案没有项目记录。</p>}
        {items.map((item) => {
          const storedEvidence = safeJson<unknown>(item.evidenceJson, []);
          const evidence = Array.isArray(storedEvidence) ? storedEvidence.filter((entry): entry is MatchEvidence =>
            !!entry && typeof entry.label === "string" && typeof entry.level === "string" && typeof entry.detail === "string") : [];
          return (
            <article className="card result-card" key={item.id}>
              <div className="result-main">
                <div className="stat-number" style={{ fontSize: 28 }}>{item.rank}</div>
                <div>
                  <div className="result-title">{item.schoolName}</div>
                  {aiPlan && <p>{displayProgramName(item.schoolName, item.programName)}</p>}
                  <div className="result-meta">
                    <span>{[item.province, item.city].filter(Boolean).join(" · ")}</span>
                    {!aiPlan && <span>{PROGRAM_TYPE_LABELS[item.programType]}</span>}
                    {!aiPlan && <span>{LANGUAGE_LABELS[item.language]}</span>}
                    {!aiPlan && <span>首年上限：{formatMoney(item.firstYearCostMax)}</span>}
                    {!aiPlan && <span>截止：{formatDate(item.deadlineDate)}</span>}
                  </div>
                  {!aiPlan && <p style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
                    {item.majorText || "数据库未有相关专业信息"}
                  </p>}
                  {item.reason ? <p style={{ marginTop: 10 }}><strong>推荐理由：</strong>{item.reason}</p> : null}
                </div>
                <Badge tone={item.fitLevel === "MATCHED" ? "green" : item.fitLevel === "NOT_MATCHED" ? "red" : "amber"}>
                  {item.fitLevel === "MATCHED" ? "可直接考虑" : item.fitLevel === "NEEDS_ACTION" ? "需补条件" : item.fitLevel === "NOT_MATCHED" ? "不符合" : "需核实"}
                </Badge>
              </div>
              <div className="evidence-strip">
                {evidence.map((entry, index) => (
                  <div className={`evidence ${entry.level.toLowerCase()}`} key={`${entry.label}-${index}`}>
                    <strong>{entry.label}</strong>
                    <span className="small">{entry.detail}</span>
                  </div>
                ))}
              </div>
              {!aiPlan && <div className="card-body"><span className="small muted">原始学费说明：</span>{item.tuitionText}</div>}
              {canApply && <div className="card-body no-print">
                {applicationByProgram.has(item.programId) ? (
                  <Link className="button" href={`/applications/${applicationByProgram.get(item.programId)}`}>查看已有申请</Link>
                ) : !header.customerArchived && !item.programArchived && !item.schoolArchived ? (
                  <form action={createApplicationFromRecommendationAction}>
                    <input type="hidden" name="recommendationId" value={id} />
                    <input type="hidden" name="programId" value={item.programId} />
                    <button type="submit">创建申请</button>
                  </form>
                ) : <span className="muted small">客户或项目已归档</span>}
              </div>}
            </article>
          );
        })}
      </section>
    </>
  );
}

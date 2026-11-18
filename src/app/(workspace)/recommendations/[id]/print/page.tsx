import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/print-button";
import { RecommendationRecordEditor } from "@/components/recommendation-record-editor";
import { Badge, PageHeading } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import type { MatchEvidence } from "@/lib/matcher";
import { groupPlanSchools } from "@/lib/recommendation-profile";
import { getRecommendationRecord } from "@/lib/recommendation-records";
import { safePlanEvidence } from "@/lib/recommendation-validation";
import { formatDate, formatMoney, safeJson } from "@/lib/utils";

import "../../recommendations.css";

type SavedFacts = {
  programType?: string;
  language?: string;
  majorText?: string;
  tuitionText?: string;
  firstYearCostMax?: number;
  deadlineAt?: number;
};

function savedCriteria(json: string) {
  const snapshot = safeJson<Record<string, unknown> | null>(json, null);
  const criteria = snapshot?.criteria ?? snapshot;
  if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) return {};
  const { programType, targetMajor, budget } = criteria as Record<string, unknown>;
  return {
    programType: typeof programType === "string" ? programType : undefined,
    targetMajor: typeof targetMajor === "string" ? safePlanEvidence(targetMajor) : undefined,
    budget: typeof budget === "number" ? budget : undefined,
  };
}

function savedEvidence(json: string) {
  const raw = safeJson<unknown>(json, []);
  return Array.isArray(raw) ? raw.filter((item): item is MatchEvidence =>
    item && typeof item.label === "string" && ["PASS", "NEED", "UNKNOWN", "FAIL"].includes(item.level)
      && typeof item.detail === "string") : [];
}

const fitLabel: Record<string, { label: string; tone: "green" | "red" | "amber" }> = {
  MATCHED: { label: "可直接考虑", tone: "green" },
  NEEDS_ACTION: { label: "需补条件", tone: "amber" },
  NOT_MATCHED: { label: "不符合", tone: "red" },
  UNKNOWN: { label: "需核实", tone: "amber" },
};

export default async function RecommendationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("RECOMMENDATION_MANAGE");
  const { id } = await params;
  const plan = getRecommendationRecord(id);
  if (!plan) notFound();

  const t = await getT();
  const criteria = savedCriteria(plan.criteriaJson);
  const schools = groupPlanSchools(plan.items);
  const profile = {
    studentName: plan.studentName ?? "",
    studentRegion: plan.studentRegion ?? "",
    preferredRegion: plan.preferredRegion ?? "",
    notes: plan.notes ?? "",
  };
  const unrecorded = t("未记录");
  const date = formatDate(plan.createdAt);

  return (
    <div className="plan-detail">
      <div className="no-print">
        <Link href="/recommendations" className="plan-detail-back"><ArrowLeft size={15} aria-hidden="true" /> {t("返回方案记录")}</Link>
        <PageHeading title={plan.title} description={[date, plan.authorName, t(plan.mode === "ai" ? "AI 选校" : "条件筛查")].filter(Boolean).join(" · ")}
          action={<PrintButton />} />
      </div>
      <div className="print-only"><h1>{plan.title}</h1><p>{date}</p></div>
      <section className="card plan-detail-profile" aria-labelledby="plan-profile-title">
        <div className="card-header"><h3 id="plan-profile-title">{t("方案信息")}</h3></div>
        <div className="card-body">
          <dl className="plan-detail-summary">
            <div><dt>{t("学生姓名")}</dt><dd>{profile.studentName || unrecorded}</dd></div>
            <div><dt>{t("意向就读地区")}</dt><dd>{profile.preferredRegion || unrecorded}</dd></div>
            <div className="no-print"><dt>{t("学生所在国家或地区")}</dt><dd>{profile.studentRegion || unrecorded}</dd></div>
            <div><dt>{t("申请学历")}</dt><dd>{t(PROGRAM_TYPE_LABELS[criteria.programType ?? ""] ?? "未记录")}</dd></div>
            <div><dt>{t("目标专业")}</dt><dd>{criteria.targetMajor || unrecorded}</dd></div>
            <div><dt>{t("首年预算")}</dt><dd>{criteria.budget == null ? unrecorded : formatMoney(criteria.budget)}</dd></div>
          </dl>
          <div className="plan-detail-notes no-print"><strong>{t("顾问备注")}</strong><p>{profile.notes || unrecorded}</p></div>
          <RecommendationRecordEditor id={id} version={plan.version} profile={profile} />
        </div>
      </section>

      <section className="plan-detail-items" aria-labelledby="plan-schools-title">
        <div className="plan-detail-section-head">
          <h2 id="plan-schools-title">{t("方案院校")}</h2><Badge>{schools.length} {t("所学校")}</Badge>
        </div>
        <p className="plan-detail-caption">{t("以下为保存时的项目及匹配依据，申请前请再次核实招生条件。")}</p>
        {!schools.length && <p className="plan-detail-caption">{t("该历史方案没有项目记录。")}</p>}
        {schools.map((projects, index) => (
          <article className="card plan-school" key={projects[0].schoolId}>
            <div className="plan-school-head">
              <span className="plan-school-number" aria-hidden="true">{index + 1}</span>
              <div><h3>{projects[0].schoolName || t("院校名称未记录")}</h3>
                {projects[0].schoolRegion && <p>{projects[0].schoolRegion}</p>}
              </div>
            </div>
            {projects.map((item) => {
              const facts = safeJson<SavedFacts | null>(item.factsJson, null);
              const fit = Object.hasOwn(fitLabel, item.fitLevel) ? fitLabel[item.fitLevel] : fitLabel.UNKNOWN;
              const evidence = savedEvidence(item.evidenceJson);
              return <div className="plan-project" key={item.id}>
                <div className="plan-project-head"><h4>{item.programName || t("项目名称未记录")}</h4><Badge tone={fit.tone}>{t(fit.label)}</Badge></div>
                {facts && <div className="result-meta">
                  {facts.programType && <span>{t(PROGRAM_TYPE_LABELS[facts.programType] ?? facts.programType)}</span>}
                  {facts.language && <span>{t(LANGUAGE_LABELS[facts.language] ?? facts.language)}</span>}
                  {facts.firstYearCostMax != null && <span>{t("首年上限")}：{formatMoney(facts.firstYearCostMax)}</span>}
                  {facts.deadlineAt != null && <span>{t("截止日期")}：{formatDate(facts.deadlineAt)}</span>}
                </div>}
                {facts?.majorText && <p className="plan-project-text">{t("专业方向")}：{safePlanEvidence(facts.majorText)}</p>}
                {facts?.tuitionText && <p className="plan-project-text">{t("学费")}：{safePlanEvidence(facts.tuitionText)}</p>}
                {item.reason && <p className="plan-project-text"><strong>{t("推荐理由")}：</strong>{safePlanEvidence(item.reason)}</p>}
                {evidence.length > 0 && <div className="evidence-strip">
                  {evidence.map((entry, i) => (
                    <div className={`evidence ${entry.level.toLowerCase()}${entry.label === "内部注意事项" || entry.label === "来源" ? " no-print" : ""}`}
                      key={`${entry.label}-${i}`}>
                      <strong>{entry.label}</strong><span className="small">{safePlanEvidence(entry.detail)}</span>
                    </div>
                  ))}
                </div>}
              </div>;
            })}
          </article>
        ))}
      </section>
    </div>
  );
}

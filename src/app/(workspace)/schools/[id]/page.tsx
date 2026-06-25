import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { getSchoolDetails } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/utils";

function externalUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function deadlineTone(deadlineDate: Date | null) {
  if (!deadlineDate) return "gray" as const;
  return deadlineDate.getTime() >= Date.now() ? ("green" as const) : ("red" as const);
}

function deadlineLabel(deadlineDate: Date | null) {
  if (!deadlineDate) return "截止日期未知";
  return deadlineDate.getTime() >= Date.now()
    ? `截止 ${formatDate(deadlineDate)}`
    : `已截止 ${formatDate(deadlineDate)}`;
}

export default async function SchoolDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getSchoolDetails(id);
  if (!data) notFound();
  const { school, programs } = data;

  return (
    <>
      <PageHeading
        title={school.nameZh}
        description={school.name && school.name !== school.nameZh ? school.name : "学校主数据与全部项目资料"}
        action={<Link className="button" href="/screening">返回学校筛查</Link>}
      />

      <section className="grid cols-3 school-overview-grid">
        <div className="card school-overview-card">
          <span>地区</span>
          <strong>{[school.province, school.city].filter(Boolean).join(" · ") || "数据库未有相关信息"}</strong>
        </div>
        <div className="card school-overview-card">
          <span>QS 排名</span>
          <strong>{school.qsRanking ?? "数据库未有相关信息"}</strong>
        </div>
        <div className="card school-overview-card">
          <span>合作星级</span>
          <strong>{school.partnershipRating ? `${school.partnershipRating} 星` : "数据库未有相关信息"}</strong>
        </div>
      </section>

      <section className="grid cols-2 school-detail-grid">
        <article className="card">
          <div className="card-header"><h3>学校信息</h3></div>
          <div className="card-body school-facts">
            <p><span>学校分类</span><strong>{school.category || "数据库未有相关信息"}</strong></p>
            <p><span>学校级 CSCA</span><Badge tone={school.cscaStatus === "NOT_REQUIRED" ? "green" : school.cscaStatus === "REQUIRED" ? "amber" : "gray"}>{school.cscaStatus === "NOT_REQUIRED" ? "不要求" : school.cscaStatus === "REQUIRED" ? "要求" : "数据库未有相关信息"}</Badge></p>
            <p><span>数据状态</span><Badge tone={school.reviewStatus === "VERIFIED" ? "green" : school.reviewStatus === "NEEDS_REVIEW" ? "amber" : "blue"}>{school.reviewStatus === "VERIFIED" ? "已复核" : school.reviewStatus === "NEEDS_REVIEW" ? "待复核" : "自动导入"}</Badge></p>
            <p><span>标签</span><strong>{school.tags || "—"}</strong></p>
            <p>
              <span>学校官网</span>
              {school.website ? <a href={externalUrl(school.website)} target="_blank" rel="noreferrer">访问官网</a> : <strong>数据库未有相关信息</strong>}
            </p>
          </div>
        </article>
        <article className="card">
          <div className="card-header"><h3>合作信息</h3></div>
          <div className="card-body school-copy">
            <p>{school.cooperationPrograms || "数据库未有相关合作项目信息"}</p>
          </div>
        </article>
      </section>

      <section className="card school-description-card">
        <div className="card-header"><h3>学校简介</h3></div>
        <div className="card-body school-copy">
          <p>{school.description || "数据库未有相关学校简介"}</p>
        </div>
      </section>

      <section className="school-programs-section">
        <div className="school-programs-heading">
          <div>
            <h2>项目列表</h2>
            <p>共 {programs.length} 个有效项目。项目级要求优先于学校级信息。</p>
          </div>
          <Link className="button primary" href={`/screening?major=&deadlineMode=all`}>返回筛选</Link>
        </div>

        {programs.length ? programs.map((program) => (
          <article className="card school-program-card" key={program.id}>
            <div className="card-header school-program-header">
              <div>
                <h3>{program.name}</h3>
                <div className="result-meta">
                  <span>{PROGRAM_TYPE_LABELS[program.programType] ?? program.programType}</span>
                  <span>{LANGUAGE_LABELS[program.teachingLanguage] ?? program.teachingLanguage}</span>
                  <span>首年上限：{formatMoney(program.firstYearCostMax)}</span>
                </div>
              </div>
              <div className="school-program-badges">
                <Badge tone={deadlineTone(program.deadlineDate)}>{deadlineLabel(program.deadlineDate)}</Badge>
                <Badge tone={program.reviewStatus === "VERIFIED" ? "green" : program.reviewStatus === "NEEDS_REVIEW" ? "amber" : "blue"}>{program.reviewStatus === "VERIFIED" ? "已复核" : program.reviewStatus === "NEEDS_REVIEW" ? "待复核" : "自动解析"}</Badge>
              </div>
            </div>
            <div className="card-body school-program-content">
              <div>
                <h4>专业</h4>
                <p>{program.majorText || "数据库未有相关信息"}</p>
              </div>
              <div>
                <h4>学费</h4>
                <p>{program.tuitionText || "数据库未有相关信息"}</p>
                {program.costIncomplete ? <span className="small muted">首年费用仍有缺失项</span> : null}
              </div>
              <div>
                <h4>申请时间</h4>
                <p>{program.applicationTimeText || "数据库未有相关信息"}</p>
              </div>
              <details>
                <summary>查看申请要求、奖学金和住宿</summary>
                <div className="school-program-details">
                  <div><h4>申请要求</h4><p>{program.requirementsText || "数据库未有相关信息"}</p></div>
                  <div><h4>奖学金</h4><p>{[program.scholarshipCategory, program.scholarshipContent].filter(Boolean).join("\n") || "数据库未有相关信息"}</p></div>
                  <div><h4>住宿</h4><p>{program.accommodationText || "数据库未有相关信息"}</p></div>
                </div>
              </details>
            </div>
          </article>
        )) : <EmptyState>该学校暂无有效项目</EmptyState>}
      </section>
    </>
  );
}
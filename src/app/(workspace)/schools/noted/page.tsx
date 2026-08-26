import Link from "next/link";

import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  canEditSchool,
  canViewConfidentialSchoolFields,
} from "@/lib/permissions";
import {
  getNotedSchoolScopeCounts,
  listNotedSchools,
  type NotedSchoolScope,
} from "@/lib/queries";

const pageSize = 30;

const scopeOptions: Array<{
  value: NotedSchoolScope;
  label: string;
  tone: "blue" | "amber" | "green" | "red";
}> = [
  { value: "all", label: "全部", tone: "blue" },
  { value: "info", label: "备注", tone: "blue" },
  { value: "cooperation", label: "合作信息", tone: "amber" },
  { value: "recruitment", label: "招生安排", tone: "green" },
  { value: "assessment", label: "考核要求", tone: "green" },
  { value: "special", label: "特殊情况", tone: "red" },
];

type NotedSchool = {
  infoNote: string | null;
  groupApplicationAccount: string | null;
  scholarshipDisbursementText: string | null;
  collectionServiceText: string | null;
  cooperationDeadlineText: string | null;
  companyRecruitmentQuotaText: string | null;
  schoolRecruitmentPlanText: string | null;
  recruitmentPreferenceText: string | null;
  languageStudentAssessmentText: string | null;
  degreeStudentAssessmentText: string | null;
  cooperationNote: string | null;
  specialCaseNote: string | null;
  applicationUpdateFrequency: string | null;
};

function displayNote(value: string | null) {
  return value?.trim() || null;
}

function hasAnyNote(values: Array<string | null>) {
  return values.some((value) => displayNote(value));
}

function visibleScopeOptions(canViewConfidential: boolean) {
  return canViewConfidential
    ? scopeOptions
    : scopeOptions.filter((option) => option.value === "info");
}

function getScopeFromParams(scope: string | undefined, canViewConfidential: boolean) {
  const available = visibleScopeOptions(canViewConfidential);
  return available.some((option) => option.value === scope)
    ? (scope as NotedSchoolScope)
    : canViewConfidential
      ? "all"
      : "info";
}

function getNotedSchoolsHref(page: number, scope: NotedSchoolScope, searchQuery = "") {
  const params = new URLSearchParams();
  if (scope !== "all") params.set("scope", scope);
  if (searchQuery) params.set("q", searchQuery);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/schools/noted?${query}` : "/schools/noted";
}

function getPaginationPages(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages]);
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page > 1 && page < totalPages) pages.add(page);
  }

  const orderedPages = [...pages].sort((left, right) => left - right);
  return orderedPages.flatMap((page, index) => {
    const previousPage = orderedPages[index - 1];
    return previousPage && page - previousPage > 1 ? [null, page] : [page];
  });
}

function getSchoolTags(school: NotedSchool, canViewConfidential: boolean) {
  const tags: Array<{ label: string; tone: "blue" | "amber" | "green" | "red" }> = [];
  if (displayNote(school.infoNote)) tags.push({ label: "备注", tone: "blue" });
  if (canViewConfidential && hasAnyNote([
    school.groupApplicationAccount,
    school.scholarshipDisbursementText,
    school.collectionServiceText,
    school.cooperationDeadlineText,
    school.cooperationNote,
  ])) tags.push({ label: "合作信息", tone: "amber" });
  if (canViewConfidential && hasAnyNote([
    school.companyRecruitmentQuotaText,
    school.schoolRecruitmentPlanText,
    school.recruitmentPreferenceText,
    school.applicationUpdateFrequency,
  ])) tags.push({ label: "招生安排", tone: "green" });
  if (canViewConfidential && hasAnyNote([
    school.languageStudentAssessmentText,
    school.degreeStudentAssessmentText,
  ])) tags.push({ label: "考核要求", tone: "green" });
  if (canViewConfidential && displayNote(school.specialCaseNote)) {
    tags.push({ label: "特殊情况", tone: "red" });
  }
  return tags;
}

function getSchoolSummary(
  school: NotedSchool,
  scope: NotedSchoolScope,
  canViewConfidential: boolean,
) {
  const summaries: Record<NotedSchoolScope, Array<string | null>> = {
    all: [
      school.specialCaseNote,
      school.cooperationNote,
      school.recruitmentPreferenceText,
      school.applicationUpdateFrequency,
      school.languageStudentAssessmentText,
      school.degreeStudentAssessmentText,
      school.infoNote,
    ],
    info: [school.infoNote],
    cooperation: [
      school.cooperationNote,
      school.cooperationDeadlineText,
      school.groupApplicationAccount,
      school.scholarshipDisbursementText,
      school.collectionServiceText,
    ],
    recruitment: [
      school.recruitmentPreferenceText,
      school.schoolRecruitmentPlanText,
      school.companyRecruitmentQuotaText,
      school.applicationUpdateFrequency,
    ],
    assessment: [
      school.languageStudentAssessmentText,
      school.degreeStudentAssessmentText,
    ],
    special: [school.specialCaseNote],
  };
  const values = canViewConfidential ? summaries[scope] : summaries.info;
  return values.map(displayNote).find(Boolean) || "已填写备注，进入详情查看完整信息。";
}

function formatUpdatedAt(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新时间未知";
  return `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(date)}`;
}

export default async function NotedSchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; scope?: string; q?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const canViewConfidential = canViewConfidentialSchoolFields(user.role);
  const canEdit = canEditSchool(user.role);
  const scope = getScopeFromParams(params.scope, canViewConfidential);
  const query = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const [result, counts] = await Promise.all([
    listNotedSchools(page, pageSize, canViewConfidential, scope, query),
    getNotedSchoolScopeCounts(canViewConfidential, query),
  ]);
  const { rows } = result;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const paginationPages = getPaginationPages(page, totalPages);
  const options = visibleScopeOptions(canViewConfidential);
  const activeOption = options.find((option) => option.value === scope) ?? options[0];

  return (
    <>
      <PageHeading
        title="特别备注院校"
        description="按业务场景浏览需要跟进的院校信息，默认按最近更新排序。"
      />

      <section className="noted-school-search-panel" aria-label="搜索特别备注院校">
        <form className="noted-school-search" method="get">
          <label className="noted-school-search-field">
            <span>搜索院校</span>
            <input
              defaultValue={query}
              name="q"
              placeholder="输入院校名称、省份或城市"
              type="search"
            />
          </label>
          {scope !== "all" ? <input name="scope" type="hidden" value={scope} /> : null}
          <div className="noted-school-search-actions">
            <button className="primary" type="submit">搜索</button>
            {query ? (
              <Link className="button" href={getNotedSchoolsHref(1, scope)}>
                清除
              </Link>
            ) : null}
          </div>
        </form>
        <p className="small muted">仅在当前特别备注院校中匹配院校名称、省份和城市。</p>
      </section>

      <section className="noted-schools-summary">
        <div className="noted-schools-summary-count">
          <span className="small muted">当前分类</span>
          <strong>{result.total}</strong>
          <span className="small muted">所院校</span>
        </div>
        <p className="small muted">
          {query ? "搜索“" + query + "” · " : ""}
          {activeOption.label} · 每页最多 {pageSize} 所 · 点击详情查看完整信息
        </p>
      </section>

      {options.length > 0 ? (
        <nav className="noted-school-filters" aria-label="备注分类筛选">
          {options.map((option) => (
            <Link
              aria-current={option.value === scope ? "page" : undefined}
              className={`noted-school-filter${option.value === scope ? " active" : ""}`}
              href={getNotedSchoolsHref(1, option.value, query)}
              key={option.value}
            >
              {option.label}
              <span className="noted-school-filter-count">{counts[option.value]}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState>
          {query ? "暂无匹配“" + query + "”的" + activeOption.label + "院校" : "暂无需要跟进的" + activeOption.label + "院校"}
        </EmptyState>
      ) : (
        <section className="noted-school-table-wrap" aria-label="院校备注清单">
          <table className="noted-school-table">
            <thead>
              <tr>
                <th className="noted-school-column-school" scope="col">院校</th>
                <th className="noted-school-column-tags" scope="col">涉及分类</th>
                <th className="noted-school-column-summary" scope="col">重点摘要</th>
                <th className="noted-school-column-actions" scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((school) => {
                const tags = getSchoolTags(school, canViewConfidential);
                const location = [school.province, school.city].filter(Boolean).join(" · ");
                return (
                  <tr key={school.id}>
                    <td className="noted-school-cell-school" data-label="院校">
                      <Link className="noted-school-name" href={`/schools/${school.id}`}>
                        {school.nameZh}
                      </Link>
                      <span className="small muted">{[location || "地区未填写", formatUpdatedAt(school.updatedAt)].join(" · ")}</span>
                    </td>
                    <td className="noted-school-cell-tags" data-label="涉及分类">
                      <div className="noted-school-tags">
                        {tags.map((tag) => (
                          <Badge key={tag.label} tone={tag.tone}>{tag.label}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="noted-school-cell-summary" data-label="重点摘要">
                      <p className="noted-school-summary-text">
                        {getSchoolSummary(school, scope, canViewConfidential)}
                      </p>
                    </td>
                    <td className="noted-school-cell-actions" data-label="操作">
                      <div className="noted-school-table-actions">
                        <Link className="button" href={`/schools/${school.id}`}>
                          详情
                        </Link>
                        {canEdit ? (
                          <Link className="button primary" href={`/schools/${school.id}/edit`}>
                            编辑
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {totalPages > 1 ? (
        <nav className="pagination" aria-label="院校备注分页">
          {page > 1 ? (
            <Link className="pagination-link" href={getNotedSchoolsHref(page - 1, scope, query)}>
              上一页
            </Link>
          ) : null}
          {paginationPages.map((paginationPage, index) =>
            paginationPage ? (
              <Link
                className={`pagination-link${paginationPage === page ? " active" : ""}`}
                href={getNotedSchoolsHref(paginationPage, scope, query)}
                key={paginationPage}
              >
                {paginationPage}
              </Link>
            ) : (
              <span className="pagination-gap" key={`gap-${index}`}>
                …
              </span>
            ),
          )}
          {page < totalPages ? (
            <Link className="pagination-link" href={getNotedSchoolsHref(page + 1, scope, query)}>
              下一页
            </Link>
          ) : null}
          <span className="pagination-info">第 {page} / {totalPages} 页</span>
        </nav>
      ) : null}
    </>
  );
}

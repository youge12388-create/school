import Link from "next/link";

import { Search } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { Badge, PageHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isMarketManager } from "@/lib/permissions";
import { listSchools } from "@/lib/queries";

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const marketManagerView = isMarketManager(user.role);
  const { q = "" } = params;
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listSchools(q, page);
  const rows = result.rows;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const extraParams: Record<string, string> = {};
  if (q) extraParams.q = q;
  return (
    <>
      <PageHeading
        title="学校知识库"
        description="学校主数据、合作等级和关键项目概览。学校级 CSCA 仅作参考，筛选以项目要求为准。"
        action={
          <Link className="button mobile-header-icon-only" href="/schools" aria-label="搜索学校">
            <Search aria-hidden="true" />
          </Link>
        }
      />
      <form className="toolbar desktop-only">
        <label className="search">
          搜索学校、省份或城市
          <input name="q" defaultValue={q} placeholder="例如：浙江、深圳大学" />
        </label>
        <button type="submit">搜索</button>
        <Link className="button" href="/schools/noted">特别备注院校</Link>
      </form>

      <form className="mobile-only mobile-school-search">
        <input name="q" defaultValue={q} placeholder="搜索学校、省份或城市" />
        <button type="submit">搜索</button>
      </form>

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>学校</th>
              <th>地区</th>
              {!marketManagerView ? <th>QS</th> : null}
              {!marketManagerView ? <th>合作星级</th> : null}
              {!marketManagerView ? <th>CSCA</th> : null}
              <th>项目数</th>
              {!marketManagerView ? <th>数据状态</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((school) => (
              <tr key={school.id}>
                <td>
                  <Link href={`/schools/${school.id}`}><strong>{school.nameZh}</strong></Link>
                </td>
                <td>{[school.province, school.city].filter(Boolean).join(" · ") || "—"}</td>
                {!marketManagerView ? <td>{school.qsRanking || "—"}</td> : null}
                {!marketManagerView ? <td>{school.partnershipRating || "—"}</td> : null}
                {!marketManagerView ? (
                  <td>
                    <Badge
                      tone={
                        school.cscaStatus === "NOT_REQUIRED"
                          ? "green"
                          : school.cscaStatus === "REQUIRED"
                            ? "amber"
                            : "gray"
                      }
                    >
                      {school.cscaStatus === "NOT_REQUIRED"
                        ? "不要求"
                        : school.cscaStatus === "REQUIRED"
                          ? "要求"
                          : "数据库未有相关信息"}
                    </Badge>
                  </td>
                ) : null}
                <td>{school.programCount}</td>
                {!marketManagerView ? (
                  <td>
                    <Badge tone={school.reviewStatus === "VERIFIED" ? "green" : "gray"}>
                      {school.reviewStatus === "VERIFIED" ? "已复核" : "自动导入"}
                    </Badge>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-only mobile-school-list">
        {rows.map((school) => (
          <Link key={school.id} href={`/schools/${school.id}`} className="mobile-school-card">
            <div className="mobile-school-name">{school.nameZh}</div>
            <div className="mobile-school-location">
              {[school.province, school.city].filter(Boolean).join(" · ") || "—"}
            </div>
            <div className="mobile-school-meta">
              {!marketManagerView ? (
                <div>
                  <span className="mobile-school-meta-label">QS</span>
                  <span className="mobile-school-meta-value">{school.qsRanking || "—"}</span>
                </div>
              ) : null}
              {!marketManagerView ? (
                <div>
                  <span className="mobile-school-meta-label">合作星级</span>
                  <span className="mobile-school-meta-value">{"★".repeat(Number(school.partnershipRating) || 0) || "—"}</span>
                </div>
              ) : null}
              {!marketManagerView ? (
                <div>
                  <span className="mobile-school-meta-label">CSCA</span>
                  <Badge
                    tone={
                      school.cscaStatus === "NOT_REQUIRED"
                        ? "green"
                        : school.cscaStatus === "REQUIRED"
                          ? "amber"
                          : "gray"
                    }
                  >
                    {school.cscaStatus === "NOT_REQUIRED"
                      ? "不要求"
                      : school.cscaStatus === "REQUIRED"
                        ? "要求"
                        : "未写明"}
                  </Badge>
                </div>
              ) : null}
              <div>
                <span className="mobile-school-meta-label">项目数</span>
                <span className="mobile-school-meta-value">{school.programCount}</span>
              </div>
              {!marketManagerView ? (
                <div>
                  <span className="mobile-school-meta-label">数据状态</span>
                  <Badge tone={school.reviewStatus === "VERIFIED" ? "green" : "gray"}>
                    {school.reviewStatus === "VERIFIED" ? "已复核" : "自动导入"}
                  </Badge>
                </div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>

      {totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} basePath="/schools" extraParams={extraParams} />
      ) : null}
    </>
  );
}

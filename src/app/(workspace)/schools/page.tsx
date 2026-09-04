import Link from "next/link";

import { Search } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { Badge, PageHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { makeT } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import { isMarketManager } from "@/lib/permissions";
import { listSchools } from "@/lib/queries";

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const t = makeT(await getUiLocale());
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
        title={t("学校知识库")}
        description={t("学校主数据、合作等级和关键项目概览。学校级 CSCA 仅作参考，筛选以项目要求为准。")}
        action={
          <Link className="button mobile-header-icon-only" href="/schools" aria-label={t("搜索学校")}>
            <Search aria-hidden="true" />
          </Link>
        }
      />
      <form className="toolbar desktop-only">
        <label className="search">
          {t("搜索学校、省份或城市")}
          <input name="q" defaultValue={q} placeholder={t("例如：浙江、深圳大学")} />
        </label>
        <button type="submit">{t("搜索")}</button>
        <Link className="button" href="/schools/noted">{t("特别备注院校")}</Link>
      </form>

      <form className="mobile-only mobile-school-search">
        <input name="q" defaultValue={q} placeholder={t("搜索学校、省份或城市")} />
        <button type="submit">{t("搜索")}</button>
      </form>

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>{t("学校")}</th>
              <th>{t("地区")}</th>
              {!marketManagerView ? <th>QS</th> : null}
              {!marketManagerView ? <th>{t("合作星级")}</th> : null}
              {!marketManagerView ? <th>CSCA</th> : null}
              <th>{t("项目数")}</th>
              {marketManagerView ? <th>{t("备注")}</th> : null}
              {!marketManagerView ? <th>{t("数据状态")}</th> : null}
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
                        ? t("不要求")
                        : school.cscaStatus === "REQUIRED"
                          ? t("要求")
                          : t("数据库未有相关信息")}
                    </Badge>
                  </td>
                ) : null}
                <td>{school.programCount}</td>
                {marketManagerView ? <td>{school.infoNote ?? ""}</td> : null}
                {!marketManagerView ? (
                  <td>
                    <Badge tone={school.reviewStatus === "VERIFIED" ? "green" : "gray"}>
                      {school.reviewStatus === "VERIFIED" ? t("已复核") : t("自动导入")}
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
                  <span className="mobile-school-meta-label">{t("合作星级")}</span>
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
                      ? t("不要求")
                      : school.cscaStatus === "REQUIRED"
                        ? t("要求")
                        : t("未写明")}
                  </Badge>
                </div>
              ) : null}
              <div>
                <span className="mobile-school-meta-label">{t("项目数")}</span>
                <span className="mobile-school-meta-value">{school.programCount}</span>
              </div>
              {marketManagerView ? (
                <div className="mobile-school-note">
                  <span className="mobile-school-meta-label">{t("备注")}</span>
                  <span className="mobile-school-meta-value">{school.infoNote ?? "—"}</span>
                </div>
              ) : null}
              {!marketManagerView ? (
                <div>
                  <span className="mobile-school-meta-label">{t("数据状态")}</span>
                  <Badge tone={school.reviewStatus === "VERIFIED" ? "green" : "gray"}>
                    {school.reviewStatus === "VERIFIED" ? t("已复核") : t("自动导入")}
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

import { ArrowUpRight, ClipboardList, Search } from "lucide-react";
import Link from "next/link";

import { Pagination } from "@/components/pagination";
import { Badge, PageHeading } from "@/components/ui";
import { getUserPermissions } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { listRecommendationRecords } from "@/lib/recommendation-records";
import { formatDate } from "@/lib/utils";

import "./recommendations.css";

export default async function RecommendationsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; scope?: string; page?: string }>;
}) {
  const user = await requirePermission("CUSTOMER_VIEW");
  const t = await getT();
  const permissions = getUserPermissions(user);
  const canStart = permissions.includes("SCREENING_VIEW") && permissions.includes("RECOMMENDATION_MANAGE");
  const params = await searchParams;
  const query = (typeof params.q === "string" ? params.q : "").trim().slice(0, 100);
  const mine = params.scope === "mine";
  const { rows, total, page, pageCount } = listRecommendationRecords({
    query, page: Number(params.page), createdBy: mine ? user.id : undefined,
  });
  const extraParams: Record<string, string> = {
    ...(query ? { q: query } : {}), ...(mine ? { scope: "mine" } : {}),
  };
  const scopeUrl = (myPlans: boolean) => {
    const next = new URLSearchParams(query ? { q: query } : {});
    if (myPlans) next.set("scope", "mine");
    return `/recommendations${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <PageHeading
        title={t("方案记录")}
        description={t("找回已保存的选校方案，查看候选项目和后续进度。")}
        action={canStart ? <Link className="button primary" href="/ai-screening">{t("开始选校")} <ArrowUpRight size={16} aria-hidden="true" /></Link> : undefined}
      />
      <section className="card plan-index" aria-label={t("已保存的方案")}>
        <div className="plan-index-tools">
          <nav className="plan-index-scope" aria-label={t("方案范围")}>
            <Link href={scopeUrl(false)} aria-current={!mine ? "page" : undefined}>{t("全部方案")}</Link>
            <Link href={scopeUrl(true)} aria-current={mine ? "page" : undefined}>{t("我保存的")}</Link>
          </nav>
          <form action="/recommendations" className="plan-index-search">
            {mine && <input type="hidden" name="scope" value="mine" />}
            <div>
              <Search size={16} aria-hidden="true" />
              <input name="q" type="search" defaultValue={query} maxLength={100}
                aria-label={t("搜索方案名、客户或学校")} placeholder={t("搜索方案名、客户或学校")} />
            </div>
            <button type="submit">{t("搜索")}</button>
          </form>
        </div>
        {rows.length ? (
          <>
            <div className="plan-index-columns" aria-hidden="true">
              <span>{t("方案")}</span>
              <span>{t("关联客户")}</span>
              <span>{t("项目数")}</span>
              <span>{t("保存信息")}</span>
              <span />
            </div>
            <ul className="plan-index-list">
              {rows.map((plan) => (
                <li key={plan.id} className="plan-index-row">
                  <div className="plan-index-title">
                    <Link href={`/recommendations/${plan.id}/print`}>{plan.title}</Link>
                    <span>{t(plan.mode === "ai" ? "AI 选校" : "条件筛查")}</span>
                  </div>
                  <div className="plan-index-customer">
                    <strong>{plan.customerName}</strong>
                    <span>{plan.customerNo}{plan.customerArchived ? ` · ${t("已归档")}` : ""}</span>
                  </div>
                  <div className="plan-index-count"><Badge>{plan.itemCount} {t("个项目")}</Badge></div>
                  <div className="plan-index-author"><span>{formatDate(plan.createdAt)}</span><span>{plan.authorName || "—"}</span></div>
                  <Link className="plan-index-open" href={`/recommendations/${plan.id}/print`}
                    aria-label={`${t("打开方案")}：${plan.title}`} title={t("打开方案")}><ArrowUpRight size={17} aria-hidden="true" /></Link>
                </li>
              ))}
            </ul>
            <footer className="plan-index-footer">
              <span>{total} {t("份方案")}</span>
              {pageCount > 1 && <Pagination page={page} totalPages={pageCount} basePath="/recommendations" extraParams={extraParams} />}
            </footer>
          </>
        ) : (
          <div className="plan-index-empty">
            <ClipboardList size={26} aria-hidden="true" />
            <h2>{t(query ? "没有找到匹配的方案" : mine ? "你还没有保存方案" : "还没有已保存的方案")}</h2>
            <p>{t(query ? "试试其他方案名、客户编号或学校名称。" : "在 AI 选校中把项目加入草稿并保存，之后可在这里找回。")}</p>
            {query ? <Link className="button" href={mine ? "/recommendations?scope=mine" : "/recommendations"}>{t("清除搜索")}</Link> : canStart ? (
              <Link className="button" href="/ai-screening">{t("开始选校")}</Link>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

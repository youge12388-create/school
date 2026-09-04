import Link from "next/link";

import { makeT, makeTv } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";

function buildQuery(base: string, page: number, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra ?? {});
  params.set("page", String(page));
  return `${base}?${params.toString()}`;
}

export async function Pagination({
  page,
  totalPages,
  basePath,
  extraParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  if (totalPages <= 1) return null;
  const locale = await getUiLocale();
  const t = makeT(locale);
  const tv = makeTv(locale);
  const pages = pageRange(page, totalPages);
  return (
    <nav className="pagination" aria-label={t("分页")}>
      {page > 1 ? (
        <Link className="pagination-link" href={buildQuery(basePath, page - 1, extraParams)}>
          {t("上一页")}
        </Link>
      ) : null}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="pagination-gap">…</span>
        ) : (
          <Link
            key={p}
            className={`pagination-link${p === page ? " active" : ""}`}
            href={buildQuery(basePath, p, extraParams)}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link className="pagination-link" href={buildQuery(basePath, page + 1, extraParams)}>
          {t("下一页")}
        </Link>
      ) : null}
      <span className="pagination-info">
        {tv("第 {page} / {totalPages} 页", { page, totalPages })}
      </span>
    </nav>
  );
}

function pageRange(current: number, total: number): (number | "...")[] {
  const delta = 1;
  const result: (number | "...")[] = [];
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  result.push(1);
  if (left > 2) result.push("...");
  for (let i = left; i <= right; i++) result.push(i);
  if (right < total - 1) result.push("...");
  if (total > 1) result.push(total);
  return result;
}

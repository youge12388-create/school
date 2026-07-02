import Link from "next/link";

function buildQuery(base: string, page: number, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra ?? {});
  params.set("page", String(page));
  return `${base}?${params.toString()}`;
}

export function Pagination({
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
  const pages = pageRange(page, totalPages);
  return (
    <nav className="pagination" aria-label="分页">
      {page > 1 ? (
        <Link className="pagination-link" href={buildQuery(basePath, page - 1, extraParams)}>
          上一页
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
          下一页
        </Link>
      ) : null}
      <span className="pagination-info">
        第 {page} / {totalPages} 页
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

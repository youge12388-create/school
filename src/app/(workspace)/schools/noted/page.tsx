import Link from "next/link";

import { EmptyState, PageHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { canViewConfidentialSchoolFields } from "@/lib/permissions";
import { listNotedSchools } from "@/lib/queries";

const pageSize = 20;

function displayNote(value: string | null) {
  return value?.trim() || null;
}

export default async function NotedSchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const canViewConfidential = canViewConfidentialSchoolFields(user.role);
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listNotedSchools(page, pageSize);
  const { rows } = result;
  const totalPages = Math.max(
    1,
    Math.ceil(result.total / result.pageSize),
  );

  return (
    <>
      <PageHeading
        title="特别备注院校"
        description="集中查看所有填写了备注的院校。信息备注为普通信息，合作与特殊情况备注仅高级管理员可见。"
      />

      {rows.length === 0 ? (
        <EmptyState>暂未有填写备注的院校</EmptyState>
      ) : (
        <div className="card">
          <div className="card-body">
            {rows.map((school) => {
              const infoNote = displayNote(school.infoNote);
              const cooperationNote = canViewConfidential
                ? displayNote(school.cooperationNote)
                : null;
              const specialCaseNote = canViewConfidential
                ? displayNote(school.specialCaseNote)
                : null;
              return (
                <article
                  key={school.id}
                  className="noted-school-item"
                  style={{
                    padding: "14px 0",
                    borderBottom: "1px solid var(--border-soft)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Link href={`/schools/${school.id}`}>
                      <strong>{school.nameZh}</strong>
                    </Link>
                    <span className="small muted">
                      {[school.province, school.city].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  {infoNote ? (
                    <div style={{ marginTop: 8 }}>
                      <span className="small muted">信息备注</span>
                      <p style={{ marginTop: 4 }}>{infoNote}</p>
                    </div>
                  ) : null}
                  {canViewConfidential ? (
                    <>
                      {cooperationNote ? (
                        <div style={{ marginTop: 8 }}>
                          <span className="small muted">合作备注</span>
                          <p style={{ marginTop: 4 }}>{cooperationNote}</p>
                        </div>
                      ) : null}
                      {specialCaseNote ? (
                        <div style={{ marginTop: 8 }}>
                          <span className="small muted">特殊情况备注</span>
                          <p style={{ marginTop: 4 }}>{specialCaseNote}</p>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {totalPages > 1 ? (
        <div style={{ marginTop: 16 }}>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (p) => (
              <Link
                href={`/schools/noted?page=${p}`}
                key={p}
                className={p === page ? "button primary" : "button"}
                style={{ marginRight: 8 }}
              >
                {p}
              </Link>
            ),
          )}
        </div>
      ) : null}
    </>
  );
}

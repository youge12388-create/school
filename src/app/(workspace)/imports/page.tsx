import { ImportPanel } from "@/components/import-panel";
import { SchoolUpdateImportPanel } from "@/components/school-update-import-panel";
import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { userHasPermission } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { makeT, makeTv } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import { listImports } from "@/lib/queries";
import { formatDate, safeJson } from "@/lib/utils";

type ImportAction = "NEW" | "MODIFIED" | "DUPLICATE" | "CONFLICT";
type SummaryRecord = Record<string, unknown>;

function isRecord(value: unknown): value is SummaryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatImportSummary(
  value: string | null,
  t: (text: string) => string,
  tv: (text: string, vars: Record<string, string | number>) => string,
  locale: "zh" | "en",
) {
  const parsed = safeJson<unknown>(value, null);
  if (!isRecord(parsed)) return t("摘要不可用");

  const actionLabels: Array<[ImportAction, string]> = [
    ["NEW", "新增"],
    ["MODIFIED", "修改"],
    ["DUPLICATE", "重复"],
    ["CONFLICT", "冲突"],
  ];
  const count = (record: SummaryRecord, key: string) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const lines = ([
    ["schools", "学校"],
    ["programs", "项目"],
  ] as const).map(([key, label]) => {
    const group = isRecord(parsed[key]) ? parsed[key] : {};
    const changes = actionLabels.flatMap(([action, actionLabel]) => {
      const amount = count(group, action);
      return amount > 0 ? [tv("{label} {n}", { label: t(actionLabel), n: amount })] : [];
    });
    return `${t(label)}${locale === "en" ? ": " : "："}${changes.length ? changes.join(" · ") : t("无变更")}`;
  });

  const sourceDuplicates = count(parsed, "sourceDuplicates");
  const needsReview = count(parsed, "needsReview");
  const fileConflicts = count(parsed, "fileConflicts");
  const fileSkipped = count(parsed, "fileSkipped");
  if (sourceDuplicates) lines.push(tv("源文件重复 {n} 条", { n: sourceDuplicates }));
  if (needsReview) lines.push(tv("待复核 {n} 条", { n: needsReview }));
  if (fileConflicts) lines.push(tv("文件内冲突 {n} 条", { n: fileConflicts }));
  if (fileSkipped) lines.push(tv("缺少必填信息跳过 {n} 条", { n: fileSkipped }));
  return lines.join(" · ");
}

export default async function ImportsPage() {
  const user = await requirePermission("DATA_IMPORT");
  const locale = await getUiLocale();
  const t = makeT(locale);
  const tv = makeTv(locale);
  const canImportSchoolUpdates = userHasPermission(user, "SCHOOL_UPDATE_MANAGE");
  const batches = await listImports();
  return (
    <>
      <PageHeading
        title={t("数据录入")}
        description={t("导入学校与项目数据，确认预览后写入知识库。")}
        action={
          <div className="page-heading-actions import-page-actions">
            <a className="button" href="/api/templates/maintenance">{t("下载维护模板")}</a>
            <a className="button" href="/api/templates/programs">{t("导出完整数据")}</a>
          </div>
        }
      />
      <ImportPanel />
      {canImportSchoolUpdates ? <SchoolUpdateImportPanel /> : null}
      <section className="card import-history-card">
        <div className="card-header"><h3>{t("导入历史")}</h3></div>
        <div className="card-body">
          {batches.length ? (
            <>
              <div className="table-wrap desktop-only">
                <table>
                  <thead><tr><th>{t("文件")}</th><th>{t("状态")}</th><th>{t("摘要")}</th><th>{t("时间")}</th></tr></thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr key={batch.id}>
                        <td>{batch.sourceName.split(/[\\/]/).filter(Boolean).at(-1) ?? batch.sourceName}</td>
                        <td>
                          <Badge tone={batch.status === "CONFIRMED" ? "green" : "amber"}>
                            {batch.status === "CONFIRMED" ? t("已确认") : t("仅预览")}
                          </Badge>
                        </td>
                        <td className="small import-history-summary">{formatImportSummary(batch.summaryJson, t, tv, locale)}</td>
                        <td>{formatDate(batch.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="import-history-mobile mobile-only">
                {batches.map((batch) => (
                  <article className="import-history-mobile-item" key={batch.id}>
                    <strong>{batch.sourceName.split(/[\\/]/).filter(Boolean).at(-1) ?? batch.sourceName}</strong>
                    <div className="import-history-mobile-meta">
                      <Badge tone={batch.status === "CONFIRMED" ? "green" : "amber"}>
                        {batch.status === "CONFIRMED" ? t("已确认") : t("仅预览")}
                      </Badge>
                      <time>{formatDate(batch.createdAt)}</time>
                    </div>
                    <p>{formatImportSummary(batch.summaryJson, t, tv, locale)}</p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <EmptyState>{t("暂无导入记录")}</EmptyState>
          )}
        </div>
      </section>
    </>
  );
}

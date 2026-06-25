import Link from "next/link";

import { Badge, PageHeading } from "@/components/ui";
import { listSchools } from "@/lib/queries";

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const rows = await listSchools(q);
  return (
    <>
      <PageHeading
        title="学校知识库"
        description="学校主数据、合作等级和关联项目概览。学校级 CSCA 仅作参考，筛选以项目要求为准。"
      />
      <form className="toolbar">
        <label className="search">
          搜索学校、省份或城市
          <input name="q" defaultValue={q} placeholder="例如：浙江、深圳大学" />
        </label>
        <button type="submit">搜索</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>学校</th>
              <th>地区</th>
              <th>QS</th>
              <th>合作星级</th>
              <th>CSCA</th>
              <th>项目数</th>
              <th>数据状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((school) => (
              <tr key={school.id}>
                <td>
                  <Link href={`/schools/${school.id}`}><strong>{school.nameZh}</strong></Link>
                </td>
                <td>{[school.province, school.city].filter(Boolean).join(" · ") || "—"}</td>
                <td>{school.qsRanking || "—"}</td>
                <td>{school.partnershipRating || "—"}</td>
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
                <td>
                  <Link href={`/programs?q=${encodeURIComponent(school.nameZh)}`}>
                    {school.programCount}
                  </Link>
                </td>
                <td>
                  <Badge tone={school.reviewStatus === "VERIFIED" ? "green" : "gray"}>
                    {school.reviewStatus === "VERIFIED" ? "已复核" : "自动导入"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}



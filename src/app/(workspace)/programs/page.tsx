import { verifyProgramAction } from "@/app/actions";
import { Badge, PageHeading } from "@/components/ui";
import {
  LANGUAGE_LABELS,
  PROGRAM_TYPE_LABELS,
} from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import { listPrograms } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/utils";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    language?: string;
    review?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const rows = await listPrograms({
    query: params.q,
    programType: params.type,
    language: params.language,
    reviewStatus: params.review,
  });
  return (
    <>
      <PageHeading
        title="项目知识库"
        description="结构化条件与原始文本并存。标为“数据库未有相关信息”的项目需要人工核实。"
      />
      <form className="toolbar">
        <label className="search">
          关键词
          <input name="q" defaultValue={params.q} placeholder="学校、专业或介绍" />
        </label>
        <label>
          申请学历
          <select name="type" defaultValue={params.type}>
            <option value="">全部</option>
            {Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          授课语言
          <select name="language" defaultValue={params.language}>
            <option value="">全部</option>
            {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          数据状态
          <select name="review" defaultValue={params.review}>
            <option value="">全部</option>
            <option value="NEEDS_REVIEW">待复核</option>
            <option value="AUTO_PARSED">自动解析</option>
            <option value="VERIFIED">已复核</option>
          </select>
        </label>
        <button type="submit">筛选</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>学校 / 项目</th>
              <th>类型</th>
              <th>首年费用上限</th>
              <th>CSCA</th>
              <th>截止日期</th>
              <th>专业</th>
              <th>状态</th>
              {user.role !== "ADVISOR" ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((program) => (
              <tr key={program.id}>
                <td>
                  <strong>{program.schoolName}</strong>
                  <div className="small muted">{program.name}</div>
                </td>
                <td className="nowrap">
                  {PROGRAM_TYPE_LABELS[program.programType] ?? program.programType}
                  <div className="small muted">
                    {LANGUAGE_LABELS[program.teachingLanguage] ??
                      program.teachingLanguage}
                  </div>
                </td>
                <td>
                  {formatMoney(program.firstYearCostMax)}
                  <div className="small muted truncate">{program.tuitionText}</div>
                </td>
                <td>
                  <Badge
                    tone={
                      program.cscaStatus === "NOT_REQUIRED"
                        ? "green"
                        : program.cscaStatus === "REQUIRED"
                          ? "amber"
                          : "gray"
                    }
                  >
                    {program.cscaStatus === "NOT_REQUIRED"
                      ? "不要求"
                      : program.cscaStatus === "REQUIRED"
                        ? "要求"
                        : "未知"}
                  </Badge>
                </td>
                <td>
                  <Badge
                    tone={
                      program.deadlineStatus === "OPEN"
                        ? "green"
                        : program.deadlineStatus === "EXPIRED"
                          ? "red"
                          : "gray"
                    }
                  >
                    {program.deadlineStatus === "OPEN"
                      ? formatDate(program.deadlineDate)
                      : program.deadlineStatus === "EXPIRED"
                        ? `已截止 ${formatDate(program.deadlineDate)}`
                        : "数据库未有相关信息"}
                  </Badge>
                </td>
                <td><div className="truncate">{program.majorText || "数据库未有相关信息"}</div></td>
                <td>
                  <Badge
                    tone={
                      program.reviewStatus === "VERIFIED"
                        ? "green"
                        : program.reviewStatus === "NEEDS_REVIEW"
                          ? "amber"
                          : "blue"
                    }
                  >
                    {program.reviewStatus === "VERIFIED"
                      ? "已复核"
                      : program.reviewStatus === "NEEDS_REVIEW"
                        ? "待复核"
                        : "自动解析"}
                  </Badge>
                </td>
                {user.role !== "ADVISOR" ? (
                  <td>
                    {program.reviewStatus !== "VERIFIED" ? (
                      <form action={verifyProgramAction}>
                        <input type="hidden" name="programId" value={program.id} />
                        <button type="submit">确认复核</button>
                      </form>
                    ) : "—"}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

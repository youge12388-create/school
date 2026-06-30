import Link from "next/link";

import { Badge } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { getSupervisorAcceptanceStatus } from "@/lib/matcher";
import type { FitLevel, RankedProgram } from "@/lib/matcher";
import { parseMajorItems } from "@/lib/screening-results";
import { formatDate, formatMoney } from "@/lib/utils";

const toneByFit: Record<FitLevel, "green" | "amber" | "gray" | "red"> = {
  MATCHED: "green",
  NEEDS_ACTION: "amber",
  UNKNOWN: "gray",
  NOT_MATCHED: "red",
};

const labelByFit: Record<FitLevel, string> = {
  MATCHED: "可直接申请",
  NEEDS_ACTION: "需要补充条件",
  UNKNOWN: "信息待核实",
  NOT_MATCHED: "明确不符合",
};
type DetailLinkParams = Record<string, string | undefined>;

function buildSchoolDetailHref(result: RankedProgram, detailParams?: DetailLinkParams) {
  const { program } = result;
  const params = new URLSearchParams({ from: "screening" });

  const relevantKeys = ["type", "language", "major"] as const;
  for (const key of relevantKeys) {
    const value = detailParams?.[key];
    if (value) params.set(key, value);
  }

  if (!params.has("type") && !params.has("language") && !params.has("major")) {
    params.set("programId", program.id);
  }

  return `/schools/${program.schoolId}?${params.toString()}`;
}

export function ScreeningResultCard({
  result,
  rank,
  detailParams,
}: {
  result: RankedProgram;
  rank: number;
  detailParams?: DetailLinkParams;
}) {
  const { program } = result;
  const supervisorStatus = getSupervisorAcceptanceStatus(program);
  const supervisorBadge =
    supervisorStatus === "REQUIRED"
      ? { label: "需导师接收函", tone: "red" as const }
      : supervisorStatus === "PARTIAL_REQUIRED"
        ? { label: "部分需导师接收函", tone: "amber" as const }
        : null;
  const schoolDetailHref = buildSchoolDetailHref(result, detailParams);
  const majors = parseMajorItems(program.majorText);
  const visibleMajors = majors.slice(0, 8);
  const hiddenMajorCount = majors.length - visibleMajors.length;
  return (
    <article className="card result-card">
      <div className="result-main">
        <div className="result-select">
          <input
            type="checkbox"
            name="programIds"
            value={program.id}
            aria-label={`选择 ${program.schoolName} ${program.programName}`}
          />
          <span className="result-rank" aria-label={`排序第 ${rank}`}>{rank}</span>
        </div>
        <div className="result-content">
          <div className="result-heading-row">
            <div className="result-title-wrap">
              <div className="result-title-line">
                <Link className="result-school-link" href={schoolDetailHref}>
                  {program.schoolName}
                </Link>
                {supervisorBadge ? (
                  <Badge tone={supervisorBadge.tone}>{supervisorBadge.label}</Badge>
                ) : null}
              </div>
              <div className="result-program-name">{program.programName}</div>
            </div>
            <div className="result-status">
              <Badge tone={toneByFit[result.fitLevel]}>{labelByFit[result.fitLevel]}</Badge>
              <Link className="button result-detail-link" href={schoolDetailHref}>
                查看详情
              </Link>
            </div>
          </div>
          <div className="result-meta">
            <span>{PROGRAM_TYPE_LABELS[program.programType] ?? program.programType}</span>
            <span>{LANGUAGE_LABELS[program.teachingLanguage] ?? program.teachingLanguage}</span>
            <span>{[program.province, program.city].filter(Boolean).join(" · ") || "地区未知"}</span>
            <span>申请截止：{formatDate(program.deadlineDate)}</span>
            <span>
              {result.effectiveDeadlineStatus === "OPEN"
                ? "开放中"
                : result.effectiveDeadlineStatus === "EXPIRED"
                  ? "已截止"
                  : "截止日期未知"}
            </span>
            <span className="result-money">首年上限：{formatMoney(program.firstYearCostMax)}</span>
          </div>
          {majors.length ? (
            <div className="result-majors">
              <span className="result-major-label">专业方向</span>
              <ul className="major-chip-list" aria-label={`专业方向，共 ${majors.length} 个`}>
                {visibleMajors.map((major) => (
                  <li className="major-chip" key={major}>{major}</li>
                ))}
                {hiddenMajorCount > 0 ? (
                  <li className="major-chip major-chip-more">另有 {hiddenMajorCount} 个</li>
                ) : null}
              </ul>
            </div>
          ) : (
            <span className="small muted result-major-empty">暂无专业信息</span>
          )}
          <label className="result-reason">
            顾问推荐理由
            <input name={`reason_${program.id}`} placeholder="可选，打印方案时显示" />
          </label>
          <input type="hidden" name={`fit_${program.id}`} value={result.fitLevel} />
          <input
            type="hidden"
            name={`evidence_${program.id}`}
            value={JSON.stringify(result.evidence)}
          />
        </div>
      </div>
      <div className="evidence-strip">
        {result.evidence.map((item) => (
          <div className={`evidence ${item.level.toLowerCase()}`} key={`${program.id}-${item.label}`}>
            <strong>{item.label}</strong>
            <span className="small">{item.detail}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

import Link from "next/link";

import { Badge } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { getEnrollmentRegionPreference, getSupervisorAcceptanceStatus } from "@/lib/matcher";
import type { FitLevel, RankedProgram } from "@/lib/matcher";
import { makeT, makeTv } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
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

// 市场经理视图：专业分组的授课语言后缀（对应总表"专业（中授/英授）"口径）
const TEACHING_SUFFIX: Record<string, string> = {
  CHINESE: "中",
  ENGLISH: "英",
  FRENCH: "法",
};

const TEACHING_SUFFIX_EN: Record<string, string> = {
  CHINESE: "Chinese",
  ENGLISH: "English",
  FRENCH: "French",
};

function buildSchoolDetailHref(result: RankedProgram, detailParams?: DetailLinkParams) {
  const { program } = result;
  const params = new URLSearchParams({ from: "screening" });

  const relevantKeys = ["type", "language", "major"] as const;
  for (const key of relevantKeys) {
    const value = detailParams?.[key];
    if (value) params.set(key, value);
  }

  params.set("programId", program.id);

  return `/schools/${program.schoolId}?${params.toString()}`;
}

export async function ScreeningResultCard({
  result,
  rank,
  detailParams,
  marketManagerView = false,
}: {
  result: RankedProgram;
  rank: number;
  detailParams?: DetailLinkParams;
  marketManagerView?: boolean;
}) {
  const { program } = result;
  const locale = await getUiLocale();
  const t = makeT(locale);
  const tv = makeTv(locale);
  const en = locale === "en";
  const supervisorStatus = getSupervisorAcceptanceStatus(program);
  const supervisorBadge =
    supervisorStatus === "REQUIRED"
      ? { label: "需导师接收函", tone: "red" as const }
      : supervisorStatus === "PARTIAL_REQUIRED"
        ? { label: "部分需导师接收函", tone: "amber" as const }
        : null;
  const enrollmentRegionPreference = getEnrollmentRegionPreference(program);
  const enrollmentRegionBadge =
    enrollmentRegionPreference === "HAS_PREFERENCE"
      ? { label: "有生源地偏好", tone: "amber" as const }
      : null;
  const schoolDetailHref = buildSchoolDetailHref(result, detailParams);
  const majors = parseMajorItems(program.majorText);
  const visibleMajors = majors.slice(0, 8);
  const hiddenMajorCount = majors.length - visibleMajors.length;
  const teachingSuffix = TEACHING_SUFFIX[program.teachingLanguage] ?? "";
  const teachingSuffixEn = TEACHING_SUFFIX_EN[program.teachingLanguage] ?? "";
  const interviewDetail = [
    program.languageAssessmentText,
    program.degreeAssessmentText,
  ].filter(Boolean).join("；");
  const scholarshipText = [
    program.scholarshipCategory,
    program.scholarshipContent,
  ].filter(Boolean).join("：");
  return (
    <article className="card result-card">
      <div className="result-main">
        <div className="result-select">
          <input
            type="checkbox"
            name="programIds"
            value={program.id}
            aria-label={tv("选择 {school} {program}", {
              school: program.schoolName,
              program: program.programName,
            })}
          />
          <span className="result-rank" aria-label={tv("排序第 {n}", { n: rank })}>{rank}</span>
        </div>
        <div className="result-content">
          <div className="result-heading-row">
            <div className="result-title-wrap">
              <div className="result-title-line">
                <Link className="result-school-link" href={schoolDetailHref}>
                  {program.schoolName}
                </Link>
                {!marketManagerView && supervisorBadge ? (
                  <Badge tone={supervisorBadge.tone}>{t(supervisorBadge.label)}</Badge>
                ) : null}
                {!marketManagerView && enrollmentRegionBadge ? (
                  <Badge tone={enrollmentRegionBadge.tone}>{t(enrollmentRegionBadge.label)}</Badge>
                ) : null}
              </div>
              <div className="result-program-name">{program.programName}</div>
            </div>
            <div className="result-status">
              {!marketManagerView ? (
                <Badge tone={toneByFit[result.fitLevel]}>{t(labelByFit[result.fitLevel])}</Badge>
              ) : null}
              <Link className="button result-detail-link" href={schoolDetailHref}>
                {t("查看详情")}
              </Link>
            </div>
          </div>
          <div className="result-meta">
            <span>{t(PROGRAM_TYPE_LABELS[program.programType] ?? program.programType)}</span>
            {!marketManagerView ? (
              <span>{t(LANGUAGE_LABELS[program.teachingLanguage] ?? program.teachingLanguage)}</span>
            ) : null}
            <span>{[program.province, program.city].filter(Boolean).join(" · ") || t("地区未知")}</span>
            <span>{tv("申请截止：{d}", { d: formatDate(program.deadlineDate) })}</span>
            <span>
              {result.effectiveDeadlineStatus === "OPEN"
                ? t("开放中")
                : result.effectiveDeadlineStatus === "EXPIRED"
                  ? t("已截止")
                  : t("截止日期未知")}
            </span>
            {!marketManagerView ? (
              <span className="result-money">{tv("首年上限：{n}", { n: formatMoney(program.firstYearCostMax) })}</span>
            ) : null}
          </div>
          {majors.length ? (
            <div className="result-majors">
              <span className="result-major-label">
                {marketManagerView && teachingSuffix
                  ? en
                    ? `Majors (${teachingSuffixEn}-taught)`
                    : tv("专业（{s}授）", { s: teachingSuffix })
                  : t("专业方向")}
              </span>
              <ul className="major-chip-list" aria-label={tv("专业方向，共 {n} 个", { n: majors.length })}>
                {visibleMajors.map((major) => (
                  <li className="major-chip" key={major}>{major}</li>
                ))}
                {hiddenMajorCount > 0 ? (
                  <li className="major-chip major-chip-more">{tv("另有 {n} 个", { n: hiddenMajorCount })}</li>
                ) : null}
              </ul>
            </div>
          ) : (
            <span className="small muted result-major-empty">{t("暂无专业信息")}</span>
          )}
          {marketManagerView ? (
            <div className="result-market">
              <div className="result-market-item">
                <span className="result-market-label">{t("学费")}</span>
                <span>{program.tuitionText || "—"}</span>
              </div>
              <div className="result-market-item">
                <span className="result-market-label">{t("住宿费")}</span>
                <span>{program.accommodationText || "—"}</span>
              </div>
              <div className="result-market-item">
                <span className="result-market-label">{t("奖学金")}</span>
                <span>{scholarshipText || "—"}</span>
              </div>
              <div className="result-market-item">
                <span className="result-market-label">{t("可招生人数")}</span>
                <span>
                  {program.recruitmentQuotaText || program.recruitmentPlanText || "—"}
                </span>
              </div>
              <div className="result-market-item">
                <span className="result-market-label">{t("是否面试")}</span>
                <span title={interviewDetail || undefined}>
                  {interviewDetail ? t("是") : "—"}
                </span>
              </div>
              <div className="result-market-item result-market-wide">
                <span className="result-market-label">{t("招生条件")}</span>
                <span>{program.requirementsText || "—"}</span>
              </div>
            </div>
          ) : null}
          {!marketManagerView ? (
            <label className="result-reason">
              {t("顾问推荐理由")}
              <input name={`reason_${program.id}`} placeholder={t("可选，打印方案时显示")} />
            </label>
          ) : null}
          <input type="hidden" name={`fit_${program.id}`} value={result.fitLevel} />
          <input
            type="hidden"
            name={`evidence_${program.id}`}
            value={JSON.stringify(result.evidence)}
          />
        </div>
      </div>
      {!marketManagerView ? (
        <div className="evidence-strip">
          {result.evidence.map((item) => (
            <div className={`evidence ${item.level.toLowerCase()}`} key={`${program.id}-${item.label}`}>
              <strong>{t(item.label)}</strong>
              <span className="small">{item.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import { getSchoolDetails } from "@/lib/queries";
import { parseMajorItems } from "@/lib/screening-results";
import { formatDate, formatMoney, safeJson } from "@/lib/utils";

const UNKNOWN_TEXT = "数据库未有相关信息";

const SCHOOL_FIELDS = [
  "学校中文名",
  "学校名称",
  "学校分类",
  "省份",
  "城市",
  "官网",
  "QS排名",
  "排名信息",
  "合作星级",
  "CSCA",
  "标签",
  "LogoID",
  "CoverID",
  "学校简介",
  "合作项目",
] as const;

const PROGRAM_FIELDS = [
  "学校中文名",
  "项目类型",
  "学费",
  "授课语言",
  "标签",
  "项目介绍",
  "学制",
  "学制备注",
  "专业列表",
  "专业方向",
  "申请要求及材料",
  "学期安排",
  "申请时间说明",
  "奖学金类别",
  "奖学金内容",
  "奖学金备注",
  "奖学金截止日期",
  "住宿费",
  "保险费",
  "自费生申请费",
  "奖学金申请费",
  "费用备注",
] as const;

function externalUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function hasValidDate(value: Date | null) {
  return Boolean(value && Number.isFinite(value.getTime()));
}

function deadlineTone(deadlineDate: Date | null) {
  if (!hasValidDate(deadlineDate)) return "gray" as const;
  return deadlineDate!.getTime() >= Date.now() ? ("green" as const) : ("red" as const);
}

function deadlineLabel(deadlineDate: Date | null) {
  if (!hasValidDate(deadlineDate)) return "截止日期未知";
  return deadlineDate!.getTime() >= Date.now()
    ? `截止 ${formatDate(deadlineDate)}`
    : `已截止 ${formatDate(deadlineDate)}`;
}
function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function programMatchesContext(
  program: { id: string; programType: string; teachingLanguage: string; majorText: string | null },
  context: { programId?: string; type?: string; language?: string; major?: string },
) {
  if (context.programId) return program.id === context.programId;
  if (context.type && program.programType !== context.type) return false;
  if (context.language && program.teachingLanguage !== context.language) return false;
  if (context.major) {
    const normalizedMajor = normalizeSearchText(context.major);
    const normalizedText = normalizeSearchText(program.majorText ?? "");
    if (!normalizedText.includes(normalizedMajor)) return false;
  }
  return true;
}

function contextLabel(context: { type?: string; language?: string; major?: string }) {
  return [
    context.type ? PROGRAM_TYPE_LABELS[context.type] ?? context.type : null,
    context.language ? LANGUAGE_LABELS[context.language] ?? context.language : null,
    context.major ? `专业：${context.major}` : null,
  ].filter(Boolean).join(" · ");
}

function displayValue(value: unknown) {
  if (value == null) return UNKNOWN_TEXT;
  if (typeof value === "string") return value.trim() || UNKNOWN_TEXT;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function isLongField(label: string, value: unknown) {
  return (
    displayValue(value).length > 70 ||
    [
      "学校简介",
      "合作项目",
      "项目介绍",
      "专业列表",
      "专业方向",
      "申请要求及材料",
      "学期安排",
      "申请时间说明",
      "奖学金内容",
      "奖学金备注",
      "住宿费",
      "费用备注",
    ].includes(label)
  );
}

function KnowledgeFieldGrid({
  fields,
  data,
}: {
  fields: readonly string[];
  data: Record<string, unknown>;
}) {
  return (
    <div className="knowledge-field-grid">
      {fields.map((label) => {
        const value = data[label];
        const text = displayValue(value);
        const majorItems =
          text !== UNKNOWN_TEXT && ["专业列表", "专业方向"].includes(label)
            ? parseMajorItems(text)
            : [];
        return (
          <div
            className={`knowledge-field${isLongField(label, value) ? " knowledge-field-wide" : ""}`}
            key={label}
          >
            <span>{label}</span>
            {majorItems.length ? (
              <ul className="major-chip-list" aria-label={`${label}，共 ${majorItems.length} 个`}>
                {majorItems.map((major) => (
                  <li className="major-chip" key={major}>{major}</li>
                ))}
              </ul>
            ) : label === "官网" && text !== UNKNOWN_TEXT ? (
              <a href={externalUrl(text)} target="_blank" rel="noreferrer">
                {text}
              </a>
            ) : (
              <p className={text === UNKNOWN_TEXT ? "muted" : undefined}>{text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default async function SchoolDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await requireUser();
  const canEdit = user.role === "ADMIN" || user.role === "DATA_MANAGER";
  const data = await getSchoolDetails(id);
  if (!data) notFound();
  const { school, programs } = data;
  const screeningContext = {
    programId: query.programId,
    type: query.type,
    language: query.language,
    major: query.major,
  };
  const hasScreeningContext =
    query.from === "screening" &&
    Boolean(
      screeningContext.programId ||
        screeningContext.type ||
        screeningContext.language ||
        screeningContext.major,
    );
  const visiblePrograms = hasScreeningContext
    ? programs.filter((program) => programMatchesContext(program, screeningContext))
    : programs;
  const activeContextLabel = contextLabel(screeningContext);
  const schoolRaw = safeJson<Record<string, unknown>>(school.rawJson, {});
  const schoolKnowledge: Record<string, unknown> = {
    学校中文名: school.nameZh,
    学校名称: school.name,
    学校分类: school.category,
    省份: school.province,
    城市: school.city,
    官网: school.website,
    QS排名: school.qsRanking,
    排名信息: school.rankingInfo,
    合作星级: school.partnershipRating,
    CSCA:
      school.cscaStatus === "REQUIRED"
        ? "是"
        : school.cscaStatus === "NOT_REQUIRED"
          ? "否"
          : null,
    标签: school.tags,
    LogoID: null,
    CoverID: null,
    学校简介: school.description,
    合作项目: school.cooperationPrograms,
    ...schoolRaw,
  };

  return (
    <>
      <PageHeading
        title={school.nameZh}
        description={school.name && school.name !== school.nameZh ? school.name : "学校知识库完整档案"}
        action={<>{canEdit ? <Link className="button primary" href={`/schools/${school.id}/edit`}>编辑学校</Link> : null} <Link className="button" href="/screening">返回学校筛查</Link></>}
      />

      <section className="grid cols-3 school-overview-grid">
        <div className="card school-overview-card">
          <span>地区</span>
          <strong>{[school.province, school.city].filter(Boolean).join(" · ") || UNKNOWN_TEXT}</strong>
        </div>
        <div className="card school-overview-card">
          <span>QS 排名</span>
          <strong>{school.qsRanking ?? UNKNOWN_TEXT}</strong>
        </div>
        <div className="card school-overview-card">
          <span>知识库项目</span>
          <strong>{visiblePrograms.length} / {programs.length} 个</strong>
        </div>
      </section>

      <section className="card school-knowledge-card">
        <div className="card-header school-knowledge-header">
          <div>
            <h3>高校汇总表 · 全部字段</h3>
            <p className="small muted">以下内容来自你上传的高校汇总知识库原始记录。</p>
          </div>
          <Badge tone={school.reviewStatus === "VERIFIED" ? "green" : school.reviewStatus === "NEEDS_REVIEW" ? "amber" : "blue"}>
            {school.reviewStatus === "VERIFIED" ? "已复核" : school.reviewStatus === "NEEDS_REVIEW" ? "待复核" : "自动导入"}
          </Badge>
        </div>
        <div className="card-body">
          <KnowledgeFieldGrid fields={SCHOOL_FIELDS} data={schoolKnowledge} />
        </div>
      </section>

      <section className="school-programs-section">
        <div className="school-programs-heading">
          <div>
            <h2>{hasScreeningContext ? "筛选相关项目" : "高校项目表 · 全部项目与字段"}</h2>
            <p>
              {hasScreeningContext
                ? `当前从筛选结果进入，仅显示 ${activeContextLabel || "当前筛选"} 相关项目：${visiblePrograms.length} / ${programs.length} 个。`
                : `共 ${programs.length} 个有效项目。每个项目均按原始 Excel 列完整展示。`}
            </p>
          </div>
          <div className="school-program-actions">
            {hasScreeningContext ? (
              <Link className="button" href={`/schools/${school.id}`}>查看该校全部项目</Link>
            ) : null}
            <Link className="button primary" href="/screening">返回筛选</Link>
          </div>
        </div>

        {visiblePrograms.length ? (
          visiblePrograms.map((program, index) => {
            const raw = safeJson<Record<string, unknown>>(program.rawJson, {});
            const programKnowledge: Record<string, unknown> = {
              学校中文名: school.nameZh,
              项目类型: program.programType,
              学费: program.tuitionText,
              授课语言: program.teachingLanguage,
              标签: program.tags,
              项目介绍: program.introduction,
              学制: program.duration,
              学制备注: program.durationNote,
              专业列表: program.majorText,
              专业方向: program.directionText,
              申请要求及材料: program.requirementsText,
              学期安排: program.semesterText,
              申请时间说明: program.applicationTimeText,
              奖学金类别: program.scholarshipCategory,
              奖学金内容: program.scholarshipContent,
              奖学金备注: program.scholarshipNote,
              奖学金截止日期: program.scholarshipDeadlineText,
              住宿费: program.accommodationText,
              保险费: program.insuranceText,
              自费生申请费: program.applicationFeeText,
              奖学金申请费: program.scholarshipApplicationFeeText,
              费用备注: program.feeNote,
              ...raw,
            };
            return (
              <article className="card school-program-card" key={program.id}>
                <div className="card-header school-program-header">
                  <div>
                    <span className="small muted">项目 {index + 1}</span>
                    <h3>{program.name}</h3>
                    <div className="result-meta">
                      <span>{PROGRAM_TYPE_LABELS[program.programType] ?? program.programType}</span>
                      <span>{LANGUAGE_LABELS[program.teachingLanguage] ?? program.teachingLanguage}</span>
                      <span>首年上限：{formatMoney(program.firstYearCostMax)}</span>
                    </div>
                  </div>
                  <div className="school-program-badges">
                    <Badge tone={deadlineTone(program.deadlineDate)}>{deadlineLabel(program.deadlineDate)}</Badge>
                    <Badge tone={program.reviewStatus === "VERIFIED" ? "green" : program.reviewStatus === "NEEDS_REVIEW" ? "amber" : "blue"}>
                      {program.reviewStatus === "VERIFIED" ? "已复核" : program.reviewStatus === "NEEDS_REVIEW" ? "待复核" : "自动解析"}
                    </Badge>
                  </div>
                </div>
                <div className="card-body">
                  <KnowledgeFieldGrid fields={PROGRAM_FIELDS} data={programKnowledge} />
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState>{hasScreeningContext ? "该学校没有符合当前筛选上下文的项目。" : "该学校暂无有效项目"}</EmptyState>
        )}
      </section>
    </>
  );
}
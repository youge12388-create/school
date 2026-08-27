import Link from "next/link";
import { notFound } from "next/navigation";

import { BackButton } from "@/components/back-button";
import { EditModeBanner, EditModeProvider, EditModeToggle } from "@/components/edit-mode";
import { ScrollToProgram } from "@/components/scroll-to-program";
import { SchoolUpdateForm } from "@/components/school-update-form";
import { SchoolUpdateItem } from "@/components/school-update-item";
import { SchoolBasicCard, type BasicCardSchool } from "@/components/school-basic-card";
import { SchoolConfidentialCard } from "@/components/school-confidential-card";
import { SchoolProgramCard, type ProgramCardData } from "@/components/school-program-card";
import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import {
  canEditConfidentialSchoolFields,
  canEditSchool,
  canManageSchoolUpdates,
  canViewConfidentialSchoolFields,
  isMarketManager,
  MARKET_MANAGER_PROGRAM_CORE_FIELDS,
  MARKET_MANAGER_PROGRAM_LONG_FIELDS,
  MARKET_MANAGER_SCHOOL_FIELDS,
} from "@/lib/permissions";
import { getSchoolDetails, getSchoolUpdates } from "@/lib/queries";
import { serializeSchoolUpdate } from "@/lib/school-updates";
import { safeJson } from "@/lib/utils";

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

// 项目核心字段：4 列紧凑网格 always 显示（短文本，决策时一眼可见）
const PROGRAM_CORE_FIELDS = [
  "项目类型",
  "授课语言",
  "学费",
  "学制",
  "学制备注",
  "标签",
  "奖学金类别",
  "奖学金截止日期",
  "住宿费",
  "保险费",
  "自费生申请费",
  "奖学金申请费",
] as const;

// 项目长字段：折叠区，避免多项目时下滑过长
const PROGRAM_LONG_FIELDS = [
  "项目介绍",
  "专业列表",
  "专业方向",
  "学期安排",
  "申请时间说明",
  "奖学金内容",
  "奖学金备注",
  "费用备注",
] as const;

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
  const canEdit = canEditSchool(user.role);
  const canEditConfidential = canEditConfidentialSchoolFields(user.role);
  const canViewConfidential = canViewConfidentialSchoolFields(user.role);
  const canManageUpdates = canManageSchoolUpdates(user.role);
  const marketManagerView = isMarketManager(user.role);
  const schoolFields = marketManagerView
    ? MARKET_MANAGER_SCHOOL_FIELDS
    : SCHOOL_FIELDS;
  const programCoreFields = marketManagerView
    ? MARKET_MANAGER_PROGRAM_CORE_FIELDS
    : PROGRAM_CORE_FIELDS;
  const programLongFields = marketManagerView
    ? MARKET_MANAGER_PROGRAM_LONG_FIELDS
    : PROGRAM_LONG_FIELDS;
  const data = await getSchoolDetails(id);
  if (!data) notFound();
  const { school, programs } = data;
  const updateItems = marketManagerView ? [] : await getSchoolUpdates(id);
  const screeningContext = {
    programId: query.programId,
    type: query.type,
    language: query.language,
    major: query.major,
  };
  const targetProgramId = screeningContext.programId;
  const targetMajor = screeningContext.major;
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
  const cooperationKnowledge: Record<string, unknown> = {
    团体申请账号: school.groupApplicationAccount,
    是否可代收: school.collectionServiceText,
    奖学金发放形式: school.scholarshipDisbursementText,
    合作截止日期: school.cooperationDeadlineText,
    公司招生名额: school.companyRecruitmentQuotaText,
    学校招生计划: school.schoolRecruitmentPlanText,
    学校申请更新频率: school.applicationUpdateFrequency,
    "语言生面试、笔试": school.languageStudentAssessmentText,
    "学历生面试、笔试": school.degreeStudentAssessmentText,
    招生偏向: school.recruitmentPreferenceText,
    合作备注: school.cooperationNote,
    特殊情况备注: school.specialCaseNote,
    合作收费: school.cooperationFeeText,
  };
  const locationText = [school.province, school.city].filter(Boolean).join(" · ");
  const basicCardSchool: BasicCardSchool = {
    id: school.id,
    nameZh: school.nameZh,
    name: school.name,
    category: school.category,
    province: school.province,
    city: school.city,
    website: school.website,
    qsRanking: school.qsRanking,
    rankingInfo: school.rankingInfo,
    partnershipRating: school.partnershipRating,
    cscaStatus: school.cscaStatus,
    tags: school.tags,
    description: school.description,
    cooperationPrograms: school.cooperationPrograms,
    reviewStatus: school.reviewStatus,
    infoNote: school.infoNote,
  };

  return (
    <EditModeProvider>
      <PageHeading
        title={school.nameZh}
        description={school.name && school.name !== school.nameZh ? school.name : "学校知识库完整档案"}
        action={
          <div className="page-heading-actions">
            {canEdit ? <EditModeToggle /> : null}
            <BackButton text="返回筛选结果" />
          </div>
        }
      />

      <EditModeBanner />

      <div className="detail-status-bar">
        {locationText ? (
          <div className="status-item">
            <span>地区</span>
            <strong>{locationText}</strong>
          </div>
        ) : null}
        {school.qsRanking ? (
          <div className="status-item">
            <span>QS 排名</span>
            <strong>{school.qsRanking}</strong>
          </div>
        ) : null}
        <div className="status-item">
          <span>知识库项目</span>
          <strong>{visiblePrograms.length} / {programs.length} 个</strong>
        </div>
      </div>

      {!marketManagerView ? (
        <section className="card card-compact school-updates-card">
        <div className="card-header school-knowledge-header">
          <div>
            <h3>最近更新</h3>
          </div>
          <Badge tone="blue">{updateItems.length} 条动态</Badge>
        </div>
        <div className="card-body">
          {updateItems.length ? (
            <div className="update-timeline">
              {updateItems.map((item) => {
                const view = serializeSchoolUpdate(
                  item.update,
                  item.attachments,
                  user.role,
                );
                return (
                  <SchoolUpdateItem
                    key={view.id}
                    view={view}
                    canManage={canManageUpdates}
                  />
                );
              })}
            </div>
          ) : (
            <p className="small muted">暂无更新记录</p>
          )}
          {canManageUpdates ? (
            <details className="update-form-toggle">
              <summary>＋ 新增更新记录</summary>
              <SchoolUpdateForm schoolId={school.id} />
            </details>
          ) : null}
        </div>
        </section>
      ) : null}

      <SchoolBasicCard
        school={basicCardSchool}
        canEditNote={canEdit}
        fields={schoolFields}
      />

      {canViewConfidential ? (
        <>
          <SchoolConfidentialCard
            schoolId={school.id}
            section="cooperation"
            data={cooperationKnowledge}
            canEdit={canEditConfidential}
          />
          <SchoolConfidentialCard
            schoolId={school.id}
            section="secret"
            data={cooperationKnowledge}
            canEdit={canEditConfidential}
          />
        </>
      ) : null}

      <section className="school-programs-section">
        {targetProgramId ? <ScrollToProgram programId={targetProgramId} /> : null}
        <div className="school-programs-heading">
          <div>
            <h2>{hasScreeningContext ? "筛选相关项目" : "院校项目"}</h2>
            <p>
              {hasScreeningContext
                ? `当前从筛选结果进入，仅显示 ${activeContextLabel || "当前筛选"} 相关项目：${visiblePrograms.length} / ${programs.length} 个。`
                : `共 ${programs.length} 个有效项目。默认折叠，点击项目标题展开查看完整字段。`}
            </p>
          </div>
          <div className="school-program-actions">
            {hasScreeningContext ? (
              <Link className="button" href={`/schools/${school.id}`}>查看该校全部项目</Link>
            ) : null}
            <BackButton text="返回筛选" className="button primary" />
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
            const programCard: ProgramCardData = {
              id: program.id,
              schoolId: program.schoolId,
              name: program.name,
              programType: program.programType,
              teachingLanguage: program.teachingLanguage,
              duration: program.duration,
              tuitionText: program.tuitionText,
              firstYearCostMax: program.firstYearCostMax,
              deadlineDate: program.deadlineDate
                ? program.deadlineDate.getTime()
                : null,
              applicationTimeText: program.applicationTimeText,
              majorText: program.majorText,
              requirementsText: program.requirementsText,
              introduction: program.introduction,
              scholarshipContent: program.scholarshipContent,
              reviewStatus: program.reviewStatus,
            };
            return (
              <SchoolProgramCard
                key={program.id}
                program={programCard}
                index={index}
                knowledge={programKnowledge}
                marketManagerView={marketManagerView}
                coreFields={programCoreFields}
                longFields={programLongFields}
                open={program.id === targetProgramId ? true : undefined}
              />
            );
          })
        ) : (
          <EmptyState>{hasScreeningContext ? "该学校没有符合当前筛选上下文的项目。" : "该学校暂无有效项目"}</EmptyState>
        )}
      </section>
    </EditModeProvider>
  );
}

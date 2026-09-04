import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { requireRole } from "@/lib/auth";
import { makeMessageT, makeT, makeTv } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import {
  canEditConfidentialSchoolFields,
  canViewConfidentialSchoolFields,
  SCHOOL_EDITOR_ROLES,
} from "@/lib/permissions";
import { getSchoolDetails } from "@/lib/queries";

export default async function SchoolEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireRole([...SCHOOL_EDITOR_ROLES]);
  const locale = await getUiLocale();
  const t = makeT(locale);
  const tv = makeTv(locale);
  const tm = makeMessageT(locale);
  const canViewConfidential = canViewConfidentialSchoolFields(user.role);
  const canEditConfidential = canEditConfidentialSchoolFields(user.role);
  const { id } = await params;
  const query = await searchParams;
  const errorMessage = query.error;
  const data = await getSchoolDetails(id);
  if (!data) notFound();
  const { school, programs: schoolPrograms } = data;

  return (
    <>
      <PageHeading
        title={tv("编辑：{name}", { name: school.nameZh })}
        description={t("修改学校基本信息和项目数据，一键保存全部修改。")}
      />

      {errorMessage ? (
        <div className="alert-error" style={{ marginBottom: 16, padding: "10px 14px", background: "#fff0f0", border: "1px solid #fcc", borderRadius: 8, color: "#c00", fontSize: 13 }}>
          {tm(errorMessage)}
        </div>
      ) : null}

      <form action="/api/schools/update" method="POST" className="card" style={{ marginBottom: 24 }}>
        <input type="hidden" name="id" value={school.id} />

        <section className="ordinary-note-editor" id="ordinary-note">
          <div>
            <h3>{t("备注")}</h3>
            <p className="small muted">{t("填写日常跟进、申请提醒和常见咨询口径。")}</p>
          </div>
          <textarea
            aria-describedby="ordinary-note-help"
            name="infoNote"
            defaultValue={school.infoNote ?? ""}
            placeholder={t("例如：每周同步申请进度；常见咨询口径；材料提交提醒。")}
            rows={4}
          />
          <p className="small muted" id="ordinary-note-help">{t("仅填写可供业务协作参考的内容；合作账号与特殊情况请在对应字段维护。保存后会显示在院校详情与\u201C特别备注院校\u201D清单。")}</p>
        </section>

        <div className="card-header">
          <h3>{t("学校基本信息")}</h3>
        </div>
        <div className="card-body">
          <div className="form-grid">
            <label>
              {t("学校中文名")}
              <input name="nameZh" defaultValue={school.nameZh} />
            </label>
            <label>
              {t("学校英文名")}
              <input name="name" defaultValue={school.name ?? ""} />
            </label>
            <label>
              {t("学校分类")}
              <input name="category" defaultValue={school.category ?? ""} />
            </label>
            <label>
              {t("省份")}
              <input name="province" defaultValue={school.province ?? ""} />
            </label>
            <label>
              {t("城市")}
              <input name="city" defaultValue={school.city ?? ""} />
            </label>
            <label>
              {t("官网")}
              <input name="website" defaultValue={school.website ?? ""} placeholder="https://" />
            </label>
            <label>
              {t("QS 排名")}
              <input name="qsRanking" type="number" defaultValue={school.qsRanking ?? ""} />
            </label>
            <label>
              {t("排名信息")}
              <input name="rankingInfo" defaultValue={school.rankingInfo ?? ""} placeholder={t("可填写其他排名")} />
            </label>
            <label>
              {t("合作星级")}
              <input name="partnershipRating" type="number" min="0" max="5" defaultValue={school.partnershipRating} />
            </label>
            <label>
              {t("CSCA 状态")}
              <select name="cscaStatus" defaultValue={school.cscaStatus}>
                <option value="UNKNOWN">{t("未知")}</option>
                <option value="REQUIRED">{t("要求")}</option>
                <option value="NOT_REQUIRED">{t("不要求")}</option>
              </select>
            </label>
            <label>
              {t("标签")}
              <input name="tags" defaultValue={school.tags ?? ""} />
            </label>
          </div>
          <label style={{ marginTop: 14 }}>
            {t("学校简介")}
            <textarea name="description" defaultValue={school.description ?? ""} rows={3} />
          </label>
          <label style={{ marginTop: 10 }}>
            {t("合作项目")}
            <textarea name="cooperationPrograms" defaultValue={school.cooperationPrograms ?? ""} rows={2} placeholder={t("列出已合作的项目")} />
          </label>

        </div>

        {canViewConfidential ? (
          <fieldset
            className="confidential-school-fields"
            disabled={!canEditConfidential}
          >
            <legend>
              {t("机密院校信息")}
              {!canEditConfidential ? <span className="small muted">{t("仅可查看")}</span> : null}
            </legend>
            <details className="card-header" style={{ cursor: "pointer" }} open>
              <summary style={{ listStyle: "none", fontWeight: 600, fontSize: 15 }}>
                <h3 style={{ display: "inline" }}>{t("合作与招生信息")}</h3>
                <span className="small muted" style={{ marginLeft: 8 }}>{t("内部资料，仅高级管理员可编辑")}</span>
              </summary>
            </details>
            <div className="card-body">
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8, fontWeight: 600 }}>{t("申请通道")}</h4>
                <div className="form-grid">
                  <label>
                    {t("团体申请账号")}
                    <input name="groupApplicationAccount" defaultValue={school.groupApplicationAccount ?? ""} />
                  </label>
                  <label>
                    {t("是否可代收")}
                    <input name="collectionServiceText" defaultValue={school.collectionServiceText ?? ""} />
                  </label>
                  <label>
                    {t("奖学金发放形式")}
                    <input name="scholarshipDisbursementText" defaultValue={school.scholarshipDisbursementText ?? ""} />
                  </label>
                  <label>
                    {t("合作截止日期")}
                    <input name="cooperationDeadlineText" defaultValue={school.cooperationDeadlineText ?? ""} />
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8, fontWeight: 600 }}>{t("招生计划")}</h4>
                <div className="form-grid">
                  <label>
                    {t("公司招生名额")}
                    <input name="companyRecruitmentQuotaText" defaultValue={school.companyRecruitmentQuotaText ?? ""} />
                  </label>
                  <label>
                    {t("学校招生计划")}
                    <input name="schoolRecruitmentPlanText" defaultValue={school.schoolRecruitmentPlanText ?? ""} />
                  </label>
                  <label>
                    {t("申请更新频率")}
                    <input name="applicationUpdateFrequency" defaultValue={school.applicationUpdateFrequency ?? ""} />
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8, fontWeight: 600 }}>{t("考核安排")}</h4>
                <div className="form-grid">
                  <label>
                    {t("语言生考核")}
                    <input name="languageStudentAssessmentText" defaultValue={school.languageStudentAssessmentText ?? ""} placeholder={t("语言生面试、笔试安排")} />
                  </label>
                  <label>
                    {t("学历生考核")}
                    <input name="degreeStudentAssessmentText" defaultValue={school.degreeStudentAssessmentText ?? ""} placeholder={t("学历生面试、笔试安排")} />
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8, fontWeight: 600 }}>{t("合作收费")}</h4>
                <label style={{ marginBottom: 10 }}>
                  {t("合作收费")}
                  <textarea name="cooperationFeeText" defaultValue={school.cooperationFeeText ?? ""} rows={2} placeholder={t("合作分成、收费口径等，仅高级管理员可见")} />
                </label>
                <h4 style={{ marginBottom: 8, fontWeight: 600 }}>{t("合作说明")}</h4>
                <label style={{ marginBottom: 10 }}>
                  {t("招生偏向")}
                  <textarea name="recruitmentPreferenceText" defaultValue={school.recruitmentPreferenceText ?? ""} rows={2} />
                </label>
                <label style={{ marginBottom: 10 }}>
                  {t("合作备注")}
                  <textarea name="cooperationNote" defaultValue={school.cooperationNote ?? ""} rows={2} />
                </label>
                <label>
                  {t("特殊情况备注")}
                  <textarea name="specialCaseNote" defaultValue={school.specialCaseNote ?? ""} rows={2} />
                </label>
              </div>
            </div>
                    </fieldset>
        ) : null}

        <div className="card-header" style={{ borderTop: "1px solid var(--border-soft)" }}>
          <h3>{tv("项目信息（{n} 个）", { n: schoolPrograms.length })}</h3>
        </div>
        <div className="card-body">
          {schoolPrograms.length === 0 ? (
            <p className="small muted">{t("该校暂无项目数据。")}</p>
          ) : (
            schoolPrograms.map((program, index) => (
              <div
                key={program.id}
                style={{
                  borderTop: index > 0 ? "1px solid var(--border-soft)" : "none",
                  paddingTop: index > 0 ? 16 : 0,
                  marginBottom: 16,
                }}
              >
                <input type="hidden" name={`program_${index}_id`} value={program.id} />
                <h4 style={{ marginBottom: 12, fontWeight: 600 }}>
                  {program.name}
                </h4>
                <div className="form-grid">
                  <label>
                    {t("项目名称")}
                    <input name={`program_${index}_name`} defaultValue={program.name} />
                  </label>
                  <label>
                    {t("申请学历")}
                    <select name={`program_${index}_programType`} defaultValue={program.programType}>
                      {Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => (
                        <option value={value} key={value}>{t(label)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("授课语言")}
                    <select name={`program_${index}_teachingLanguage`} defaultValue={program.teachingLanguage}>
                      {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                        <option value={value} key={value}>{t(label)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("学制")}
                    <input name={`program_${index}_duration`} defaultValue={program.duration ?? ""} />
                  </label>
                  <label>
                    {t("学费说明")}
                    <input name={`program_${index}_tuitionText`} defaultValue={program.tuitionText ?? ""} />
                  </label>
                  <label>
                    {t("首年费用上限（元）")}
                    <input name={`program_${index}_firstYearCostMax`} type="number" defaultValue={program.firstYearCostMax ?? ""} />
                  </label>
                  <label>
                    {t("截止日期")}
                    <input
                      name={`program_${index}_deadlineDate`}
                      type="date"
                      defaultValue={
                        program.deadlineDate && !isNaN(new Date(program.deadlineDate).getTime())
                          ? new Date(program.deadlineDate).toISOString().slice(0, 10)
                          : ""
                      }
                    />
                  </label>
                  <label>
                    {t("申请时间说明")}
                    <input name={`program_${index}_applicationTimeText`} defaultValue={program.applicationTimeText ?? ""} />
                  </label>
                </div>
                <label style={{ marginTop: 10 }}>
                  {t("专业列表")}
                  <textarea name={`program_${index}_majorText`} defaultValue={program.majorText ?? ""} rows={3} />
                </label>
                <label style={{ marginTop: 10 }}>
                  {t("申请要求及材料")}
                  <textarea name={`program_${index}_requirementsText`} defaultValue={program.requirementsText ?? ""} rows={3} />
                </label>
                <label style={{ marginTop: 10 }}>
                  {t("项目介绍")}
                  <textarea name={`program_${index}_introduction`} defaultValue={program.introduction ?? ""} rows={2} />
                </label>
                <label style={{ marginTop: 10 }}>
                  {t("奖学金内容")}
                  <textarea name={`program_${index}_scholarshipContent`} defaultValue={program.scholarshipContent ?? ""} rows={2} />
                </label>
              </div>
            ))
          )}
        </div>

        <div className="card-header form-actions" style={{ justifyContent: "flex-end", gap: 10, borderTop: "1px solid var(--border-soft)" }}>
          <Link className="button" href={`/schools/${school.id}`}>{t("取消")}</Link>
          <button className="button primary" type="submit" style={{ fontWeight: 700, padding: "10px 28px" }}>{t("一键保存全部修改")}</button>
        </div>
      </form>
    </>
  );
}

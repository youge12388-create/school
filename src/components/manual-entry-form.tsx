"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { useT } from "@/lib/i18n/locale-context";

type ManualResult = {
  schoolId: string;
  programId: string;
  createdSchool: boolean;
  reviewStatus: "VERIFIED" | "NEEDS_REVIEW";
};

function TextInput({
  label,
  name,
  required = false,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: "text" | "url" | "number";
  placeholder?: string;
}) {
  const t = useT();
  return (
    <label>
      {t(label)}
      <input
        name={name}
        placeholder={placeholder ? t(placeholder) : undefined}
        required={required}
        type={type}
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder?: string;
}) {
  const t = useT();
  return (
    <label>
      {t(label)}
      <textarea name={name} placeholder={placeholder ? t(placeholder) : undefined} />
    </label>
  );
}

export function ManualEntryForm({
  canEditConfidential = false,
}: {
  canEditConfidential?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ManualResult | null>(null);
  const t = useT();

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/api/imports/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("手动录入失败"));
      setResult(body as ManualResult);
      setMessage(t("录入成功，已可在学校库和学校筛查中搜索。"));
      formRef.current?.reset();
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t("手动录入失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={submit} className="card manual-entry-form" ref={formRef}>
      <div className="card-header">
        <h3>{t("手动录入学校与项目")}</h3>
      </div>
      <div className="card-body">
        <p className="small muted">
          {t("仅学校中文名必填，其余内容可以不填。同名学校会自动关联，不改动已有学校资料。")}
        </p>

        <section className="manual-entry-section">
          <div className="manual-entry-section-title">
            <span>01</span>
            <div><h4>{t("学校信息")}</h4><p>{t("学校中文名是关联已有学校的唯一依据。")}</p></div>
          </div>
          <div className="grid cols-2">
            <TextInput label="学校中文名" name="schoolNameZh" required placeholder="例如：深圳大学" />
            <TextInput label="学校英文名" name="schoolName" />
            <TextInput label="省份" name="province" />
            <TextInput label="城市" name="city" />
            <TextInput label="学校分类" name="schoolCategory" />
            <TextInput label="官网" name="website" type="url" />
            <TextInput label="QS 排名" name="qsRanking" type="number" />
            <TextInput label="合作星级" name="partnershipRating" type="number" />
          </div>
        </section>

        <section className="manual-entry-section">
          <div className="manual-entry-section-title">
            <span>02</span>
            <div><h4>{t("项目搜索字段")}</h4><p>{t("暂时不清楚的字段可以留空，系统会标记为待复核。")}</p></div>
          </div>
          <div className="grid cols-2">
            <label>
              {t("项目类型")}
              <select defaultValue="UNKNOWN" name="programType">
                <option value="UNKNOWN">{t("暂不填写")}</option>
                <option value="UG">{t("本科")}</option>
                <option value="MASTER">{t("硕士")}</option>
                <option value="PHD">{t("博士")}</option>
                <option value="LONG_TERM">{t("长期进修")}</option>
                <option value="SHORT_TERM">{t("短期项目")}</option>
              </select>
            </label>
            <label>
              {t("授课语言")}
              <select defaultValue="UNKNOWN" name="teachingLanguage">
                <option value="UNKNOWN">{t("暂不填写")}</option>
                <option value="CHINESE">{t("中文")}</option>
                <option value="ENGLISH">{t("英文")}</option>
                <option value="FRENCH">{t("法文")}</option>
              </select>
            </label>
          </div>
          <div className="manual-entry-stack">
            <TextArea label="专业列表" name="majorText" placeholder="多个专业可换行或用顿号、分号分隔" />
            <TextInput label="学费" name="tuitionText" placeholder="例如：30000 元/年" />
            <TextArea label="申请要求及材料" name="requirementsText" placeholder="可填写 HSK、雅思、托福、GPA、年龄、CSCA 等要求" />
            <TextArea label="申请时间说明" name="applicationTimeText" placeholder="例如：2027 年 5 月 31 日截止" />
          </div>
        </section>

        <details className="manual-entry-details">
          <summary>{t("填写更多学校与项目字段")}</summary>
          <div className="manual-entry-section optional">
            <div className="grid cols-2">
              <label>
                {t("学校 CSCA 状态")}
                <select defaultValue="UNKNOWN" name="schoolCscaStatus">
                  <option value="UNKNOWN">{t("数据库未有相关信息")}</option>
                  <option value="REQUIRED">{t("需要")}</option>
                  <option value="NOT_REQUIRED">{t("不需要")}</option>
                </select>
              </label>
              <TextInput label="学校标签" name="schoolTags" />
              <TextInput label="项目标签" name="programTags" />
              <TextInput label="学制" name="duration" />
            </div>
            <div className="manual-entry-stack">
              <TextArea label="学校简介" name="schoolDescription" />
              <TextArea label="合作项目" name="cooperationPrograms" />
              <TextArea label="项目介绍" name="introduction" />
              <TextArea label="专业方向" name="directionText" />
              <TextArea label="学制备注" name="durationNote" />
              <TextArea label="学期安排" name="semesterText" />
              <TextInput label="奖学金类别" name="scholarshipCategory" />
              <TextArea label="奖学金内容" name="scholarshipContent" />
              <TextArea label="奖学金备注" name="scholarshipNote" />
              <TextInput label="奖学金截止日期" name="scholarshipDeadlineText" />
              <TextInput label="住宿费" name="accommodationText" />
              <TextInput label="保险费" name="insuranceText" />
              <TextInput label="自费生申请费" name="applicationFeeText" />
              <TextInput label="奖学金申请费" name="scholarshipApplicationFeeText" />
              <TextArea label="费用备注" name="feeNote" />
            </div>
          </div>

          {canEditConfidential ? (
            <div className="manual-entry-section optional">
              <div className="manual-entry-section-title">
                <span>03</span>
                <div><h4>{t("学校合作与招生信息")}</h4><p>{t("内部资料，仅高级管理员可录入。")}</p></div>
              </div>
              <div className="grid cols-2">
                <TextInput label="团体申请账号" name="groupApplicationAccount" />
                <TextInput label="奖学金发放形式" name="scholarshipDisbursementText" />
                <TextInput label="是否可代收" name="collectionServiceText" />
                <TextInput label="合作截止日期" name="cooperationDeadlineText" />
                <TextInput label="公司招生名额" name="companyRecruitmentQuotaText" />
                <TextInput label="学校招生计划" name="schoolRecruitmentPlanText" />
                <TextInput label="语言生考核" name="languageStudentAssessmentText" />
                <TextInput label="学历生考核" name="degreeStudentAssessmentText" />
                <TextInput label="申请更新频率" name="applicationUpdateFrequency" />
              </div>
              <div className="manual-entry-stack">
                <TextArea label="招生偏向" name="recruitmentPreferenceText" />
                <TextArea label="合作备注" name="cooperationNote" />
                <TextArea label="特殊情况备注" name="specialCaseNote" />
              </div>
            </div>
          ) : null}
        </details>

        <div className="form-actions">
          <button className="primary" disabled={loading} type="submit">
            {loading ? t("保存中…") : t("保存并加入搜索")}
          </button>
          <button disabled={loading} onClick={() => formRef.current?.reset()} type="button">
            {t("清空")}
          </button>
        </div>
        {message ? (
          <div aria-live="polite" className="alert manual-entry-message">
            {message}
            {result ? (
              <>
                {result.reviewStatus === "NEEDS_REVIEW" ? ` ${t("当前信息不完整，已标记待复核。")}` : ""}
                {" "}<Link href={`/schools/${result.schoolId}`}>{t("查看学校详情")}</Link>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}

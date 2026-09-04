import { PageHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  LANGUAGE_LABELS,
  PROGRAM_TYPE_LABELS,
} from "@/lib/constants";
import { makeMessageT, makeT } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import { listCustomerOwners } from "@/lib/queries";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, user] = await Promise.all([searchParams, requireUser()]);
  const locale = await getUiLocale();
  const t = makeT(locale);
  const tm = makeMessageT(locale);
  const owners = listCustomerOwners();

  return (
    <>
      <PageHeading
        title={t("新增客户")}
        description={t("先录入筛选所需的基础信息；未取得的成绩可以留空。")}
      />
      <form className="card" action="/api/customers" method="post">
        <div className="card-header"><h3>{t("客户档案")}</h3></div>
        <div className="card-body">
          {error ? <div className="alert error" style={{ marginBottom: 14 }}>{tm(error)}</div> : null}
          <div className="form-grid">
            <label>{t("姓名")}<input name="name" required /></label>
            <label>{t("国籍")}<input name="nationality" /></label>
            <label>{t("出生日期")}<input name="dateOfBirth" type="date" /></label>
            <label>{t("电话")}<input name="phone" /></label>
            <label>{t("邮箱")}<input name="email" type="email" /></label>
            <label>{t("微信")}<input name="wechat" /></label>
            <label>
              {t("负责老师")}
              <select name="ownerId" defaultValue={user.id} required>
                {owners.map((owner) => (
                  <option value={owner.id} key={owner.id}>{owner.displayName}</option>
                ))}
              </select>
            </label>
            <label>
              {t("签约状态")}
              <select name="contractStatus" defaultValue="UNKNOWN">
                {CONTRACT_STATUSES.map((status) => (
                  <option value={status} key={status}>{t(CONTRACT_STATUS_LABELS[status])}</option>
                ))}
              </select>
            </label>
            <label>{t("计划跟进日期")}<input name="nextFollowUpAt" type="date" /></label>
            <label>{t("当前学历")}<input name="currentEducation" placeholder={t("高中、本科等")} /></label>
            <label>{t("毕业/在读学校")}<input name="schoolBackground" /></label>
            <label>{t("目标学历")}<select name="targetDegree"><option value="">{t("未确定")}</option>{Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}</select></label>
            <label>{t("目标专业")}<input name="targetMajor" /></label>
            <label>{t("授课语言")}<select name="teachingLanguage"><option value="">{t("不限")}</option>{Object.entries(LANGUAGE_LABELS).map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}</select></label>
            <label>{t("入学年份")}<input name="intakeYear" type="number" min="2026" max="2035" /></label>
            <label>{t("GPA / 平均分")}<input name="gpa" type="number" step="0.01" /></label>
            <label>{t("GPA 满分制")}<input name="gpaScale" type="number" step="0.01" placeholder={t("4、5 或 100")} /></label>
            <label>CSCA<select name="hasCsca"><option value="">{t("未确认")}</option><option value="yes">{t("已有")}</option><option value="no">{t("目前没有")}</option></select></label>
            <label>{t("HSK 级别")}<input name="hskLevel" type="number" min="1" max="6" /></label>
            <label>{t("HSK 分数")}<input name="hskScore" type="number" /></label>
            <label>{t("雅思")}<input name="ielts" type="number" step="0.5" /></label>
            <label>{t("托福")}<input name="toefl" type="number" /></label>
            <label>{t("多邻国")}<input name="duolingo" type="number" /></label>
            <label>{t("首年总预算（元）")}<input name="firstYearBudget" type="number" /></label>
            <label>{t("意向省份")}<input name="preferredProvince" /></label>
            <label>{t("意向城市")}<input name="preferredCity" /></label>
            <label className="checkbox"><input name="scholarshipRequired" type="checkbox" />{t("需要奖学金")}</label>
            <label className="checkbox"><input name="accommodationRequired" type="checkbox" />{t("需要住宿")}</label>
            <label className="wide">{t("备注")}<textarea name="notes" /></label>
          </div>
          <div className="form-actions"><button className="primary" type="submit">{t("保存客户")}</button></div>
        </div>
      </form>
    </>
  );
}

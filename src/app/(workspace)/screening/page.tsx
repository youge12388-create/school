import { saveRecommendationAction } from "@/app/actions";
import { ClearScreeningFilters } from "@/components/clear-screening-filters";
import { MajorPicker, type MajorCatalog } from "@/components/major-picker";
import { ScreeningResultCard } from "@/components/screening-result-card";
import { EmptyState, PageHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { makeT, makeTv } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import {
  parseSchoolTier,
  rankPrograms,
  type FitLevel,
  type RankedProgram,
  type ScreeningCriteria,
} from "@/lib/matcher";
import { isMarketManager } from "@/lib/permissions";
import { getMajorCatalog, getProgramsForScreening, listCustomerOptions } from "@/lib/queries";
import { partitionScreeningResults } from "@/lib/screening-results";
import { asNumber } from "@/lib/utils";

function parseDateParam(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}


const supervisorAcceptanceModes = ["required", "unknown"] as const;

function parseSupervisorAcceptance(value?: string): ScreeningCriteria["supervisorAcceptance"] {
  return supervisorAcceptanceModes.includes(value as (typeof supervisorAcceptanceModes)[number])
    ? (value as ScreeningCriteria["supervisorAcceptance"])
    : null;
}



function toCriteria(params: Record<string, string | undefined>): ScreeningCriteria {
  return {
    programType: params.type,
    teachingLanguage: params.language,
    targetMajor: params.major,
    schoolTier: parseSchoolTier(params.schoolTier),
    schoolQuery: params.q,
    budget: asNumber(params.budget),
    cscaStatus:
      params.csca === "REQUIRED"
        ? "REQUIRED"
        : params.csca === "NOT_REQUIRED"
          ? "NOT_REQUIRED"
          : params.csca === "UNKNOWN"
            ? "UNKNOWN"
            : null,
    gpa: asNumber(params.gpa),
    gpaScale: asNumber(params.gpaScale),
    hskLevel: asNumber(params.hskLevel),
    hskScore: asNumber(params.hskScore),
    ielts: asNumber(params.ielts),
    toefl: asNumber(params.toefl),
    duolingo: asNumber(params.duolingo),
    age: asNumber(params.age),
    hasPaperPatent: params.paperPatent || null,
    hasCompetition: params.competition || null,
    nationality: params.nationality,
    province: params.province,
    city: params.city,
    scholarshipType: params.scholarshipType || "",
    accommodationRequired: params.accommodation === "yes",
    supervisorAcceptance: parseSupervisorAcceptance(params.supervisorAcceptance),
    enrollmentRegion: params.enrollmentRegion,
    deadlineFrom: parseDateParam(params.deadlineFrom),
    deadlineTo: parseDateParam(params.deadlineTo),
    deadlineMode:
      (params.deadlineMode as ScreeningCriteria["deadlineMode"]) || "all",
  };
}

const searchKeys = [
  "type",
  "language",
  "major",
  "q",
  "budget",
  "csca",
  "age",
  "gpa",
  "gpaScale",
  "hskLevel",
  "hskScore",
  "ielts",
  "toefl",
  "duolingo",
  "paperPatent",
  "competition",
  "nationality",
  "province",
  "city",
  "scholarshipType",
  "accommodation",
  "supervisorAcceptance",
  "enrollmentRegion",
  "deadlineFrom",
  "deadlineTo",
] as const;

function hasSearchCriteria(params: Record<string, string | undefined>) {
  return (
    searchKeys.some((key) => Boolean(params[key])) ||
    Boolean(parseSchoolTier(params.schoolTier)) ||
    Boolean(params.deadlineMode && params.deadlineMode !== "all")
  );
}


function hasAnyParam(
  params: Record<string, string | undefined>,
  keys: readonly string[],
) {
  return keys.some((key) => Boolean(params[key]));
}

const academicFilterKeys = [
  "gpa",
  "gpaScale",
  "hskLevel",
  "hskScore",
  "ielts",
  "toefl",
  "duolingo",
] as const;

const softFilterKeys = [
  "paperPatent",
  "competition",
] as const;

const preferenceFilterKeys = [
  "budget",
  "province",
  "city",
  "accommodation",
  "enrollmentRegion",
] as const;
const fitSection: Record<
  Exclude<FitLevel, "NOT_MATCHED">,
  { title: string; description: string }
> = {
  MATCHED: {
    title: "可直接申请",
    description: "当前结构化条件均符合。提交前仍建议核对学校最新通知。",
  },
  NEEDS_ACTION: {
    title: "需要补充条件",
    description: "项目方向可考虑，但客户还需要补成绩、CSCA 或其他材料。",
  },
  UNKNOWN: {
    title: "信息待核实",
    description: "数据库缺少关键条件，不能擅自判断为符合。",
  },
};

function ResultSection({
  fitLevel,
  results,
  ranks,
  detailParams,
  marketManagerView,
  t,
  tv,
}: {
  fitLevel: Exclude<FitLevel, "NOT_MATCHED">;
  results: RankedProgram[];
  ranks: Map<string, number>;
  detailParams: Record<string, string | undefined>;
  marketManagerView: boolean;
  t: (s: string) => string;
  tv: (s: string, vars: Record<string, string | number>) => string;
}) {
  if (!results.length) return null;
  const section = fitSection[fitLevel];
  return (
    <section className="screening-result-section">
      <div className="screening-section-heading">
        <div>
          <h3>{t(section.title)}</h3>
          <p>{t(section.description)}</p>
        </div>
        <span>{tv("{n} 个项目", { n: results.length })}</span>
      </div>
      {results.map((result) => (
        <ScreeningResultCard
          result={result}
          rank={ranks.get(result.program.id) ?? 0}
          detailParams={detailParams}
          marketManagerView={marketManagerView}
          key={result.program.id}
        />
      ))}
    </section>
  );
}

export default async function ScreeningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const locale = await getUiLocale();
  const t = makeT(locale);
  const tv = makeTv(locale);
  const marketManagerView = isMarketManager(user.role);
  const criteria = toCriteria(params);
  const hasSearch = hasSearchCriteria(params);
  const showAcademicFilters = hasAnyParam(params, academicFilterKeys);
  const showSoftFilters = hasAnyParam(params, softFilterKeys);
  const showPreferenceFilters = hasAnyParam(params, preferenceFilterKeys);
  const [programs, customers, majorCatalog] = await Promise.all([
    hasSearch ? getProgramsForScreening() : Promise.resolve([]),
    listCustomerOptions(),
    getMajorCatalog(),
  ]);
  const results = hasSearch ? rankPrograms(programs, criteria) : [];
  const ranks = new Map(results.map((result, index) => [result.program.id, index + 1]));
  const {
    currentByFit: grouped,
    expired: expiredResults,
    notMatched: notMatchedResults,
  } = partitionScreeningResults(results);
  const detailParams = {
    type: params.type,
    language: params.language,
    major: params.major,
  };
  const countText = (n: number) => tv("{n} 个项目", { n });

  return (
    <>
      <PageHeading
        title={t("学校项目筛查")}
        description={t("明确符合、需要补充、信息未知和不符合会分开显示；点击学校名称可查看完整学校与项目资料。")}
      />
      <form className="card screening-filter-card" method="get">
        <div className="card-header">
          <div>
            <h3>{t("客户筛选条件")}</h3>
            <p className="small muted">{t("空缺信息不参与判断，可按需展开更多条件。")}</p>
          </div>
          <div className="header-search">
            <input
              name="q"
              defaultValue={params.q}
              placeholder={t("搜索学校名称...")}
              aria-label={t("搜索学校")}
            />
          </div>
        </div>
        <div className="card-body screening-filter-body">
          <section className="screening-filter-section screening-filter-primary">
            <h4>{t("申请目标")}</h4>
            <div className="screening-primary-fields">
              <div className="form-grid screening-primary-main">
                <label>
                  {t("申请学历")}
                  <select name="type" defaultValue={params.type}>
                    <option value="">{t("不限")}</option>
                    {Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => (
                      <option value={value} key={value}>{t(label)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("授课语言")}
                  <select name="language" defaultValue={params.language}>
                    <option value="">{t("不限")}</option>
                    {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                      <option value={value} key={value}>{t(label)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("目标专业")}
                  <MajorPicker
                    name="major"
                    defaultValue={params.major ?? ""}
                    catalog={majorCatalog as MajorCatalog}
                    placeholder={t("输入或选择专业...")}
                  />
                </label>
                <label>
                  CSCA
                  <select name="csca" defaultValue={params.csca}>
                    <option value="">{t("不限")}</option>
                    <option value="REQUIRED">{t("院校需要")}</option>
                    <option value="NOT_REQUIRED">{t("院校不需要")}</option>
                    <option value="UNKNOWN">{t("信息未标明")}</option>
                  </select>
                </label>
                <label>
                  {t("年龄")}
                  <input name="age" type="number" min="1" max="100" defaultValue={params.age} placeholder={t("周岁")} />
                </label>
                <label>
                  {t("奖学金需求")}
                  <select name="scholarshipType" defaultValue={params.scholarshipType}>
                    <option value="">{t("不限")}</option>
                    <option value="full">{t("全额奖学金")}</option>
                    <option value="any">{t("有其他奖学金")}</option>
                    <option value="none">{t("无奖学金（自费）")}</option>
                  </select>
                </label>
              </div>
              <div className="form-grid screening-primary-secondary">
                <label>
                  {t("院校层次")}
                  <select name="schoolTier" defaultValue={criteria.schoolTier || ""}>
                    <option value="">{t("不限")}</option>
                    <option value="985">985</option>
                    <option value="211">211</option>
                    <option value="double_first_class_only">{t("仅双一流")}</option>
                    <option value="double_non">{t("双非普通院校")}</option>
                  </select>
                </label>
                <label>{t("国籍")}<input name="nationality" defaultValue={params.nationality} placeholder={t("例如：泰国")} /></label>
                <label>
                  {t("导师接收函要求")}
                  <select name="supervisorAcceptance" defaultValue={params.supervisorAcceptance}>
                    <option value="">{t("不限")}</option>
                    <option value="required">{t("明确或部分要求")}</option>
                    <option value="unknown">{t("未标明")}</option>
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="screening-filter-section screening-filter-deadline">
            <h4>{t("申请时间")}</h4>
            <div className="form-grid">
              <label>
                {t("申请截止状态")}
                <select name="deadlineMode" defaultValue={params.deadlineMode || "all"}>
                  <option value="all">{t("全部状态")}</option>
                  <option value="open">{t("只看开放中")}</option>
                  <option value="unknown">{t("只看日期未知")}</option>
                  <option value="expired">{t("只看已截止")}</option>
                </select>
              </label>
              <label>{t("截止日期从")}<input name="deadlineFrom" type="date" defaultValue={params.deadlineFrom} /></label>
              <label>{t("截止日期到")}<input name="deadlineTo" type="date" defaultValue={params.deadlineTo} /></label>
            </div>
          </section>

          <details className="screening-filter-section screening-filter-advanced screening-filter-academic" open={showAcademicFilters}>
            <summary>
              <span>
                <strong>{t("学术与语言条件")}</strong>
                <small>{t("GPA、HSK、雅思、托福、多邻国分数")}</small>
              </span>
              <span className="screening-advanced-toggle">{t("展开")}</span>
            </summary>
            <div className="form-grid screening-advanced-body">
              <label>{t("GPA / 均分")}<input name="gpa" type="number" step="0.01" defaultValue={params.gpa} /></label>
              <label>{t("GPA 满分制")}<input name="gpaScale" type="number" step="0.01" placeholder={t("4、5 或 100")} defaultValue={params.gpaScale} /></label>
              <label>{t("HSK 级别")}<input name="hskLevel" type="number" min="1" max="6" defaultValue={params.hskLevel} /></label>
              <label>{t("HSK 分数")}<input name="hskScore" type="number" defaultValue={params.hskScore} /></label>
              <label>{t("雅思")}<input name="ielts" type="number" step="0.5" defaultValue={params.ielts} /></label>
              <label>{t("托福")}<input name="toefl" type="number" defaultValue={params.toefl} /></label>
              <label>{t("多邻国分数")}<input name="duolingo" type="number" defaultValue={params.duolingo} /></label>
            </div>
          </details>

          <details className="screening-filter-section screening-filter-advanced screening-filter-soft" open={showSoftFilters}>
            <summary>
              <span>
                <strong>{t("软性竞争力")}</strong>
                <small>{t("论文/专利成果、竞赛/突出表现")}</small>
              </span>
              <span className="screening-advanced-toggle">{t("展开")}</span>
            </summary>
            <div className="form-grid screening-advanced-body">
              <label>
                {t("论文/专利成果")}
                <select name="paperPatent" defaultValue={params.paperPatent}>
                  <option value="">{t("不限")}</option>
                  <option value="general">{t("有论文或专利")}</option>
                  <option value="sci_ei">{t("有SCI/EI级别论文")}</option>
                </select>
              </label>
              
              
              <label>
                {t("竞赛/其他突出表现")}
                <select name="competition" defaultValue={params.competition}>
                  <option value="">{t("不限")}</option>
                  <option value="competition">{t("有竞赛或突出表现")}</option>
                </select>
              </label>
              
            </div>
          </details>

          <details className="screening-filter-section screening-filter-advanced screening-filter-preferences" open={showPreferenceFilters}>
            <summary>
              <span>
                <strong>{t("预算与偏好")}</strong>
                <small>{t("预算、省市、住宿")}</small>
              </span>
              <span className="screening-advanced-toggle">{t("展开")}</span>
            </summary>
            <div className="form-grid screening-advanced-body">
              <label>{t("首年总预算（元）")}<input name="budget" type="number" min="0" defaultValue={params.budget} /></label>
              <label>{t("意向省份")}<input name="province" defaultValue={params.province} placeholder={t("例如：广东")} /></label>
              <label>{t("意向城市")}<input name="city" defaultValue={params.city} placeholder={t("例如：深圳")} /></label>
              <label>
                {t("住宿需求")}
                <select name="accommodation" defaultValue={params.accommodation}>
                  <option value="">{t("不限")}</option>
                  <option value="yes">{t("需要住宿信息")}</option>
                </select>
              </label>
              <label>
                {t("生源地（招生）偏好")}
                <select name="enrollmentRegion" defaultValue={params.enrollmentRegion || ""}>
                  <option value="">{t("不限")}</option>
                  <option value="no_preference">{t("没有生源地偏好")}</option>
                </select>
              </label>
            </div>
          </details>
          <div className="form-actions screening-filter-actions">
            <button className="primary" type="submit">{t("开始筛查")}</button>
            <ClearScreeningFilters />
          </div>
        </div>
      </form>

      <div className="screening-results">
        {!hasSearch ? (
          <EmptyState>{t("填写至少一个筛选条件后查看项目匹配结果")}</EmptyState>
        ) : (
          <form action={saveRecommendationAction}>
            <div className="toolbar screening-save-toolbar">
              <label>
                {t("保存到客户")}
                <select name="customerId" required>
                  <option value="">{t("请选择客户")}</option>
                  {customers.map((customer) => (
                    <option value={customer.id} key={customer.id}>
                      {customer.name} · {customer.customerNo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("方案名称")}
                <input name="title" defaultValue={tv("{y} 项目筛选方案", { y: new Date().getFullYear() })} required />
              </label>
              <label className="search">{t("方案备注")}<input name="notes" /></label>
              <input type="hidden" name="criteriaJson" value={JSON.stringify(criteria)} />
              <button className="primary" type="submit">{t("保存并生成对比页")}</button>
            </div>

            <div className="screening-summary screening-summary-prominent">
              <strong>{tv("📊 共找到 {n} 个项目", { n: results.length })}</strong>
              <span className="summary-matched">{tv("✅ 可直接申请 {n}", { n: grouped.MATCHED.length })}</span>
              <span className="summary-need">{tv("⚠️ 需要补充 {n}", { n: grouped.NEEDS_ACTION.length })}</span>
              <span className="summary-unknown">{tv("❓ 信息待核实 {n}", { n: grouped.UNKNOWN.length })}</span>
              <span>{tv("⛔ 明确不符合 {n}", { n: notMatchedResults.length })}</span>
              <span>{tv("⏰ 已截止 {n}", { n: expiredResults.length })}</span>
            </div>

            <ResultSection fitLevel="MATCHED" results={grouped.MATCHED} ranks={ranks} detailParams={detailParams} marketManagerView={marketManagerView} t={t} tv={tv} />
            <ResultSection fitLevel="NEEDS_ACTION" results={grouped.NEEDS_ACTION} ranks={ranks} detailParams={detailParams} marketManagerView={marketManagerView} t={t} tv={tv} />
            <ResultSection fitLevel="UNKNOWN" results={grouped.UNKNOWN} ranks={ranks} detailParams={detailParams} marketManagerView={marketManagerView} t={t} tv={tv} />

                        {expiredResults.length ? (
              <details className="card screening-collapsible-group">
                <summary>
                  <span><strong>{t("已截止项目")}</strong><small>{t("已过期，点击展开查看")}</small></span>
                  <span>{countText(expiredResults.length)}</span>
                </summary>
                <div className="screening-collapsible-body">
                  {expiredResults.map((result) => (
                    <ScreeningResultCard
                      result={result}
                      rank={ranks.get(result.program.id) ?? 0}
                      detailParams={detailParams}
                      marketManagerView={marketManagerView}
                      key={result.program.id}
                    />
                  ))}
                </div>
              </details>
            ) : null}

            {notMatchedResults.length ? (
              <details className="card screening-collapsible-group">
                <summary>
                  <span><strong>{t("明确不符合")}</strong><small>{t("默认收起，需要核对原因时再展开")}</small></span>
                  <span>{countText(notMatchedResults.length)}</span>
                </summary>
                <div className="screening-collapsible-body">
                  {notMatchedResults.map((result) => (
                    <ScreeningResultCard
                      result={result}
                      rank={ranks.get(result.program.id) ?? 0}
                      detailParams={detailParams}
                      marketManagerView={marketManagerView}
                      key={result.program.id}
                    />
                  ))}
                </div>
              </details>
            ) : null}

          </form>
        )}
      </div>
    </>
  );
}

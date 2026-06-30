import Link from "next/link";

import { saveRecommendationAction } from "@/app/actions";
import { ScreeningResultCard } from "@/components/screening-result-card";
import { EmptyState, PageHeading } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import {
  rankPrograms,
  type FitLevel,
  type RankedProgram,
  type ScreeningCriteria,
} from "@/lib/matcher";
import { getProgramsForScreening, listCustomerOptions } from "@/lib/queries";
import { partitionScreeningResults } from "@/lib/screening-results";
import { asNumber } from "@/lib/utils";

function parseDateParam(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}


const supervisorAcceptanceModes = ["required", "not_required", "unknown"] as const;

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
    intakeYear: asNumber(params.intakeYear),
    budget: asNumber(params.budget),
    hasCsca: params.csca === "yes" ? true : params.csca === "no" ? false : null,
    gpa: asNumber(params.gpa),
    gpaScale: asNumber(params.gpaScale),
    hskLevel: asNumber(params.hskLevel),
    hskScore: asNumber(params.hskScore),
    ielts: asNumber(params.ielts),
    toefl: asNumber(params.toefl),
    duolingo: asNumber(params.duolingo),
    age: asNumber(params.age),
    nationality: params.nationality,
    province: params.province,
    city: params.city,
    scholarshipRequired: params.scholarship === "yes",
    accommodationRequired: params.accommodation === "yes",
    supervisorAcceptance: parseSupervisorAcceptance(params.supervisorAcceptance),
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
  "intakeYear",
  "budget",
  "csca",
  "gpa",
  "gpaScale",
  "hskLevel",
  "hskScore",
  "ielts",
  "toefl",
  "duolingo",
  "age",
  "nationality",
  "province",
  "city",
  "scholarship",
  "accommodation",
  "supervisorAcceptance",
  "deadlineFrom",
  "deadlineTo",
] as const;

function hasSearchCriteria(params: Record<string, string | undefined>) {
  return (
    searchKeys.some((key) => Boolean(params[key])) ||
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
  "csca",
  "gpa",
  "gpaScale",
  "hskLevel",
  "hskScore",
  "ielts",
  "toefl",
  "duolingo",
] as const;

const preferenceFilterKeys = [
  "budget",
  "province",
  "city",
  "scholarship",
  "accommodation",
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
}: {
  fitLevel: Exclude<FitLevel, "NOT_MATCHED">;
  results: RankedProgram[];
  ranks: Map<string, number>;
  detailParams: Record<string, string | undefined>;
}) {
  if (!results.length) return null;
  const section = fitSection[fitLevel];
  return (
    <section className="screening-result-section">
      <div className="screening-section-heading">
        <div>
          <h3>{section.title}</h3>
          <p>{section.description}</p>
        </div>
        <span>{results.length} 个项目</span>
      </div>
      {results.map((result) => (
        <ScreeningResultCard
          result={result}
          rank={ranks.get(result.program.id) ?? 0}
          detailParams={detailParams}
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
  const criteria = toCriteria(params);
  const hasSearch = hasSearchCriteria(params);
  const showAcademicFilters = hasAnyParam(params, academicFilterKeys);
  const showPreferenceFilters = hasAnyParam(params, preferenceFilterKeys);
  const [programs, customers] = await Promise.all([
    getProgramsForScreening(),
    listCustomerOptions(),
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

  return (
    <>
      <PageHeading
        title="学校项目筛查"
        description="明确符合、需要补充、信息未知和不符合会分开显示；点击学校名称可查看完整学校与项目资料。"
      />
      <form className="card screening-filter-card" method="get">
        <div className="card-header">
          <div>
            <h3>客户筛选条件</h3>
            <p className="small muted">未取得或数据库未明确的信息可以留空，系统不会擅自推断。</p>
          </div>
        </div>
        <div className="card-body screening-filter-body">
          <section className="screening-filter-section">
            <h4>申请目标</h4>
            <div className="form-grid">
              <label>
                申请学历
                <select name="type" defaultValue={params.type}>
                  <option value="">不限</option>
                  {Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                授课语言
                <select name="language" defaultValue={params.language}>
                  <option value="">不限</option>
                  {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>目标专业<input name="major" defaultValue={params.major} /></label>
              <label>入学年份<input name="intakeYear" type="number" min="2026" max="2035" defaultValue={params.intakeYear} /></label>
              <label>
                学校是否要求导师接收函
                <select name="supervisorAcceptance" defaultValue={params.supervisorAcceptance}>
                  <option value="">不限</option>
                  <option value="required">明确或部分要求</option>
                  <option value="not_required">学校明确不要求</option>
                  <option value="unknown">数据库未写明</option>
                </select>
              </label>
              <label>国籍<input name="nationality" defaultValue={params.nationality} placeholder="例如：泰国" /></label>
              <label>年龄<input name="age" type="number" min="1" max="100" defaultValue={params.age} /></label>
            </div>
          </section>

          <section className="screening-filter-section">
            <h4>申请时间</h4>
            <div className="form-grid">
              <label>
                申请截止状态
                <select name="deadlineMode" defaultValue={params.deadlineMode || "all"}>
                  <option value="all">全部状态</option>
                  <option value="open">只看开放中</option>
                  <option value="unknown">只看日期未知</option>
                  <option value="expired">只看已截止</option>
                </select>
              </label>
              <label>截止日期从<input name="deadlineFrom" type="date" defaultValue={params.deadlineFrom} /></label>
              <label>截止日期到<input name="deadlineTo" type="date" defaultValue={params.deadlineTo} /></label>
            </div>
          </section>

          <details className="screening-filter-section screening-filter-advanced" open={showAcademicFilters}>
            <summary>
              <span>
                <strong>学术与语言条件</strong>
                <small>CSCA、GPA、HSK、雅思、托福、多邻国</small>
              </span>
              <span className="screening-advanced-toggle">展开</span>
            </summary>
            <div className="form-grid screening-advanced-body">
              <label>
                CSCA 当前状态
                <select name="csca" defaultValue={params.csca}>
                  <option value="">不限</option>
                  <option value="yes">已有</option>
                  <option value="no">目前没有</option>
                </select>
              </label>
              <label>GPA / 均分<input name="gpa" type="number" step="0.01" defaultValue={params.gpa} /></label>
              <label>GPA 满分制<input name="gpaScale" type="number" step="0.01" placeholder="4、5 或 100" defaultValue={params.gpaScale} /></label>
              <label>HSK 级别<input name="hskLevel" type="number" min="1" max="6" defaultValue={params.hskLevel} /></label>
              <label>HSK 分数<input name="hskScore" type="number" defaultValue={params.hskScore} /></label>
              <label>雅思<input name="ielts" type="number" step="0.5" defaultValue={params.ielts} /></label>
              <label>托福<input name="toefl" type="number" defaultValue={params.toefl} /></label>
              <label>多邻国<input name="duolingo" type="number" defaultValue={params.duolingo} /></label>
            </div>
          </details>

          <details className="screening-filter-section screening-filter-advanced" open={showPreferenceFilters}>
            <summary>
              <span>
                <strong>预算与偏好</strong>
                <small>预算、省市、奖学金、住宿</small>
              </span>
              <span className="screening-advanced-toggle">展开</span>
            </summary>
            <div className="form-grid screening-advanced-body">
              <label>首年总预算（元）<input name="budget" type="number" min="0" defaultValue={params.budget} /></label>
              <label>意向省份<input name="province" defaultValue={params.province} placeholder="例如：广东" /></label>
              <label>意向城市<input name="city" defaultValue={params.city} placeholder="例如：深圳" /></label>
              <label>
                奖学金需求
                <select name="scholarship" defaultValue={params.scholarship}>
                  <option value="">不限</option>
                  <option value="yes">需要奖学金信息</option>
                </select>
              </label>
              <label>
                住宿需求
                <select name="accommodation" defaultValue={params.accommodation}>
                  <option value="">不限</option>
                  <option value="yes">需要住宿信息</option>
                </select>
              </label>
            </div>
          </details>
          <div className="form-actions screening-filter-actions">
            <button className="primary" type="submit">开始筛查</button>
            <Link className="button" href="/screening">清空条件</Link>
          </div>
        </div>
      </form>

      <div className="screening-results">
        {!hasSearch ? (
          <EmptyState>填写至少一个筛选条件后查看项目匹配结果</EmptyState>
        ) : (
          <form action={saveRecommendationAction}>
            <div className="toolbar screening-save-toolbar">
              <label>
                保存到客户
                <select name="customerId" required>
                  <option value="">请选择客户</option>
                  {customers.map((customer) => (
                    <option value={customer.id} key={customer.id}>
                      {customer.name} · {customer.customerNo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                方案名称
                <input name="title" defaultValue={`${new Date().getFullYear()} 项目筛选方案`} required />
              </label>
              <label className="search">方案备注<input name="notes" /></label>
              <input type="hidden" name="criteriaJson" value={JSON.stringify(criteria)} />
              <button className="primary" type="submit">保存并生成对比页</button>
            </div>

            <div className="screening-summary">
              <strong>共找到 {results.length} 个项目</strong>
              <span>可直接申请 {grouped.MATCHED.length}</span>
              <span>需要补充 {grouped.NEEDS_ACTION.length}</span>
              <span>信息待核实 {grouped.UNKNOWN.length}</span>
              <span>明确不符合 {notMatchedResults.length}</span>
              <span>已截止 {expiredResults.length}</span>
            </div>

            <ResultSection fitLevel="MATCHED" results={grouped.MATCHED} ranks={ranks} detailParams={detailParams} />
            <ResultSection fitLevel="NEEDS_ACTION" results={grouped.NEEDS_ACTION} ranks={ranks} detailParams={detailParams} />
            <ResultSection fitLevel="UNKNOWN" results={grouped.UNKNOWN} ranks={ranks} detailParams={detailParams} />

            {notMatchedResults.length ? (
              <details className="card screening-collapsible-group">
                <summary>
                  <span><strong>明确不符合</strong><small>默认收起，需要核对原因时再展开</small></span>
                  <span>{notMatchedResults.length} 个项目</span>
                </summary>
                <div className="screening-collapsible-body">
                  {notMatchedResults.map((result) => (
                    <ScreeningResultCard
                      result={result}
                      rank={ranks.get(result.program.id) ?? 0}
                      detailParams={detailParams}
                      key={result.program.id}
                    />
                  ))}
                </div>
              </details>
            ) : null}

            {expiredResults.length ? (
              <details
                className="card screening-collapsible-group"
                open={criteria.deadlineMode === "expired" || criteria.deadlineMode === "all"}
              >
                <summary>
                  <span><strong>已截止项目</strong><small>全部状态下自动展开，仅供历史对照</small></span>
                  <span>{expiredResults.length} 个项目</span>
                </summary>
                <div className="screening-collapsible-body">
                  {expiredResults.map((result) => (
                    <ScreeningResultCard
                      result={result}
                      rank={ranks.get(result.program.id) ?? 0}
                      detailParams={detailParams}
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
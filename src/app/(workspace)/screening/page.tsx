import { saveRecommendationAction } from "@/app/actions";
import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { rankPrograms, type ScreeningCriteria } from "@/lib/matcher";
import { getProgramsForScreening, listCustomerOptions } from "@/lib/queries";
import { asNumber, formatDate, formatMoney } from "@/lib/utils";

function parseDateParam(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toCriteria(params: Record<string, string | undefined>): ScreeningCriteria {
  return {
    programType: params.type,
    teachingLanguage: params.language,
    targetMajor: params.major,
    budget: asNumber(params.budget),
    hasCsca: params.csca === "yes" ? true : params.csca === "no" ? false : null,
    gpa: asNumber(params.gpa),
    gpaScale: asNumber(params.gpaScale),
    hskLevel: asNumber(params.hskLevel),
    hskScore: asNumber(params.hskScore),
    ielts: asNumber(params.ielts),
    toefl: asNumber(params.toefl),
    duolingo: asNumber(params.duolingo),
    province: params.province,
    city: params.city,
    scholarshipRequired: params.scholarship === "yes",
    deadlineFrom: parseDateParam(params.deadlineFrom),
    deadlineTo: parseDateParam(params.deadlineTo),
    deadlineMode: (params.deadlineMode as ScreeningCriteria["deadlineMode"]) || "open",
  };
}

const toneByFit = {
  MATCHED: "green",
  NEEDS_ACTION: "amber",
  UNKNOWN: "gray",
  NOT_MATCHED: "red",
} as const;

const labelByFit = {
  MATCHED: "可直接考虑",
  NEEDS_ACTION: "需要补充条件",
  UNKNOWN: "存在未知信息",
  NOT_MATCHED: "明确不符合",
};

export default async function ScreeningPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const criteria = toCriteria(params);
  const hasSearch = Boolean(
    criteria.programType ||
      criteria.teachingLanguage ||
      criteria.targetMajor ||
      criteria.budget ||
      criteria.province ||
      criteria.city ||
      criteria.deadlineFrom ||
      criteria.deadlineTo ||
      params.deadlineMode,
  );
  const [programs, customers] = await Promise.all([getProgramsForScreening(), listCustomerOptions()]);
  const results = hasSearch ? rankPrograms(programs, criteria) : [];
  const activeResults = results.filter((result) => result.program.deadlineStatus !== "EXPIRED");
  const expiredResults = results.filter((result) => result.program.deadlineStatus === "EXPIRED");

  const renderResult = (result: (typeof results)[number], index: number) => (
    <article className="card result-card" key={result.program.id}>
      <div className="result-main">
        <input type="checkbox" name="programIds" value={result.program.id} aria-label={`选择 ${result.program.schoolName}`} />
        <div>
          <div className="result-title">{result.program.schoolName}</div>
          <div className="result-meta">
            <span>{PROGRAM_TYPE_LABELS[result.program.programType]}</span>
            <span>{LANGUAGE_LABELS[result.program.teachingLanguage]}</span>
            <span>首年上限：{formatMoney(result.program.firstYearCostMax)}</span>
            <span>申请截止：{formatDate(result.program.deadlineDate)}</span>
            <span>{result.program.deadlineStatus === "OPEN" ? "开放中" : result.program.deadlineStatus === "EXPIRED" ? "已截止" : "截止日期未知"}</span>
          </div>
          <p className="small muted truncate" style={{ marginTop: 8 }}>
            {result.program.majorText || "数据库未有相关专业信息"}
          </p>
          <label style={{ marginTop: 10 }}>
            顾问推荐理由
            <input name={`reason_${result.program.id}`} placeholder="可选，打印方案时显示" />
          </label>
          <input type="hidden" name={`fit_${result.program.id}`} value={result.fitLevel} />
          <input type="hidden" name={`evidence_${result.program.id}`} value={JSON.stringify(result.evidence)} />
        </div>
        <div>
          <Badge tone={toneByFit[result.fitLevel as keyof typeof toneByFit]}>{labelByFit[result.fitLevel as keyof typeof labelByFit]}</Badge>
          <div className="small muted" style={{ marginTop: 6 }}>排序 {index + 1}</div>
        </div>
      </div>
      <div className="evidence-strip">
        {result.evidence.map((item) => (
          <div className={`evidence ${item.level.toLowerCase()}`} key={`${result.program.id}-${item.label}`}>
            <strong>{item.label}</strong>
            <span className="small">{item.detail}</span>
          </div>
        ))}
      </div>
    </article>
  );

  return (
    <>
      <PageHeading title="学校项目筛查" description="按申请可行性排序。截止日期、未知信息和需补条件都会单独展示，方便顾问判断。" />
      <form className="card" method="get">
        <div className="card-header"><h3>客户条件</h3></div>
        <div className="card-body">
          <div className="form-grid">
            <label>申请学历<select name="type" defaultValue={params.type}><option value="">不限</option>{Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>授课语言<select name="language" defaultValue={params.language}><option value="">不限</option>{Object.entries(LANGUAGE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>目标专业<input name="major" defaultValue={params.major} /></label>
            <label>申请截止状态<select name="deadlineMode" defaultValue={params.deadlineMode || "open"}><option value="open">只看开放中</option><option value="unknown">只看日期未知</option><option value="expired">只看已截止</option><option value="all">全部</option></select></label>
            <label>截止日期从<input name="deadlineFrom" type="date" defaultValue={params.deadlineFrom} /></label>
            <label>截止日期到<input name="deadlineTo" type="date" defaultValue={params.deadlineTo} /></label>
            <label>首年总预算（元）<input name="budget" type="number" defaultValue={params.budget} /></label>
            <label>CSCA 状态<select name="csca" defaultValue={params.csca}><option value="">未确认</option><option value="yes">已有</option><option value="no">目前没有</option></select></label>
            <label>GPA / 均分<input name="gpa" type="number" step="0.01" defaultValue={params.gpa} /></label>
            <label>GPA 满分制<input name="gpaScale" type="number" step="0.01" defaultValue={params.gpaScale} /></label>
            <label>HSK 级别<input name="hskLevel" type="number" min="1" max="6" defaultValue={params.hskLevel} /></label>
            <label>HSK 分数<input name="hskScore" type="number" defaultValue={params.hskScore} /></label>
            <label>雅思<input name="ielts" type="number" step="0.5" defaultValue={params.ielts} /></label>
            <label>托福<input name="toefl" type="number" defaultValue={params.toefl} /></label>
            <label>多邻国<input name="duolingo" type="number" defaultValue={params.duolingo} /></label>
            <label>意向省份<input name="province" defaultValue={params.province} /></label>
            <label>意向城市<input name="city" defaultValue={params.city} /></label>
            <label>奖学金<select name="scholarship" defaultValue={params.scholarship}><option value="">不限</option><option value="yes">必须有奖学金信息</option></select></label>
          </div>
          <div className="form-actions"><button className="primary" type="submit">开始筛查</button></div>
        </div>
      </form>

      <div style={{ marginTop: 20 }}>
        {!hasSearch ? <EmptyState>填写至少一个筛选条件后查看项目匹配结果</EmptyState> : (
          <form action={saveRecommendationAction}>
            <div className="toolbar">
              <label>保存到客户<select name="customerId" required><option value="">请选择客户</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name} · {customer.customerNo}</option>)}</select></label>
              <label>方案名称<input name="title" defaultValue={`${new Date().getFullYear()} 项目筛选方案`} required /></label>
              <label className="search">方案备注<input name="notes" /></label>
              <input type="hidden" name="criteriaJson" value={JSON.stringify(criteria)} />
              <button className="primary" type="submit">保存并生成对比页</button>
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>找到 {activeResults.length} 个当前可参考项目；另有 {expiredResults.length} 个已截止项目。</p>
            {activeResults.map(renderResult)}
            {expiredResults.length ? <details className="card"><summary className="card-header"><strong>已截止项目（{expiredResults.length}）</strong></summary><div className="card-body">{expiredResults.map(renderResult)}</div></details> : null}
          </form>
        )}
      </div>
    </>
  );
}


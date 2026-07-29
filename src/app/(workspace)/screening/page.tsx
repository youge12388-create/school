import { saveRecommendationAction } from "@/app/actions";
import { ClearScreeningFilters } from "@/components/clear-screening-filters";
import { MajorPicker, type MajorCatalog } from "@/components/major-picker";
import { ScreeningResultCard } from "@/components/screening-result-card";
import { EmptyState, PageHeading } from "@/components/ui";
import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import {
  parseSchoolTier,
  rankPrograms,
  type FitLevel,
  type RankedProgram,
  type ScreeningCriteria,
} from "@/lib/matcher";
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
    title: "鍙洿鎺ョ敵璇?,
    description: "褰撳墠缁撴瀯鍖栨潯浠跺潎绗﹀悎銆傛彁浜ゅ墠浠嶅缓璁牳瀵瑰鏍℃渶鏂伴€氱煡銆?,
  },
  NEEDS_ACTION: {
    title: "闇€瑕佽ˉ鍏呮潯浠?,
    description: "椤圭洰鏂瑰悜鍙€冭檻锛屼絾瀹㈡埛杩橀渶瑕佽ˉ鎴愮哗銆丆SCA 鎴栧叾浠栨潗鏂欍€?,
  },
  UNKNOWN: {
    title: "淇℃伅寰呮牳瀹?,
    description: "鏁版嵁搴撶己灏戝叧閿潯浠讹紝涓嶈兘鎿呰嚜鍒ゆ柇涓虹鍚堛€?,
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
        <span>{results.length} 涓」鐩?/span>
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

  return (
    <>
      <PageHeading
        title="瀛︽牎椤圭洰绛涙煡"
        description="鏄庣‘绗﹀悎銆侀渶瑕佽ˉ鍏呫€佷俊鎭湭鐭ュ拰涓嶇鍚堜細鍒嗗紑鏄剧ず锛涚偣鍑诲鏍″悕绉板彲鏌ョ湅瀹屾暣瀛︽牎涓庨」鐩祫鏂欍€?
      />
      <form className="card screening-filter-card" method="get">
        <div className="card-header">
          <div>
            <h3>瀹㈡埛绛涢€夋潯浠?/h3>
            <p className="small muted">绌虹己淇℃伅涓嶅弬涓庡垽鏂紝鍙寜闇€灞曞紑鏇村鏉′欢銆?/p>
          </div>
          <div className="header-search">
            <input
              name="q"
              defaultValue={params.q}
              placeholder="鎼滅储瀛︽牎鍚嶇О..."
              aria-label="鎼滅储瀛︽牎"
            />
          </div>
        </div>
        <div className="card-body screening-filter-body">
          <section className="screening-filter-section screening-filter-primary">
            <h4>鐢宠鐩爣</h4>
            <div className="screening-primary-fields">
              <div className="form-grid screening-primary-main">
                <label>
                  鐢宠瀛﹀巻
                  <select name="type" defaultValue={params.type}>
                    <option value="">涓嶉檺</option>
                    {Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  鎺堣璇█
                  <select name="language" defaultValue={params.language}>
                    <option value="">涓嶉檺</option>
                    {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  鐩爣涓撲笟
                  <MajorPicker
                    name="major"
                    defaultValue={params.major ?? ""}
                    catalog={majorCatalog as MajorCatalog}
                    placeholder="杈撳叆鎴栭€夋嫨涓撲笟..."
                  />
                </label>
                <label>
                  CSCA
                  <select name="csca" defaultValue={params.csca}>
                    <option value="">涓嶉檺</option>
                    <option value="REQUIRED">闄㈡牎闇€瑕?/option>
                    <option value="NOT_REQUIRED">闄㈡牎涓嶉渶瑕?/option>
                    <option value="UNKNOWN">淇℃伅鏈爣鏄?/option>
                  </select>
                </label>
                <label>
                  骞撮緞
                  <input name="age" type="number" min="1" max="100" defaultValue={params.age} placeholder="鍛ㄥ瞾" />
                </label>
                <label>
                  濂栧閲戦渶姹?
                  <select name="scholarshipType" defaultValue={params.scholarshipType}>
                    <option value="">涓嶉檺</option>
                    <option value="full">鍏ㄩ濂栧閲?/option>
                    <option value="any">鏈夊叾浠栧瀛﹂噾</option>
                    <option value="none">鏃犲瀛﹂噾锛堣嚜璐癸級</option>
                  </select>
                </label>
              </div>
              <div className="form-grid screening-primary-secondary">
                <label>
                  闄㈡牎灞傛
                  <select name="schoolTier" defaultValue={criteria.schoolTier || ""}>
                    <option value="">涓嶉檺</option>
                    <option value="985">985</option>
                    <option value="211">211</option>
                    <option value="double_first_class_only">浠呭弻涓€娴?/option>
                    <option value="double_non">鍙岄潪鏅€氶櫌鏍?/option>
                  </select>
                </label>
                <label>鍥界睄<input name="nationality" defaultValue={params.nationality} placeholder="渚嬪锛氭嘲鍥? /></label>
                <label>
                  瀵煎笀鎺ユ敹鍑借姹?
                  <select name="supervisorAcceptance" defaultValue={params.supervisorAcceptance}>
                    <option value="">涓嶉檺</option>
                    <option value="required">鏄庣‘鎴栭儴鍒嗚姹?/option>
                    <option value="unknown">鏈爣鏄?/option>
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="screening-filter-section screening-filter-deadline">
            <h4>鐢宠鏃堕棿</h4>
            <div className="form-grid">
              <label>
                鐢宠鎴鐘舵€?
                <select name="deadlineMode" defaultValue={params.deadlineMode || "all"}>
                  <option value="all">鍏ㄩ儴鐘舵€?/option>
                  <option value="open">鍙湅寮€鏀句腑</option>
                  <option value="unknown">鍙湅鏃ユ湡鏈煡</option>
                  <option value="expired">鍙湅宸叉埅姝?/option>
                </select>
              </label>
              <label>鎴鏃ユ湡浠?input name="deadlineFrom" type="date" defaultValue={params.deadlineFrom} /></label>
              <label>鎴鏃ユ湡鍒?input name="deadlineTo" type="date" defaultValue={params.deadlineTo} /></label>
            </div>
          </section>

          <details className="screening-filter-section screening-filter-advanced screening-filter-academic" open={showAcademicFilters}>
            <summary>
              <span>
                <strong>瀛︽湳涓庤瑷€鏉′欢</strong>
                <small>GPA銆丠SK銆侀泤鎬濄€佹墭绂忋€佸閭诲浗鍒嗘暟</small>
              </span>
              <span className="screening-advanced-toggle">灞曞紑</span>
            </summary>
            <div className="form-grid screening-advanced-body">
              <label>GPA / 鍧囧垎<input name="gpa" type="number" step="0.01" defaultValue={params.gpa} /></label>
              <label>GPA 婊″垎鍒?input name="gpaScale" type="number" step="0.01" placeholder="4銆? 鎴?100" defaultValue={params.gpaScale} /></label>
              <label>HSK 绾у埆<input name="hskLevel" type="number" min="1" max="6" defaultValue={params.hskLevel} /></label>
              <label>HSK 鍒嗘暟<input name="hskScore" type="number" defaultValue={params.hskScore} /></label>
              <label>闆呮€?input name="ielts" type="number" step="0.5" defaultValue={params.ielts} /></label>
              <label>鎵樼<input name="toefl" type="number" defaultValue={params.toefl} /></label>
              <label>澶氶偦鍥藉垎鏁?input name="duolingo" type="number" defaultValue={params.duolingo} /></label>
            </div>
          </details>

          <details className="screening-filter-section screening-filter-advanced screening-filter-soft" open={showSoftFilters}>
            <summary>
              <span>
                <strong>杞€х珵浜夊姏</strong>
                <small>璁烘枃/涓撳埄鎴愭灉銆佺珵璧?绐佸嚭琛ㄧ幇</small>
              </span>
              <span className="screening-advanced-toggle">灞曞紑</span>
            </summary>
            <div className="form-grid screening-advanced-body">
              <label>
                璁烘枃/涓撳埄鎴愭灉
                <select name="paperPatent" defaultValue={params.paperPatent}>
                  <option value="">涓嶉檺</option>
                  <option value="general">鏈夎鏂囨垨涓撳埄</option>
                  <option value="sci_ei">鏈塖CI/EI绾у埆璁烘枃</option>
                </select>
              </label>
              
              
              <label>
                绔炶禌/鍏朵粬绐佸嚭琛ㄧ幇
                <select name="competition" defaultValue={params.competition}>
                  <option value="">涓嶉檺</option>
                  <option value="competition">鏈夌珵璧涙垨绐佸嚭琛ㄧ幇</option>
                </select>
              </label>
              
            </div>
          </details>

          <details className="screening-filter-section screening-filter-advanced screening-filter-preferences" open={showPreferenceFilters}>
            <summary>
              <span>
                <strong>棰勭畻涓庡亸濂?/strong>
                <small>棰勭畻銆佺渷甯傘€佷綇瀹?/small>
              </span>
              <span className="screening-advanced-toggle">灞曞紑</span>
            </summary>
            <div className="form-grid screening-advanced-body">
              <label>棣栧勾鎬婚绠楋紙鍏冿級<input name="budget" type="number" min="0" defaultValue={params.budget} /></label>
              <label>鎰忓悜鐪佷唤<input name="province" defaultValue={params.province} placeholder="渚嬪锛氬箍涓? /></label>
              <label>鎰忓悜鍩庡競<input name="city" defaultValue={params.city} placeholder="渚嬪锛氭繁鍦? /></label>
              <label>
                浣忓闇€姹?
                <select name="accommodation" defaultValue={params.accommodation}>
                  <option value="">涓嶉檺</option>
                  <option value="yes">闇€瑕佷綇瀹夸俊鎭?/option>
                </select>
              </label>
              <label>
                鐢熸簮鍦帮紙鎷涚敓锛夊亸濂?
                <select name="enrollmentRegion" defaultValue={params.enrollmentRegion || ""}>
                  <option value="">涓嶉檺</option>
                  <option value="no_preference">娌℃湁鐢熸簮鍦板亸濂?/option>
                </select>
              </label>
            </div>
          </details>
          <div className="form-actions screening-filter-actions">
            <button className="primary" type="submit">寮€濮嬬瓫鏌?/button>
            <ClearScreeningFilters />
          </div>
        </div>
      </form>

      <div className="screening-results">
        {!hasSearch ? (
          <EmptyState>濉啓鑷冲皯涓€涓瓫閫夋潯浠跺悗鏌ョ湅椤圭洰鍖归厤缁撴灉</EmptyState>
        ) : (
          <form action={saveRecommendationAction}>
            <div className="toolbar screening-save-toolbar">
              <label>
                淇濆瓨鍒板鎴?
                <select name="customerId" required>
                  <option value="">璇烽€夋嫨瀹㈡埛</option>
                  {customers.map((customer) => (
                    <option value={customer.id} key={customer.id}>
                      {customer.name} 路 {customer.customerNo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                鏂规鍚嶇О
                <input name="title" defaultValue={`${new Date().getFullYear()} 椤圭洰绛涢€夋柟妗坄} required />
              </label>
              <label className="search">鏂规澶囨敞<input name="notes" /></label>
              <input type="hidden" name="criteriaJson" value={JSON.stringify(criteria)} />
              <button className="primary" type="submit">淇濆瓨骞剁敓鎴愬姣旈〉</button>
            </div>

            <div className="screening-summary screening-summary-prominent">
              <strong>馃搳 鍏辨壘鍒?{results.length} 涓」鐩?/strong>
              <span className="summary-matched">鉁?鍙洿鎺ョ敵璇?{grouped.MATCHED.length}</span>
              <span className="summary-need">鈿狅笍 闇€瑕佽ˉ鍏?{grouped.NEEDS_ACTION.length}</span>
              <span className="summary-unknown">鉂?淇℃伅寰呮牳瀹?{grouped.UNKNOWN.length}</span>
              <span>鉀?鏄庣‘涓嶇鍚?{notMatchedResults.length}</span>
              <span>鈴?宸叉埅姝?{expiredResults.length}</span>
            </div>

            <ResultSection fitLevel="MATCHED" results={grouped.MATCHED} ranks={ranks} detailParams={detailParams} />
            <ResultSection fitLevel="NEEDS_ACTION" results={grouped.NEEDS_ACTION} ranks={ranks} detailParams={detailParams} />
            <ResultSection fitLevel="UNKNOWN" results={grouped.UNKNOWN} ranks={ranks} detailParams={detailParams} />

                        {expiredResults.length ? (
              <details className="card screening-collapsible-group">
                <summary>
                  <span><strong>宸叉埅姝㈤」鐩?/strong><small>宸茶繃鏈燂紝鐐瑰嚮灞曞紑鏌ョ湅</small></span>
                  <span>{expiredResults.length} 涓」鐩?/span>
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

            {notMatchedResults.length ? (
              <details className="card screening-collapsible-group">
                <summary>
                  <span><strong>鏄庣‘涓嶇鍚?/strong><small>榛樿鏀惰捣锛岄渶瑕佹牳瀵瑰師鍥犳椂鍐嶅睍寮€</small></span>
                  <span>{notMatchedResults.length} 涓」鐩?/span>
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

          </form>
        )}
      </div>
    </>
  );
}


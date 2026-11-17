import { schoolIdentityKey } from "@/lib/ai-screening";
import { loadCurrentWorkbook } from "@/lib/ai-screening-workbook";
import { openRawDatabase } from "@/lib/db/raw";

type ProgramRow = {
  id: string;
  schoolName: string;
  programName: string;
  reviewStatus: string;
  manuallyVerified: number;
  firstYearCostMax: number | null;
  costIncomplete: number;
  deadlineDate: number | null;
  deadlineStatus: string;
  semesterText: string | null;
  applicationTimeText: string | null;
};

const database = openRawDatabase();
const rows = database.prepare(`
  SELECT
    p.id AS id,
    s.name_zh AS schoolName,
    p.name AS programName,
    p.review_status AS reviewStatus,
    p.manually_verified AS manuallyVerified,
    p.first_year_cost_max AS firstYearCostMax,
    p.cost_incomplete AS costIncomplete,
    p.deadline_date AS deadlineDate,
    p.deadline_status AS deadlineStatus,
    p.semester_text AS semesterText,
    p.application_time_text AS applicationTimeText
  FROM programs p
  INNER JOIN schools s ON s.id = p.school_id
  WHERE p.archived = 0 AND s.archived = 0
`).all() as ProgramRow[];

const schoolRows = database
  .prepare("SELECT id, name_zh AS name FROM schools WHERE archived = 0")
  .all() as Array<{ id: string; name: string }>;

const schoolGroups = new Map<string, string[]>();
for (const school of schoolRows) {
  const key = schoolIdentityKey(school.name);
  schoolGroups.set(key, [...(schoolGroups.get(key) ?? []), school.name]);
}
const duplicateSchools = [...schoolGroups.values()].filter((names) => names.length > 1);

const currentYear = Number(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(new Date()),
);
const sourceYears = (row: ProgramRow) =>
  [...new Set(`${row.semesterText ?? ""} ${row.applicationTimeText ?? ""}`.match(/20\d{2}/gu) ?? [])].map(Number);
const unverified = rows.filter(
  (row) => row.reviewStatus !== "VERIFIED" || !row.manuallyVerified,
);
const missingFee = rows.filter(
  (row) => row.costIncomplete || row.firstYearCostMax == null,
);
const missingDeadline = rows.filter(
  (row) =>
    row.deadlineDate == null &&
    !row.applicationTimeText?.trim() &&
    !row.semesterText?.trim(),
);
const expiredDeadline = rows.filter(
  (row) =>
    row.deadlineDate != null &&
    Number.isFinite(row.deadlineDate) &&
    row.deadlineDate < Date.now() &&
    row.deadlineStatus !== "EXPIRED",
);
const missingSourceYear = rows.filter((row) => sourceYears(row).length === 0);
const historicalOnly = rows.filter((row) => {
  const years = sourceYears(row);
  return years.length > 0 && years.every((year) => year < currentYear);
});

function examples(values: ProgramRow[]) {
  return values
    .slice(0, 5)
    .map((row) => `  - ${row.schoolName} · ${row.programName}`)
    .join("\n");
}

function section(title: string, values: ProgramRow[], detail?: string) {
  console.log(`\n${title}: ${values.length}`);
  if (detail) console.log(`  ${detail}`);
  const sample = examples(values);
  if (sample) console.log(sample);
  if (values.length > 5) console.log(`  …另有 ${values.length - 5} 条`);
}

console.log("AI 选校数据审计（只读）");
console.log(`有效学校: ${schoolRows.length}`);
console.log(`有效项目: ${rows.length}`);
section("待人工核实项目", unverified, "未完成人工核实，不应展示为已确认资料。");
section("费用缺失或口径不完整", missingFee, "不得据此宣称预算覆盖。");
section("截止日期过期但状态未更新", expiredDeadline, "需要核对新批次或标记过期。");
section("截止和入学时间均缺失", missingDeadline, "需要补齐招生时间或标记待核实。");
section("无法识别资料年份", missingSourceYear, "费用和日期必须提示适用年份不明。");
section("仅含较早年份资料", historicalOnly, `当前年份为 ${currentYear}，旧年资料不能当作当期标准。`);

if (duplicateSchools.length) {
  console.log(`\n疑似重复学校: ${duplicateSchools.length}`);
  for (const names of duplicateSchools.slice(0, 10)) {
    console.log(`  - ${names.join(" / ")}`);
  }
} else {
  console.log("\n疑似重复学校: 0");
}

async function printReport() {
  try {
    const workbook = await loadCurrentWorkbook();
    const grouped = new Map<string, number>();
    for (const row of workbook.rows) {
      const key = schoolIdentityKey(row.name);
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    const repeatedRows = [...grouped.values()].filter((count) => count > 1);
    console.log(`\n当前招生名单: ${workbook.name}`);
    console.log(`  记录 ${workbook.rows.length} 条，识别 ${workbook.schools} 所学校`);
    console.log(`  同一学校多行记录: ${repeatedRows.length} 所`);
    if (workbook.missingColumns.length) {
      console.log(`  缺少可识别列: ${workbook.missingColumns.join("、")}`);
    }
  } catch (error) {
    console.log(`\n当前招生名单: 无法读取（${error instanceof Error ? error.message : "未知错误"}）`);
  }

  const blocking = unverified.length + expiredDeadline.length + missingFee.length;
  console.log(`\n上线前需要人工处理的风险项合计: ${blocking}`);
  for (const line of [
    "1. 先核实所有待展示项目的招生年份、批次、学费、截止日期和开班状态。",
    "2. 人工核实完成后，在管理端逐项确认；确认前页面保持“待人工核实”。",
    "3. 旧年或未注明年份的费用只能作为线索，不得表述为当期标准。",
  ]) {
    console.log(line);
  }

  if (process.argv.includes("--strict") && blocking > 0) {
    process.exitCode = 1;
  }
  database.close();
}

void printReport();

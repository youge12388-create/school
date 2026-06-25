import { createHash } from "node:crypto";

import * as XLSX from "xlsx";

import { LANGUAGE_LABELS, PROGRAM_TYPE_LABELS } from "@/lib/constants";
import { parseProgram } from "@/lib/program-parser";
import { asNumber, asOptionalText, asText } from "@/lib/utils";

const SCHOOL_HEADERS = [
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
];

const PROGRAM_HEADERS = [
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
];

export type SchoolImportRow = ReturnType<typeof toSchool>;
export type ProgramImportRow = ReturnType<typeof toProgram>;

function sheetRows(workbook: XLSX.WorkBook, sheetName: string, range: number) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`缺少工作表：${sheetName}`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    range,
    raw: false,
  });
}

function validateHeaders(rows: Record<string, unknown>[], expected: string[], kind: string) {
  if (!rows.length) throw new Error(`${kind}工作表没有数据`);
  const actual = Object.keys(rows[0]);
  const missing = expected.filter((header) => !actual.includes(header));
  if (missing.length) throw new Error(`${kind}缺少字段：${missing.join("、")}`);
}

function toSchool(row: Record<string, unknown>) {
  const cscaText = asText(row.CSCA);
  return {
    nameZh: asText(row.学校中文名),
    name: asText(row.学校名称) || asText(row.学校中文名),
    category: asOptionalText(row.学校分类),
    province: asOptionalText(row.省份),
    city: asOptionalText(row.城市),
    website: asOptionalText(row.官网),
    qsRanking: asNumber(row.QS排名),
    rankingInfo: asOptionalText(row.排名信息),
    partnershipRating: asNumber(row.合作星级) ?? 0,
    cscaStatus:
      cscaText === "是"
        ? ("REQUIRED" as const)
        : cscaText === "否"
          ? ("NOT_REQUIRED" as const)
          : ("UNKNOWN" as const),
    tags: asOptionalText(row.标签),
    description: asOptionalText(row.学校简介),
    cooperationPrograms: asOptionalText(row.合作项目),
    rawJson: JSON.stringify(row),
  };
}

function toProgram(row: Record<string, unknown>) {
  const schoolName = asText(row.学校中文名);
  const programType = asText(row.项目类型);
  const teachingLanguage = asText(row.授课语言);
  const majorText = asText(row.专业列表);
  const requirementsText = asText(row.申请要求及材料);
  const tuitionText = asText(row.学费);
  const accommodationText = asText(row.住宿费);
  const insuranceText = asText(row.保险费);
  const applicationFeeText = asText(row.自费生申请费);
  const applicationTimeText = asText(row.申请时间说明);
  const parsed = parseProgram({
    tuitionText,
    accommodationText,
    insuranceText,
    applicationFeeText,
    requirementsText,
    applicationTimeText,
    majorText,
    programType,
  });
  const languageName = LANGUAGE_LABELS[teachingLanguage] ?? teachingLanguage;
  const typeName = PROGRAM_TYPE_LABELS[programType] ?? programType;

  return {
    schoolName,
    name: `${schoolName} · ${typeName} · ${languageName}授课`,
    programType,
    tuitionText,
    teachingLanguage,
    tags: asOptionalText(row.标签),
    introduction: asOptionalText(row.项目介绍),
    duration: asOptionalText(row.学制),
    durationNote: asOptionalText(row.学制备注),
    majorText: majorText || null,
    directionText: asOptionalText(row.专业方向),
    requirementsText: requirementsText || null,
    semesterText: asOptionalText(row.学期安排),
    applicationTimeText: applicationTimeText || null,
    scholarshipCategory: asOptionalText(row.奖学金类别),
    scholarshipContent: asOptionalText(row.奖学金内容),
    scholarshipNote: asOptionalText(row.奖学金备注),
    scholarshipDeadlineText: asOptionalText(row.奖学金截止日期),
    accommodationText: accommodationText || null,
    insuranceText: insuranceText || null,
    applicationFeeText: applicationFeeText || null,
    scholarshipApplicationFeeText: asOptionalText(row.奖学金申请费),
    feeNote: asOptionalText(row.费用备注),
    parsed,
    rawJson: JSON.stringify(row),
    fingerprint: createHash("sha256")
      .update(JSON.stringify(row))
      .digest("hex"),
  };
}

export function parseSchoolWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows = sheetRows(workbook, "高校汇总", 0);
  validateHeaders(rows, SCHOOL_HEADERS, "高校汇总");
  const schools = rows.map(toSchool).filter((row) => row.nameZh);
  return { schools, sourceHash: createHash("sha256").update(buffer).digest("hex") };
}

export function parseProgramWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows = sheetRows(workbook, "高校项目", 1);
  validateHeaders(rows, PROGRAM_HEADERS, "高校项目");
  const parsed = rows.map(toProgram).filter((row) => row.schoolName && row.programType);
  const seen = new Set<string>();
  const programs: ProgramImportRow[] = [];
  let duplicates = 0;
  for (const row of parsed) {
    if (seen.has(row.fingerprint)) {
      duplicates += 1;
      continue;
    }
    seen.add(row.fingerprint);
    programs.push(row);
  }
  return {
    programs,
    duplicates,
    sourceHash: createHash("sha256").update(buffer).digest("hex"),
  };
}

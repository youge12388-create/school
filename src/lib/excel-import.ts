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

const SCHOOL_PATCH_FIELDS = [
  "externalId",
  "name",
  "category",
  "province",
  "city",
  "website",
  "qsRanking",
  "rankingInfo",
  "partnershipRating",
  "cscaStatus",
  "tags",
  "description",
  "cooperationPrograms",
  "groupApplicationAccount",
  "scholarshipDisbursementText",
  "collectionServiceText",
  "cooperationDeadlineText",
  "companyRecruitmentQuotaText",
  "schoolRecruitmentPlanText",
  "recruitmentPreferenceText",
  "languageStudentAssessmentText",
  "degreeStudentAssessmentText",
  "cooperationNote",
  "specialCaseNote",
  "applicationUpdateFrequency",
] as const;

const PROGRAM_TYPES = new Set(Object.keys(PROGRAM_TYPE_LABELS));
const TEACHING_LANGUAGES = new Set(Object.keys(LANGUAGE_LABELS));

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
  const cscaStatus: "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN" | null =
    cscaText === "是"
      ? "REQUIRED"
      : cscaText === "否"
        ? "NOT_REQUIRED"
        : cscaText
          ? "UNKNOWN"
          : null;
  return {
    externalId: asOptionalText(row.学校ID),
    nameZh: asText(row.学校中文名),
    name: asOptionalText(row.学校名称),
    category: asOptionalText(row.学校分类),
    province: asOptionalText(row.省份),
    city: asOptionalText(row.城市),
    website: asOptionalText(row.官网),
    qsRanking: asNumber(row.QS排名),
    rankingInfo: asOptionalText(row.排名信息),
    partnershipRating: asNumber(row.合作星级),
    cscaStatus,
    tags: asOptionalText(row.标签),
    description: asOptionalText(row.学校简介),
    cooperationPrograms: asOptionalText(row.合作项目),
    groupApplicationAccount: firstOptionalText(row, "团体申请账号"),
    scholarshipDisbursementText: firstOptionalText(
      row,
      "奖学金发放形式",
      "奖学金发放形式\noffer是否标明",
    ),
    collectionServiceText: firstOptionalText(row, "是否可代收"),
    cooperationDeadlineText: firstOptionalText(row, "合作截止日期", "截止日期"),
    companyRecruitmentQuotaText: firstOptionalText(row, "公司招生名额"),
    schoolRecruitmentPlanText: firstOptionalText(row, "学校招生计划"),
    recruitmentPreferenceText: firstOptionalText(row, "招生偏向"),
    languageStudentAssessmentText: firstOptionalText(
      row,
      "语言生考核",
      "语言生是否面试、笔试",
    ),
    degreeStudentAssessmentText: firstOptionalText(
      row,
      "学历生考核",
      "学历生是否面试、笔试",
    ),
    cooperationNote: firstOptionalText(row, "合作备注"),
    specialCaseNote: firstOptionalText(row, "特殊情况备注"),
    applicationUpdateFrequency: firstOptionalText(
      row,
      "申请更新频率",
      "学校申请更新频率",
    ),
    rawJson: JSON.stringify(row),
  };
}

function compactRecord(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => {
      if (value == null) return false;
      return typeof value !== "string" || value.trim().length > 0;
    }),
  );
}

function firstOptionalText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = asOptionalText(row[key]);
    if (value != null) return value;
  }
  return null;
}

function toProgramSchool(row: Record<string, unknown>) {
  return toSchool(
    compactRecord({
      学校ID: row.学校ID,
      学校中文名: row.学校中文名,
      学校名称: row.学校英文名 ?? row.学校名称,
      学校分类: row.院校分类 ?? row.学校分类,
      城市: row.所在城市 ?? row.城市,
      团体申请账号: row.团体申请账号,
      奖学金发放形式:
        row["奖学金发放形式\noffer是否标明"] ?? row.奖学金发放形式,
      是否可代收: row.是否可代收,
      合作截止日期: row.截止日期 ?? row.合作截止日期,
      公司招生名额: row.公司招生名额,
      学校招生计划: row.学校招生计划,
      招生偏向: row.招生偏向,
      语言生考核: row["语言生是否面试、笔试"] ?? row.语言生考核,
      学历生考核: row["学历生是否面试、笔试"] ?? row.学历生考核,
      合作备注: row.合作备注,
      特殊情况备注: row.特殊情况备注,
      申请更新频率: row.学校申请更新频率 ?? row.申请更新频率,
    }),
  );
}

function mergeSchoolRows(rows: SchoolImportRow[]) {
  const schools = new Map<string, SchoolImportRow>();
  for (const row of rows) {
    if (!row.nameZh) continue;
    const existing = schools.get(row.nameZh);
    if (!existing) {
      schools.set(row.nameZh, row);
      continue;
    }
    const merged = { ...existing };
    const target = merged as unknown as Record<string, unknown>;
    for (const field of SCHOOL_PATCH_FIELDS) {
      const current = existing[field];
      const incoming = row[field];
      if (incoming == null || incoming === "") continue;
      if (current != null && current !== "" && current !== incoming) {
        continue;
      }
      target[field] = incoming;
    }
    target.rawJson = JSON.stringify({
      ...JSON.parse(existing.rawJson),
      ...JSON.parse(row.rawJson),
    });
    schools.set(row.nameZh, merged);
  }
  return [...schools.values()];
}

function normalizeProgramType(value: unknown) {
  const raw = asText(value);
  return PROGRAM_TYPES.has(raw) ? raw : "UNKNOWN";
}

function normalizeTeachingLanguage(value: unknown) {
  const raw = asText(value);
  const normalized = raw.toUpperCase();
  return TEACHING_LANGUAGES.has(normalized) ? normalized : "UNKNOWN";
}

function toProgram(row: Record<string, unknown>) {
  const schoolName = asText(row.学校中文名);
  const rawProgramType = asText(row.项目类型);
  const rawTeachingLanguage = asText(row.授课语言);
  const programType = normalizeProgramType(rawProgramType);
  const teachingLanguage = normalizeTeachingLanguage(rawTeachingLanguage);
  const majorText = asText(row.专业列表);
  const requirementsText = asText(row.申请要求及材料);
  const tuitionText = asText(row.学费);
  const accommodationText = asText(row.住宿费);
  const insuranceText = asText(row.保险费);
  const applicationFeeText = asText(row.自费生申请费);
  const applicationTimeText = asText(row.申请时间说明);
  const parsedResult = parseProgram({
    tuitionText,
    accommodationText,
    insuranceText,
    applicationFeeText,
    requirementsText,
    applicationTimeText,
    majorText,
    programType,
  });
  const formatReviewReasons = [
    !PROGRAM_TYPES.has(rawProgramType)
      ? `项目类型待复核：${rawProgramType || "空白"}`
      : null,
    !TEACHING_LANGUAGES.has(rawTeachingLanguage.toUpperCase())
      ? `授课语言待复核：${rawTeachingLanguage || "空白"}`
      : null,
  ].filter((item): item is string => Boolean(item));
  const parsed = {
    ...parsedResult,
    reviewReasons: [...new Set([...parsedResult.reviewReasons, ...formatReviewReasons])],
  };
  const languageName = LANGUAGE_LABELS[teachingLanguage] ?? teachingLanguage;
  const typeName = PROGRAM_TYPE_LABELS[programType] ?? programType;
  const programSource = compactRecord({
    项目ID: row.项目ID,
    ...Object.fromEntries(PROGRAM_HEADERS.map((header) => [header, row[header]])),
    标签: row.标签,
    项目名称: row.项目名称,
  });

  return {
    externalId: asOptionalText(row.项目ID),
    schoolExternalId: asOptionalText(row.学校ID),
    schoolName,
    rawProgramType,
    name:
      asOptionalText(row.项目名称) ??
      `${schoolName} · ${typeName} · ${languageName}授课`,
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
      .update(JSON.stringify(programSource))
      .digest("hex"),
  };
}

export function parseSchoolWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows = sheetRows(workbook, "高校汇总", 0);
  validateHeaders(rows, SCHOOL_HEADERS, "高校汇总");
  const schools = mergeSchoolRows(rows.map(toSchool));
  return { schools, sourceHash: createHash("sha256").update(buffer).digest("hex") };
}

export function parseProgramWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows = sheetRows(workbook, "高校项目", 1);
  validateHeaders(rows, PROGRAM_HEADERS, "高校项目");
  const schools = mergeSchoolRows(rows.map(toProgramSchool));
  const parsed = rows
    .map(toProgram)
    .filter((row) => row.schoolName && row.rawProgramType);
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

  const externalIds = new Set<string>();
  for (const program of programs) {
    if (!program.externalId) continue;
    if (externalIds.has(program.externalId)) {
      throw new Error(`项目ID重复：${program.externalId}`);
    }
    externalIds.add(program.externalId);
  }

  const businessKeys = new Map<string, ProgramImportRow[]>();
  for (const program of programs) {
    const key = `${program.schoolName}|${program.programType}|${program.teachingLanguage}`;
    const group = businessKeys.get(key) ?? [];
    group.push(program);
    businessKeys.set(key, group);
  }
  for (const [, group] of businessKeys) {
    if (group.length <= 1) continue;
    const needsId = group.some((program) => !program.externalId);
    if (!needsId) continue;
    for (const program of group) {
      if (program.externalId) continue;
      const base = [
        program.schoolName,
        program.programType,
        program.teachingLanguage,
        program.introduction ?? program.majorText ?? program.name,
      ].join("|");
      program.externalId = `auto:${createHash("sha256").update(base).digest("hex").slice(0, 8)}`;
    }
  }

  return {
    schools,
    programs,
    duplicates,
    sourceHash: createHash("sha256").update(buffer).digest("hex"),
  };
}

/** 智能解析：自动尝试高校汇总和高校项目两张表，缺失不报错 */
export function parseImportFile(buffer: Buffer) {
  let schoolResult = { schools: [] as SchoolImportRow[], sourceHash: "" };
  let programResult: ReturnType<typeof parseProgramWorkbook> | null = null;

  try { schoolResult = parseSchoolWorkbook(buffer); } catch { /* 无高校汇总表 */ }
  try { programResult = parseProgramWorkbook(buffer); } catch { /* 无高校项目表 */ }

  if (!schoolResult.schools.length && !programResult) {
    throw new Error("文件中未找到高校汇总或高校项目工作表");
  }
  return { schoolResult, programResult };
}

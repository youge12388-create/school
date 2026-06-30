import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/lib/db/migration";
import { openRawDatabase } from "@/lib/db/raw";
import {
  parseProgramWorkbook,
  parseSchoolWorkbook,
} from "@/lib/excel-import";
import {
  confirmImport,
  createImportPreview,
  createManualEntry,
} from "@/lib/import-service";

const SCHOOL_HEADERS = [
  "学校中文名", "学校名称", "学校分类", "省份", "城市", "官网", "QS排名",
  "排名信息", "合作星级", "CSCA", "标签", "LogoID", "CoverID", "学校简介", "合作项目",
];

const PROGRAM_HEADERS = [
  "学校中文名", "项目类型", "学费", "授课语言", "标签", "项目介绍", "学制", "学制备注",
  "专业列表", "专业方向", "申请要求及材料", "学期安排", "申请时间说明", "奖学金类别",
  "奖学金内容", "奖学金备注", "奖学金截止日期", "住宿费", "保险费", "自费生申请费",
  "奖学金申请费", "费用备注",
];

function workbookBuffer(sheetName: string, rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return Buffer.from(XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
}

function schoolWorkbook(schoolName = "测试大学") {
  return workbookBuffer("高校汇总", [
    SCHOOL_HEADERS,
    [
      schoolName, "Test University", "综合类", "广东省", "深圳市", "https://example.edu",
      300, "QS 300", 4, "是", "合作院校", "", "", "测试学校简介", "本科项目",
    ],
  ]);
}

function programRow(schoolName = "测试大学", tuitionText = "30000 元/年") {
  return [
    schoolName, "UG", tuitionText, "ENGLISH", "重点项目", "项目介绍", "4 年", "",
    "软件工程；人工智能", "计算机", "要求 CSCA，雅思 6.0，GPA 80/100", "秋季学期",
    "2099年5月31日截止", "校长奖学金", "减免学费", "", "2099年4月30日",
    "8000 元/年", "800 元/年", "400 元", "", "以学校通知为准",
  ];
}

function programWorkbook(rows = [programRow()]) {
  return workbookBuffer("高校项目", [["高校项目维护表"], PROGRAM_HEADERS, ...rows]);
}

let testDir: string;
let databaseFile: string;
let importDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "school-syt-import-"));
  databaseFile = join(testDir, "test.db");
  importDir = join(testDir, "imports");
  migrateDatabase(databaseFile);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("Excel import", () => {
  it("预览后在事务中写入学校、项目和专业索引", () => {
    const preview = createImportPreview(
      {
        schoolBuffer: schoolWorkbook(),
        schoolName: "schools.xlsx",
        programBuffer: programWorkbook(),
        programName: "programs.xlsx",
      },
      { databaseFile, importDir },
    );

    expect(preview.summary.schools.NEW).toBe(1);
    expect(preview.summary.programs.NEW).toBe(1);
    expect(preview.summary.sourceDuplicates).toBe(0);

    confirmImport(preview.batchId, null, { databaseFile });

    const database = openRawDatabase(databaseFile);
    const program = database.prepare(
      `SELECT s.name_zh AS school_name, p.major_text, p.tuition_max,
              p.ielts_min, p.review_status
       FROM programs p JOIN schools s ON s.id = p.school_id`,
    ).get() as Record<string, unknown>;
    const majors = database.prepare(
      "SELECT name FROM program_majors ORDER BY name",
    ).all() as Array<{ name: string }>;
    const batch = database.prepare(
      "SELECT status FROM import_batches WHERE id = ?",
    ).get(preview.batchId) as { status: string };
    database.close();

    expect(program).toMatchObject({
      school_name: "测试大学",
      major_text: "软件工程；人工智能",
      tuition_max: 30000,
      ielts_min: 6,
      review_status: "AUTO_PARSED",
    });
    expect(majors.map((item) => item.name)).toEqual(["人工智能", "软件工程"]);
    expect(batch.status).toBe("CONFIRMED");
  });

  it("拒绝缺少必需表头的工作簿", () => {
    const invalid = workbookBuffer("高校汇总", [["学校中文名"], ["测试大学"]]);
    expect(() => parseSchoolWorkbook(invalid)).toThrow("高校汇总缺少字段");
  });

  it("过滤源文件中的完全重复项目", () => {
    const parsed = parseProgramWorkbook(programWorkbook([programRow(), programRow()]));
    expect(parsed.programs).toHaveLength(1);
    expect(parsed.duplicates).toBe(1);
  });
});

describe("manual entry", () => {
  const input = {
    schoolNameZh: "手工录入大学",
    schoolName: "Manual Entry University",
    province: "广东省",
    city: "深圳市",
    qsRanking: "500",
    partnershipRating: "3",
    programType: "UG",
    teachingLanguage: "ENGLISH",
    majorText: "软件工程；人工智能",
    tuitionText: "32000 元/年",
    requirementsText: "要求 CSCA，雅思 6.5，GPA 80/100",
    applicationTimeText: "2099年5月31日截止",
    accommodationText: "9000 元/年",
  };

  it("写入可搜索字段、专业索引、人工保护标记和审计日志", () => {
    const result = createManualEntry(input, null, databaseFile);
    const database = openRawDatabase(databaseFile);
    const row = database.prepare(
      `SELECT s.name_zh AS school_name, p.name, p.major_text, p.tuition_max,
              p.ielts_min, p.manually_verified, p.review_status
       FROM programs p JOIN schools s ON s.id = p.school_id`,
    ).get() as Record<string, unknown>;
    const majors = database.prepare(
      "SELECT name FROM program_majors ORDER BY name",
    ).all() as Array<{ name: string }>;
    const audit = database.prepare(
      "SELECT action, entity_id FROM audit_logs",
    ).get() as { action: string; entity_id: string };
    database.close();

    expect(result.createdSchool).toBe(true);
    expect(row).toMatchObject({
      school_name: "手工录入大学",
      name: "手工录入大学 · 本科 · 英文授课",
      major_text: "软件工程；人工智能",
      tuition_max: 32000,
      ielts_min: 6.5,
      manually_verified: 1,
      review_status: "VERIFIED",
    });
    expect(majors.map((item) => item.name)).toEqual(["人工智能", "软件工程"]);
    expect(audit).toEqual({
      action: "MANUAL_PROGRAM_CREATED",
      entity_id: result.programId,
    });
  });

  it("Excel 导入不会覆盖手工录入项目", () => {
    const manual = createManualEntry(input, null, databaseFile);
    const preview = createImportPreview(
      {
        schoolBuffer: schoolWorkbook(input.schoolNameZh),
        schoolName: "schools.xlsx",
        programBuffer: programWorkbook([
          programRow(input.schoolNameZh, "99000 元/年"),
        ]),
        programName: "programs.xlsx",
      },
      { databaseFile, importDir },
    );

    expect(preview.summary.schools.CONFLICT).toBe(1);
    expect(preview.summary.programs.CONFLICT).toBe(1);
    confirmImport(preview.batchId, null, { databaseFile });

    const database = openRawDatabase(databaseFile);
    const program = database.prepare(
      "SELECT tuition_max, manually_verified FROM programs WHERE id = ?",
    ).get(manual.programId) as { tuition_max: number; manually_verified: number };
    database.close();
    expect(program).toEqual({ tuition_max: 32000, manually_verified: 1 });
  });

  it("拒绝重复项目并回滚写入", () => {
    createManualEntry(input, null, databaseFile);
    expect(() => createManualEntry(input, null, databaseFile)).toThrow(
      "该学校已存在相同项目类型和授课语言的项目",
    );

    const database = openRawDatabase(databaseFile);
    const count = database.prepare("SELECT COUNT(*) AS count FROM programs").get() as {
      count: number;
    };
    database.close();
    expect(count.count).toBe(1);
  });

  it("缺少学校中文名时拒绝录入", () => {
    expect(() => createManualEntry({}, null, databaseFile)).toThrow("请填写学校中文名");
  });

  it("只填写学校中文名也可以录入待补充项目", () => {
    const result = createManualEntry(
      { schoolNameZh: "待补充大学" },
      null,
      databaseFile,
    );
    const database = openRawDatabase(databaseFile);
    const program = database.prepare(
      `SELECT name, program_type, teaching_language, review_status,
              manually_verified
       FROM programs WHERE id = ?`,
    ).get(result.programId) as Record<string, unknown>;
    database.close();

    expect(program).toEqual({
      name: "待补充大学 · 项目类型待补充 · 授课语言待补充",
      program_type: "UNKNOWN",
      teaching_language: "UNKNOWN",
      review_status: "NEEDS_REVIEW",
      manually_verified: 1,
    });
  });
});

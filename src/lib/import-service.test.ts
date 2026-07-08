import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

const SCHOOL_COOPERATION_HEADERS = [
  "团体申请账号", "奖学金发放形式", "是否可代收", "合作截止日期", "公司招生名额",
  "学校招生计划", "招生偏向", "语言生考核", "学历生考核", "合作备注", "特殊情况备注",
  "申请更新频率",
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

const ENRICHED_PROGRAM_HEADERS = [
  "学校ID",
  "项目ID",
  "院校分类",
  "学校中文名",
  "学校英文名",
  "所在城市",
  ...PROGRAM_HEADERS.filter((header) => header !== "学校中文名" && header !== "标签"),
  ...SCHOOL_COOPERATION_HEADERS,
];

function enrichedProgramWorkbook(
  overrides: Array<Record<string, unknown>> = [{}],
) {
  const base: Record<string, unknown> = {
    学校ID: "school-1",
    项目ID: "program-1",
    院校分类: "综合类",
    学校中文名: "新增大学",
    学校英文名: "New University",
    所在城市: "深圳市",
    项目类型: "UG",
    学费: "30000 元/年",
    授课语言: "English",
    项目介绍: "项目介绍",
    学制: "4 年",
    专业列表: "软件工程",
    申请要求及材料: "要求 CSCA，雅思 6.0",
    申请时间说明: "2099年5月31日截止",
    团体申请账号: "√",
    奖学金发放形式: "offer 标明",
    是否可代收: "可代收",
    合作截止日期: "2026-12-31",
    公司招生名额: "20",
    学校招生计划: "计划招收 50 人",
    招生偏向: "优秀生源",
    语言生考核: "面试",
    学历生考核: "笔试",
    合作备注: "可签署合作协议",
    特殊情况备注: "无",
    申请更新频率: "每月",
  };
  const rows = overrides.map((override) => {
    const row = { ...base, ...override };
    return ENRICHED_PROGRAM_HEADERS.map((header) => row[header] ?? "");
  });
  return workbookBuffer(
    "高校项目",
    [["高校项目汇总-中文版"], ENRICHED_PROGRAM_HEADERS, ...rows],
  );
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

  it("项目表可补充学校合作字段", () => {
    const preview = createImportPreview(
      {
        schoolBuffer: schoolWorkbook("新增大学"),
        schoolName: "schools.xlsx",
        programBuffer: enrichedProgramWorkbook(),
        programName: "enriched-programs.xlsx",
      },
      { databaseFile, importDir },
    );

    expect(preview.summary.schools.NEW).toBe(1);
    expect(preview.summary.programs.NEW).toBe(1);
    confirmImport(preview.batchId, null, { databaseFile });

    const database = openRawDatabase(databaseFile);
    const row = database
      .prepare(
        `SELECT s.external_id AS school_external_id,
                s.name_zh AS school_name,
                s.name AS school_english_name,
                s.category,
                s.city,
                s.group_application_account,
                s.scholarship_disbursement_text,
                s.collection_service_text,
                s.cooperation_deadline_text,
                s.company_recruitment_quota_text,
                s.school_recruitment_plan_text,
                s.recruitment_preference_text,
                s.language_student_assessment_text,
                s.degree_student_assessment_text,
                s.cooperation_note,
                s.special_case_note,
                s.application_update_frequency,
                p.external_id AS program_external_id,
                p.teaching_language,
                p.review_status
         FROM schools s
         JOIN programs p ON p.school_id = s.id`,
      )
      .get() as Record<string, unknown>;
    database.close();

    expect(row).toMatchObject({
      school_external_id: "school-1",
      school_name: "新增大学",
      school_english_name: "New University",
      category: "综合类",
      city: "深圳市",
      group_application_account: "√",
      scholarship_disbursement_text: "offer 标明",
      collection_service_text: "可代收",
      cooperation_deadline_text: "2026-12-31",
      company_recruitment_quota_text: "20",
      school_recruitment_plan_text: "计划招收 50 人",
      recruitment_preference_text: "优秀生源",
      language_student_assessment_text: "面试",
      degree_student_assessment_text: "笔试",
      cooperation_note: "可签署合作协议",
      special_case_note: "无",
      application_update_frequency: "每月",
      program_external_id: "program-1",
      teaching_language: "ENGLISH",
      review_status: "AUTO_PARSED",
    });
  });

  it("同校同类型同语言的多个项目缺项目ID时自动生成合成ID", () => {
    const workbook = enrichedProgramWorkbook([
      { 项目ID: "", 项目介绍: "预科项目" },
      { 项目ID: "", 项目介绍: "汉语进修项目" },
    ]);
    const parsed = parseProgramWorkbook(workbook);
    expect(parsed.programs).toHaveLength(2);
    expect(parsed.programs.every((program) => program.externalId?.startsWith("auto:"))).toBe(true);
    expect(parsed.programs[0]?.externalId).not.toBe(parsed.programs[1]?.externalId);
  });

  it("仅上传高校汇总也可导入学校", () => {
    const preview = createImportPreview(
      {
        schoolBuffer: schoolWorkbook("独立大学"),
        schoolName: "schools.xlsx",
      },
      { databaseFile, importDir },
    );

    expect(preview.summary.schools.NEW).toBe(1);
    expect(preview.summary.programs.NEW).toBe(0);
    expect(preview.summary.sourceDuplicates).toBe(0);
    confirmImport(preview.batchId, null, { databaseFile });

    const database = openRawDatabase(databaseFile);
    const school = database
      .prepare("SELECT name_zh, category FROM schools WHERE name_zh = ?")
      .get("独立大学") as { name_zh: string; category: string };
    const programCount = database
      .prepare("SELECT COUNT(*) AS count FROM programs")
      .get() as { count: number };
    database.close();

    expect(school).toEqual({ name_zh: "独立大学", category: "综合类" });
    expect(programCount.count).toBe(0);
  });

  it("高校汇总表可直接导入全部 12 个合作字段", () => {
    const headers = [...SCHOOL_HEADERS, ...SCHOOL_COOPERATION_HEADERS];
    const values = [
      "合作字段大学", "Cooperation University", "综合类", "广东省", "深圳市",
      "https://coop.edu", 200, "QS 200", 5, "是", "985,211", "", "",
      "学校简介", "本科项目",
      "√", "offer 标明", "可代收", "2026-12-31", "30", "计划招收 100 人",
      "优秀生源", "面试", "笔试", "可签署合作协议", "无", "每月",
    ];
    const buffer = workbookBuffer("高校汇总", [headers, values]);
    const preview = createImportPreview(
      { schoolBuffer: buffer, schoolName: "coop-schools.xlsx" },
      { databaseFile, importDir },
    );

    expect(preview.summary.schools.NEW).toBe(1);
    confirmImport(preview.batchId, null, { databaseFile });

    const database = openRawDatabase(databaseFile);
    const school = database
      .prepare(
        `SELECT group_application_account, scholarship_disbursement_text,
                collection_service_text, cooperation_deadline_text,
                company_recruitment_quota_text, school_recruitment_plan_text,
                recruitment_preference_text, language_student_assessment_text,
                degree_student_assessment_text, cooperation_note,
                special_case_note, application_update_frequency
         FROM schools WHERE name_zh = ?`,
      )
      .get("合作字段大学") as Record<string, unknown>;
    database.close();

    expect(school).toEqual({
      group_application_account: "√",
      scholarship_disbursement_text: "offer 标明",
      collection_service_text: "可代收",
      cooperation_deadline_text: "2026-12-31",
      company_recruitment_quota_text: "30",
      school_recruitment_plan_text: "计划招收 100 人",
      recruitment_preference_text: "优秀生源",
      language_student_assessment_text: "面试",
      degree_student_assessment_text: "笔试",
      cooperation_note: "可签署合作协议",
      special_case_note: "无",
      application_update_frequency: "每月",
    });
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
    groupApplicationAccount: "√",
    scholarshipDisbursementText: "offer 标明",
    collectionServiceText: "可代收",
    cooperationDeadlineText: "2026-12-31",
    companyRecruitmentQuotaText: "30",
    schoolRecruitmentPlanText: "计划招收 100 人",
    recruitmentPreferenceText: "优秀生源",
    languageStudentAssessmentText: "面试",
    degreeStudentAssessmentText: "笔试",
    cooperationNote: "可签署合作协议",
    specialCaseNote: "无",
    applicationUpdateFrequency: "每月",
  };

  it("写入可搜索字段、专业索引、人工保护标记和审计日志", () => {
    const result = createManualEntry(input, null, databaseFile);
    const database = openRawDatabase(databaseFile);
    const row = database.prepare(
      `SELECT s.name_zh AS school_name,
              s.group_application_account, s.scholarship_disbursement_text,
              s.collection_service_text, s.cooperation_deadline_text,
              s.company_recruitment_quota_text, s.school_recruitment_plan_text,
              s.recruitment_preference_text, s.language_student_assessment_text,
              s.degree_student_assessment_text, s.cooperation_note,
              s.special_case_note, s.application_update_frequency,
              p.name, p.major_text, p.tuition_max,
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
      group_application_account: "√",
      scholarship_disbursement_text: "offer 标明",
      collection_service_text: "可代收",
      cooperation_deadline_text: "2026-12-31",
      company_recruitment_quota_text: "30",
      school_recruitment_plan_text: "计划招收 100 人",
      recruitment_preference_text: "优秀生源",
      language_student_assessment_text: "面试",
      degree_student_assessment_text: "笔试",
      cooperation_note: "可签署合作协议",
      special_case_note: "无",
      application_update_frequency: "每月",
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


  it("筛选池排除已归档学校的项目", () => {
    createManualEntry(input, null, databaseFile);
    const database = openRawDatabase(databaseFile);
    database.prepare("UPDATE schools SET archived = 1 WHERE name_zh = ?").run(input.schoolNameZh);
    const rows = database
      .prepare(`SELECT p.id
        FROM programs p
        INNER JOIN schools s ON s.id = p.school_id
        WHERE p.archived = 0 AND s.archived = 0`)
      .all();
    database.close();

    expect(rows).toHaveLength(0);
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

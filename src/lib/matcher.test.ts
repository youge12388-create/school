import { describe, expect, it } from "vitest";

import {
  evaluateProgram,
  getEffectiveDeadlineStatus,
  getSupervisorAcceptanceStatus,
  majorMatches,
  rankPrograms,
  type MatchProgram,
} from "./matcher";

const now = new Date("2026-06-25T00:00:00+08:00");

const baseProgram: MatchProgram = {
  id: "p1",
  schoolId: "s1",
  schoolName: "测试大学",
  programName: "测试大学 · 本科 · 英文授课",
  programType: "UG",
  teachingLanguage: "ENGLISH",
  majorText: "软件工程\n人工智能",
  requirementsText: "申请人须为非中国籍，雅思 6.0，GPA 80/100，年龄不超过 30 岁",
  sourceText: null,
  semesterText: "2027 年秋季入学",
  applicationTimeText: "申请截止日期为 2027年5月31日",
  accommodationText: "校内住宿 8000 元/年",
  firstYearCostMax: 40000,
  costIncomplete: false,
  cscaStatus: "REQUIRED",
  gpaMin: 80,
  gpaScale: 100,
  hskLevelMin: null,
  hskScoreMin: null,
  ieltsMin: 6,
  toeflMin: 80,
  duolingoMin: 100,
  minAge: null,
  maxAge: 30,
  deadlineDate: new Date("2027-05-31T23:59:59+08:00"),
  deadlineStatus: "OPEN",
  scholarshipCategory: "校长奖学金",
  province: "广东省",
  city: "深圳市",
  partnershipRating: 4,
  qsRanking: 300,
  reviewStatus: "AUTO_PARSED",
};

function makeProgram(overrides: Partial<MatchProgram> = {}): MatchProgram {
  return { ...baseProgram, ...overrides };
}

describe("screening matcher", () => {
  it("通过专业同义词匹配", () => {
    expect(majorMatches("计算机", baseProgram.majorText)).toBe(true);
  });

  it("没有 CSCA 时标记需补而非直接排除", () => {
    const result = evaluateProgram(
      baseProgram,
      {
        targetMajor: "计算机",
        hasCsca: false,
        teachingLanguage: "ENGLISH",
        ielts: 6.5,
        budget: 50000,
      },
      now,
    );
    expect(result.fitLevel).toBe("NEEDS_ACTION");
    expect(result.evidence).toContainEqual({
      label: "CSCA",
      level: "NEED",
      detail: "需要补充 CSCA",
    });
  });

  it("不同 GPA 计分制进入人工复核", () => {
    const result = evaluateProgram(baseProgram, { gpa: 3.5, gpaScale: 4 }, now);
    expect(result.evidence).toContainEqual({
      label: "GPA",
      level: "UNKNOWN",
      detail: "计分制不同，需要人工复核",
    });
  });

  it("学历不符合的项目仍保留并显示原因", () => {
    const results = rankPrograms(
      [baseProgram, makeProgram({ id: "p2", programType: "MASTER" })],
      { programType: "UG" },
      now,
    );
    expect(results).toHaveLength(2);
    expect(results.find((item) => item.program.id === "p2")?.fitLevel).toBe(
      "NOT_MATCHED",
    );
  });

  it("年龄超过项目上限时明确不符合", () => {
    const result = evaluateProgram(baseProgram, { age: 35 }, now);
    expect(result.fitLevel).toBe("NOT_MATCHED");
    expect(result.evidence).toContainEqual({
      label: "年龄",
      level: "FAIL",
      detail: "35 岁，超过最高年龄 30 岁",
    });
  });

  it("筛选时修正历史数据中只有最高年龄却误存最低年龄的问题", () => {
    const program = makeProgram({
      requirementsText: "申请人年龄不超过 35 岁。",
      minAge: 35,
      maxAge: 35,
    });

    const result = evaluateProgram(program, { age: 24 }, now);

    expect(result.fitLevel).toBe("MATCHED");
    expect(result.evidence).toContainEqual({
      label: "年龄",
      level: "PASS",
      detail: "24 岁，符合最高 35 岁",
    });
  });
  it("省市名称忽略省和市后缀", () => {
    const result = evaluateProgram(
      baseProgram,
      { province: "广东", city: "深圳" },
      now,
    );
    expect(result.evidence).toContainEqual({
      label: "地区",
      level: "PASS",
      detail: "广东省 · 深圳市",
    });
  });

  it("截止日期根据当前时间动态判断", () => {
    const program = makeProgram({
      deadlineDate: new Date("2025-12-31T23:59:59+08:00"),
      deadlineStatus: "OPEN",
    });
    expect(getEffectiveDeadlineStatus(program, now)).toBe("EXPIRED");
    expect(evaluateProgram(program, {}, now).fitLevel).toBe("NEEDS_ACTION");
  });

  it("截止日期超出筛选范围时展示不符合原因", () => {
    const result = evaluateProgram(
      baseProgram,
      { deadlineFrom: new Date("2027-06-01T00:00:00+08:00") },
      now,
    );
    expect(result.fitLevel).toBe("NOT_MATCHED");
    expect(result.evidence.find((item) => item.label === "申请截止")?.detail).toContain(
      "早于筛选范围",
    );
  });

  it("外国国籍满足明确的非中国籍要求", () => {
    const result = evaluateProgram(baseProgram, { nationality: "泰国" }, now);
    expect(result.evidence).toContainEqual({
      label: "国籍",
      level: "PASS",
      detail: "项目要求外国公民，客户国籍符合",
    });
  });

  it("缺少住宿信息时保留项目并标记未知", () => {
    const result = evaluateProgram(
      makeProgram({ accommodationText: null }),
      { accommodationRequired: true },
      now,
    );
    expect(result.fitLevel).toBe("UNKNOWN");
    expect(result.evidence).toContainEqual({
      label: "住宿",
      level: "UNKNOWN",
      detail: "数据库未有相关信息",
    });
  });

  it("入学年份在项目文本中出现时判定通过", () => {
    const result = evaluateProgram(baseProgram, { intakeYear: 2027 }, now);
    expect(result.evidence).toContainEqual({
      label: "入学年份",
      level: "PASS",
      detail: "项目文本包含 2027 年",
    });
  });

  it("排序按可直接申请、未知、明确不符合排列", () => {
    const matched = makeProgram({ id: "matched", reviewStatus: "VERIFIED" });
    const unknown = makeProgram({
      id: "unknown",
      deadlineDate: null,
      deadlineStatus: "UNKNOWN",
    });
    const failed = makeProgram({ id: "failed", programType: "MASTER" });
    const results = rankPrograms(
      [failed, unknown, matched],
      { programType: "UG" },
      now,
    );
    expect(results.map((item) => item.program.id)).toEqual([
      "matched",
      "unknown",
      "failed",
    ]);
  });

  it("截止状态筛选只保留所选状态", () => {
    const expired = makeProgram({
      id: "expired",
      deadlineDate: new Date("2025-01-01T00:00:00+08:00"),
    });
    const results = rankPrograms(
      [baseProgram, expired],
      { deadlineMode: "expired" },
      now,
    );
    expect(results.map((item) => item.program.id)).toEqual(["expired"]);
  });

  it("无效截止日期归入信息未知且不会抛错", () => {
    const program = makeProgram({
      deadlineDate: new Date("invalid"),
      deadlineStatus: "OPEN",
    });
    expect(getEffectiveDeadlineStatus(program, now)).toBe("UNKNOWN");
    const result = evaluateProgram(program, {}, now);
    expect(result.fitLevel).toBe("UNKNOWN");
    expect(result.evidence).toContainEqual({
      label: "申请截止",
      level: "UNKNOWN",
      detail: "数据库未有相关信息",
    });
  });

  it("detects school-required supervisor acceptance letter", () => {
    const program = makeProgram({
      programType: "MASTER",
      requirementsText: "申请材料包括导师接收函、成绩单和语言成绩。",
    });
    const result = evaluateProgram(
      program,
      { programType: "MASTER", supervisorAcceptance: "required" },
      now,
    );
    expect(getSupervisorAcceptanceStatus(program)).toBe("REQUIRED");
    expect(result.fitLevel).toBe("MATCHED");
    expect(result.evidence).toContainEqual({
      label: "导师接收函",
      level: "PASS",
      detail: "学校申请条件明确要求导师接收函",
    });
  });

  it("detects common supervisor acceptance wording variants", () => {
    const variants = [
      "在线申请系统中选择专业时选择导师，并取得导师审核通过。",
      "博士申请人应提供导师邀请函等录取材料。",
      "申请材料包含《意向导师推荐信》。",
      "Applicants must submit a supervisor invitation letter.",
      "Applicants should provide pre-acceptance approval from an advisor.",
    ];

    for (const requirementsText of variants) {
      const program = makeProgram({ programType: "MASTER", requirementsText });

      expect(getSupervisorAcceptanceStatus(program)).toBe("REQUIRED");
    }
  });

  it("keeps mixed supervisor requirements as partial required", () => {
    const program = makeProgram({
      programType: "MASTER",
      requirementsText:
        "以下院系须在报名前取得导师接收意向函：航空学院；其他学院硕士项目申请，导师接收函为非必需文件。",
    });

    const result = evaluateProgram(
      program,
      { programType: "MASTER", supervisorAcceptance: "required" },
      now,
    );

    expect(getSupervisorAcceptanceStatus(program)).toBe("PARTIAL_REQUIRED");
    expect(result.fitLevel).toBe("NEEDS_ACTION");
    expect(result.evidence).toContainEqual({
      label: "导师接收函",
      level: "NEED",
      detail: "部分学院或专业要求导师接收函，需确认目标专业",
    });
  });

  it("detects supervisor intention form as required", () => {
    const program = makeProgram({
      programType: "MASTER",
      requirementsText:
        "《浙江工商大学导师接收国际学生意向表》原则上，硕士和博士项目申请者应向导师提供该表格填写并提交。",
    });

    expect(getSupervisorAcceptanceStatus(program)).toBe("REQUIRED");
  });

  it("detects explicit supervisor acceptance letter exemption", () => {
    const program = makeProgram({
      programType: "MASTER",
      requirementsText: "无需提前联系导师，不需要导师接收函。",
    });
    const result = evaluateProgram(
      program,
      { programType: "MASTER", supervisorAcceptance: "not_required" },
      now,
    );
    expect(getSupervisorAcceptanceStatus(program)).toBe("NOT_REQUIRED");
    expect(result.evidence).toContainEqual({
      label: "导师接收函",
      level: "PASS",
      detail: "学校申请条件明确不要求导师接收函",
    });
  });

  it("明确竞赛层级要求未达到时判定不符合", () => {
    const program = makeProgram({
      requirementsText: "申请人须提供国家级学科竞赛获奖证书。",
    });

    const result = evaluateProgram(program, { hasCompetition: "competition" }, now);

    expect(result.fitLevel).toBe("NOT_MATCHED");
    expect(result.evidence).toContainEqual({
      label: "竞赛经历",
      level: "FAIL",
      detail: "项目要求至少达到国家级竞赛",
    });
  });

  it("可选竞赛加分项缺失时不淘汰项目", () => {
    const program = makeProgram({
      requirementsText: "如有国家级学科竞赛获奖证书，可作为加分材料。",
    });

    const result = evaluateProgram(program, { hasCompetition: "competition" }, now);

    expect(result.fitLevel).toBe("MATCHED");
    expect(result.evidence.some((item) => item.label === "竞赛经历")).toBe(false);
  });

  it("客户具备学校重视的软性条件时提高排序", () => {
    const relevant = makeProgram({
      id: "sat-relevant",
      requirementsText: "可提交 SAT/AP/ACT 等标准化考试成绩作为补充材料。",
    });
    const unmentioned = makeProgram({
      id: "sat-unmentioned",
      requirementsText: "申请人须为非中国籍。",
    });

    const results = rankPrograms(
      [unmentioned, relevant],
      { hasPaperPatent: "general" },
      now,
    );

    expect(results.map((item) => item.program.id)).toEqual([
      "sat-relevant",
      "sat-unmentioned",
    ]);
    expect(results[0].evidence).toContainEqual({
      label: "SAT",
      level: "PASS",
      detail: "客户已具备；项目将此项作为可选或加分材料",
    });
  });

  it("知识库未写明软性条件时不制造未知结论", () => {
    const result = evaluateProgram(
      makeProgram({ requirementsText: "申请人须为非中国籍。" }),
      { hasCompetition: "competition" },
      now,
    );

    expect(result.fitLevel).toBe("MATCHED");
    expect(result.evidence.some((item) => item.label === "志愿者经历")).toBe(false);
  });
});

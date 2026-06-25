import { describe, expect, it } from "vitest";

import { evaluateProgram, majorMatches, type MatchProgram } from "./matcher";

const baseProgram: MatchProgram = {
  id: "p1",
  schoolName: "测试大学",
  programType: "UG",
  teachingLanguage: "ENGLISH",
  majorText: "软件工程\n人工智能",
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
  deadlineDate: new Date("2027-05-31"),
  deadlineStatus: "OPEN",
  scholarshipCategory: null,
  province: "广东省",
  city: "深圳市",
  partnershipRating: 4,
  qsRanking: 300,
  reviewStatus: "AUTO_PARSED",
};

describe("screening matcher", () => {
  it("通过专业同义词匹配", () => {
    expect(majorMatches("计算机", baseProgram.majorText)).toBe(true);
  });

  it("没有 CSCA 时标记需补而非直接排除", () => {
    const result = evaluateProgram(baseProgram, {
      targetMajor: "计算机",
      hasCsca: false,
      teachingLanguage: "ENGLISH",
      ielts: 6.5,
      budget: 50000,
    });
    expect(result.fitLevel).toBe("NEEDS_ACTION");
    expect(result.evidence).toContainEqual({
      label: "CSCA",
      level: "NEED",
      detail: "需要补充 CSCA",
    });
  });

  it("不同 GPA 计分制进入人工复核", () => {
    const result = evaluateProgram(baseProgram, { gpa: 3.5, gpaScale: 4 });
    expect(result.evidence).toContainEqual({
      label: "GPA",
      level: "UNKNOWN",
      detail: "计分制不同，需要人工复核",
    });
  });
});



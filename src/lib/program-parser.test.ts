import { describe, expect, it } from "vitest";

import {
  parseDeadline,
  parseMoneyRange,
  parseProgram,
  splitMajors,
} from "./program-parser";

describe("program parser", () => {
  it("将学期费用折算为年度上限", () => {
    expect(parseMoneyRange("2400-8000元/学期", "tuition")).toEqual({
      min: 2400,
      max: 8000,
      period: "SEMESTER",
      annualMax: 16000,
    });
  });

  it("将未写明 CSCA 的本科项目保持为 UNKNOWN", () => {
    const result = parseProgram({
      tuitionText: "26000元/年",
      accommodationText: "600元/月",
      insuranceText: "800元/年",
      applicationFeeText: "400元",
      requirementsText: "高中毕业，HSK4级180分",
      applicationTimeText: "2027年5月31日",
      majorText: "计算机科学\n工商管理",
      programType: "UG",
    });
    expect(result.cscaStatus).toBe("UNKNOWN");
    expect(result.firstYearCostMax).toBe(34400);
    expect(result.hskLevelMin).toBe(4);
    expect(result.hskScoreMin).toBe(180);
  });

  it("解析明确的 CSCA 要求和语言门槛", () => {
    const result = parseProgram({
      tuitionText: "30000元/年",
      accommodationText: "",
      insuranceText: "",
      applicationFeeText: "",
      requirementsText:
        "须参加来华留学本科入学学业水平测试（CSCA），雅思6.0，托福80，多邻国100",
      applicationTimeText: "",
      majorText: "",
      programType: "UG",
    });
    expect(result.cscaStatus).toBe("REQUIRED");
    expect(result.ieltsMin).toBe(6);
    expect(result.toeflMin).toBe(80);
    expect(result.duolingoMin).toBe(100);
  });

  it("选择多批次中的最晚截止日期", () => {
    const result = parseDeadline(
      "第一批：2026年3月20日；第二批：2026年5月31日",
      new Date("2026-01-01"),
    );
    expect(result.date?.getMonth()).toBe(4);
    expect(result.date?.getDate()).toBe(31);
  });

  it("拆分并去重专业", () => {
    expect(splitMajors("计算机科学\n工商管理\n计算机科学")).toEqual([
      "计算机科学",
      "工商管理",
    ]);
  });
});

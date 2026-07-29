import { describe, expect, it } from "vitest";

import {
  parseAgeRequirement,
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

  it("不会把其他材料的否定条件误判为 CSCA 不要求", () => {
    const result = parseProgram({
      tuitionText: "24000元/年",
      accommodationText: "16200元/年",
      insuranceText: "800元/年",
      applicationFeeText: "400元",
      requirementsText: [
        "需要参加《来华留学本科入学学业水平测试》CSCA",
        "如果在中学阶段接受过中文学历教育，一般不需要提供HSK成绩",
        "报名材料：CSCA考试成绩",
      ].join("\n"),
      applicationTimeText: "2026年9月30日",
      majorText: "法学",
      programType: "UG",
    });

    expect(result.cscaStatus).toBe("REQUIRED");
  });

  it("只在否定词明确指向 CSCA 时判定为不要求", () => {
    const result = parseProgram({
      tuitionText: "24000元/年",
      accommodationText: "",
      insuranceText: "",
      applicationFeeText: "",
      requirementsText: "CSCA成绩可免提交",
      applicationTimeText: "",
      majorText: "法学",
      programType: "UG",
    });

    expect(result.cscaStatus).toBe("NOT_REQUIRED");
  });

  it("区分最低年龄、最高年龄和年龄范围", () => {
    expect(parseAgeRequirement("申请人年龄不超过 35 岁")).toEqual({
      minAge: null,
      maxAge: 35,
    });
    expect(parseAgeRequirement("申请人必须满 18 岁")).toEqual({
      minAge: 18,
      maxAge: null,
    });
    expect(parseAgeRequirement("年龄要求为 18-25 岁")).toEqual({
      minAge: 18,
      maxAge: 25,
    });
    expect(parseAgeRequirement("申请人年龄须在 35 岁以下")).toEqual({
      minAge: null,
      maxAge: 35,
    });
  });

  it("选择多批次中的最晚截止日期", () => {
    const result = parseDeadline(
      "第一批：2026年3月20日；第二批：2026年5月31日",
      new Date("2026-01-01"),
    );
    expect(result.date?.getMonth()).toBe(4);
    expect(result.date?.getDate()).toBe(31);
  });

  it("月日范围取结束日期为截止日期（深圳大学）", () => {
    const result = parseDeadline(
      "1月1日-3月20日（第一批）；3月20日-5月31日（第二批）",
      new Date("2026-01-01"),
    );
    expect(result.date?.getMonth()).toBe(4); // 5月
    expect(result.date?.getDate()).toBe(31);
    expect(result.status).toBe("OPEN");
  });

  it("跨年范围结束日期推到次年（沈阳化工大学）", () => {
    const result = parseDeadline(
      "秋季学期：3月15日-7月15日；春季学期：10月15日-1月15日",
      new Date("2026-01-01"),
    );
    expect(result.date?.getFullYear()).toBe(2027);
    expect(result.date?.getMonth()).toBe(0); // 1月
    expect(result.date?.getDate()).toBe(15);
    expect(result.status).toBe("OPEN");
  });

  it("独立月日日期保持原有逻辑", () => {
    const result = parseDeadline(
      "截止日期：8月15日",
      new Date("2026-01-01"),
    );
    expect(result.date?.getMonth()).toBe(7); // 8月
    expect(result.date?.getDate()).toBe(15);
    expect(result.status).toBe("OPEN");
  });

  it("拆分并去重专业", () => {
    expect(splitMajors("计算机科学\n工商管理\n计算机科学")).toEqual([
      "计算机科学",
      "工商管理",
    ]);
  });
});


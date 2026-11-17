import { describe, expect, it } from "vitest";
import { admissionGroupLabel, outcomeSummary, summarizePoints } from "./ai-screening-presentation";
import type { ScreeningResponse } from "./ai-screening-events";

describe("选校结果的重点展示", () => {
  it("优先呈现专业和预算，学生缺少必要考试时先提醒", () => {
    const result = summarizePoints([
      { label: "申请学历", level: "PASS", text: "有本科项目" },
      { label: "申请截止", level: "UNKNOWN", text: "申请截止时间尚未确认" },
      { label: "CSCA", level: "NEED", text: "学校要求 CSCA，学生目前还没有" },
      { label: "首年预算", level: "PASS", text: "在预算内" },
      { label: "专业", level: "PASS", text: "专业匹配" },
    ]);
    expect(result.highlights.map((point) => point.text)).toEqual(["专业匹配", "在预算内"]);
    expect(result.firstConcern?.text).toContain("CSCA");
    expect(result.concerns).toHaveLength(2);
  });
  it("名单没有候选院校时给出清楚结论", () => {
    const result: ScreeningResponse = { criteria: {}, source: "名单", partnerConfigured: false, otherRequested: false, sensitiveContext: false, prompt: "", results: { confirmed: [], pending: [], other: [], otherHidden: false } };
    expect(outcomeSummary(result)).toBe("合作名单中暂未找到符合条件的院校。");
    expect(outcomeSummary({ ...result, source: "2027春季招生院校名单.xlsx" })).toBe("合作名单中暂未找到符合条件的院校。");
  });
  it("清楚区分春季招生名单与知识库院校", () => {
    expect(admissionGroupLabel("2027春季招生院校名单.xlsx", "partner")).toBe("2027 年春季招生名单中的合作院校");
    expect(admissionGroupLabel("2027春季招生院校名单.xlsx", "other")).toBe("院校知识库");
    expect(admissionGroupLabel("C:/资料/2026-11/2027春季招生院校名单.xlsx", "partner")).toBe("2027 年春季招生名单中的合作院校");
    expect(admissionGroupLabel("招生院校名单.xlsx", "partner")).toBe("招生名单中的合作院校");
  });
  it("截止日期即使通过筛选，也要作为待确认信息展示", () => {
    const result = summarizePoints([
      { label: "专业", level: "PASS", text: "专业匹配" },
      { label: "申请截止", level: "PASS", text: "库内截止日期为 2027/4/20，需确认适用批次" },
    ]);
    expect(result.highlights.map((point) => point.text)).toEqual(["专业匹配"]);
    expect(result.firstConcern?.text).toContain("需确认适用批次");
  });
});

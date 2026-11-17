import { describe, expect, it } from "vitest";
import { admissionGroupLabel, comparisonCards, latestSaveableResultIndex, outcomeSummary, presentedProgramIds, presentedSchoolNames, summarizePoints } from "./ai-screening-presentation";
import type { ResultCard } from "./ai-screening";
import type { ScreeningResponse } from "./ai-screening-events";

function card(name: string, programId?: string, kind: ResultCard["kind"] = "project"): ResultCard {
  return {
    name,
    schoolId: `school-${name}`,
    programId,
    program: kind === "project" ? `${name} · 计算机硕士` : "招生名单院校",
    fit: "条件待核实",
    kind,
    cooperation: "listed",
    evidence: [],
    points: [],
    sources: [],
    warning: [],
    yellow: false,
    image: false,
  };
}

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
  it("收集全部结果分组的已展示院校，避免展开依据后重复推荐", () => {
    const result: ScreeningResponse = {
      criteria: {},
      source: "名单",
      partnerConfigured: false,
      otherRequested: true,
      sensitiveContext: false,
      prompt: "",
      results: {
        confirmed: [card("甲大学", "p1")],
        pending: [card("乙大学", "p2"), card("乙大学", "p2")],
        other: [card("丙大学", "p3"), card("丁大学")],
        otherHidden: false,
      },
    };

    expect(presentedProgramIds(result)).toEqual(["p1", "p2", "p3"]);
    expect(presentedSchoolNames(result)).toEqual(["甲大学", "乙大学", "丙大学", "丁大学"]);
  });
  it("并排对比只使用本轮叙事实际展示的候选", () => {
    const result: ScreeningResponse = {
      criteria: {},
      source: "名单",
      partnerConfigured: false,
      otherRequested: false,
      sensitiveContext: false,
      prompt: "",
      results: {
        confirmed: [card("甲大学", "p1"), card("乙大学", "p2")],
        pending: [card("丙大学", "p3")],
        other: [],
        otherHidden: false,
      },
      narrative: {
        lead: "",
        highlights: [
          { name: "丙大学", programId: "p3", group: "partner", body: "", attention: false, notCooperating: false },
          { name: "甲大学", programId: "p1", group: "partner", body: "", attention: false, notCooperating: false },
        ],
      },
    };

    expect(comparisonCards(result).map((item) => item.name)).toEqual(["丙大学", "甲大学"]);
  });
  it("没有叙事高亮时按当前结果顺序对比，并合并同名院校", () => {
    const result: ScreeningResponse = {
      criteria: {},
      source: "名单",
      partnerConfigured: false,
      otherRequested: true,
      sensitiveContext: false,
      prompt: "",
      results: {
        confirmed: [card("甲大学", "p1")],
        pending: [card("乙大学", "p2")],
        other: [card("丙大学", "p3"), card("丙大学", "p4")],
        otherHidden: false,
      },
    };

    expect(comparisonCards(result).map((item) => item.name)).toEqual(["丙大学", "甲大学", "乙大学"]);
  });
  it("追问返回空结果时仍保留最近一轮可保存方案", () => {
    const withCandidates: ScreeningResponse = {
      criteria: {},
      source: "名单",
      partnerConfigured: false,
      otherRequested: false,
      sensitiveContext: false,
      prompt: "",
      results: { confirmed: [card("甲大学", "p1")], pending: [], other: [], otherHidden: false },
    };
    const noNewCandidates: ScreeningResponse = {
      ...withCandidates,
      otherRequested: true,
      results: { confirmed: [], pending: [], other: [], otherHidden: false },
    };

    expect(latestSaveableResultIndex([{ result: withCandidates }, { result: noNewCandidates }])).toBe(0);
    expect(latestSaveableResultIndex([{ result: noNewCandidates }])).toBe(-1);
  });
});

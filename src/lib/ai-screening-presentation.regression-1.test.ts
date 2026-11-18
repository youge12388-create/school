import { describe, expect, it } from "vitest";

import type { ResultCard } from "./ai-screening";
import type { ScreeningResponse } from "./ai-screening-events";
import { presentedProgramIds, presentedSchoolNames } from "./ai-screening-presentation";

function candidate(name: string, programId: string): ResultCard {
  return {
    name, schoolId: name, programId, program: "计算机硕士", fit: "条件待核实",
    kind: "project", cooperation: "listed", evidence: [], points: [], sources: [],
    warning: [], yellow: false, image: false,
  };
}

// Regression: ISSUE-001 — hidden candidates must remain available for a later search.
// Found by end-to-end QA on 2026-11-18.
describe("记录实际展示的选校结果", () => {
  const result: ScreeningResponse = {
    criteria: {}, source: "测试名单.xlsx", partnerConfigured: false,
    otherRequested: false, sensitiveContext: false, prompt: "",
    results: {
      confirmed: [candidate("甲大学", "p1"), candidate("乙大学", "p2"), candidate("丙大学", "p3"), candidate("丁大学", "p4")],
      pending: [candidate("甲大学", "p5")], other: [], otherHidden: false,
    },
    shown: { programIds: ["p1", "p2", "p3"], schoolNames: ["甲大学", "乙大学", "丙大学"] },
  };

  it("只排除本轮展示的三所学校及项目，保留未展示的第四所", () => {
    expect(presentedProgramIds(result)).toEqual(["p1", "p2", "p3"]);
    expect(presentedSchoolNames(result)).toEqual(["甲大学", "乙大学", "丙大学"]);
  });

  it("仅回答追问时不把折叠在依据里的候选视为已展示", () => {
    const answer: ScreeningResponse = {
      ...result, shown: undefined, answer: { lead: "请核实语言要求。", details: [] },
    };
    expect(presentedProgramIds(answer)).toEqual([]);
    expect(presentedSchoolNames(answer)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import type { ChatCriteria, ResultCard } from "./ai-screening";
import type { ScreeningResponse } from "./ai-screening-events";
import { togglePlanCandidate } from "./ai-screening-plan";

function candidate(programId: string, quality: ResultCard["quality"] = "candidate"): ResultCard {
  return {
    programId, name: "示例院校", program: "示例院校 · 计算机硕士",
    kind: "project", fit: "条件待核实", cooperation: "listed", quality,
    points: [], evidence: [], sources: [], warning: [], yellow: false, image: false,
  };
}

function origin(criteria: ChatCriteria, other: ResultCard[] = [], source = "招生名单.xlsx") {
  return { criteria, source, results: { confirmed: [], pending: [], other, otherHidden: false } } satisfies
    Pick<ScreeningResponse, "criteria" | "source" | "results">;
}

describe("选校方案草稿", () => {
  it("同一筛查条件下跨轮加入项目，保留关联客户、顺序和知识库来源", () => {
    const initial = togglePlanCandidate(null, candidate("p1"), origin({ programType: "MASTER", budget: 80000 }), "demo").draft!;
    const extra = candidate("p2");
    const appended = togglePlanCandidate(initial, extra, origin({ budget: 80000, programType: "MASTER", hskLevel: null }, [extra]), "").draft!;
    expect(appended.customerId).toBe("demo");
    expect(appended.items.map(({ programId, requiresOtherResults }) => [programId, requiresOtherResults])).toEqual([["p1", false], ["p2", true]]);
    expect(togglePlanCandidate(appended, extra, origin(appended.criteria), "").draft!.items.map((item) => item.programId)).toEqual(["p1"]);
  });

  it("保留旧草稿，阻止混合不同条件、不同名单和资料不足的项目", () => {
    const criteria = { programType: "MASTER", hasCsca: false } as const;
    const initial = togglePlanCandidate(null, candidate("p1"), origin(criteria), "demo").draft!;
    for (const result of [origin({ programType: "MASTER" }), origin(criteria, [], "更新名单.xlsx")]) {
      const rejected = togglePlanCandidate(initial, candidate("p2"), result, "");
      expect(rejected.error).toBe(true);
      expect(rejected.draft).toBe(initial);
    }
    expect(togglePlanCandidate(initial, candidate("p3", "insufficient"), origin(criteria), "").error).toBe(true);
  });
});

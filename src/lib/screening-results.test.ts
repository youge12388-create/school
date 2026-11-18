import { describe, expect, it } from "vitest";

import type { FitLevel, RankedProgram } from "./matcher";
import { isScreeningPlanEligible, parseMajorItems, partitionScreeningResults } from "./screening-results";

function makeResult(
  id: string,
  fitLevel: FitLevel,
  effectiveDeadlineStatus: RankedProgram["effectiveDeadlineStatus"],
): RankedProgram {
  return {
    program: { id } as RankedProgram["program"],
    evidence: [],
    fitLevel,
    score: 0,
    effectiveDeadlineStatus,
  };
}

describe("screening result presentation", () => {
  it("only current or verifiable projects can be saved to a plan", () => {
    expect(isScreeningPlanEligible(makeResult("matched", "MATCHED", "OPEN"))).toBe(true);
    expect(isScreeningPlanEligible(makeResult("needs-action", "NEEDS_ACTION", "OPEN"))).toBe(true);
    expect(isScreeningPlanEligible(makeResult("unknown", "UNKNOWN", "UNKNOWN"))).toBe(true);
    expect(isScreeningPlanEligible(makeResult("expired", "MATCHED", "EXPIRED"))).toBe(false);
    expect(isScreeningPlanEligible(makeResult("not-matched", "NOT_MATCHED", "OPEN"))).toBe(false);
  });

  it("keeps expired not-matched projects only in the collapsed not-matched group", () => {
    const expiredNotMatched = makeResult("expired-not-matched", "NOT_MATCHED", "EXPIRED");
    const expiredMatched = makeResult("expired-matched", "MATCHED", "EXPIRED");
    const currentNeedsAction = makeResult("current-needs-action", "NEEDS_ACTION", "OPEN");

    const groups = partitionScreeningResults([
      expiredNotMatched,
      expiredMatched,
      currentNeedsAction,
    ]);

    expect(groups.notMatched.map((result) => result.program.id)).toEqual([
      "expired-not-matched",
    ]);
    expect(groups.expired.map((result) => result.program.id)).toEqual([
      "expired-matched",
    ]);
    expect(groups.currentByFit.NEEDS_ACTION.map((result) => result.program.id)).toEqual([
      "current-needs-action",
    ]);
  });

  it("turns line and semicolon separated majors into unique horizontal items", () => {
    expect(parseMajorItems("国际商务\n金融学；国际商务; 会计学")).toEqual([
      "国际商务",
      "金融学",
      "会计学",
    ]);
    expect(parseMajorItems(null)).toEqual([]);
  });
});

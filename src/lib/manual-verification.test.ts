import { describe, expect, it } from "vitest";

import { isManualVerificationChecked, manualReviewState } from "./manual-verification";

describe("人工核实状态", () => {
  it("只有明确勾选才标记为已核实", () => {
    const checked = new FormData();
    checked.set("verified", "on");
    expect(isManualVerificationChecked(checked, "verified")).toBe(true);
    expect(manualReviewState(checked, "verified")).toEqual({
      manuallyVerified: true,
      reviewStatus: "VERIFIED",
    });

    const unchecked = new FormData();
    expect(manualReviewState(unchecked, "verified")).toEqual({
      manuallyVerified: false,
      reviewStatus: "NEEDS_REVIEW",
    });
  });
});

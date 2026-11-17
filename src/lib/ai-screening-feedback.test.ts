import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ sqlite: {} }));

import { screeningFeedbackScores } from "./ai-screening-feedback";

describe("选校反馈排序", () => {
  it("同一项目保留最新反馈，并区分正负权重", () => {
    const scores = screeningFeedbackScores([
      {
        entityId: "p1",
        detailsJson: JSON.stringify({ value: "not_relevant" }),
        createdAt: 1,
      },
      {
        entityId: "p1",
        detailsJson: JSON.stringify({ value: "relevant" }),
        createdAt: 2,
      },
      {
        entityId: "p2",
        detailsJson: JSON.stringify({ value: "not_relevant" }),
        createdAt: 3,
      },
      {
        entityId: "p3",
        detailsJson: "not-json",
        createdAt: 4,
      },
    ]);
    expect(scores.get("p1")).toBe(1);
    expect(scores.get("p2")).toBe(-1);
    expect(scores.has("p3")).toBe(false);
  });
});

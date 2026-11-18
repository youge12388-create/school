import { describe, expect, it } from "vitest";

import {
  screeningConcernLabels,
  screeningFollowUpContent,
  screeningFollowUpDueAt,
} from "./screening-follow-up-task";

describe("选校自动跟进草稿", () => {
  it("只提取待核实标签，不把依据原文写入跟进记录", () => {
    const evidence = JSON.stringify([
      { label: "专业", level: "PASS", detail: "计算机" },
      { label: "申请截止", level: "UNKNOWN", detail: "内部截止资料未核实" },
      { label: "合作状态", level: "NEED", detail: "学校不招某国籍" },
      { label: "内部注意事项", level: "NEED", detail: "敏感原文" },
    ]);
    expect(screeningConcernLabels(evidence)).toEqual([
      "申请截止",
      "合作状态",
    ]);
    const content = screeningFollowUpContent({
      recommendationId: "plan-1",
      title: "2027 春季方案",
      items: [
        {
          schoolName: "示例大学",
          programName: "计算机硕士",
          evidenceJson: evidence,
        },
      ],
    });
    expect(content).toContain("示例大学（计算机硕士）的申请截止、合作状态");
    expect(content).toContain("方案编号：plan-1");
    expect(content).not.toContain("内部截止资料");
    expect(content).not.toContain("某国籍");
  });

  it("临近截止时提前一天，其余默认三天后跟进", () => {
    const now = new Date("2026-11-17T02:00:00.000Z");
    expect(
      screeningFollowUpDueAt(
        [now.getTime() + 2 * 86_400_000, null],
        now,
      ),
    ).toBe(now.getTime() + 86_400_000);
    expect(
      screeningFollowUpDueAt(
        [now.getTime() + 20 * 86_400_000, null],
        now,
      ),
    ).toBe(now.getTime() + 3 * 86_400_000);
  });

  it("长项目名被截短时保留完整方案编号，便于找回关联任务", () => {
    const note = screeningFollowUpContent({
      recommendationId: "long-plan-id",
      title: "测试跟进",
      items: [{
        schoolName: "示例学校".repeat(150),
        programName: "英文项目".repeat(150),
        evidenceJson: "[]",
      }],
    });
    expect(note.length).toBeLessThanOrEqual(600);
    expect(note.endsWith("方案编号：long-plan-id")).toBe(true);
  });

  it("证据损坏或为空时仍生成可执行的默认核实任务", () => {
    expect(screeningConcernLabels("{bad json")).toEqual([]);
    const content = screeningFollowUpContent({
      recommendationId: "plan-2",
      title: "备选方案",
      items: [
        {
          schoolName: "示例学院",
          programName: "本科项目",
          evidenceJson: "{}",
        },
      ],
    });
    expect(content).toContain("招生批次、最新费用和申请截止");
  });
});

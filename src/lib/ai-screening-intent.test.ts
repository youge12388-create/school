import { describe, expect, it, vi } from "vitest";

import { extractScreeningIntent } from "./ai-screening-intent";

function response(content: string, finishReason = "stop") {
  return Response.json({
    choices: [{ finish_reason: finishReason, message: { content } }],
  });
}

describe("AI 选校意图解析", () => {
  it("把模型结果和服务端已有条件合并", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      response(
        JSON.stringify({
          criteria: { budget: 100000, intakeSeason: null },
          intent: "search",
        }),
      ),
    );
    const result = await extractScreeningIntent(
      {
        message: "预算提高到 10 万",
        criteria: {
          programType: "MASTER",
          targetMajor: "计算机",
          budget: 80000,
          intakeSeason: "SPRING",
        },
        history: [],
        hasPrevious: true,
      },
      { apiKey: "fixture-key", fetchImpl },
    );
    expect(result.criteria).toMatchObject({
      programType: "MASTER",
      targetMajor: "计算机",
      budget: 100000,
      intakeSeason: "SPRING",
    });
    expect(result.intent).toBe("search");
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.messages[0].content).toContain("不能推测");
    expect(body.messages[1].content).toContain("预算提高到 10 万");
  });

  it("缺少密钥、返回非 JSON 或被截断时给出可重试错误", async () => {
    await expect(
      extractScreeningIntent(
        {
          message: "想读硕士",
          criteria: {},
          history: [],
          hasPrevious: false,
        },
        { apiKey: "" },
      ),
    ).rejects.toThrow("尚未配置 DeepSeek");

    await expect(
      extractScreeningIntent(
        {
          message: "想读硕士",
          criteria: {},
          history: [],
          hasPrevious: false,
        },
        {
          apiKey: "fixture-key",
          fetchImpl: vi.fn(async () => response("not-json")),
        },
      ),
    ).rejects.toThrow("格式错误");

    await expect(
      extractScreeningIntent(
        {
          message: "想读硕士",
          criteria: {},
          history: [],
          hasPrevious: false,
        },
        {
          apiKey: "fixture-key",
          fetchImpl: vi.fn(async () => response('{"criteria":{}', "length")),
        },
      ),
    ).rejects.toThrow("不完整");
  });
});

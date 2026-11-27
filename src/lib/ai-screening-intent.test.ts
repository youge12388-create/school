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

  it("模型误判闲聊时，只要条件变化或用户明确要求其他院校就按检索处理", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            criteria: { hasCsca: false },
            intent: "chat",
            reply: "好的。",
          }),
        ),
      )
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            criteria: { programType: "MASTER" },
            intent: "chat",
            showOther: false,
            reply: "好的。",
          }),
        ),
      );
    const changed = await extractScreeningIntent(
      {
        message: "我还没有 CSCA",
        criteria: { programType: "UG" },
        history: [],
        hasPrevious: true,
      },
      { apiKey: "fixture-key", fetchImpl },
    );
    expect(changed).toMatchObject({ intent: "search", criteria: { hasCsca: false } });

    const more = await extractScreeningIntent(
      {
        message: "还有其他的吗",
        criteria: { programType: "MASTER" },
        history: [],
        hasPrevious: true,
      },
      { apiKey: "fixture-key", fetchImpl },
    );
    expect(more).toMatchObject({ intent: "search", showOther: true });
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
    ).rejects.toThrow("尚未配置 AI API");

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

  it("支持长筛选条件解析、数组字段容错归一化、未知键剥离及强制开关兜底", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      response(
        JSON.stringify({
          criteria: {
            programType: "UG",
            teachingLanguage: "ENGLISH",
            targetMajors: "国际关系/外交/全球治理",
            cities: "上海",
            targetSchools: ["复旦大学", "华东政法大学"],
            gpa: 4.83,
            gpaScale: 5,
            intakeYear: 2027,
            intakeSeason: "AUTUMN",
            plannedExams: "CSCA数学(2026年11月)、雅思目标7.0(2026年11月)",
            unexpectedExtraField: "should be stripped cleanly",
          },
          intent: "search",
        }),
      ),
    );
    const result = await extractScreeningIntent(
      {
        message: "申请人只考虑位于上海的提供英语授课学士学位的公立大学。国际关系/外交/全球治理（如复旦大学、ECUPL）。直接2027年9月进入1年级（没有预科年）。GPA 4.83/5.0，计划考CSCA和雅思7.0，区分Reach/Target/Safe并过滤纯自费。",
        criteria: {},
        history: [],
        hasPrevious: false,
      },
      { apiKey: "fixture-key", fetchImpl },
    );
    expect(result.intent).toBe("search");
    expect(result.criteria).toMatchObject({
      programType: "UG",
      teachingLanguage: "ENGLISH",
      targetMajors: ["国际关系", "外交", "全球治理"],
      cities: ["上海"],
      targetSchools: ["复旦大学", "华东政法大学"],
      publicOnly: true,
      noFoundation: true,
      excludeSelfFunded: true,
      wantTiering: true,
      gpa: 4.83,
      gpaScale: 5,
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { anonymousNarrativeInput, chooseNarrativeFocus, createAdvisorExplanation, createNarrative, shownNarrativeCards } from "./ai-screening-narrative";
import type { ResultCard } from "./ai-screening";
import type { ScreeningResponse } from "./ai-screening-events";

function card(name: string, group: "listed" | "unknown" = "listed"): ResultCard {
  return {
    name, schoolId: `private-id-${name}`, program: "内部项目名称", cooperation: group, fit: "条件待核实", kind: "project", comparableCost: 37000,
    points: [
      { label: "申请学历", level: "PASS", text: "有硕士项目" },
      { label: "专业", level: "PASS", text: "专业信息中包含“计算机”" },
      { label: "首年预算", level: "PASS", text: "约 37000 元，在预算内" },
      { label: "入学季", level: "UNKNOWN", text: "入学季信息不足，暂时无法判断" },
      { label: "国籍", level: "NEED", text: "内部限制原文" },
    ],
    evidence: ["内部原始记录"], sources: ["内部来源 第 3 行"], warning: ["敏感信息，需人工核实：某类学生限制"], yellow: false, image: false,
  };
}
function response(): ScreeningResponse {
  const other = card("其他乙大学", "unknown");
  other.points = other.points.map((point) => point.label === "入学季" ? { ...point, level: "PASS", text: "项目资料列有春季入学" } : point);
  return {
    criteria: { programType: "MASTER", targetMajor: "计算机", budget: 80000, intakeYear: 2027, intakeSeason: "SPRING" },
    results: { confirmed: [], pending: [card("合作甲大学")], other: [other], otherHidden: false },
    source: "内部春季名单.xlsx", partnerConfigured: false, otherRequested: false, sensitiveContext: false, prompt: "",
  };
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("有依据的自然回答", () => {
  it("模型只接收匿名编号与条件类型，不接收学校、内部信息、金额或学生原始条件", () => {
    const payload = JSON.stringify(anonymousNarrativeInput(response()));
    expect(payload).toContain('"slot":"A"');
    expect(payload).toContain("MAJOR");
    for (const value of ["合作甲大学", "其他乙大学", "内部", "限制", "国籍", "计算机", "37000", "80000", "2027", "private-id"]) expect(payload).not.toContain(value);
  });
  it("以自然语言先解释合作候选，再列其他院校，明确未知项和下一步", () => {
    const answer = createNarrative(response(), { selections: [{ slot: "A", reasons: ["MAJOR", "BUDGET"], caution: "INTAKE" }] });
    expect(answer.lead).toContain("我优先查了春季招生名单");
    expect(answer.lead).toContain("1 所合作院校可以先核对");
    expect(answer.lead).toContain("知识库另补了 1 所候选");
    expect(answer.highlights.map((item) => item.name)).toEqual(["合作甲大学", "其他乙大学"]);
    expect(answer.highlights[0].body).toContain("计算机");
    expect(answer.highlights[0].body).toContain("37,000 元");
    expect(answer.highlights[0].body).toContain("2027 年春季是否开班还没有确认");
    expect(answer.highlights[0].attention).toBe(true);
    expect(JSON.stringify(answer)).not.toContain("某类学生限制");
    expect(answer.next).toBeUndefined();
  });
  it("模型即使选择不存在的匹配项，也只使用服务器已有证据", () => {
    const answer = createNarrative(response(), { selections: [{ slot: "A", reasons: ["SCHOLARSHIP"], caution: "AGE" }] });
    expect(answer.highlights[0].body).not.toContain("奖学金");
    expect(answer.highlights[0].body).not.toContain("年龄");
    expect(answer.highlights[0].body).toContain("计算机");
  });
  it("模型从匿名候选中挑选和排序，但服务端始终保持合作优先与已确认优先", () => {
    const value = response();
    const a = { ...card("合作甲大学"), programId: "a" }, b = { ...card("合作乙大学"), programId: "b" }, c = { ...card("合作丙大学"), programId: "c" }, d = { ...card("其他丁大学", "unknown"), programId: "d" };
    value.results.pending = [a, b, c];
    value.results.other = [d];
    const ordered = { selections: (["D", "C", "B", "A"] as const).map((slot) => ({ slot, reasons: ["MAJOR" as const], caution: "INTAKE" as const })) };
    const narrative = createNarrative(value, ordered);
    expect(narrative.highlights.map((item) => item.programId)).toEqual(["c", "b", "a"]);
    expect(shownNarrativeCards(value, ["c", "b", "d"]).map((item) => item.name)).toEqual(["合作丙大学", "合作乙大学", "其他丁大学"]);
    value.results.confirmed = [a]; value.results.pending = [b, c]; value.results.other = [];
    expect(createNarrative(value, ordered).highlights.map((item) => item.programId)).toEqual(["a", "c", "b"]);
  });
  it("模型组织解释，服务端只替换本候选的已核验依据", () => {
    const answer = createNarrative(response(), { selections: [{ slot: "A", reasons: ["MAJOR", "BUDGET"], caution: "INTAKE", text: "这所可以先重点联系：{{M1}}，{{M2}}。不过，{{N1}}，建议先向学校核实再推进。", verified: true }] });
    expect(answer.highlights[0].body).toContain("建议先向学校核实再推进");
    expect(answer.highlights[0].body).toContain("计算机");
    expect(answer.highlights[0].body).toContain("37,000 元");
    expect(answer.highlights[0].body).toContain("2027 年春季是否开班还没有确认");
  });
  it("模型增加无依据的承诺、使用错误编号或遗漏关键入学风险时使用本地依据降级", () => {
    for (const text of ["{{M2}}，保证录取。不过，{{N1}}。", "{{M8}}。不过，{{N1}}。", "{{M2}}，可以先了解。", "{{M1}}，全部条件都已满足。不过，{{N1}}。", "{{M1}}，具体费用为四万元。不过，{{N1}}。", "{{M1}}。不过，{{N1}}，无需核实。", "{{M1}}，{{M2}}，语言和学位背景也对得上。不过，{{N1}}。", "{{M1}}，语言成绩符合要求。不过，{{N1}}。", "{{M1}}，预算余量比较舒服。不过，{{N1}}。"]) {
      const answer = createNarrative(response(), { selections: [{ slot: "A", reasons: ["MAJOR"], caution: "INTAKE", text, verified: true }] });
      expect(answer.highlights[0].body).not.toContain("保证录取");
      expect(answer.highlights[0].body).not.toContain("学位背景");
      expect(answer.highlights[0].body).not.toContain("语言成绩符合要求");
      expect(answer.highlights[0].body).toContain("计算机");
      expect(answer.highlights[0].body).toContain("2027 年春季是否开班还没有确认");
    }
  });
  it("用户明确指定春季时，即使模型选了其他风险也不能遗漏入学季未知", () => {
    const value = response();
    value.results.pending[0].points.push({ label: "申请截止", level: "NEED", text: "库内截止日期已过，需核实新的招生批次" });
    const answer = createNarrative(value, { selections: [{ slot: "A", reasons: ["MAJOR"], caution: "DEADLINE" }] });
    expect(answer.highlights[0].body).toContain("春季是否开班还没有确认");
    expect(answer.highlights[0].body).toContain("截止时间已过");
  });
  it("模型遗漏已过截止日期时，仍须同时提示截止风险和目标入学季未知", () => {
    const value = response();
    value.results.pending[0].points.push({ label: "申请截止", level: "NEED", text: "库内截止日期已过，需核实新的招生批次" });
    const candidate = anonymousNarrativeInput(value).candidates[0];
    expect(candidate.required.filter((id) => id.startsWith("N"))).toHaveLength(2);
    const intake = candidate.evidence.find((item) => item.category === "INTAKE" && item.id.startsWith("N"))!.id;
    const answer = createNarrative(value, { selections: [{ slot: "A", reasons: ["MAJOR"], caution: "INTAKE", text: `{{M1}}。不过，{{${intake}}}。`, verified: true }] });
    expect(answer.highlights[0].body).toContain("春季是否开班还没有确认");
    expect(answer.highlights[0].body).toContain("截止时间已过");
  });
  it("提供授课语言和语言成绩时，回答须引用各自依据，不把未知成绩说成达标", () => {
    const value = response();
    value.criteria.teachingLanguage = "ENGLISH"; value.criteria.ielts = 6.5;
    value.results.pending[0].points.push({ label: "授课语言", level: "PASS", text: "项目为英文授课" }, { label: "英语", level: "PASS", text: "至少一项英语成绩达到要求" });
    const answer = createNarrative(value, null).highlights[0].body;
    expect(answer).toContain("专业方向、授课语言和至少一项英语成绩与项目的已知条件相符");
    value.results.pending[0].points = value.results.pending[0].points.map((point) => point.label === "英语" ? { ...point, level: "UNKNOWN", text: "英语信息不足，暂时无法判断" } : point);
    const unknown = createNarrative(value, null).highlights[0].body;
    expect(unknown).toContain("项目的英语成绩要求尚未明确");
    expect(unknown).not.toContain("现有英语成绩达到");
  });
  it("将已确认的专业、语言和成绩合并解释，避免机械重复；未知项仍单独提示", () => {
    const value = response();
    value.criteria.teachingLanguage = "ENGLISH"; value.criteria.ielts = 6.5;
    value.results.pending[0].points.push({ label: "授课语言", level: "PASS", text: "项目为英文授课" }, { label: "英语", level: "PASS", text: "至少一项英语成绩达到要求" });
    const first = anonymousNarrativeInput(value).candidates[0];
    expect(first.required).toContain("C1");
    expect(JSON.stringify(first)).not.toContain("计算机");
    const answer = createNarrative(value, { selections: [{ slot: "A", reasons: ["MAJOR", "BUDGET"], caution: "INTAKE", text: "这所可以重点联系：{{C1}}，{{M2}}。不过，{{N1}}，建议先核实批次再推进。", verified: true }] });
    expect(answer.highlights[0].body).toContain("专业方向、授课语言和至少一项英语成绩与项目的已知条件相符");
    expect(answer.highlights[0].body).toContain("37,000 元");
    expect(answer.highlights[0].body).toContain("春季是否开班还没有确认");
    expect(answer.highlights[0].body).toContain("建议先核实批次再推进");
  });
  it("所有候选有相同的已知匹配时只在开头总结一次，各校突出费用与风险", () => {
    const value = response();
    value.criteria.teachingLanguage = "ENGLISH"; value.criteria.ielts = 6.5;
    value.results.pending = [card("合作甲大学"), card("合作乙大学")]; value.results.other = [];
    for (const item of value.results.pending) item.points.push({ label: "授课语言", level: "PASS", text: "项目为英文授课" }, { label: "英语", level: "PASS", text: "至少一项英语成绩达到要求" });
    const input = anonymousNarrativeInput(value);
    expect(input.sharedCore).toBe(true);
    expect(input.sharedIntake).toBe(true);
    expect(input.candidates[0].required).not.toContain("C1");
    expect(input.candidates[0].required).not.toContain("N1");
    const answer = createNarrative(value, { selections: [{ slot: "A", reasons: ["BUDGET"], caution: "INTAKE", text: "可以先联系：{{M2}}。", verified: true }] });
    expect(answer.lead).toContain("共同匹配计算机方向、英文授课和英语成绩");
    expect(answer.lead).toContain("\n共同匹配");
    expect(answer.lead).toContain("2027 年春季是否开班还需确认");
    expect(answer.highlights[0].body).toContain("37,000 元");
    expect(answer.highlights[0].body).toContain("可以先联系");
    expect(answer.highlights[0].body).not.toContain("2027 年");
    expect(answer.highlights[0].body).not.toContain("授课语言");
    expect(answer.highlights[1].body).not.toContain("英语成绩");
    value.results.pending[1].points = value.results.pending[1].points.map((point) => point.label === "英语" ? { ...point, level: "UNKNOWN", text: "英语信息不足，暂时无法判断" } : point);
    expect(anonymousNarrativeInput(value).sharedCore).toBe(false);
    expect(createNarrative(value, null).lead).not.toContain("英语成绩达到");
    value.results.pending[1].points = value.results.pending[1].points.map((point) => point.label === "入学季" ? { ...point, level: "PASS", text: "项目资料列有春季入学" } : point);
    expect(anonymousNarrativeInput(value).sharedIntake).toBe(false);
    expect(createNarrative(value, null).lead).not.toContain("是否开班仍需确认");
  });
  it("选出的学校共享条件而候选池不同时，重新生成不重复的说明并保持排序", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    const value = response();
    value.criteria.teachingLanguage = "ENGLISH"; value.criteria.ielts = 6.5;
    value.results.pending = [card("合作甲大学"), card("合作乙大学"), card("未展示大学")];
    value.results.other = [card("其他丁大学", "unknown")];
    for (const item of [...value.results.pending, ...value.results.other]) item.points.push({ label: "授课语言", level: "PASS", text: "项目为英文授课" }, { label: "英语", level: "PASS", text: "至少一项英语成绩达到要求" });
    value.results.other[0].points = value.results.other[0].points.filter((point) => point.label !== "英语");
    expect(anonymousNarrativeInput(value).sharedCore).toBe(false);
    const initial = { selections: (["A", "B", "C", "D"] as const).map((slot) => ({ slot, reasons: ["BUDGET"], caution: "INTAKE" })) };
    const rewrites = { selections: (["A", "B", "C"] as const).map((slot) => ({ slot, reasons: ["需要核实"], caution: "请确认批次", text: "可以继续了解：{{M2}}。" })) };
    const reviews = { reviews: (["A", "B", "C"] as const).map((slot) => ({ slot, grounded: true })) };
    const reply = (value: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(initial)).mockResolvedValueOnce(reply(rewrites)).mockResolvedValueOnce(reply(reviews));
    vi.stubGlobal("fetch", fetchMock);
    const plan = await chooseNarrativeFocus(value, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const answer = createNarrative(value, plan);
    expect(answer.lead).toContain("共同匹配计算机方向、英文授课和英语成绩");
    expect(answer.highlights.map((item) => item.name)).toEqual(["合作甲大学", "合作乙大学", "未展示大学"]);
    expect(answer.highlights[0].body).toContain("可以继续了解");
    expect(answer.highlights[0].body).not.toContain("授课语言");
    for (const [, options] of fetchMock.mock.calls) expect(String(options?.body)).not.toContain("合作甲大学");
  });
  it("无候选时如实说明，可选项目不足三所时用其他院校补齐", () => {
    const empty = response();
    empty.results = { confirmed: [], pending: [], other: [], otherHidden: false };
    expect(createNarrative(empty, null).lead).toContain("暂时没有找到");
    const confirmed = response();
    confirmed.results.confirmed = [card("合作甲大学")]; confirmed.results.pending = [];
    expect(createNarrative(confirmed, null).highlights.map((item) => item.name)).toEqual(["合作甲大学", "其他乙大学"]);
    expect(createNarrative(confirmed, null).lead).toContain("1 所合作院校可以先核对");
  });
  it("按实际结果简明引出候选，不把待核实说成符合", () => {
    const value = response();
    value.results.other = [];
    expect(createNarrative(value, null).lead).toContain("1 所合作院校可以先核对");
    value.results.other = [card("其他大学", "unknown")];
    value.otherRequested = true;
    expect(createNarrative(value, null).lead).toContain("查了学校知识库");
  });
  it("不把缺少关键条件依据的项目写成推荐", () => {
    const value = response();
    value.results.pending[0].quality = "insufficient";
    value.results.other[0].quality = "insufficient";
    const answer = createNarrative(value, null);
    expect(answer.highlights).toEqual([]);
    expect(answer.lead).toContain("项目资料还不足以判断");
  });
  it("名单明确不合作的学校在自然回答中保留不合作标记", () => {
    const value = response();
    value.results.other[0].cooperation = "not_cooperating";
    const answer = createNarrative(value, null);
    expect(answer.highlights.find((item) => item.name === "其他乙大学")?.notCooperating).toBe(true);
  });
  it("让模型选择匿名依据，超时或返回格式异常时降级为有依据的回答", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"selections":[{"slot":"A","reasons":["BUDGET"],"caution":"INTAKE"}]}' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const value = response();
    const plan = await chooseNarrativeFocus(value, new AbortController().signal, "预算调整为 7 万元");
    expect(plan?.selections[0].reasons).toEqual(["BUDGET"]);
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain('\\\"emphasis\\\":[\\\"BUDGET\\\"]');
    for (const secret of ["合作甲大学", "某类学生限制", "内部春季名单", "计算机", "37000"]) expect(body).not.toContain(secret);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }));
    expect(await chooseNarrativeFocus(value, new AbortController().signal)).toBeNull();
    expect(createNarrative(value, null).highlights[0].body).toContain("计算机");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: '{"selections":"bad"}' } }] })));
    expect(await chooseNarrativeFocus(value, new AbortController().signal)).toBeNull();
  });
  it("对自然顾问表达进行匿名事实审校，通过后才展示，模型看不到学校和内部原文", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    const draft = "这所可以先重点联系：{{M1}}，{{M2}}。不过，{{N1}}，建议先向学校核实再推进。";
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ selections: [{ slot: "A", reasons: ["MAJOR", "BUDGET"], caution: "INTAKE", text: draft }] }) } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"reviews":[{"slot":"A","grounded":true}]}' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const value = response();
    const plan = await chooseNarrativeFocus(value, new AbortController().signal);
    expect(plan?.selections[0].verified).toBe(true);
    expect(createNarrative(value, plan).highlights[0].body).toContain("建议先向学校核实再推进");
    for (const [, options] of fetchMock.mock.calls) {
      const body = String(options?.body);
      for (const secret of ["合作甲大学", "内部原始记录", "某类学生限制", "37000", "80000", "private-id"]) expect(body).not.toContain(secret);
    }
  });
  it("为推荐理由生成顾问式解释，并隐藏学校、金额和内部原文", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    const draft = "这所更适合先核对：{{M1}}，{{M2}}。关键风险是{{N1}}，建议先向学校问清招生批次。";
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ selections: [{ slot: "A", text: draft }] }) } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"reviews":[{"slot":"A","grounded":true}]}' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const text = await createAdvisorExplanation(response(), "合作甲大学", new AbortController().signal);
    expect(text).toContain("这所更适合先核对");
    expect(text).toContain("计算机");
    expect(text).toContain("37,000");
    expect(text).toContain("2027 年春季是否开班还没有确认");
    expect(text).not.toContain("某类学生限制");
    for (const [, options] of fetchMock.mock.calls) {
      const body = String(options?.body);
      for (const secret of ["合作甲大学", "内部原始记录", "某类学生限制", "37000", "80000", "private-id"]) expect(body).not.toContain(secret);
    }
  });
  it("事实审校拒绝或超时时不展示模型自由文本，继续使用本地证据", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    const draft = JSON.stringify({ selections: [{ slot: "A", reasons: ["MAJOR"], caution: "INTAKE", text: "这所可以先了解：{{M1}}，{{M2}}。不过，{{N1}}，建议先核实。" }] });
    for (const reject of [Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"reviews":[{"slot":"A","grounded":false}]}' } }] }), null]) {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: draft } }] }));
      if (reject) fetchMock.mockResolvedValueOnce(reject); else fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
      vi.stubGlobal("fetch", fetchMock);
      const value = response();
      const plan = await chooseNarrativeFocus(value, new AbortController().signal);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(plan?.selections[0].verified).toBeUndefined();
      expect(plan?.selections[0].text).toBeUndefined();
      expect(createNarrative(value, plan).highlights[0].body).toContain("计算机");
      expect(createNarrative(value, plan).highlights[0].body).toContain("春季是否开班还没有确认");
    }
  });
});

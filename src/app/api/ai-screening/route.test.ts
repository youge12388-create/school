import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "test", role: "ADMIN" })) }));
vi.mock("@/lib/db", () => ({ sqlite: { prepare: () => ({ all: () => [] }) } }));
vi.mock("@/lib/queries", () => ({ getProgramsForScreening: vi.fn(async () => []) }));

import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { getProgramsForScreening } from "@/lib/queries";
import type { MatchProgram } from "@/lib/matcher";

const makeRequest = (message = "想申请硕士") => new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ message, criteria: {} }) });

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("AI 选校接口", () => {
  it("拒绝跨站调用，避免借用登录会话触发模型请求", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai-screening", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "想申请硕士" }),
      }),
    );
    expect(response.status).toBe(403);
  });
  it("未配置模型时返回清楚错误，不生成结果", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const response = await POST(makeRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("尚未配置 AI API");
  });
  it.each([["你好", "您好，我可以帮您查找适合的院校。"], ["你是谁", "我是 AI 选校助手，可以协助您查找和比较院校。"]])("普通对话由模型自然回答且不触发院校检索：%s", async (message, reply) => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", "Z:/nonexistent-test-workbook.xlsx");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ criteria: {}, intent: "chat", reply }) } }] })));
    const response = await POST(makeRequest(message));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.answer.lead).toBe(reply);
    expect(data.conversation).toBe(true);
    expect(data.results.confirmed).toEqual([]);
  });
  it("普通对话保留上次检索条件与学校，并向模型提供有限的近期对话", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ criteria: {}, intent: "chat", reply: "我是选校助手，可以帮您继续比较。" }) } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ message: "你是谁", criteria: { programType: "MASTER" }, hasPrevious: true, focusSchool: "仅服务端使用的大学", previousOtherRequested: true, history: [{ role: "user", content: "你好" }, { role: "assistant", content: "您好。" }] }) });
    const response = await POST(request);
    const data = await response.json();
    expect(data).toMatchObject({ criteria: { programType: "MASTER" }, focusSchool: "仅服务端使用的大学", otherRequested: true, conversation: true });
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("你好");
    expect(body).toContain("您好。");
    expect(body).not.toContain("仅服务端使用的大学");
  });
  it("无法识别任何申请条件时先追问，避免把整库当作推荐", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", "Z:/nonexistent-test-workbook.xlsx");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"criteria":{},"intent":"search"}' } }] })));
    const response = await POST(makeRequest("给我看看有哪些学校"));
    expect(response.status).toBe(200);
    expect((await response.json()).answer.lead).toContain("学历或专业");
  });
  it("近期对话中的敏感限制或联系方式也不会发送到模型", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const content of ["学校不招某国籍", "电话：13812345678"]) {
      const request = new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ message: "继续", history: [{ role: "user", content }] }) });
      expect((await POST(request)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("联系方式不会发送到模型", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(makeRequest("手机号：13812345678"));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["想申请硕士，学校不招某国籍", "想读本科，学校偏好白皮肤的学生", "申请硕士，招生限制：不接受某地区学生", "学校偏爱欧美学生", "学校更喜欢白皙的学生", "更喜欢欧美学生"])("敏感招生限制不会发送到模型：%s", async (message) => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", "Z:/nonexistent-test-workbook.xlsx");
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"criteria":{"programType":"MASTER"}}' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(makeRequest(message));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
  it("已有条件中的敏感招生限制也不会发送到模型", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ message: "继续查询", criteria: { targetMajor: "学校不招某国籍" } }) });
    const response = await POST(request);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
  it("上轮选中的学校只在服务端使用，不放入模型请求", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", "Z:/nonexistent-test-workbook.xlsx");
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"criteria":{"programType":"MASTER"}}' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ message: "这所学校学费多少？", criteria: {}, hasPrevious: true, focusSchool: "不发送的上轮学校" }) });
    await POST(request);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("不发送的上轮学校");
  });
  it.each(["学生想申请皮肤病学硕士", "只看不要求CSCA的本科院校", "巴基斯坦学生想申请硕士", "优先选择北京地区的本科院校", "我偏好上海的学校"])("普通申请条件仍可发送给模型：%s", async (message) => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", "Z:/nonexistent-test-workbook.xlsx");
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"criteria":{"programType":"MASTER"}}' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await POST(makeRequest(message));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("模型输出格式错误时要求重试", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "not json" } }] })));
    const response = await POST(makeRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("格式错误");
  });
  it("模型请求超时或断网时返回可重试的错误", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }));
    const response = await POST(makeRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("重试");
  });
  it("招生表缺失时不会返回伪造的匹配结果", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", "Z:/nonexistent-test-workbook.xlsx");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"criteria":{"programType":"MASTER"}}' } }] })));
    const response = await POST(makeRequest());
    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result.error).toContain("找不到合作院校名单");
    expect(result.results).toBeUndefined();
  });
  it("按已编辑条件重筛时使用服务端条件，不依赖模型重新解析", async () => {
    const path = join(tmpdir(), `school-ai-direct-${randomUUID()}.xlsx`);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["院校名称（中文）"], ["直连测试大学"]]), "Sheet1");
    await writeFile(path, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    const program: MatchProgram = { id: "direct-program", schoolId: "direct-school", schoolName: "直连测试大学", schoolTags: null, programName: "计算机硕士", programType: "MASTER", teachingLanguage: "ENGLISH", majorText: "计算机", requirementsText: null, sourceText: null, semesterText: "2027年春季入学", applicationTimeText: null, accommodationText: null, firstYearCostMax: 37000, costIncomplete: false, cscaStatus: "UNKNOWN", gpaMin: null, gpaScale: null, hskLevelMin: null, hskScoreMin: null, ieltsMin: null, toeflMin: null, duolingoMin: null, minAge: null, maxAge: null, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN", scholarshipCategory: null, province: null, city: null, partnershipRating: 0, qsRanking: null, reviewStatus: "VERIFIED", manuallyVerified: true };
    try {
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", path);
      vi.stubEnv("AI_SCREENING_SHARED_DIR", join(tmpdir(), `school-ai-direct-empty-${randomUUID()}`));
      vi.stubEnv("AI_SCREENING_PARTNERS_PATH", "");
      vi.mocked(getProgramsForScreening).mockResolvedValueOnce([program]);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = await POST(new Request("http://localhost/api/ai-screening", {
        method: "POST",
        headers: { Origin: "http://localhost", "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "按已更新的申请条件重新筛选。",
          criteria: { programType: "MASTER", budget: 90000 },
          criteriaOverride: { programType: "MASTER", targetMajor: "计算机", budget: 60000, intakeYear: 2027, intakeSeason: "SPRING" },
          hasPrevious: true,
        }),
      }));
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(data.criteria).toMatchObject({ programType: "MASTER", targetMajor: "计算机", budget: 60000, intakeYear: 2027, intakeSeason: "SPRING" });
      expect([...data.results.confirmed, ...data.results.pending, ...data.results.other].some((card: { name: string }) => card.name === "直连测试大学")).toBe(true);
    } finally {
      await unlink(path);
    }
  });
  it("流式返回真实执行步骤，未配置台账时明确提示，最后才返回结果", async () => {
    const path = join(tmpdir(), `school-ai-test-${randomUUID()}.xlsx`);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[], ["", "", "院校名称（中文）"], [1, "", "测试学校"]]), "Sheet1");
    await writeFile(path, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    try {
      vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
      vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", path);
      vi.stubEnv("AI_SCREENING_PARTNERS_PATH", "");
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"criteria":{"programType":"MASTER"}}' } }] })));
      const req = new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ message: "巴基斯坦学生想申请硕士", criteria: {} }) });
      const response = await POST(req);
      const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
      expect(events[0]).toMatchObject({ type: "progress", step: { id: "understand", status: "active" } });
      expect(events.findIndex((event) => event.step?.id === "cooperation" && event.step.status === "active")).toBeLessThan(events.findIndex((event) => event.step?.id === "cooperation" && event.step.status === "warning"));
      expect(events.some((event) => event.step?.id === "cooperation" && event.step.status === "warning" && event.step.message.includes("合作院校名单"))).toBe(true);
      expect(events.some((event) => event.step?.id === "alternatives" && event.step.status === "active")).toBe(true);
      expect(events.at(-1)).toMatchObject({ type: "result", result: { partnerConfigured: false, sensitiveContext: true } });
    } finally { await unlink(path); }
  });
  it("流式请求在模型失败时返回错误事件，保留已发生的进度", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const req = new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ message: "想申请硕士", criteria: {} }) });
    const events = (await (await POST(req)).text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({ type: "progress", step: { id: "understand", status: "active" } });
    expect(events.at(-1)).toMatchObject({ type: "error", message: expect.stringContaining("尚未配置") });
  });
  it("用户明确查看或排除其他院校时，即使模型判断错误也尊重用户意图", async () => {
    const path = join(tmpdir(), `school-ai-other-${randomUUID()}.xlsx`);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["院校名称（中文）"], ["测试大学"]]), "Sheet1");
    await writeFile(path, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    try {
      vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
      vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", path);
      vi.stubEnv("AI_SCREENING_SHARED_DIR", join(tmpdir(), `school-ai-empty-${randomUUID()}`));
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ criteria: { programType: "MASTER" }, intent: "search", showOther: true }) } }] })));
      const request = (message: string) => new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ message, criteria: { programType: "MASTER" }, hasPrevious: true }) });
      const excluding = await (await POST(request("不要看其他院校"))).json();
      expect(excluding.otherRequested).toBe(false);
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ criteria: { programType: "MASTER" }, intent: "chat", showOther: false, reply: "好的。" }) } }] })));
      const requesting = await (await POST(request("请再看看其他院校"))).json();
      expect(requesting.otherRequested).toBe(true);
      expect(requesting.source).toContain(".xlsx");
    } finally { await unlink(path); }
  });
  it("追问还有其他的吗时排除上一轮已展示院校，返回新的知识库候选", async () => {
    const path = join(tmpdir(), `school-ai-more-${randomUUID()}.xlsx`);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["院校名称（中文）"], ["甲大学"], ["乙大学"]]), "Sheet1");
    await writeFile(path, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    const base: MatchProgram = { id: "base", schoolId: "s1", schoolName: "甲大学", schoolTags: null, programName: "计算机硕士", programType: "MASTER", teachingLanguage: "ENGLISH", majorText: "计算机", requirementsText: null, sourceText: null, semesterText: "2027年春季入学", applicationTimeText: null, accommodationText: null, firstYearCostMax: 37000, costIncomplete: false, cscaStatus: "UNKNOWN", gpaMin: null, gpaScale: null, hskLevelMin: null, hskScoreMin: null, ieltsMin: null, toeflMin: null, duolingoMin: null, minAge: null, maxAge: null, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN", scholarshipCategory: null, province: null, city: null, partnershipRating: 0, qsRanking: null, reviewStatus: "AUTO_PARSED" };
    const first = { ...base, id: "p1", schoolId: "s1", schoolName: "甲大学", programName: "甲大学 · 计算机硕士" };
    const second = { ...base, id: "p2", schoolId: "s2", schoolName: "乙大学", programName: "乙大学 · 计算机硕士" };
    const extra = { ...base, id: "p3", schoolId: "s3", schoolName: "丙大学", programName: "丙大学 · 计算机硕士" };
    try {
      vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
      vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", path);
      vi.stubEnv("AI_SCREENING_SHARED_DIR", join(tmpdir(), `school-ai-empty-${randomUUID()}`));
      vi.stubEnv("AI_SCREENING_PARTNERS_PATH", "");
      vi.mocked(getProgramsForScreening).mockResolvedValueOnce([first, second, extra]).mockResolvedValueOnce([first, second, extra]);
      vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        const system = String(body.messages?.[0]?.content ?? "");
        const content = system.includes("匿名候选")
          ? '{"selections":[]}'
          : '{"criteria":{"programType":"MASTER","targetMajor":"计算机"},"intent":"search"}';
        return Response.json({ choices: [{ finish_reason: "stop", message: { content } }] });
      }));
      const initial = await (await POST(new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ message: "想申请计算机硕士", criteria: {} }) }))).json();
      expect(initial.shown.schoolNames.sort()).toEqual(["乙大学", "甲大学"].sort());
      const more = await (await POST(new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ message: "还有其他的吗", criteria: initial.criteria, hasPrevious: true, seenProgramIds: initial.shown.programIds, seenSchoolNames: initial.shown.schoolNames }) }))).json();
      expect(more.results.confirmed).toHaveLength(0);
      expect(more.results.pending).toHaveLength(0);
      expect(more.results.other.map((card: { name: string }) => card.name)).toEqual(["丙大学"]);
      expect(more.shown.schoolNames).toEqual(["丙大学"]);
      expect(more.results.excludedSchoolCount).toBe(2);
      expect(more.narrative.lead).toContain("排除了前几轮已展示的院校");
      expect(JSON.stringify(more.results)).not.toContain("甲大学");
      expect(JSON.stringify(more.results)).not.toContain("乙大学");
    } finally { await unlink(path); }
  });
  it("说明重点分析超时后仍返回可信的自然回答，匿名请求不含内部资料", async () => {
    const path = join(tmpdir(), `school-ai-narrative-${randomUUID()}.xlsx`);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["院校名称（中文）"], ["私有测试大学"]]), "Sheet1");
    await writeFile(path, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    const program: MatchProgram = { id: "p", schoolId: "s", schoolName: "私有测试大学", schoolTags: null, programName: "私有测试项目", programType: "MASTER", teachingLanguage: "ENGLISH", majorText: "计算机", requirementsText: "内部限制：不招某国籍", sourceText: null, semesterText: null, applicationTimeText: null, accommodationText: null, firstYearCostMax: 37000, costIncomplete: false, cscaStatus: "UNKNOWN", gpaMin: null, gpaScale: null, hskLevelMin: null, hskScoreMin: null, ieltsMin: null, toeflMin: null, duolingoMin: null, minAge: null, maxAge: null, deadlineDate: null, deadlineStatus: "UNKNOWN", scholarshipCategory: null, province: null, city: null, partnershipRating: 0, qsRanking: null, reviewStatus: "AUTO_PARSED" };
    try {
      vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
      vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", path);
      vi.stubEnv("AI_SCREENING_SHARED_DIR", join(tmpdir(), `school-ai-empty-${randomUUID()}`));
      vi.stubEnv("AI_SCREENING_PARTNERS_PATH", "");
      vi.mocked(getProgramsForScreening).mockResolvedValueOnce([program]);
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"criteria":{"programType":"MASTER","targetMajor":"计算机","budget":80000}}' } }] }))
        .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
      vi.stubGlobal("fetch", fetchMock);
      const response = await POST(makeRequest("想申请计算机硕士，预算 8 万"));
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.narrative.highlights[0].name).toBe("私有测试大学");
      expect(data.narrative.highlights[0].body).toContain("计算机");
      expect(data.narrative.highlights[0].body).toContain("适用年份尚未确认");
      expect(data.narrative.highlights[0].body).not.toContain("预算能覆盖");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const anonymousBody = String(fetchMock.mock.calls[1][1]?.body);
      for (const privateText of ["私有测试大学", "私有测试项目", "某国籍", "37000", "计算机"]) expect(anonymousBody).not.toContain(privateText);
      vi.mocked(getProgramsForScreening).mockResolvedValueOnce([{ ...program, ieltsMin: 6 }]);
      fetchMock.mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"criteria":{"ielts":5},"intent":"school_fact","topic":"LANGUAGE"}' } }] }));
      const follow = new Request("http://localhost/api/ai-screening", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ message: "私有测试大学雅思 5 分够吗？", criteria: { programType: "MASTER", targetMajor: "计算机", ielts: 6.5 }, hasPrevious: true, focusSchool: "私有测试大学" }) });
      const followResponse = await POST(follow);
      expect(followResponse.status).toBe(200);
      const followData = await followResponse.json();
      expect(followData.answer.details.join()).toContain("5 分尚未达到这一已知门槛");
      expect(followData.criteria.ielts).toBe(6.5);
      expect(followData.focusSchool).toBe("私有测试大学");
    } finally { await unlink(path); }
  });
  it("管理员和顾问看到不同的敏感原文，模型始终只接收匿名依据", async () => {
    const path = join(tmpdir(), `school-ai-permissions-${randomUUID()}.xlsx`);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["院校名称（中文）"], ["测试合作大学"]]), "Sheet1");
    await writeFile(path, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    const program: MatchProgram = { id: "private-program", schoolId: "private-school", schoolName: "测试合作大学", schoolTags: null, programName: "测试项目", programType: "MASTER", teachingLanguage: "ENGLISH", majorText: "计算机", requirementsText: "内部测试限制：不招某国籍", sourceText: null, semesterText: null, applicationTimeText: null, accommodationText: null, firstYearCostMax: 37000, costIncomplete: false, cscaStatus: "UNKNOWN", gpaMin: null, gpaScale: null, hskLevelMin: null, hskScoreMin: null, ieltsMin: null, toeflMin: null, duolingoMin: null, minAge: null, maxAge: null, deadlineDate: null, deadlineStatus: "UNKNOWN", scholarshipCategory: null, province: null, city: null, partnershipRating: 0, qsRanking: null, reviewStatus: "AUTO_PARSED" };
    try {
      vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
      vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", path);
      vi.stubEnv("AI_SCREENING_SHARED_DIR", join(tmpdir(), `school-ai-empty-${randomUUID()}`));
      vi.stubEnv("AI_SCREENING_PARTNERS_PATH", "");
      const fetchMock = vi.fn<typeof fetch>(async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        const isNarrative = String(body.messages[0].content).includes("匿名候选");
        const content = isNarrative ? '{"selections":[]}' : '{"criteria":{"programType":"MASTER","targetMajor":"计算机"},"intent":"search"}';
        return Response.json({ choices: [{ finish_reason: "stop", message: { content } }] });
      });
      vi.stubGlobal("fetch", fetchMock);
      for (const role of ["ADMIN", "DATA_MANAGER", "ADVISOR"] as const) {
        vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: role, username: "fixture", displayName: "测试", role, authProvider: "LOCAL", active: true, sessionId: "fixture-session" });
        vi.mocked(getProgramsForScreening).mockResolvedValueOnce([program]);
        const response = await POST(makeRequest("想申请计算机硕士"));
        expect(response.status).toBe(200);
        const data = await response.json();
        const warning = data.results.pending[0].warning.join();
        expect(warning).toContain("核实");
        if (role === "ADVISOR") expect(warning).not.toContain("不招某国籍");
        else expect(warning).toContain("不招某国籍");
      }
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(6);
      for (const [, options] of fetchMock.mock.calls) {
        const body = String(options?.body);
        expect(body).not.toContain("不招某国籍");
        expect(body).not.toContain("测试合作大学");
        expect(body).not.toContain("测试项目");
      }
    } finally { await unlink(path); }
  });
});

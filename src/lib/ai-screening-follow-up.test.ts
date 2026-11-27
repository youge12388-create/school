import { afterEach, describe, expect, it, vi } from "vitest";
import { advisorFollowUpAnswer, factQuestion, followUpAnswer, followUpIntent, schoolFactAnswer, shownGroupAnswer, shownGroupTopic } from "./ai-screening-follow-up";
import type { ResultCard } from "./ai-screening";
import type { ScreeningResponse } from "./ai-screening-events";

const card = (name: string, cost: number | null, cooperation: ResultCard["cooperation"] = "listed"): ResultCard => ({
  name, program: "计算机硕士", kind: "project", cooperation, fit: "条件待核实", comparableCost: cost,
  evidence: [], sources: ["名单第 3 行"], warning: [], yellow: false, image: false,
  points: [{ label: "专业", level: "PASS", text: "专业包含计算机" }, { label: "入学季", level: "UNKNOWN", text: "春季入学需核实" }],
});
function response(): ScreeningResponse {
  return { criteria: {}, results: { confirmed: [card("合作甲大学", 60000)], pending: [card("合作乙大学", null)], other: [card("其他大学", 40000, "unknown")], otherHidden: false }, source: "测试名单.xlsx", partnerConfigured: false, otherRequested: false, sensitiveContext: false, prompt: "" };
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("后续提问", () => {
  it("按刚展示的项目顺序回答多校学费和开班问题", () => {
    const value = response();
    value.results.confirmed[0].programId = "a";
    value.results.pending[0].programId = "b";
    value.results.other[0].programId = "c";
    expect(shownGroupTopic("这几所学校哪所学费更低？")).toBe("TUITION");
    expect(shownGroupTopic("这些推荐项目已经确认2027年春季开班了吗？")).toBe("INTAKE");
    expect(shownGroupTopic("北京大学学费多少？")).toBeNull();
    const ids = ["b", "a"];
    for (const topic of ["TUITION", "INTAKE"] as const) {
      const result = shownGroupAnswer(topic, "这几所呢？", value, ids);
      expect(result.details).toHaveLength(2);
      expect(result.details[0]).toContain("合作乙大学");
      expect(result.details[1]).toContain("合作甲大学");
      expect(result.details.join()).not.toContain("其他大学");
    }
  });
  it("识别费用比较和推荐理由，但不把调整预算当费用比较", () => {
    expect(followUpIntent("哪所学校最便宜？")).toBe("compare_cost");
    expect(followUpIntent("为什么推荐第一所？")).toBe("explain");
    expect(followUpIntent("预算改成 5 万")).toBeNull();
  });
  it("根据第一条实际显示的学校解释依据和未知项，提醒内部注意事项", () => {
    const value = response();
    value.criteria = { intakeYear: 2027, intakeSeason: "SPRING" };
    value.results.confirmed[0].warning = ["有内部招生注意事项，请联系有权限的同事核实"];
    const answer = followUpAnswer("explain", "为什么推荐第一所", value, true);
    expect(answer.lead).toContain("合作甲大学");
    expect(answer.details.join()).toContain("专业包含计算机");
    expect(answer.details.join()).toContain("2027 年春季是否开班还没有确认");
    expect(answer.note).toContain("内部注意事项");
    value.otherRequested = true;
    expect(followUpAnswer("explain", "为什么推荐第一所", value, true).lead).toContain("其他大学");
  });
  it("推荐理由追问由模型组织成顾问式解释，失败时保留本地依据", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"selections":[{"slot":"A","text":"这所更适合先核对：{{M1}}。关键风险是{{N1}}，建议先向学校问清招生批次。"}]}' } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"reviews":[{"slot":"A","grounded":true}]}' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const value = response();
    value.criteria = { intakeYear: 2027, intakeSeason: "SPRING" };
    const answer = await advisorFollowUpAnswer("explain", "为什么推荐第一所", value, true, null, [], new AbortController().signal);
    expect(answer.lead).toContain("合作院校名单");
    expect(answer.details).toHaveLength(1);
    expect(answer.details[0]).toContain("这所更适合先核对");
    expect(answer.details[0]).toContain("专业包含计算机");
    expect(answer.details[0]).toContain("2027 年春季是否开班还没有确认");
    for (const [, options] of fetchMock.mock.calls) expect(String(options?.body)).not.toContain("合作甲大学");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }));
    const fallback = await advisorFollowUpAnswer("explain", "为什么推荐第一所", value, true, null, [], new AbortController().signal);
    expect(fallback.details[0]).toContain("专业包含计算机");
    expect(fallback.details.join()).toContain("2027 年春季是否开班还没有确认");
    expect(fallback.details.join().match(/春季是否开班还没有确认/gu)).toHaveLength(1);
  });
  it("按实际可见学校的顺序解释第二所，不把折叠的资料不足候选排到前面", () => {
    const value = response();
    expect(followUpAnswer("explain", "为什么推荐第二所", value, true).lead).toContain("合作乙大学");
    value.results.confirmed = [];
    value.results.pending = [{ ...card("资料不足大学", null), kind: "school" }];
    expect(followUpAnswer("explain", "为什么推荐第一所", value, true).lead).toContain("其他大学");
    expect(followUpAnswer("explain", "为什么推荐不存在大学", value, true).lead).toContain("没有找到");
  });
  it("模型调整候选顺序后，第一所和费用比较仍指向用户看到的项目", () => {
    const value = response();
    value.results.confirmed = [];
    value.results.pending = [{ ...card("合作甲大学", 60000), programId: "a" }, { ...card("合作乙大学", 50000), programId: "b" }, { ...card("未展示大学", 1000), programId: "hidden" }];
    value.results.other = [{ ...card("其他大学", 40000, "unknown"), programId: "other" }];
    const shown = ["b", "a", "other"];
    expect(schoolFactAnswer("TUITION", "第一所学费多少？", value, true, null, shown).school).toBe("合作乙大学");
    expect(followUpAnswer("explain", "为什么推荐第一所", value, true, null, shown).lead).toContain("合作乙大学");
    expect(followUpAnswer("compare_cost", "这几所哪个最便宜", value, true, null, shown).lead).not.toContain("未展示大学");
  });
  it("比较已知的首年费用上限，不把缺失费用说成整体最低", () => {
    const value = response();
    value.results.pending.unshift(value.results.confirmed[0]); value.results.confirmed = [];
    const answer = followUpAnswer("compare_cost", "哪个最便宜", value, true);
    expect(answer.lead).toContain("合作甲大学");
    expect(answer.lead).toContain("60,000");
    expect(answer.details[0]).toContain("其他大学");
    expect(answer.details[0]).toContain("40,000");
    expect(answer.details[0]).toContain("低于");
    expect(answer.note).toContain("不能确认整体最低");
    value.results.otherHidden = true;
    expect(followUpAnswer("compare_cost", "哪个最便宜", value, true).note).toContain("其他院校尚未纳入比较");
  });
  it("这几所只比较刚才展示的前三所，明确说全部时才比较未展示候选", () => {
    const value = response();
    value.results.pending = [
      value.results.confirmed[0],
      value.results.pending[0],
      card("展示丙大学", 1000),
      card("展示丁大学", 2000),
      card("展示戊大学", 3000),
      card("展示己大学", 4000),
      card("展示庚大学", 5000),
      card("展示辛大学", 6000),
      card("展示壬大学", 7000),
      card("未展示丁大学", 500),
    ];
    value.results.confirmed = [];
    const shown = followUpAnswer("compare_cost", "这几所学校哪个最便宜", value, true);
    expect(shown.lead + shown.details.join()).not.toContain("未展示丁大学");
    expect(shown.note).toContain("只比较刚才展示的项目");
    const all = followUpAnswer("compare_cost", "所有候选院校哪个最便宜", value, true);
    expect(all.lead).toContain("未展示丁大学");
    expect(schoolFactAnswer("TUITION", "第三所的学费多少？", value, true).school).toBe("展示丙大学");
  });
  it("追问明确不合作的学校时保留状态提醒", () => {
    const value = response();
    value.results.other[0].cooperation = "not_cooperating";
    expect(schoolFactAnswer("TUITION", "其他大学学费多少？", value, true).note).toContain("不合作");
  });
  it("没有可比价格或尚无上一轮时给出明确提示", () => {
    const value = response();
    value.results.confirmed[0].comparableCost = null;
    value.results.other[0].comparableCost = null;
    expect(followUpAnswer("compare_cost", "最便宜", value, true).lead).toContain("无法判断");
    expect(followUpAnswer("explain", "为什么推荐", value, false).lead).toContain("先告诉我");
  });
  it("追问具体学校学费时区分学费与首年总费用，不把总费用当学费", () => {
    const value = response();
    expect(factQuestion("合作甲大学这个项目的学费到底是多少？")).toBe("TUITION");
    expect(factQuestion("这些学校哪个最便宜？")).toBeNull();
    const answer = schoolFactAnswer("TUITION", "合作甲大学这个项目的学费到底是多少？", value, true);
    expect(answer.lead).toContain("没有查到");
    expect(answer.details[0]).toContain("60,000");
    expect(answer.details[0]).toContain("不等于单列学费");
  });
  it("名单有可用学费时给出来源，冲突时不猜价格", () => {
    const value = response();
    value.results.confirmed[0].facts = { tuition: 20000, tuitionStatus: "known", teachingLanguage: "ENGLISH", ielts: 6, toefl: null, duolingo: null, hskLevel: null, hskScore: null, scholarship: "unknown" };
    expect(schoolFactAnswer("TUITION", "第一所的学费多少", value, true).lead).toContain("20,000");
    value.results.confirmed[0].facts!.tuitionStatus = "conflict";
    expect(schoolFactAnswer("TUITION", "第一所的学费多少", value, true).lead).toContain("冲突");
    const language = schoolFactAnswer("LANGUAGE", "第一所要求雅思多少", value, true);
    expect(language.lead).toContain("雅思要求是 6 分");
    expect(language.lead + language.details.join()).not.toContain("托福");
    value.criteria.ielts = 6.5;
    expect(schoolFactAnswer("LANGUAGE", "第一所雅思 6.5 够吗？", value, true).details.join()).toContain("6.5 分达到这一已知门槛");
    expect(schoolFactAnswer("LANGUAGE", "第一所雅思要求 6 分，学生考了 5 分够吗？", value, true).details.join()).toContain("5 分尚未达到这一已知门槛");
  });
  it("没有指定学校时先追问，多所候选不能擅自指向第一所", () => {
    const answer = schoolFactAnswer("TUITION", "学费是多少？", response(), true);
    expect(answer.lead).toContain("哪所学校");
    expect(schoolFactAnswer("TUITION", "不存在大学学费是多少", response(), true).lead).toContain("没有找到");
  });
  it("连续追问这所学校时沿用刚才提到的第二所，不擅自回到第一所", () => {
    const value = response();
    const first = schoolFactAnswer("TUITION", "合作乙大学的学费是多少？", value, true);
    expect(first.school).toBe("合作乙大学");
    const second = schoolFactAnswer("DEADLINE", "这所学校什么时候截止？", value, true, first.school);
    expect(second.lead).toContain("合作乙大学");
    expect(second.lead).not.toContain("合作甲大学");
    const explicitlyFirst = schoolFactAnswer("TUITION", "第一所学费多少？", value, true, first.school);
    expect(explicitlyFirst.school).toBe("合作甲大学");
  });
  it("指代的学校已经不在结果时要求重新确认，不替换成其他学校", () => {
    const answer = schoolFactAnswer("TUITION", "这所学校的学费多少？", response(), true, "已消失大学");
    expect(answer.lead).toContain("没有找到这所学校");
    expect(answer.school).toBeUndefined();
  });
  it("询问不同年份或季节时，不把上一批次的记录当成本次结论", () => {
    const value = response();
    value.criteria.intakeYear = 2027; value.criteria.intakeSeason = "SPRING";
    value.results.confirmed[0].points.push({ label: "入学季", level: "PASS", text: "项目资料列有春季入学" });
    const answer = schoolFactAnswer("INTAKE", "第一所2028年秋季是否开班？", value, true);
    expect(answer.lead).toContain("不能确认");
  });
  it("费用未注明年份时，追问和比较都提示不能视为当前标准", () => {
    const value = response();
    value.results.confirmed[0].facts = { tuition: null, tuitionStatus: "unknown", teachingLanguage: "ENGLISH", ielts: null, toefl: null, duolingo: null, hskLevel: null, hskScore: null, scholarship: "unknown", sourceYear: null, feeFreshness: "unknown" };
    const cost = schoolFactAnswer("COST", "第一所首年费用多少", value, true);
    expect(cost.details.join()).toContain("未注明这项费用的适用年份");
    const comparison = followUpAnswer("compare_cost", "这几所哪个最便宜", value, true);
    expect(comparison.lead).toContain("部分未注明年份");
    expect(comparison.note).toContain("未注明适用年份");
  });
});

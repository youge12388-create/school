import { describe, expect, it } from "vitest";
import { buildResults, feeFreshnessFor, mergeCriteria, redactPreferenceSource, redactSensitiveSource, schoolIdentityKey, schoolKey, sensitiveSnippets, type ListRow } from "./ai-screening";
import type { MatchProgram } from "./matcher";

const program: MatchProgram = { id: "p", schoolId: "s", schoolName: "示例大学", schoolTags: null, programName: "示例大学硕士", programType: "MASTER", teachingLanguage: "ENGLISH", majorText: "计算机", requirementsText: null, sourceText: null, semesterText: null, applicationTimeText: null, accommodationText: null, firstYearCostMax: null, costIncomplete: true, cscaStatus: "UNKNOWN", gpaMin: null, gpaScale: null, hskLevelMin: null, hskScoreMin: null, ieltsMin: null, toeflMin: null, duolingoMin: null, minAge: null, maxAge: null, deadlineDate: null, deadlineStatus: "UNKNOWN", scholarshipCategory: null, province: null, city: null, partnershipRating: 0, qsRanking: null, reviewStatus: "AUTO_PARSED" };
const row = (name: string, number: number, text = ""): ListRow => ({ name, row: number, yellow: false, fields: [text], image: false, noCooperation: /不合作/.test(text) });
const schools = [{ id: "s", name: "示例大学", preference: "不招孟加拉" }];

describe("AI 选校结果组装", () => {
  it("只有已完成人工核实的项目才显示核验标识", () => {
    const verified = { ...program, id: "verified", reviewStatus: "VERIFIED", manuallyVerified: true };
    const imported = { ...program, id: "imported", schoolId: "s2", schoolName: "自动解析大学", reviewStatus: "VERIFIED", manuallyVerified: false };
    const result = buildResults([], [verified, imported], schools, [], { programType: "MASTER" }, false, false);
    expect(result.other.find((card) => card.programId === "verified")?.verified).toBe(true);
    expect(result.other.find((card) => card.programId === "imported")?.verified).toBe(false);
  });
  it("负反馈会降低同组项目排序但不会删除项目", () => {
    const first = { ...program, id: "feedback-a", schoolId: "a", schoolName: "甲大学", programName: "甲大学硕士" };
    const second = { ...program, id: "feedback-b", schoolId: "b", schoolName: "乙大学", programName: "乙大学硕士" };
    const result = buildResults(
      [row("甲大学", 3), row("乙大学", 4)],
      [first, second],
      [],
      [],
      { programType: "MASTER" },
      true,
      false,
      undefined,
      undefined,
      new Map([["feedback-a", -1]]),
    );
    const ids = result.pending.map((card) => card.programId);
    expect(ids).toContain("feedback-a");
    expect(ids.indexOf("feedback-b")).toBeLessThan(ids.indexOf("feedback-a"));
  });
  it("合并同名表格行并保留来源，校区名称不合并", () => {
    expect(schoolKey("示例 大学")).toBe(schoolKey("示例大学"));
    const result = buildResults([row("示例大学", 3), row("示例大学", 4), row("示例大学（分校）", 5)], [], schools, [], {}, true, false);
    expect(result.pending).toHaveLength(2);
    expect(result.pending[0].sources).toEqual(["招生表 Sheet1 第 3 行", "招生表 Sheet1 第 4 行"]);
  });
  it("只有条件待核实的名单候选时，其他院校回退可见", () => {
    const result = buildResults([row("示例大学", 3)], [program, { ...program, id: "other", schoolId: "s2", schoolName: "其他大学" }], schools, [], { programType: "MASTER" }, false, false);
    expect(result.confirmed).toHaveLength(0);
    expect(result.pending[0].cooperation).toBe("listed");
    expect(result.other).toHaveLength(1);
  });
  it("名单内已知条件符合的学校优先，不依赖单独的项目台账", () => {
    const open = { ...program, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const other = { ...open, id: "other", schoolId: "s2", schoolName: "其他大学" };
    const result = buildResults([row("示例大学", 3)], [open, other], schools, [], { programType: "MASTER" }, false, false);
    expect(result.confirmed).toHaveLength(1);
    expect(result.confirmed[0].cooperation).toBe("listed");
    expect(result.other).toHaveLength(0);
    expect(result.otherHidden).toBe(true);
  });
  it("明确不合作优先于台账合作标记", () => {
    const result = buildResults([row("示例大学", 3, "不合作")], [program], schools, [{ name: "示例大学", status: "confirmed" }], {}, true, false);
    expect(result.confirmed).toHaveLength(0);
    expect(result.other).toHaveLength(1);
  });
  it("区分名单学校与台账确认项目，支持主动查看其他院校", () => {
    const open = { ...program, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const partner = [{ name: "示例大学", status: "confirmed" as const, programIds: ["p"] }];
    const other = { ...open, id: "other", schoolId: "s2", schoolName: "其他大学" };
    const hidden = buildResults([row("示例大学", 3)], [open, other], schools, partner, {}, false, false);
    expect(hidden.confirmed).toHaveLength(1);
    expect(hidden.confirmed[0].cooperation).toBe("project_confirmed");
    expect(hidden.other).toHaveLength(0);
    expect(buildResults([row("示例大学", 3)], [open, other], schools, partner, {}, false, true).other).toHaveLength(1);
    expect(buildResults([row("示例大学", 3)], [open], schools, [{ name: "示例大学", status: "confirmed" }], {}, false, false).confirmed[0].cooperation).toBe("listed");
  });
  it("普通顾问看不到内部敏感原文", () => {
    const result = buildResults([row("示例大学", 3, "不招孟加拉")], [program], schools, [], {}, false, false);
    expect(JSON.stringify(result)).not.toContain("孟加拉");
    expect(result.pending[0].warning.join()).toContain("内部招生注意事项");
    const admin = buildResults([row("示例大学", 3)], [program], schools, [], {}, true, false);
    expect(admin.pending[0].warning.join()).toContain("孟加拉");
  });
  it("申请详情只隐藏敏感来源片段，保留其他材料要求", () => {
    const redacted = redactSensitiveSource("请上传成绩单。\n学校不招某国籍；\n请提供语言证明。");
    expect(redacted).toContain("请上传成绩单");
    expect(redacted).toContain("请提供语言证明");
    expect(redacted).toContain("需内部核实");
    expect(redacted).not.toContain("某国籍");
    expect(redactPreferenceSource("某类申请人更受欢迎")).toContain("需人工核实");
    expect(redactPreferenceSource("无特殊要求")).toBe("无特殊要求");
  });
  it("已导入的学校台账备注参与敏感提醒，普通顾问看不到原文", () => {
    const school = { id: "s", name: "示例大学", preference: null, updatedAt: Date.parse("2026-10-26T00:00:00Z"), internalNotes: [
      { source: "学校合作备注", text: "仅供测试：不招某国籍" },
      { source: "语言生考核信息", text: "仅供测试：限制某地区生源" },
    ] };
    const admin = buildResults([row("示例大学", 3)], [program], [school], [], {}, true, false);
    const advisor = buildResults([row("示例大学", 3)], [program], [school], [], {}, false, false);
    expect(admin.pending[0].warning.join()).toContain("学校合作备注");
    expect(admin.pending[0].warning.join()).toContain("语言生考核信息");
    expect(admin.pending[0].warning.join()).toContain("学校资料更新于 2026/10/26");
    expect(JSON.stringify(advisor)).not.toContain("某国籍");
    expect(JSON.stringify(advisor)).not.toContain("某地区");
    expect(advisor.pending[0].warning).toEqual(["有内部招生注意事项，请联系有权限的同事核实"]);
  });
  it.each(["学校更喜欢肤白的学生", "学校更喜欢欧美学生", "偏向白皙的申请人"])("不同表述的敏感偏好会提醒：%s", (text) => {
    expect(sensitiveSnippets(text)).toContain(text);
  });
  it("招生偏向字段即使没有命中关键词也需要内部核实", () => {
    const school = { id: "s", name: "示例大学", preference: "某类申请人更受欢迎" };
    const admin = buildResults([row("示例大学", 3)], [program], [school], [], {}, true, false);
    const advisor = buildResults([row("示例大学", 3)], [program], [school], [], {}, false, false);
    expect(admin.pending[0].warning.join()).toContain("某类申请人更受欢迎");
    expect(JSON.stringify(advisor)).not.toContain("某类申请人更受欢迎");
    expect(advisor.pending[0].warning.join()).toContain("内部招生注意事项");
  });
  it("招生名单独有的学校与知识库其他学校分别保留", () => {
    const other = { ...program, id: "other", schoolId: "s2", schoolName: "其他大学" };
    const result = buildResults([row("名单独有学校", 3)], [other], [], [], { programType: "MASTER" }, false, false);
    expect(result.pending.map((card) => [card.name, card.kind])).toEqual([["名单独有学校", "school"]]);
    expect(result.other.map((card) => card.name)).toEqual(["其他大学"]);
  });
  it("知识库项目要求中的敏感信息也会提醒且限制访问", () => {
    const restricted = { ...program, requirementsText: "不招某国籍", sourceText: "不招某国籍" };
    const admin = buildResults([], [restricted], schools, [], {}, true, false);
    const advisor = buildResults([], [restricted], schools, [], {}, false, false);
    expect(admin.other[0].warning.join()).toContain("不招某国籍");
    expect(JSON.stringify(advisor)).not.toContain("不招某国籍");
    expect(advisor.other[0].warning.join()).toContain("内部招生注意事项");
  });
  it("原始 JSON 的空字段名不会被误当作敏感招生信息", () => {
    const withEmptyMetadata = { ...program, sourceText: '{"招生偏向":""}' };
    const result = buildResults([], [withEmptyMetadata], [{ id: "s", name: "示例大学", preference: null }], [], {}, true, false);
    expect(result.other[0].warning).toEqual([]);
  });
  it("项目补充资料有实际限制时提示来源，普通顾问看不到原文", () => {
    const restricted = { ...program, attentionText: "仅供测试：不招某国籍" };
    const noPreference = [{ id: "s", name: "示例大学", preference: null }];
    const admin = buildResults([], [restricted], noPreference, [], {}, true, false);
    const advisor = buildResults([], [restricted], noPreference, [], {}, false, false);
    expect(admin.other[0].warning.join()).toContain("知识库项目资料");
    expect(JSON.stringify(advisor)).not.toContain("不招某国籍");
    expect(advisor.other[0].warning.join()).toContain("内部招生注意事项");
  });
  it("未知授课语言不作为明确不符合，明确学历不符合则排除", () => {
    const unknown = buildResults([row("示例大学", 3)], [{ ...program, teachingLanguage: "UNKNOWN" }], schools, [], { teachingLanguage: "ENGLISH" }, false, false);
    expect(unknown.pending).toHaveLength(1);
    expect(unknown.pending[0].evidence.join()).toContain("信息未知");
    const mismatch = buildResults([row("示例大学", 3)], [program], schools, [], { programType: "UG" }, false, false);
    expect(mismatch.pending.every((card) => card.kind !== "project")).toBe(true);
    expect(mismatch.pending[0].points[0].text).toContain("未找到符合本次条件的项目");
  });
  it("有具体匹配依据的项目排在资料不足的学校之前", () => {
    const matched = { ...program, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([row("只有名字的学校", 3), row("示例大学", 4)], [matched], schools, [], { programType: "MASTER", targetMajor: "计算机" }, true, false);
    expect([...result.confirmed, ...result.pending].map((card) => card.kind)).toEqual(["project", "school"]);
    expect(result.confirmed[0].points.some((point) => point.level === "PASS" && point.text.includes("计算机"))).toBe(true);
    expect(result.pending[0].points[0].text).toContain("需核实");
  });
  it("学历或目标专业缺少依据时保留资料，但不当作可推荐候选", () => {
    const missingMajor = { ...program, id: "missing-major", majorText: null };
    const missingDegree = { ...program, id: "missing-degree", programType: "UNKNOWN" };
    const result = buildResults([row("示例大学", 3)], [missingMajor, missingDegree, program], schools, [], { programType: "MASTER", targetMajor: "计算机" }, false, false);
    const items = [...result.confirmed, ...result.pending];
    expect(items.find((card) => card.programId === "missing-major")?.quality).toBe("insufficient");
    expect(items.find((card) => card.programId === "missing-degree")?.quality).toBe("insufficient");
    expect(items.find((card) => card.programId === "p")?.quality).toBe("candidate");
    expect(items[0].programId).toBe("p");
  });
  it("资料不足的其他院校不会被删除，且专业有依据但语言未知的项目仍可核实", () => {
    const missing = { ...program, id: "missing", majorText: null };
    const partial = { ...program, id: "partial", schoolId: "s2", schoolName: "其他大学", teachingLanguage: "UNKNOWN" };
    const result = buildResults([], [missing, partial], schools, [], { programType: "MASTER", targetMajor: "计算机", teachingLanguage: "ENGLISH" }, false, false);
    expect(result.other.find((card) => card.programId === "missing")?.quality).toBe("insufficient");
    expect(result.other.find((card) => card.programId === "partial")).toMatchObject({ quality: "candidate", fit: "条件待核实" });
  });
  it("搜索过程只在真正开始查询其他学校时报告", () => {
    const open = { ...program, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const events: boolean[] = [];
    const progress = { onPartnerSearchComplete: (state: { searchingOthers: boolean }) => events.push(state.searchingOthers) };
    const partners = [{ name: "示例大学", status: "confirmed" as const, programIds: ["p"] }];
    buildResults([row("示例大学", 3)], [open], schools, partners, { programType: "MASTER" }, false, false, progress);
    buildResults([row("示例大学", 3)], [open], schools, partners, { programType: "MASTER" }, false, true, progress);
    expect(events).toEqual([false, true]);
  });
  it("缺少奖学金资料时保留候选并明确提示，而不是当作不符合", () => {
    const result = buildResults([row("示例大学", 3)], [program], schools, [], { scholarshipType: "any" }, false, false);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].points.find((point) => point.label === "奖学金")).toMatchObject({ level: "UNKNOWN" });
  });
  it("学生没有 CSCA 时，明确要求 CSCA 的本科项目进入待处理", () => {
    const undergraduate = { ...program, programType: "UG", cscaStatus: "REQUIRED" as const };
    const result = buildResults([row("示例大学", 3)], [undergraduate], schools, [], { programType: "UG", hasCsca: false }, false, false);
    expect(result.pending[0].points.find((point) => point.label === "CSCA")).toMatchObject({ level: "NEED" });
    expect(result.pending[0].points.find((point) => point.label === "CSCA")?.text).toContain("学校要求 CSCA");
  });
  it("明确只看不要求 CSCA 的学校时，排除明确要求的项目并保留未知项", () => {
    const undergraduate = { ...program, programType: "UG" };
    const required = buildResults([row("示例大学", 3)], [{ ...undergraduate, cscaStatus: "REQUIRED" }], schools, [], { cscaRequirement: "NOT_REQUIRED" }, false, false);
    const unknown = buildResults([row("示例大学", 3)], [{ ...undergraduate, cscaStatus: "UNKNOWN" }], schools, [], { cscaRequirement: "NOT_REQUIRED" }, false, false);
    expect(required.pending.every((card) => card.kind === "school")).toBe(true);
    expect(unknown.pending[0].points.find((point) => point.label === "学校 CSCA 要求")?.level).toBe("UNKNOWN");
  });
  it("申请截止年份不能当作入学年份，春季信息缺失时保持待核实", () => {
    const p = { ...program, semesterText: null, applicationTimeText: "2027年4月申请截止", deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([row("示例大学", 3)], [p], schools, [], { programType: "MASTER", intakeYear: 2027, intakeSeason: "SPRING" }, false, false);
    expect(result.pending[0].points.find((point) => point.label === "入学年份")?.level).toBe("UNKNOWN");
    expect(result.pending[0].points.find((point) => point.label === "入学季")?.level).toBe("UNKNOWN");
  });
  it("明确只在同年秋季入学的项目不作为春季匹配", () => {
    const p = { ...program, semesterText: "2027年秋季入学", deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([row("示例大学", 3)], [p], schools, [], { programType: "MASTER", intakeYear: 2027, intakeSeason: "SPRING" }, false, false);
    expect(result.confirmed).toHaveLength(0);
    expect(result.pending.every((card) => card.kind === "school")).toBe(true);
  });
  it("明确的同年春季入学可以作为匹配依据", () => {
    const p = { ...program, semesterText: "2027年春季入学", deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([row("示例大学", 3)], [p], schools, [], { programType: "MASTER", intakeYear: 2027, intakeSeason: "SPRING" }, false, false);
    expect(result.confirmed[0].points.find((point) => point.label === "入学季")?.level).toBe("PASS");
  });
  it("招生表学费高于知识库首年总费用时标记冲突，不说预算符合", () => {
    const fields = Array(18).fill(""); fields[11] = "学费12万元/年";
    const listRow = { ...row("示例大学", 3), fields };
    const p = { ...program, firstYearCostMax: 35200, costIncomplete: false, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([listRow], [p], schools, [], { programType: "MASTER", budget: 80000 }, true, false);
    expect(result.confirmed).toHaveLength(0);
    expect(result.pending[0].points.find((point) => point.label === "首年预算")).toMatchObject({ level: "NEED", text: expect.stringContaining("冲突") });
    expect(result.pending[0].comparableCost).toBeNull();
    expect(result.pending[0].facts?.tuitionStatus).toBe("conflict");
    expect(result.pending[0].evidence.join()).toContain("12万元");
  });
  it("名单明确的年学费与知识库首年总费分开记录，重复行费用冲突不猜", () => {
    const firstFields = Array(18).fill(""); firstFields[11] = "学费2万元/年";
    const secondFields = Array(18).fill(""); secondFields[11] = "学费3万元/年";
    const p = { ...program, firstYearCostMax: 60000, costIncomplete: false, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const single = buildResults([{ ...row("示例大学", 3), fields: firstFields }], [p], schools, [], { programType: "MASTER", budget: 80000 }, false, false);
    const known = [...single.confirmed, ...single.pending][0];
    expect(known.facts).toMatchObject({ tuition: 20000, tuitionStatus: "known" });
    expect(known.comparableCost).toBe(60000);
    const conflict = buildResults([{ ...row("示例大学", 3), fields: firstFields }, { ...row("示例大学", 4), fields: secondFields }], [p], schools, [], { programType: "MASTER", budget: 80000 }, false, false);
    expect(conflict.pending[0].facts).toMatchObject({ tuition: null, tuitionStatus: "conflict" });
    expect(conflict.pending[0].comparableCost).toBeNull();
  });
  it("奖学金描述有否定或混合语义时不擅自确认全奖", () => {
    const p = { ...program, scholarshipCategory: "不提供全额奖学金，仅部分资助", deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([row("示例大学", 3)], [p], schools, [], { programType: "MASTER" }, false, false);
    expect([...result.confirmed, ...result.pending][0].facts?.scholarship).toBe("unknown");
  });
  it("招生表费用口径复杂时不直接宣称预算符合", () => {
    const fields = Array(18).fill(""); fields[11] = "中文2万元/年，英文12万元/年";
    const p = { ...program, firstYearCostMax: 35200, costIncomplete: false, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([{ ...row("示例大学", 3), fields }], [p], schools, [], { programType: "MASTER", budget: 80000 }, false, false);
    expect(result.confirmed).toHaveLength(0);
    expect(result.pending[0].points.find((point) => point.label === "首年预算")?.level).toBe("NEED");
    expect(result.pending[0].comparableCost).toBeNull();
    const withoutBudget = buildResults([{ ...row("示例大学", 3), fields }], [p], schools, [], { programType: "MASTER" }, false, false);
    expect([...withoutBudget.confirmed, ...withoutBudget.pending][0].comparableCost).toBeNull();
  });
  it("招生表费用无法比较时不只凭知识库费用排除候选", () => {
    const fields = Array(18).fill(""); fields[11] = "中文学费2万元，英文项目另议";
    const p = { ...program, firstYearCostMax: 120000, costIncomplete: false, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([{ ...row("示例大学", 3), fields }], [p], schools, [], { programType: "MASTER", budget: 80000 }, false, false);
    expect(result.confirmed).toHaveLength(0);
    expect(result.pending[0].points.find((point) => point.label === "首年预算")?.level).toBe("NEED");
  });
  it("招生表与知识库截止日期不同，先提示核实", () => {
    const fields = Array(18).fill(""); fields[15] = "2027年1月31日截止";
    const p = { ...program, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([{ ...row("示例大学", 3), fields }], [p], schools, [], { programType: "MASTER" }, true, false);
    expect(result.confirmed).toHaveLength(0);
    expect(result.pending[0].points.find((point) => point.label === "申请截止")).toMatchObject({ level: "NEED", text: expect.stringContaining("不一致") });
  });
  it("同一院校在名单带状态后缀、知识库使用标准名时只合并为一项，校区不合并", () => {
    const open = { ...program, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const main = { ...open, id: "main", schoolName: "示例大学" };
    const campus = { ...open, id: "campus", schoolName: "示例大学（威海）" };
    const result = buildResults([row("示例大学(公办本科)", 3), row("示例大学（威海）", 4)], [main, campus], [], [], { programType: "MASTER" }, true, false);
    const cards = [...result.confirmed, ...result.pending];
    expect(cards.filter((card) => schoolIdentityKey(card.name) === "示例大学")).toHaveLength(1);
    expect(cards.filter((card) => schoolIdentityKey(card.name) === "示例大学(威海)")).toHaveLength(1);
    expect(result.other).toHaveLength(0);
  });
  it("查看更多院校时排除已展示学校，只返回尚未展示的新学校", () => {
    const open = { ...program, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const first = { ...open, id: "first", schoolName: "已看大学" };
    const second = { ...open, id: "second", schoolName: "新大学" };
    const extra = { ...open, id: "extra", schoolId: "s3", schoolName: "第三大学" };
    const rows = [row("已看大学", 3), row("新大学", 4)];
    const initial = buildResults(rows, [first, second], [], [], { programType: "MASTER" }, false, false);
    const shown = [...initial.confirmed, ...initial.pending].map((card) => card.name);
    expect(shown.sort()).toEqual(["已看大学", "新大学"].sort());
    const more = buildResults(rows, [first, second, extra], [], [], { programType: "MASTER" }, false, true, undefined, { schoolKeys: shown });
    expect(more.excludedSchoolCount).toBe(2);
    expect([...more.confirmed, ...more.pending]).toHaveLength(0);
    expect(more.other.map((card) => card.name)).toEqual(["第三大学"]);
  });
  it("目标年份晚于项目资料年份时，不把历史费用说成预算符合", () => {
    const historical = { ...program, firstYearCostMax: 37000, costIncomplete: false, semesterText: "9月开学", applicationTimeText: "申请截止时间：2026年3月-2026年7月", deadlineDate: null, deadlineStatus: "UNKNOWN" };
    const result = buildResults([row("示例大学", 3)], [historical], schools, [], { programType: "MASTER", budget: 80000, intakeYear: 2027, intakeSeason: "SPRING" }, true, false);
    const card = [...result.confirmed, ...result.pending][0];
    expect(card.facts?.feeFreshness).toBe("historical");
    expect(card.facts?.sourceYear).toBe(2026);
    expect(card.points.find((point) => point.label === "首年预算")).toMatchObject({ level: "NEED", text: expect.stringContaining("2026") });
    expect(feeFreshnessFor({ ...historical, semesterText: "2027年春季入学" }, 2027)).toBe("current");
  });
  it("知识库费用未注明适用年份时，不把预算说成符合", () => {
    const unverified = { ...program, firstYearCostMax: 34150, costIncomplete: false, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([row("示例大学", 3)], [unverified], schools, [], { programType: "MASTER", budget: 80000, intakeYear: 2027, intakeSeason: "SPRING" }, true, false);
    const card = [...result.confirmed, ...result.pending][0];
    expect(card.facts).toMatchObject({ feeFreshness: "unknown", sourceYear: null });
    expect(card.points.find((point) => point.label === "首年预算")).toMatchObject({
      level: "NEED",
      text: expect.stringContaining("未注明适用年份"),
    });
    expect(card.points.find((point) => point.label === "首年预算")?.text).toContain("2027");
  });
  it("仅知识库候选也要校验费用年份，不能绕过待核实标记", () => {
    const unverified = { ...program, schoolId: "s2", schoolName: "知识库大学", firstYearCostMax: 34150, costIncomplete: false, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([], [unverified], [], [], { programType: "MASTER", budget: 80000, intakeYear: 2027, intakeSeason: "SPRING" }, true, false);
    expect(result.other).toHaveLength(1);
    expect(result.other[0].facts).toMatchObject({ feeFreshness: "unknown", sourceYear: null });
    expect(result.other[0].points.find((point) => point.label === "首年预算")).toMatchObject({
      level: "NEED",
      text: expect.stringContaining("未注明适用年份"),
    });
  });
  it("名单已有当期学费时保留该费用，同时把旧年知识库总费用标为待核实", () => {
    const fields = Array(18).fill(""); fields[11] = "学费2万元/年";
    const oldKnowledge = { ...program, firstYearCostMax: 37000, costIncomplete: false, semesterText: "2026年秋季入学", applicationTimeText: "申请截止时间：2026年3月-2026年6月", deadlineDate: null, deadlineStatus: "UNKNOWN" };
    const result = buildResults([{ ...row("示例大学", 3), fields }], [oldKnowledge], schools, [], { programType: "MASTER", budget: 80000, intakeYear: 2027, intakeSeason: "SPRING" }, true, false);
    const card = [...result.confirmed, ...result.pending][0];
    expect(card.facts).toMatchObject({ tuition: 20000, tuitionStatus: "known", feeFreshness: "historical", sourceYear: 2026 });
    expect(card.points.find((point) => point.label === "首年预算")).toMatchObject({
      level: "NEED",
      text: expect.stringContaining("名单列有当期学费"),
    });
    expect(card.points.find((point) => point.label === "首年预算")?.text).toContain("2026");
  });
  it("模型未听到条件时不会把上一轮条件清空，只有明确取消才清空", () => {
    const previous = { programType: "MASTER" as const, targetMajor: "计算机", budget: 80000 };
    expect(mergeCriteria(previous, { budget: null, programType: null }, "还有其他的吗")).toEqual(previous);
    expect(mergeCriteria(previous, { budget: 60000 }, "预算改成 6 万")).toMatchObject({ budget: 60000, targetMajor: "计算机" });
    expect(mergeCriteria(previous, { budget: null, programType: null }, "预算不限，学历不限")).toMatchObject({ budget: null, programType: null, targetMajor: "计算机" });
  });
});

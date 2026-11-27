import { describe, expect, it } from "vitest";
import { evaluateAdmissionRules } from "@/lib/admission-rule-engine";
import type { ChatCriteria, ResultCard } from "@/lib/ai-screening";
import type { ScreeningResponse } from "@/lib/ai-screening-events";
import { buildAdvisorView } from "@/lib/ai-screening-advisor-view";

function makeLocalCard(overrides: Partial<ResultCard> = {}): ResultCard {
  return {
    name: "同济大学",
    schoolKey: "同济大学",
    schoolId: "sch-tongji",
    programId: "prog-tongji-cs",
    program: "同济大学 · 计算机科学与技术硕士",
    fit: "已知条件符合",
    quality: "candidate",
    cooperation: "project_confirmed",
    evidence: ["专业：匹配"],
    points: [
      { label: "申请学历", level: "PASS", text: "有硕士项目" },
      { label: "专业", level: "PASS", text: "专业信息中包含“计算机”" },
      { label: "授课语言", level: "PASS", text: "项目为英文授课" },
      { label: "首年预算", level: "PASS", text: "约 38000 元，在预算内" },
      { label: "英语", level: "PASS", text: "至少一项英语成绩达到要求" },
      { label: "入学季", level: "UNKNOWN", text: "入学季信息不足，暂时无法判断" },
    ],
    kind: "project",
    sources: ["招生表 Sheet1 第 12 行"],
    warning: [],
    yellow: false,
    image: false,
    comparableCost: 38000,
    facts: {
      tuition: 30000,
      tuitionStatus: "known",
      teachingLanguage: "ENGLISH",
      gpaMin: 3.0,
      gpaScale: 4,
      ielts: 6.0,
      toefl: 85,
      duolingo: null,
      hskLevel: null,
      hskScore: null,
      scholarship: "full",
      scholarshipText: "中国政府奖学金、上海市政府奖学金",
      sourceYear: 2027,
      feeFreshness: "current",
    },
    verified: true,
    score: 88,
    tier: "TARGET",
    tierReason: "综合条件契合",
    cityLabel: "上海市 · 杨浦区",
    schoolTags: "985，211，双一流",
    officialUrl: "https://study.tongji.edu.cn/",
    ...overrides,
  };
}

describe("顾问视角实证视图与可点击 [1][2] 溯源", () => {
  it("常规查询去废话、合并去重同校、逐维列出分数/预算/语言/专业依据并挂载可点击 [1][2] 溯源", () => {
    const criteria: ChatCriteria = {
      programType: "MASTER",
      targetMajor: "计算机",
      teachingLanguage: "ENGLISH",
      gpa: 3.3,
      gpaScale: 4,
      ielts: 6.5,
      budget: 80000,
      cities: ["上海"],
      intakeYear: 2027,
      intakeSeason: "AUTUMN",
    };
    const diagnostic = evaluateAdmissionRules(criteria, "计算机英文硕士，GPA 3.3/4.0，雅思 6.5，预算 8 万，首选上海");
    const response: ScreeningResponse = {
      criteria,
      runMode: "partner_priority",
      diagnostic,
      results: {
        confirmed: [makeLocalCard()],
        pending: [],
        other: [],
        otherHidden: false,
      },
      external: {
        mode: "web_search",
        summary: "已按上海优先匹配两所高校。",
        programs: [
          {
            // 同校命中：应与校内同济大学合并为一张卡，不重复展示
            schoolName: "同济大学",
            programName: "Computer Science and Technology (Master)",
            city: "上海",
            schoolNature: "公立 985 / 双一流",
            teachingLanguage: "英文授课",
            duration: "2年",
            tuitionText: "30,000 元/年",
            tuitionAmount: 30000,
            tuitionBasis: "per_year",
            dataYear: 2027,
            windowStatus: "open",
            scholarshipEligible: true,
            scholarshipSummary: "中国政府奖学金、上海市政府奖学金",
            deadline: "2027年4月30日",
            languageRequirement: "雅思 6.0 或托福 85",
            officialUrl: "https://study.tongji.edu.cn/cs-master",
            sourceUrls: ["https://study.tongji.edu.cn/cs-master"],
            tier: "TARGET",
            score: 89,
            fitReason: "上海顶尖工科名校，英文计算机硕士项目成熟",
            caution: "部分方向需提前套磁确认导师名额",
            groundedBySearch: true,
            officialVerified: true,
            isPartner: true,
            partnerBadge: "S级合作",
          },
          {
            schoolName: "上海大学",
            programName: "计算机科学与技术（英文硕士）",
            city: "上海",
            schoolNature: "公立 211 / 双一流",
            teachingLanguage: "英文授课",
            duration: "2年",
            tuitionText: "26,000 元/年",
            tuitionAmount: 26000,
            tuitionBasis: "per_year",
            dataYear: 2027,
            windowStatus: "open",
            scholarshipEligible: true,
            scholarshipSummary: "上海市政府奖学金",
            deadline: "2027年5月15日",
            languageRequirement: "雅思 6.0",
            officialUrl: "https://apply.shu.edu.cn/",
            sourceUrls: ["https://apply.shu.edu.cn/"],
            tier: "SAFE",
            score: 82,
            fitReason: "学费友好且录取友好",
            caution: "申请前请以目标年份官网招生简章核实",
            groundedBySearch: true,
            officialVerified: true,
          },
        ],
        policyNotes: [
          // 常规查询中的通用红线灌水应被过滤
          { title: "法律红线与真实首年账单提醒", content: "严禁非法打工……" },
        ],
        disclaimer: "以官网为准",
      },
      source: "2027春季招生名单.xlsx",
      partnerConfigured: true,
      otherRequested: false,
      sensitiveContext: false,
      prompt: "",
    };

    const view = buildAdvisorView(response);

    expect(view.mode).toBe("screening");
    // 同济大学已合并去重，总共 2 所学校
    expect(view.schools).toHaveLength(2);
    expect(view.schools.map((s) => s.schoolName)).toEqual(["同济大学", "上海大学"]);

    // 常规查询不出现系统黑话、未填条件假设或无关非法打工说教
    const serialized = JSON.stringify(view);
    for (const jargon of ["正常匹配态", "锁池", "守门自检", "槽位", "非法打工", "四年两年", "挂科"]) {
      expect(serialized).not.toContain(jargon);
    }

    // 条件检索表现覆盖所有已输入维度
    const dims = view.conditionChecks.map((c) => c.dimension);
    expect(dims).toEqual(expect.arrayContaining(["目标方向", "分数成绩", "语言要求", "预算/奖学金", "目标地区", "入学批次"]));

    // 同济大学有理有据：分数、预算、语言、专业、合作均对比具体条件并带有效溯源编号
    const tongji = view.schools[0];
    expect(tongji.schoolHref).toBe("/schools/sch-tongji?from=screening&programId=prog-tongji-cs");
    expect(tongji.reasons.find((r) => r.label === "分数")?.text).toContain("3.3/4");
    expect(tongji.reasons.find((r) => r.label === "预算")?.text).toContain("30,000");
    expect(tongji.reasons.find((r) => r.label === "预算")?.text).toContain("80,000");
    expect(tongji.reasons.find((r) => r.label === "语言")?.text).toContain("雅思 6.5");
    expect(tongji.reasons.find((r) => r.label === "语言")?.text).toContain("6");
    expect(tongji.reasons.find((r) => r.label === "专业")?.text).toContain("计算机");

    // 每条依据都绑定有效可点击溯源 ID
    for (const school of view.schools) {
      expect(school.reasons.length).toBeGreaterThanOrEqual(3);
      for (const reason of school.reasons) {
        expect(reason.citationIds.length).toBeGreaterThan(0);
        for (const id of reason.citationIds) {
          expect(view.citations.some((c) => c.id === id)).toBe(true);
        }
      }
    }

    // 溯源注册表包含官网链接与校内项目直达链接
    expect(view.citations.some((c) => c.kind === "official" && c.href === "https://study.tongji.edu.cn/cs-master")).toBe(true);
    expect(view.citations.some((c) => c.kind === "kb" && c.href === "/schools/sch-tongji?from=screening&programId=prog-tongji-cs")).toBe(true);
    expect(view.citations.some((c) => c.kind === "official" && c.href === "https://apply.shu.edu.cn/")).toBe(true);

    // 常规查询过滤掉灌水 policyNotes
    expect(view.policyNotes).toHaveLength(0);
  });

  it("硬熔断场景零院校泄露并清晰说明差距与补齐动作", () => {
    const criteria: ChatCriteria = {
      programType: "UG",
      targetMajor: "计算机",
      gpa: 60,
      gpaScale: 100,
      languageStatus: "CONFIRMED_NONE",
      budget: 5000,
      scholarshipType: "full",
    };
    const diagnostic = evaluateAdmissionRules(criteria, "均分60%，无语言，预算5000元求全奖本科");
    const response: ScreeningResponse = {
      criteria,
      diagnostic,
      results: { confirmed: [], pending: [], other: [], otherHidden: true },
      external: null,
      source: "",
      partnerConfigured: false,
      otherRequested: false,
      sensitiveContext: false,
      prompt: "",
    };

    const view = buildAdvisorView(response);
    expect(view.mode).toBe("circuit_breaker");
    expect(view.schools).toHaveLength(0);
    expect(view.circuitBreakerBanner?.reason).toContain("12,400");
    expect(view.circuitBreakerBanner?.actions.length).toBeGreaterThan(0);
    expect(view.conditionChecks.some((c) => c.dimension === "预算/奖学金" && c.status === "limit")).toBe(true);
  });

  it("追问单校学费或理由时自动为回答挂上可点击校内档案与官网溯源编号", () => {
    const card = makeLocalCard();
    const response: ScreeningResponse = {
      criteria: { programType: "MASTER", targetMajor: "计算机" },
      results: { confirmed: [card], pending: [], other: [], otherHidden: false },
      source: "2027春季名单.xlsx",
      partnerConfigured: true,
      otherRequested: false,
      sensitiveContext: false,
      prompt: "",
      focusSchool: "同济大学",
      answer: {
        school: "同济大学",
        lead: "同济大学在招生名单中的对应学历栏写的是每年 30,000 元。",
        details: ["这个金额是否适用当前项目和招生批次，还要向学校确认。"],
      },
    };

    const view = buildAdvisorView(response);
    expect(view.mode).toBe("follow_up");
    expect(view.followUp?.leadCitationIds.length).toBeGreaterThanOrEqual(2);
    expect(view.followUp?.details[0].citationIds.length).toBeGreaterThan(0);
    expect(view.citations.some((c) => c.kind === "kb" && c.href?.includes("sch-tongji"))).toBe(true);
    expect(view.citations.some((c) => c.kind === "official" && c.href === "https://study.tongji.edu.cn/")).toBe(true);
  });

  it("模式三合作库快检生成结构化依据与合作台账溯源", () => {
    const response: ScreeningResponse = {
      criteria: { programType: "UG", budget: 20000 },
      runMode: "partner_quick",
      results: { confirmed: [], pending: [], other: [], otherHidden: true },
      partnerQuick: {
        totalMatched: 1,
        nonPartnerWarnings: [],
        blockedByPolicy: [],
        blockedByGpaBand: [],
        redactedForPrivilege: true,
        results: [
          {
            schoolName: "广西工商职业技术学院",
            nameEn: "Guangxi Vocational College",
            city: "南宁",
            schoolLevel: "diploma",
            schoolLevelLabel: "高职专科",
            coopStatus: "active",
            partnerTier: "A",
            partnerRank: 4,
            contactPerson: "",
            partnerBadgeText: "A级合作",
            matchedLevel: "diploma",
            matchedLevelLabel: "专科/高职",
            tuitionText: "首年免学费住宿",
            minYearlyRmb: 12800,
            languages: ["中文"],
            intakes: ["秋季"],
            spring2027Status: "unknown",
            scholarshipSummary: "首年免学费住宿通道",
            dormitory: "校内宿舍",
            deadlineSummary: "2027年6月",
            requirementsSummary: "高中或中专毕业，零基础可衔接汉语",
            majorMatchScore: 80,
            majorMatchTag: "计算机应用技术",
            nationalityTag: "生源常规开放",
            budgetNote: "",
            partnerNote: "",
          },
        ],
      },
      source: "内部合作院校库",
      partnerConfigured: true,
      otherRequested: false,
      sensitiveContext: false,
      prompt: "",
    };

    const view = buildAdvisorView(response);
    expect(view.mode).toBe("partner_quick");
    expect(view.schools).toHaveLength(1);
    expect(view.schools[0].reasons.length).toBeGreaterThanOrEqual(2);
    expect(view.schools[0].reasons[0].citationIds).toEqual([1]);
    expect(view.citations).toHaveLength(1);
    expect(view.citations[0].kind).toBe("partner");
  });
});

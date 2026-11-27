import { describe, expect, it, vi } from "vitest";
import goldenCasesRaw from "@/data/golden-cases.json";
import {
  evaluateAdmissionRules,
  evaluateSchoolAgainstRules,
  LEGAL_NO_ILLEGAL_WORK_NOTICE,
  normalizeInternationalScore,
} from "@/lib/admission-rule-engine";
import { buildResults, type ChatCriteria, type ResultCard } from "@/lib/ai-screening";
import { buildExternalSearchQueries, generateExternalScreening } from "@/lib/ai-screening-external";
import type { MatchProgram } from "@/lib/matcher";
import { searchPartnerSchools } from "@/lib/partner-school-engine";
import {
  classifyStudentAcademicBand,
  evaluateAcademicTierEligibility,
} from "@/lib/screening-ranking";
import { buildV31ReportPayload } from "@/lib/v31-report-builder";

type GoldenCase = {
  id: string;
  title: string;
  category: string;
  message: string;
  criteria: ChatCriteria;
  expected: {
    state: "NORMAL" | "DOWNGRADE_LOCK" | "CIRCUIT_BREAKER";
    finalTier?: "T1" | "T2" | "T3" | "T4" | "T5";
    cscAllowed: boolean;
    blockDirectDegree?: boolean;
    allowVocationalDiploma?: boolean;
    mustAllowSchools?: string[];
    mustBlockSchools?: string[];
    mustIncludeFallbackSchools?: string[];
  };
};

const goldenCases = goldenCasesRaw as GoldenCase[];

function makeProgram(overrides: Partial<MatchProgram> & { schoolName: string }): MatchProgram {
  return {
    id: `prog-${overrides.schoolName}`,
    schoolId: `sch-${overrides.schoolName}`,
    schoolTags: null,
    programName: `${overrides.schoolName} · 计算机本科`,
    programType: "UG",
    teachingLanguage: "CHINESE",
    majorText: "计算机科学与技术、工商管理",
    requirementsText: null,
    sourceText: null,
    semesterText: "2027年秋季入学",
    applicationTimeText: "2027年5月31日截止",
    accommodationText: "校内宿舍",
    firstYearCostMax: 20000,
    costIncomplete: false,
    cscaStatus: "NOT_REQUIRED",
    gpaMin: null,
    gpaScale: null,
    hskLevelMin: null,
    hskScoreMin: null,
    ieltsMin: null,
    toeflMin: null,
    duolingoMin: null,
    minAge: null,
    maxAge: null,
    deadlineDate: new Date("2027-05-31T00:00:00Z"),
    deadlineStatus: "OPEN",
    scholarshipCategory: "全额奖学金/CSC",
    province: "北京市",
    city: "北京市",
    partnershipRating: 3,
    qsRanking: null,
    reviewStatus: "VERIFIED",
    manuallyVerified: true,
    ...overrides,
  };
}

describe("五阶段各得其位匹配引擎 — C1–C10 黄金回归压测集（零越级 100% + 零误杀 100%）", () => {
  it.each(goldenCases)("$id: $title", (tc) => {
    const diag = evaluateAdmissionRules(tc.criteria, tc.message);
    expect(diag.state).toBe(tc.expected.state);
    if (tc.expected.finalTier) {
      expect(diag.finalTier).toBe(tc.expected.finalTier);
    }
    expect(diag.scholarshipPolicy.cscAllowed).toBe(tc.expected.cscAllowed);
    if (tc.expected.blockDirectDegree !== undefined) {
      expect(diag.blockDirectDegree).toBe(tc.expected.blockDirectDegree);
    }
    if (tc.expected.allowVocationalDiploma !== undefined) {
      expect(diag.allowVocationalDiploma).toBe(tc.expected.allowVocationalDiploma);
    }

    for (const blockedName of tc.expected.mustBlockSchools ?? []) {
      const check = evaluateSchoolAgainstRules(diag, tc.criteria, {
        schoolName: blockedName,
        programName: `${blockedName} · ${tc.criteria.programType === "MASTER" ? "常规硕士" : "常规本科"}`,
        programType: tc.criteria.programType ?? "UG",
        teachingLanguage: tc.criteria.teachingLanguage ?? "CHINESE",
      });
      expect(check.eligible, `${tc.id} 绝不可放行违规校 ${blockedName}`).toBe(false);
    }

    for (const allowedName of tc.expected.mustAllowSchools ?? []) {
      const check = evaluateSchoolAgainstRules(diag, tc.criteria, {
        schoolName: allowedName,
        programName: `${allowedName} · ${tc.criteria.programType === "MASTER" ? "硕士项目" : "本科项目"}`,
        programType: tc.criteria.programType ?? "UG",
        teachingLanguage: tc.criteria.teachingLanguage ?? "CHINESE",
      });
      expect(check.eligible, `${tc.id} 不得误杀合规校 ${allowedName}：${check.reasons.join("；")}`).toBe(true);
    }

    for (const fbSchool of tc.expected.mustIncludeFallbackSchools ?? []) {
      expect(
        diag.curatedFallbacks.some((f) => f.schoolName === fbSchool),
        `${tc.id} 降级承接池应包含 ${fbSchool}`,
      ).toBe(true);
    }

    // Legal compliance law must always be present
    expect(diag.advisory.legalComplianceNotice).toBe(LEGAL_NO_ILLEGAL_WORK_NOTICE);
  });

  it("跨国成绩归一化防高分误杀：英国本科 2:1 (65%)、法语区 14/20、德国反向制 1.5", () => {
    const uk = normalizeInternationalScore({ gpa: 65, gpaScale: 100, gradeSystem: "UK_HONOURS" });
    expect(uk.initialTier).toBe("T2");
    expect(uk.normPct).toBeGreaterThanOrEqual(78);

    const fr = normalizeInternationalScore({ gpa: 14, gpaScale: 20, gradeSystem: "FR_20" });
    expect(fr.initialTier).toBe("T2");
    expect(fr.normPct).toBeGreaterThanOrEqual(75);

    const de = normalizeInternationalScore({ gpa: 1.5, gpaScale: 5, gradeSystem: "DE_REVERSE" });
    expect(de.initialTier).toBe("T1");
    expect(de.normPct).toBeGreaterThanOrEqual(88);
  });

  it("三级英语豁免与 MOI 高风控拦截：6 国护照豁免放行，南亚/非洲 MOI 被清华/上交/北理/南大硬拦截", () => {
    const moiCriteria: ChatCriteria = {
      nationality: "巴基斯坦",
      programType: "MASTER",
      teachingLanguage: "ENGLISH",
      targetMajor: "计算机",
      gpa: 3.7,
      gpaScale: 4,
      languageStatus: "MOI_ONLY",
      hasMoiCertificate: true,
      budget: 80000,
    };
    const moiDiag = evaluateAdmissionRules(moiCriteria, "仅提供本科英文授课证明 MOI");
    expect(moiDiag.englishExemption).toBe("MOI_HIGH_RISK");
    for (const strictUni of ["清华大学", "上海交通大学", "北京理工大学", "南京大学"]) {
      const decision = evaluateSchoolAgainstRules(moiDiag, moiCriteria, {
        schoolName: strictUni,
        programType: "MASTER",
        teachingLanguage: "ENGLISH",
        programName: `${strictUni} 计算机英文硕士`,
      });
      expect(decision.eligible).toBe(false);
      expect(decision.reasons.join()).toContain("MOI");
    }

    const nativeCriteria: ChatCriteria = {
      ...moiCriteria,
      nationality: "英国",
      languageStatus: "NATIVE_6",
      hasMoiCertificate: false,
    };
    const nativeDiag = evaluateAdmissionRules(nativeCriteria);
    expect(nativeDiag.englishExemption).toBe("NATIVE_EXEMPT");
    const tsinghuaNative = evaluateSchoolAgainstRules(nativeDiag, nativeCriteria, {
      schoolName: "清华大学",
      programType: "MASTER",
      teachingLanguage: "ENGLISH",
      programName: "清华大学 计算机英文硕士",
    });
    expect(tsinghuaNative.eligible).toBe(true);
  });

  it("专业与轮次动态偏移：英文 MBBS 强锁教育部 43 校白名单、4 月后下调 T1 全奖预期、强校考提示", () => {
    const mbbsCriteria: ChatCriteria = {
      programType: "UG",
      teachingLanguage: "ENGLISH",
      targetMajor: "MBBS 临床医学",
      gpa: 82,
      gpaScale: 100,
      ielts: 6.5,
      mbbsSubjectScores: { physics: 58, chemistry: 75, biology: 78 },
      budget: 60000,
      consultationMonth: 4,
    };
    const mbbsDiag = evaluateAdmissionRules(mbbsCriteria, "4月咨询英文授课临床医学 MBBS");
    expect(mbbsDiag.requireMoe43Mbbs).toBe(true);
    expect(mbbsDiag.modifiers.some((m) => m.type === "ENGLISH_MBBS_43" && m.action.includes("物理"))).toBe(true);
    expect(mbbsDiag.modifiers.some((m) => m.type === "T1_LATE_ROUND")).toBe(true);

    // 43-school whitelist school passes; non-whitelist school is blocked
    expect(evaluateSchoolAgainstRules(mbbsDiag, mbbsCriteria, {
      schoolName: "江苏大学",
      programType: "UG",
      teachingLanguage: "ENGLISH",
      programName: "MBBS",
    }).eligible).toBe(true);
    expect(evaluateSchoolAgainstRules(mbbsDiag, mbbsCriteria, {
      schoolName: "浙江工商大学",
      programType: "UG",
      teachingLanguage: "ENGLISH",
      programName: "MBBS",
    }).eligible).toBe(false);

    // Strong school exam warning on SUSTech
    const topDiag = evaluateAdmissionRules({
      programType: "UG",
      teachingLanguage: "ENGLISH",
      gpa: 92,
      gpaScale: 100,
      ielts: 7.5,
      cscaMinSubjectScore: 90,
      budget: 80000,
    });
    const sustech = evaluateSchoolAgainstRules(topDiag, { programType: "UG", budget: 80000 }, {
      schoolName: "南方科技大学",
      programType: "UG",
      teachingLanguage: "ENGLISH",
      programName: "计算机本科",
    });
    expect(sustech.eligible).toBe(true);
    expect(sustech.warnings.join()).toContain("禁计算器");
  });

  it("法定合规一票否决（未满四年两年华裔 / 活动性肺结核 / 材料造假）触发 CIRCUIT_BREAKER 零泄露", () => {
    for (const flag of ["UNDER_FOUR_TWO_RULE", "TB_ACTIVE", "DOC_FRAUD"]) {
      const c: ChatCriteria = { programType: "UG", gpa: 90, gpaScale: 100, ielts: 7.0, budget: 100000, complianceFlags: [flag] };
      const diag = evaluateAdmissionRules(c);
      expect(diag.state).toBe("CIRCUIT_BREAKER");
      expect(buildExternalSearchQueries(c, diag)).toEqual([]);
      const localRes = buildResults(
        [],
        [makeProgram({ schoolName: "清华大学", schoolTags: "985，211" })],
        [],
        [],
        c,
        true,
        true,
        undefined,
        undefined,
        undefined,
        diag,
      );
      expect(localRes.confirmed).toHaveLength(0);
      expect(localRes.pending).toHaveLength(0);
      expect(localRes.other).toHaveLength(0);
    }
  });

  it("C8 实测合作库：16,000 元低预算零语言不误杀，能在合作库精准检索出广西工商职业技术学院", () => {
    const c8 = goldenCases.find((c) => c.id === "C8")!;
    const diag = evaluateAdmissionRules(c8.criteria, c8.message);
    const partnerRes = searchPartnerSchools(
      { level: "bachelor", budget: 16000, diagnostic: diag, criteria: c8.criteria },
      { privileged: true },
    );
    expect(partnerRes.totalMatched).toBeGreaterThan(0);
    expect(partnerRes.results.some((r) => r.schoolName === "广西工商职业技术学院")).toBe(true);
    expect(partnerRes.results.some((r) => r.schoolName === "哈尔滨工业大学" || r.schoolName === "上海大学")).toBe(false);
  });

  it("C7 硬熔断与 C5 后置硬校验：即使 LLM 违抗 Prompt 乱推名校或诱导校外打工，确定性代码 100% 拦截净化", async () => {
    // 1. C7 circuit breaker never invokes external fetch and returns null + 0 schools in v3.1 report
    const c7 = goldenCases.find((c) => c.id === "C7")!;
    const c7Diag = evaluateAdmissionRules(c7.criteria, c7.message);
    const fetchSpy = vi.fn();
    const c7Ext = await generateExternalScreening(
      { sanitizedMessage: c7.message, criteria: c7.criteria, localSchoolNames: [], diagnostic: c7Diag },
      { apiKey: "fixture-key", fetchImpl: fetchSpy },
    );
    expect(c7Ext).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    const c7Report = buildV31ReportPayload({
      runMode: "partner_priority",
      criteria: c7.criteria,
      localCards: [],
      external: null,
      privileged: true,
      diagnostic: c7Diag,
    });
    expect(c7Report.report.tiers.reach.schools).toHaveLength(0);
    expect(c7Report.report.tiers.match.schools).toHaveLength(0);
    expect(c7Report.report.tiers.safety.schools).toHaveLength(0);
    expect(c7Report.gates.allPassed).toBe(true);

    // 2. C5 post-LLM hard validator strips 211/tier-1 direct UG and sanitizes illegal work hint
    const c5 = goldenCases.find((c) => c.id === "C5")!;
    const c5Diag = evaluateAdmissionRules(c5.criteria, c5.message);
    const rogueFetch = vi.fn<typeof fetch>(async () => Response.json({
      usage: { server_tool_use: { tool_search: 1 } },
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            summary: "测试越级输出",
            programs: [
              {
                schoolName: "上海大学",
                programName: "计算机本科直录",
                city: "上海",
                schoolNature: "211",
                teachingLanguage: "中文授课",
                duration: "4年",
                tuitionAmount: 24000,
                scholarshipEligible: true,
                scholarshipSummary: "CSC全额奖学金",
                tier: "REACH",
                fitReason: "名校",
                caution: "无",
              },
              {
                schoolName: "广西工商职业技术学院",
                programName: "高职大专-计算机应用技术",
                city: "南宁",
                schoolNature: "公办高职大专",
                teachingLanguage: "中文授课（零基础起步）",
                duration: "3年",
                tuitionAmount: 12800,
                scholarshipEligible: false,
                scholarshipSummary: "首年免学费住宿",
                tier: "SAFE",
                fitReason: "可通过校外打工赚学费补贴开销",
                caution: "语言零基础须按学校要求补汉语",
              },
            ],
          }),
        },
      }],
    }));

    const c5Ext = await generateExternalScreening(
      { sanitizedMessage: c5.message, criteria: c5.criteria, localSchoolNames: [], diagnostic: c5Diag },
      { apiKey: "fixture-key", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", fetchImpl: rogueFetch, enableFactDb: false },
    );
    expect(c5Ext).not.toBeNull();
    expect(c5Ext!.programs.map((p) => p.schoolName)).toEqual(["广西工商职业技术学院"]);
    expect(c5Ext!.excludedNotes?.some((n) => n.includes("上海大学"))).toBe(true);
    expect(c5Ext!.programs[0].fitReason).not.toContain("打工赚学费");
    expect(c5Ext!.programs[0].fitReason).toContain("大一新生依法严禁校外勤工助学");
  });

  it("浏览器实测回归 1：跨国分制在旧排名层零误杀（德国 1.5 分判优秀且放行 985，法语 14/20 与英国 2:1 判良好）", () => {
    const deBand = classifyStudentAcademicBand({ gpa: 1.5, gpaScale: 5, gradeSystem: "DE_REVERSE" });
    expect(deBand?.band).toBe(5);
    expect(deBand?.label).toBe("优秀");

    const deEligibility = evaluateAcademicTierEligibility(
      { gpa: 1.5, gpaScale: 5, gradeSystem: "DE_REVERSE", programType: "UG" },
      { schoolName: "上海交通大学", schoolTags: "985，211，双一流", qsRanking: 50 },
    );
    expect(deEligibility.eligible).toBe(true);

    const frBand = classifyStudentAcademicBand({ gpa: 14, gpaScale: 20, gradeSystem: "FR_20" });
    expect(frBand?.band).toBe(4);
    expect(frBand?.label).toBe("良好");

    const ukBand = classifyStudentAcademicBand({ gpa: 65, gpaScale: 100, gradeSystem: "UK_HONOURS" });
    expect(ukBand?.band).toBe(4);
    expect(ukBand?.label).toBe("良好");
  });

  it("浏览器实测回归 2：DOWNGRADE_LOCK 严禁校内“本科 · 中文授课”普通直录漏出（如衡阳师范学院、邵阳学院）", () => {
    const c5 = goldenCases.find((c) => c.id === "C5")!;
    const diag = evaluateAdmissionRules(c5.criteria, c5.message);
    expect(diag.state).toBe("DOWNGRADE_LOCK");
    expect(diag.blockDirectDegree).toBe(true);

    const hengyang = makeProgram({
      schoolName: "衡阳师范学院",
      programName: "衡阳师范学院 · 本科 · 中文授课",
      programType: "UG",
      teachingLanguage: "CHINESE",
      firstYearCostMax: 15000,
    });
    const shaoyang = makeProgram({
      schoolName: "邵阳学院",
      programName: "邵阳学院 · 本科 · 中文授课",
      programType: "UG",
      teachingLanguage: "CHINESE",
      firstYearCostMax: 14800,
    });
    const prepAllowed = makeProgram({
      schoolName: "红河学院",
      programName: "红河学院 · 1年汉语预科+本科（1+4）",
      programType: "PREP",
      teachingLanguage: "CHINESE",
      firstYearCostMax: 14000,
    });
    const zeroBaseAllowed = makeProgram({
      schoolName: "沈阳师范大学",
      programName: "沈阳师范大学 · 零基础汉语言本科",
      programType: "UG",
      teachingLanguage: "CHINESE",
      firstYearCostMax: 16000,
    });

    expect(evaluateSchoolAgainstRules(diag, c5.criteria, {
      schoolName: hengyang.schoolName,
      programName: hengyang.programName,
      programType: hengyang.programType,
      teachingLanguage: hengyang.teachingLanguage,
      firstYearCostMax: hengyang.firstYearCostMax,
    }).eligible).toBe(false);

    expect(evaluateSchoolAgainstRules(diag, c5.criteria, {
      schoolName: shaoyang.schoolName,
      programName: shaoyang.programName,
      programType: shaoyang.programType,
      teachingLanguage: shaoyang.teachingLanguage,
      firstYearCostMax: shaoyang.firstYearCostMax,
    }).eligible).toBe(false);

    expect(evaluateSchoolAgainstRules(diag, c5.criteria, {
      schoolName: prepAllowed.schoolName,
      programName: prepAllowed.programName,
      programType: prepAllowed.programType,
      teachingLanguage: prepAllowed.teachingLanguage,
      firstYearCostMax: prepAllowed.firstYearCostMax,
    }).eligible).toBe(true);

    expect(evaluateSchoolAgainstRules(diag, c5.criteria, {
      schoolName: zeroBaseAllowed.schoolName,
      programName: zeroBaseAllowed.programName,
      programType: zeroBaseAllowed.programType,
      teachingLanguage: zeroBaseAllowed.teachingLanguage,
      firstYearCostMax: zeroBaseAllowed.firstYearCostMax,
    }).eligible).toBe(true);

    const localRes = buildResults(
      [],
      [hengyang, shaoyang, prepAllowed],
      [],
      [],
      c5.criteria,
      true,
      true,
      undefined,
      undefined,
      undefined,
      diag,
    );
    const allReturnedNames = [...localRes.confirmed, ...localRes.pending, ...localRes.other].map((c) => c.name);
    expect(allReturnedNames).not.toContain("衡阳师范学院");
    expect(allReturnedNames).not.toContain("邵阳学院");
  });

  it("浏览器实测回归 3：v3.1 报告处理校内合作库卡片时不产生无来源虚构假阳性，25 项守门全通过", () => {
    const localCard: ResultCard = {
      name: "浙江工商大学",
      schoolKey: "浙江工商大学",
      schoolId: "sch-zjgs",
      programId: "prog-zjgs-cs",
      program: "计算机科学与技术（本科）",
      fit: "档位与预算均匹配",
      quality: "candidate",
      cooperation: "listed",
      evidence: ["2027年秋季", "省政府奖学金"],
      points: [{ label: "语言", level: "PASS", text: "HSK4 达标" }],
      kind: "project",
      sources: ["校内合作库"],
      warning: [],
      yellow: false,
      image: false,
      comparableCost: 18000,
      facts: {
        tuition: 18000,
        tuitionStatus: "known",
        teachingLanguage: "CHINESE",
        ielts: null,
        toefl: null,
        duolingo: null,
        hskLevel: 4,
        hskScore: 180,
        scholarship: "available",
        scholarshipText: "省政府奖学金（非全额）",
        sourceYear: 2027,
        feeFreshness: "current",
      },
      verified: true,
      score: 82,
      tier: "TARGET",
      tierReason: "档位与预算均匹配",
      cityLabel: "杭州",
      schoolTags: "省属重点",
      qsRanking: null,
    };

    const criteria: ChatCriteria = {
      programType: "UG",
      teachingLanguage: "CHINESE",
      targetMajor: "计算机",
      gpa: 72,
      gpaScale: 100,
      hskLevel: 4,
      hskScore: 210,
      cscaMinSubjectScore: 72,
      budget: 40000,
      intakeYear: 2027,
    };
    const diag = evaluateAdmissionRules(criteria, "高中均分72%，HSK4 210分，CSCA 72分，预算4万，本科计算机");
    const built = buildV31ReportPayload({
      runMode: "partner_priority",
      criteria,
      localCards: [localCard],
      external: null,
      privileged: true,
      diagnostic: diag,
    });

    expect(built.gates.totalCount).toBe(25);
    expect(built.gates.fabricationWarnings).toHaveLength(0);
    expect(built.gates.allPassed).toBe(true);
  });
});

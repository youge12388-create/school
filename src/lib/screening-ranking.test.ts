import { describe, expect, it } from "vitest";
import {
  assessStudentCompetitiveness,
  assignAdmissionTier,
  classifyStudentAcademicBand,
  evaluateAcademicTierEligibility,
  inferSchoolAdmissionBand,
  inferSchoolPrestige,
  isJuniorCollegeOrSecondarySchool,
  matchesTargetSchoolPool,
  normalizeGpaPercent,
  rebalancePoolTiers,
  scoreCandidate,
  selectBalancedCandidates,
  type RankingCriteria,
} from "./screening-ranking";

describe("综合选校评分与冲稳保梯度分层算法", () => {
  it("准确识别目标院校参考池（含简称与英文缩写）", () => {
    const pool = ["清华大学Global MBA", "北京大学", "复旦大学", "同济大学", "浙江大学", "中欧CEIBS", "ECUPL"];
    expect(matchesTargetSchoolPool("清华大学", pool)).toBe(true);
    expect(matchesTargetSchoolPool("中欧国际工商学院", pool)).toBe(true);
    expect(matchesTargetSchoolPool("华东政法大学", pool)).toBe(true);
    expect(matchesTargetSchoolPool("上海交通大学", pool)).toBe(false);
  });

  it("忽略 qsRanking=0 等脏数据，准确判定院校实力档次", () => {
    expect(inferSchoolPrestige("嘉兴大学", null, 0).band).toBe(5);
    expect(inferSchoolPrestige("清华大学", "985，211，双一流", 20).band).toBe(1);
    expect(inferSchoolPrestige("同济大学", "985，211，双一流", 177).band).toBe(2);
    expect(inferSchoolPrestige("上海大学", "211，双一流", null).band).toBe(3);
  });

  it("跨分制 GPA 归一化可正确区分 3.02/4.0 与 4.83/5.0 竞争力", () => {
    expect(normalizeGpaPercent(3.02, 4.0)).toBeCloseTo(75.5, 1);
    expect(normalizeGpaPercent(4.83, 5.0)).toBeCloseTo(96.6, 1);
    expect(normalizeGpaPercent(88, 100)).toBe(88);

    const case1 = assessStudentCompetitiveness({
      teachingLanguage: "ENGLISH",
      gpa: 3.02,
      gpaScale: 4.0,
      excludeSelfFunded: true,
    });
    const case2 = assessStudentCompetitiveness({
      teachingLanguage: "ENGLISH",
      gpa: 4.83,
      gpaScale: 5.0,
      plannedExams: "CSCA数学(2026年11月)、雅思目标7.0(2026年11月)",
    });
    expect(case2.strength).toBeGreaterThan(case1.strength);
  });

  it("为不同学生画像与院校档次分配合理的 Reach / Target / Safe 梯度", () => {
    const case1Criteria: RankingCriteria = {
      programType: "MASTER",
      teachingLanguage: "ENGLISH",
      gpa: 3.02,
      gpaScale: 4.0,
      excludeSelfFunded: true,
    };
    expect(assignAdmissionTier(1, case1Criteria, { requiresGmatOrGre: true }).tier).toBe("REACH");
    expect(assignAdmissionTier(2, case1Criteria, { scholarshipOnly: true }).tier).toBe("REACH");
    expect(assignAdmissionTier(4, case1Criteria).tier).toBe("TARGET");
    expect(assignAdmissionTier(5, case1Criteria).tier).toBe("SAFE");

    const case2Criteria: RankingCriteria = {
      programType: "UG",
      teachingLanguage: "ENGLISH",
      gpa: 4.83,
      gpaScale: 5.0,
      plannedExams: "雅思目标7.0",
    };
    expect(assignAdmissionTier(1, case2Criteria).tier).toBe("REACH");
    expect(assignAdmissionTier(2, case2Criteria).tier).toBe("TARGET");
    expect(assignAdmissionTier(3, case2Criteria).tier).toBe("SAFE");
  });

  it("综合评分优先高匹配度与高院校层次，合作院校加分但不压死更优匹配", () => {
    const criteria: RankingCriteria = {
      programType: "MASTER",
      teachingLanguage: "ENGLISH",
      targetMajors: ["建筑国际MBA", "绿色建筑", "可持续建筑"],
      cities: ["北京", "上海"],
      fallbackCities: ["杭州"],
      targetSchools: ["同济大学", "清华大学"],
      gpa: 3.02,
      gpaScale: 4.0,
      excludeSelfFunded: true,
    };
    const topTarget = scoreCandidate({
      schoolName: "同济大学",
      schoolTags: "985，211，双一流",
      qsRanking: 177,
      cooperation: "unknown",
      verified: true,
      feeFreshness: "current",
      scholarshipCategory: "中国政府奖学金、上海市政府奖学金",
      majorMatchType: "exact",
      points: [
        { label: "专业", level: "PASS", text: "绿色建筑" },
        { label: "地区", level: "PASS", text: "上海市 · 杨浦区" },
        { label: "申请学历", level: "PASS", text: "硕士" },
        { label: "授课语言", level: "PASS", text: "英文授课" },
        { label: "奖学金", level: "PASS", text: "有奖学金（匹配：CSC）" },
      ],
    }, criteria);

    const weakPartner = scoreCandidate({
      schoolName: "某普通学院",
      schoolTags: null,
      qsRanking: 0,
      cooperation: "listed",
      verified: false,
      scholarshipCategory: "校内部分奖学金",
      majorMatchType: "semantic",
      isFallbackCity: true,
      points: [
        { label: "专业", level: "NEED", text: "语义相关" },
        { label: "地区", level: "PASS", text: "备选城市：杭州市" },
        { label: "申请学历", level: "PASS", text: "硕士" },
        { label: "授课语言", level: "PASS", text: "英文授课" },
      ],
    }, criteria);

    expect(topTarget.total).toBeGreaterThan(weakPartner.total);
    expect(topTarget.fitScore).toBeGreaterThan(weakPartner.fitScore);
    expect(topTarget.prestigeScore).toBeGreaterThan(weakPartner.prestigeScore);
  });

  it("候选众多时按冲刺/匹配/稳妥三档均衡精选最多 9 所，避免单一档位扎堆", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, score: 95 - i, tier: "REACH" as const })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, score: 85 - i, tier: "TARGET" as const })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, score: 75 - i, tier: "SAFE" as const })),
    ];
    const picked = selectBalancedCandidates(
      items,
      { keyOf: (x) => x.id, scoreOf: (x) => x.score, tierOf: (x) => x.tier },
      9,
      true,
    );
    expect(picked).toHaveLength(9);
    expect(picked.filter((x) => x.tier === "REACH")).toHaveLength(3);
    expect(picked.filter((x) => x.tier === "TARGET")).toHaveLength(3);
    expect(picked.filter((x) => x.tier === "SAFE")).toHaveLength(3);
  });

  it("原始分制五档划分、差生成绩硬淘汰、专科排除与保底缺口不强行凑数", () => {
    // 1. 原始分制不跨分制线性换算，按各自标尺定档
    expect(classifyStudentAcademicBand({ gpa: 3.6, gpaScale: 4 })?.band).toBe(5);
    expect(classifyStudentAcademicBand({ gpa: 4.1, gpaScale: 5 })?.band).toBe(4);
    expect(classifyStudentAcademicBand({ gpa: 58, gpaScale: 100 })?.band).toBe(2);
    expect(classifyStudentAcademicBand({ gpa: 1.8, gpaScale: 4 })?.band).toBe(1);
    expect(classifyStudentAcademicBand({ academicLevel: "POOR" })?.band).toBe(1);

    // 2. 专科/高职识别 + 完整 985/211 字典兜底识别
    expect(isJuniorCollegeOrSecondarySchool("广东岭南职业技术学院", null)).toBe(true);
    expect(isJuniorCollegeOrSecondarySchool("温州职业技术学校", null)).toBe(true);
    expect(isJuniorCollegeOrSecondarySchool("哈尔滨市龙江旅游学校", null)).toBe(true);
    expect(isJuniorCollegeOrSecondarySchool("上海市工商外国语学院", null)).toBe(true);
    expect(isJuniorCollegeOrSecondarySchool("深圳职业技术大学", null)).toBe(false);
    expect(isJuniorCollegeOrSecondarySchool("沈阳城市建设学院", "民办本科")).toBe(false);
    expect(inferSchoolAdmissionBand("电子科技大学", null).admissionBand).toBe(5);
    expect(inferSchoolAdmissionBand("西安电子科技大学", null).admissionBand).toBe(4);

    // 3. 偏弱(2.1/4.0) 与 弱(POOR) 硬性淘汰 985/211，中等(2.6/4.0)淘汰 985 但 211 保留冲刺
    const weakStudent: RankingCriteria = { programType: "MASTER", gpa: 2.1, gpaScale: 4 };
    expect(evaluateAcademicTierEligibility(weakStudent, { schoolName: "清华大学", schoolTags: "985，211" }).eligible).toBe(false);
    expect(evaluateAcademicTierEligibility(weakStudent, { schoolName: "上海大学", schoolTags: "211" }).eligible).toBe(false);
    expect(evaluateAcademicTierEligibility(weakStudent, { schoolName: "浙江工商大学", schoolTags: null }).eligible).toBe(true);
    expect(evaluateAcademicTierEligibility(weakStudent, { schoolName: "某公办工程学院", schoolTags: null }).eligible).toBe(true);

    const poorStudent: RankingCriteria = { programType: "UG", academicLevel: "POOR" };
    expect(evaluateAcademicTierEligibility(poorStudent, { schoolName: "河南大学", schoolTags: "双一流" }).eligible).toBe(false);
    expect(evaluateAcademicTierEligibility(poorStudent, { schoolName: "沈阳城市建设学院", schoolTags: "民办本科" }).eligible).toBe(true);

    const mediumStudent: RankingCriteria = { programType: "MASTER", gpa: 2.6, gpaScale: 4 };
    expect(evaluateAcademicTierEligibility(mediumStudent, { schoolName: "复旦大学", schoolTags: "985" }).eligible).toBe(false);
    expect(evaluateAcademicTierEligibility(mediumStudent, { schoolName: "上海大学", schoolTags: "211" }).eligible).toBe(true);
    expect(inferSchoolAdmissionBand("某公办二本学院", null).admissionBand).toBe(2);

    // 4. 差生普通院校池内相对分出冲/稳/保，而不是全部挤在同一档
    const pool = ["普通甲大学", "普通乙大学", "公办丙学院", "公办丁学院", "民办戊学院", "民办己学院"].map((name, idx) => {
      const b = scoreCandidate({
        schoolName: name,
        schoolTags: name.includes("民办") ? "民办" : null,
        cooperation: "unknown",
        points: [
          { label: "专业", level: "PASS", text: "计算机" },
          { label: "授课语言", level: "PASS", text: "英文" },
          { label: "申请学历", level: "PASS", text: "硕士" },
        ],
      }, weakStudent);
      return { name, score: b.total - idx * 0.1, b };
    });
    const rebalanced = rebalancePoolTiers(pool, {
      schoolKeyOf: (x) => x.name,
      schoolNameOf: (x) => x.name,
      scoreOf: (x) => x.score,
      tierOf: (x) => x.b.tier,
      canSafeOf: (x) => x.b.canEnterSafe,
      gapBandsOf: (x) => x.b.gapBands,
      difficultyOf: (x) => x.b.difficultyIndex,
      applyTier: (x, tier, reason) => ({ ...x, b: { ...x.b, tier, tierReason: reason } }),
    });
    expect(rebalanced.filter((x) => x.b.tier === "REACH").length).toBeGreaterThanOrEqual(1);
    expect(rebalanced.filter((x) => x.b.tier === "TARGET").length).toBeGreaterThanOrEqual(1);
    expect(rebalanced.filter((x) => x.b.tier === "SAFE").length).toBeGreaterThanOrEqual(1);

    // 5. 存在缺失前置条件（如缺 CSCA）时守门拒绝进入 SAFE
    expect(assignAdmissionTier(5, { programType: "UG", gpa: 4.5, gpaScale: 5 }, { hasCscaNeed: true }).canEnterSafe).toBe(false);

    // 6. 严格 3+3+3 配额：5冲+4稳+1保 选出 3冲+3稳+1保=7所，不硬凑 9 所
    const uneven = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, score: 90 - i, tier: "REACH" as const })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, score: 85 - i, tier: "TARGET" as const })),
      { id: "s0", score: 75, tier: "SAFE" as const },
    ];
    const pickedStrict = selectBalancedCandidates(
      uneven,
      { keyOf: (x) => x.id, scoreOf: (x) => x.score, tierOf: (x) => x.tier },
      9,
      true,
      true,
    );
    expect(pickedStrict).toHaveLength(7);
    expect(pickedStrict.filter((x) => x.tier === "REACH")).toHaveLength(3);
    expect(pickedStrict.filter((x) => x.tier === "TARGET")).toHaveLength(3);
    expect(pickedStrict.filter((x) => x.tier === "SAFE")).toHaveLength(1);
  });
});

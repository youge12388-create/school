import { describe, expect, it } from "vitest";
import { buildV31ReportPayload } from "./v31-report-builder";
import { renderV31ReportHtml, runV31ReportGates, type V31ReportPayload } from "./v31-report-render";

function makeValidPayload(): V31ReportPayload {
  return {
    report_title: "测试学生 - 留学项目匹配报告",
    student: {
      name: "测试学生",
      gpa: "81/100（保留原始评分体系）",
      gpa_band: "良好",
      degree: "硕士 (Master)",
      major: "计算机科学与技术",
      nationality: "巴基斯坦",
      language: "英文授课",
      language_score: "IELTS 6.5",
      scholarship: "可申请奖学金",
      hard_requirements: ["硕士学位", "英文授课"],
      intake: "2027年秋季",
      run_mode: "模式二：合作院校优先（合作占位+全网补齐）",
      search_date: "2026年11月26日",
    },
    progress: {
      steps: [
        { label: "阶段零 查本地库", status: "done" },
        { label: "阶段四 官网核实", status: "done" },
      ],
      meta: { 正式推荐: "3所" },
    },
    tiers: {
      reach: {
        tier_note: "本层仅找到 1 所 2027 简章已发布院校，其余在历史预匹配区说明。",
        schools: [{
          name_cn: "浙江工业大学",
          city: "杭州",
          level: "normal",
          data_year: 2027,
          window_status: "open",
          needs_supervisor: false,
          eligibility_status: "conditional",
          admission_competitiveness: "竞争较高",
          scholarship_assessment: "具备申请资格；竞争中等",
          evidence_grade: "A",
          tier_reason: "2027简章已发布，可作为冲刺目标",
          risk_note: "注意奖学金截止窗口",
          is_partner: false,
          info_rows: [
            { label: "专业名称", value: "Computer Science", source_id: 1, highlight: true },
            { label: "学费标准", value: "22,000 元/年", source_id: 1, is_fee: true },
            { label: "申请截止", value: "2027年5月31日", source_id: 1, status: "open" },
          ],
          match_rows: [{ dimension: "专业", student: "计算机", school: "Computer Science", match_type: "yes", note: "直接匹配" }],
          costs: { basis: "per_year", tuition: "22,000 元/年", tuition_hl: true, accommodation: "未公布，需向学校确认", insurance: "800 元/年", living: "20,000 元/年（估算）", total: "22,800 元/年", total_num: 22800, total_hl: true },
          timeline: [{ date: "2027年5月31日", task: "递交申请", type: "deadline" }],
        }],
      },
      match: {
        tier_note: "本层仅找到 1 所 2027 简章已发布院校，严格不跨档强行凑数。",
        schools: [{
          name_cn: "深圳大学",
          city: "深圳",
          level: "normal",
          data_year: 2027,
          window_status: "open",
          needs_supervisor: true,
          eligibility_status: "conditional",
          admission_competitiveness: "竞争力较匹配",
          scholarship_assessment: "具备申请资格",
          evidence_grade: "A",
          tier_reason: "B级合作院校优先占位",
          risk_note: "需联系导师获取接收意向",
          is_partner: true,
          partner_tier: "B",
          partner_contact: "Julia",
          partner_note: "B级合作（对接人Julia）；内部台账保留",
          info_rows: [
            { label: "专业名称", value: "Computer Science", source_id: 2, highlight: true },
            { label: "学费标准", value: "26,000 元/年", source_id: 2, is_fee: true },
            { label: "申请截止", value: "2027年6月15日", source_id: 2, status: "open" },
          ],
          match_rows: [{ dimension: "专业", student: "计算机", school: "Computer Science", match_type: "yes", note: "匹配" }],
          costs: { basis: "per_year", tuition: "26,000 元/年", tuition_hl: true, accommodation: "未公布，需向学校确认", insurance: "800 元/年", living: "25,000 元/年（估算）", total: "26,800 元/年", total_num: 26800, total_hl: true },
          timeline: [{ date: "2027年6月15日", task: "递交申请", type: "deadline" }],
        }],
      },
      safety: {
        tier_note: "本层仅找到 1 所 2027 简章已发布且满足全部公开条件的院校。",
        schools: [{
          name_cn: "浙江科技大学",
          city: "杭州",
          level: "normal",
          data_year: 2027,
          window_status: "open",
          needs_supervisor: false,
          eligibility_status: "eligible",
          admission_competitiveness: "相对低风险（非录取保证）",
          scholarship_assessment: "具备申请资格",
          evidence_grade: "A",
          tier_reason: "全部公开硬条件已满足",
          risk_note: "Safety 不代表保录",
          is_partner: false,
          info_rows: [
            { label: "专业名称", value: "Computer Technology", source_id: 3, highlight: true },
            { label: "学费标准", value: "25,000 元/年", source_id: 3, is_fee: true },
            { label: "申请截止", value: "2027年6月30日", source_id: 3, status: "open" },
          ],
          match_rows: [{ dimension: "专业", student: "计算机", school: "Computer Technology", match_type: "yes", note: "匹配" }],
          costs: { basis: "per_year", tuition: "25,000 元/年", tuition_hl: true, accommodation: "未公布，需向学校确认", insurance: "800 元/年", living: "20,000 元/年（估算）", total: "25,800 元/年", total_num: 25800, total_hl: true },
          timeline: [{ date: "2027年6月30日", task: "递交申请", type: "deadline" }],
        }],
      },
    },
    historical_candidates: [
      { school: "北京邮电大学 (211)", program: "计算机技术", reference_year: "2026", target_year: "2027", preliminary_tier: "冲", historical_summary: "2026官网：32,800元/年", source_url: "https://io.bupt.edu.cn/" },
    ],
    eliminated: [
      { school: "电子科技大学", tier_label: "985候选", reason: "示例过滤说明" },
    ],
    sources: [
      { id: 1, name: "浙江工业大学招生网", type: "官网", url: "https://iec.zjut.edu.cn/" },
      { id: 2, name: "深圳大学国际教育学院", type: "官网", url: "https://lxs.szu.edu.cn/" },
      { id: 3, name: "浙江科技大学国际教育学院", type: "官网", url: "https://ies.zust.edu.cn/" },
    ],
    risks: [{ type: "warn", content: "Safety 仅代表相对低风险。" }],
  };
}

describe("v3.1 25 项守门与双版本 HTML 报告渲染", () => {
  it("标准报告 25 项守门全部通过，并区分顾问版与对外学生版 HTML", () => {
    const payload = makeValidPayload();
    const gates = runV31ReportGates(payload);
    expect(gates.totalCount).toBe(25);
    expect(gates.allPassed).toBe(true);

    const advisorHtml = renderV31ReportHtml(payload, { variant: "advisor" });
    expect(advisorHtml).toContain("🤝 B级合作 · Julia");
    expect(advisorHtml).toContain("partner-notice");
    expect(advisorHtml).not.toContain("{{REPORT_CONTENT}}");

    const studentHtml = renderV31ReportHtml(payload, { variant: "student" });
    expect(studentHtml).not.toContain("🤝 B级合作");
    expect(studentHtml).not.toContain("Julia");
    expect(studentHtml).not.toContain('<div class="partner-notice">');
    expect(studentHtml).toContain("学生评估版");
  });

  it("守门员准确拦截跨档推荐（偏弱推985、中等推985）、高职混入与估算虚构词", () => {
    const badGpa = makeValidPayload();
    badGpa.student.gpa = "2.1/4.0";
    badGpa.student.gpa_band = "偏弱";
    badGpa.tiers.reach.schools[0].name_cn = "电子科技大学";
    badGpa.tiers.reach.schools[0].level = "normal"; // Try disguising as normal
    const g1 = runV31ReportGates(badGpa);
    expect(g1.allPassed).toBe(false);
    expect(g1.checks.find((c) => c.name.includes("偏弱/弱禁985/211"))?.passed).toBe(false);

    const badVoc = makeValidPayload();
    badVoc.student.degree = "本科 (Bachelor)";
    badVoc.tiers.safety.schools[0].name_cn = "温州职业技术学院";
    const g2 = runV31ReportGates(badVoc);
    expect(g2.checks.find((c) => c.name.includes("专科/高职"))?.passed).toBe(false);

    const badFabric = makeValidPayload();
    badFabric.tiers.match.schools[0].info_rows[1].value = "约28,000元（估计）";
    const g3 = runV31ReportGates(badFabric);
    expect(g3.fabricationWarnings.length).toBeGreaterThan(0);
    expect(g3.allPassed).toBe(false);
  });

  it("buildV31ReportPayload 自动将非目标年份候选分流进 historical_candidates 而不污染正式梯队", () => {
    const built = buildV31ReportPayload({
      runMode: "partner_priority",
      criteria: { programType: "MASTER", teachingLanguage: "ENGLISH", targetMajor: "计算机", intakeYear: 2027, gpa: 3.1, gpaScale: 4 },
      localCards: [],
      external: {
        mode: "web_search",
        summary: "测试",
        programs: [{
          schoolName: "苏州大学",
          programName: "Computer Science",
          city: "苏州",
          schoolNature: "211",
          teachingLanguage: "英文授课",
          duration: "3年",
          dataYear: 2026,
          scholarshipEligible: true,
          scholarshipSummary: "CSC",
          deadline: "2026年5月",
          languageRequirement: "IELTS 6.0",
          officialUrl: "https://international.suda.edu.cn/",
          sourceUrls: ["https://international.suda.edu.cn/"],
          tier: "TARGET",
          score: 85,
          fitReason: "211高校",
          caution: "2027未出",
          groundedBySearch: true,
          officialVerified: true,
        }],
        policyNotes: [],
        disclaimer: "测试",
      },
      privileged: false,
    });

    expect(built.report.tiers.match.schools).toHaveLength(0);
    expect(built.report.historical_candidates).toHaveLength(1);
    expect(built.report.historical_candidates[0].reference_year).toBe("2026");
    expect(built.report.historical_candidates[0].partner_tag).not.toContain("Julia");
    expect(built.gates.allPassed).toBe(true);
  });
});

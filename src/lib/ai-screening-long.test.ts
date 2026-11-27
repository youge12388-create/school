import { describe, expect, it } from "vitest";
import { buildResults } from "./ai-screening";
import { containsSensitiveRestriction, sanitizePersonalContact } from "./ai-screening-input";
import type { MatchProgram } from "./matcher";

const baseProgram: MatchProgram = {
  id: "p",
  schoolId: "s",
  schoolName: "示例大学",
  schoolTags: null,
  programName: "示例大学硕士",
  programType: "MASTER",
  teachingLanguage: "ENGLISH",
  majorText: "计算机",
  requirementsText: null,
  sourceText: null,
  semesterText: null,
  applicationTimeText: null,
  accommodationText: null,
  firstYearCostMax: null,
  costIncomplete: true,
  cscaStatus: "UNKNOWN",
  gpaMin: null,
  gpaScale: null,
  hskLevelMin: null,
  hskScoreMin: null,
  ieltsMin: null,
  toeflMin: null,
  duolingoMin: null,
  minAge: null,
  maxAge: null,
  deadlineDate: null,
  deadlineStatus: "UNKNOWN",
  scholarshipCategory: null,
  province: null,
  city: null,
  partnershipRating: 0,
  qsRanking: null,
  reviewStatus: "AUTO_PARSED",
};

describe("长筛选条件、地区修复与脱敏回归验证", () => {
  it("含俄罗斯国籍与城市优先/不要中文授课的长文本不再被误判为敏感招生限制", () => {
    const prompt = `学生基础：俄罗斯国籍；2011萨马拉国立建筑土木工程大学，GPA3.02/4.0；
1.城市：仅限北京、上海（优先），无匹配再看杭州；
2.资金条件：优先中国政府奖学金CSC；过滤纯自费无奖学金项目；
3.不要中文授课项目，不要本科、语言研修项目。`;
    expect(containsSensitiveRestriction(prompt)).toBe(false);
  });

  it("自动脱敏手机号、邮箱与护照号，不改动其余正常条件", () => {
    const res = sanitizePersonalContact("学生俄罗斯国籍，电话：13800138000，邮箱 student@mail.ru，护照：P998877，申请上海英文硕士。");
    expect(res.redacted).toBe(true);
    expect(res.text).not.toContain("13800138000");
    expect(res.text).not.toContain("student@mail.ru");
    expect(res.text).not.toContain("P998877");
    expect(res.text).toContain("俄罗斯国籍");
    expect(res.text).toContain("上海英文硕士");
  });

  it("直辖市筛选可正确匹配存为行政区的上海和北京高校，并区分优先城市与备选城市", () => {
    const shanghai = { ...baseProgram, id: "sh", schoolId: "s-sh", schoolName: "华东政法大学", province: "上海市", city: "松江区", majorText: "国际关系\n国际商法", scholarshipCategory: "上海市外国留学生政府奖学金", deadlineDate: new Date("2026-05-31T00:00:00Z"), deadlineStatus: "EXPIRED" };
    const hangzhou = { ...baseProgram, id: "hz", schoolId: "s-hz", schoolName: "浙江工商大学", province: "浙江省", city: "杭州市", majorText: "国际关系", scholarshipCategory: "浙江省政府奖学金", deadlineDate: new Date("2026-05-31T00:00:00Z"), deadlineStatus: "EXPIRED" };
    const guangzhou = { ...baseProgram, id: "gz", schoolId: "s-gz", schoolName: "中山大学", province: "广东省", city: "广州市", majorText: "国际关系", scholarshipCategory: "中国政府奖学金" };
    const result = buildResults([], [shanghai, hangzhou, guangzhou], [], [], {
      programType: "MASTER",
      teachingLanguage: "ENGLISH",
      targetMajors: ["国际关系", "外交", "全球治理"],
      cities: ["北京", "上海"],
      fallbackCities: ["杭州"],
      intakeYear: 2027,
      intakeSeason: "AUTUMN",
      excludeSelfFunded: true,
    }, false, false);
    expect(result.other.map((c) => c.name)).toEqual(["华东政法大学", "浙江工商大学"]);
    expect(result.other[0].score).toBeGreaterThan(result.other[1].score ?? 0);
  });

  it("明确过滤纯自费时排除无奖学金项目，保留可申请奖学金项目", () => {
    const withScholarship = { ...baseProgram, id: "sc", schoolId: "s1", schoolName: "上海大学", majorText: "建筑学\n工商管理（全球本土 MBA）", scholarshipCategory: "中国政府奖学金、上海市政府奖学金", deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const selfFunded = { ...baseProgram, id: "sf", schoolId: "s2", schoolName: "无奖学金学院", majorText: "建筑学", scholarshipCategory: null, deadlineDate: new Date("2099-01-01T00:00:00Z"), deadlineStatus: "OPEN" };
    const result = buildResults([], [withScholarship, selfFunded], [], [], {
      programType: "MASTER",
      teachingLanguage: "ENGLISH",
      targetMajors: ["建筑国际MBA", "绿色建筑", "可持续建筑"],
      excludeSelfFunded: true,
      scholarshipType: "any",
    }, false, false);
    expect(result.other.map((c) => c.name)).toEqual(["上海大学"]);
    expect(result.other[0].facts?.scholarship).toBe("full");
  });

  it("公立大学筛选排除非公立专科/民办，保留上海公立本科英授项目，且地区未知院校不混入主候选", () => {
    const ec = { ...baseProgram, id: "ec", schoolId: "s-ec", schoolName: "华东政法大学", programType: "UG", province: "上海市", city: "松江区", majorText: "国际商法", scholarshipCategory: "上海市外国留学生政府奖学金" };
    const priv = { ...baseProgram, id: "priv", schoolId: "s-priv", schoolName: "上海市工商外国语学院", programType: "UG", province: null, city: "上海", majorText: "国际商法", scholarshipCategory: "新生奖学金" };
    const unknownCity = { ...baseProgram, id: "unk", schoolId: "s-unk", schoolName: "中国石油大学", programType: "UG", province: null, city: null, majorText: "国际商法", scholarshipCategory: "奖学金" };
    const result = buildResults([], [ec, priv, unknownCity], [], [], {
      programType: "UG",
      teachingLanguage: "ENGLISH",
      targetMajors: ["国际关系", "外交", "全球治理"],
      cities: ["上海"],
      publicOnly: true,
    }, false, false);
    expect(result.other.filter((c) => c.quality === "candidate").map((c) => c.name)).toEqual(["华东政法大学"]);
    expect(result.other.find((c) => c.name === "中国石油大学")?.quality).toBe("insufficient");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetSearchGovernanceForTests,
  saveSearchGovernanceConfig,
} from "./ai-search-governance";
import {
  buildExternalSearchQueries,
  generateExternalScreening,
  shouldTriggerExternalScreening,
} from "./ai-screening-external";
import type { ChatCriteria } from "./ai-screening";

afterEach(() => {
  resetSearchGovernanceForTests();
  vi.unstubAllEnvs();
});

describe("库外院校混合双源拓展与联网检索", () => {
  it("存在库外目标院校池或长条件要求时触发库外拓展", () => {
    const criteria: ChatCriteria = {
      programType: "MASTER",
      teachingLanguage: "ENGLISH",
      targetSchools: ["清华大学", "北京大学", "复旦大学"],
    };
    expect(shouldTriggerExternalScreening(criteria, ["上海交通大学"], false)).toBe(true);
    expect(shouldTriggerExternalScreening({ programType: "MASTER" }, ["A", "B", "C", "D"], false)).toBe(false);
    expect(shouldTriggerExternalScreening({ programType: "UG", wantTiering: true }, ["A", "B", "C", "D"], false)).toBe(true);
  });

  it("能够构造控制在 128 字以内的高精准联网检索词", () => {
    const queries = buildExternalSearchQueries({
      programType: "MASTER",
      teachingLanguage: "ENGLISH",
      targetMajors: ["建筑国际MBA", "绿色建筑", "可持续建筑"],
      cities: ["北京", "上海"],
      targetSchools: ["清华大学", "北京大学", "复旦大学", "同济大学", "浙江大学"],
      excludeSelfFunded: true,
      scholarshipPreferences: ["CSC", "MOFCOM"],
      degreeBackground: "俄罗斯工程专家学位",
      customQuestions: ["是否需要GMAT/GRE"],
    });
    expect(queries.length).toBeGreaterThanOrEqual(2);
    for (const q of queries) expect(q.length).toBeLessThanOrEqual(128);
  });

  it("优先调用 DeepSeek 内置 deepseek_web_search 联网检索并标记来源，强制过滤不符合条件的条目", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ type: string }>;
        response_format?: unknown;
      };
      expect(body.tools).toEqual([{ type: "deepseek_web_search" }]);
      expect(body.response_format).toBeUndefined();
      return Response.json({
        usage: { server_tool_use: { tool_search: 2 } },
        choices: [{
          finish_reason: "stop",
          message: {
            annotations: [
              {
                type: "url_citation",
                url_citation: { url: "https://gmba.sem.tsinghua.edu.cn/", title: "Tsinghua Global MBA" },
              },
            ],
            content: JSON.stringify({
              summary: "已按北京/上海优先并过滤纯自费，为您整理三档英文硕士方案。",
              programs: [
                {
                  schoolName: "清华大学",
                  programName: "Global MBA",
                  city: "北京",
                  schoolNature: "公立 985 / 双一流",
                  teachingLanguage: "英文授课",
                  duration: "2年",
                  scholarshipEligible: true,
                  scholarshipSummary: "院校 Merit 优秀/领导力奖学金（部分项目可申政府奖学金）",
                  deadline: "参考往年分批截止（10月-次年4月），以 2027 官网简章为准",
                  languageRequirement: "通常需雅思 7.0/托福 95 或英语授课背景，以官网为准",
                  degreeAndExamNotes: "接受经认证的俄罗斯专家学位（按本科/硕士等效审核）；需 GMAT 或 GRE",
                  officialUrl: "https://gmba.sem.tsinghua.edu.cn/",
                  sourceUrls: ["https://gmba.sem.tsinghua.edu.cn/"],
                  tier: "REACH",
                  fitReason: "位于参考池与北京首选城市，顶尖商学院英文 MBA",
                  caution: "无语言成绩与 GMAT 需尽早规划",
                },
                {
                  schoolName: "某纯自费学院",
                  programName: "国际建筑硕士",
                  city: "上海",
                  teachingLanguage: "英文授课",
                  duration: "2年",
                  scholarshipEligible: false,
                  scholarshipSummary: "纯自费无奖学金",
                  deadline: "2027年4月",
                  languageRequirement: "雅思 6.0",
                  tier: "SAFE",
                  fitReason: "英文授课",
                  caution: "无奖学金",
                },
                {
                  schoolName: "某中文硕士校",
                  programName: "绿色建筑中文硕士",
                  city: "北京",
                  teachingLanguage: "中文授课",
                  duration: "2年",
                  scholarshipEligible: true,
                  scholarshipSummary: "CSC",
                  deadline: "2027年3月",
                  languageRequirement: "HSK 5",
                  tier: "SAFE",
                  fitReason: "有奖学金",
                  caution: "中文授课",
                },
              ],
              excludedNotes: ["中欧 CEIBS MBA 以自费及商学院奖学金为主，不参与 CSC，已按需标注"],
              policyNotes: [
                {
                  title: "俄罗斯专家学位（Specialist）认可口径",
                  content: "国内高校普遍认可经认证的 5 年制俄罗斯专家学位具备硕士申请资格，建议准备海牙认证及成绩单英文公证。",
                  sourceUrls: ["https://gmba.sem.tsinghua.edu.cn/"],
                },
              ],
            }),
          },
        }],
      });
    });

    const result = await generateExternalScreening(
      {
        sanitizedMessage: "俄罗斯国籍，GPA 3.02/4.0，英文授课硕士，建筑国际MBA/绿色建筑，过滤纯自费",
        criteria: {
          programType: "MASTER",
          teachingLanguage: "ENGLISH",
          targetMajors: ["建筑国际MBA", "绿色建筑", "可持续建筑"],
          cities: ["北京", "上海"],
          fallbackCities: ["杭州"],
          excludeSelfFunded: true,
          targetSchools: ["清华大学", "同济大学", "中欧CEIBS"],
          wantTiering: true,
        },
        localSchoolNames: ["北京建筑大学"],
      },
      { apiKey: "fixture-key", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", fetchImpl },
    );

    expect(result).not.toBeNull();
    expect(result!.mode).toBe("web_search");
    // Self-funded and Chinese-taught items must be stripped by server-side hard filters
    expect(result!.programs).toHaveLength(1);
    expect(result!.programs[0].schoolName).toBe("清华大学");
    expect(result!.programs[0].groundedBySearch).toBe(true);
    expect(result!.programs[0].tier).toBe("REACH");
    expect(result!.excludedNotes).toHaveLength(1);
    expect(result!.policyNotes).toHaveLength(1);
  });

  it("联网接口不可用时自动降级为 AI 公开知识拓展，不报错中断", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: Array<{ type: string }> };
      if (body.tools?.length) {
        return new Response("tool unsupported", { status: 422 });
      }
      return Response.json({
        choices: [{
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              summary: "上海公立英语授课本科国际关系/外交方向参考。",
              programs: [
                {
                  schoolName: "复旦大学",
                  programName: "国际政治 / 全球治理相关英语项目",
                  city: "上海",
                  schoolNature: "公立 985 / 双一流",
                  teachingLanguage: "英文授课",
                  duration: "4年",
                  scholarshipEligible: true,
                  scholarshipSummary: "上海市政府奖学金（SGS）、中国政府奖学金等",
                  deadline: "参考往年春季截止，以 2027 官网为准",
                  languageRequirement: "雅思 6.5 及以上",
                  degreeAndExamNotes: "直入本科一年级（无预科年）",
                  officialUrl: "https://iso.fudan.edu.cn/",
                  tier: "REACH",
                  fitReason: "位于上海，国际关系与外交实力顶尖",
                  caution: "请核实 2027 英文授课本科具体开放专业目录",
                },
              ],
              policyNotes: [
                { title: "上海市政府奖学金（SGS）与学费折扣", content: "分为 A 类（全奖）与 B 类（免学费+保险），申请窗口通常在每年 3-5 月。" },
              ],
            }),
          },
        }],
      });
    });

    const result = await generateExternalScreening(
      {
        sanitizedMessage: "上海公立大学英语授课学士，国际关系/外交/全球治理，直入大一，2027年9月入学",
        criteria: {
          programType: "UG",
          teachingLanguage: "ENGLISH",
          targetMajors: ["国际关系", "外交", "全球治理"],
          cities: ["上海"],
          publicOnly: true,
          noFoundation: true,
        },
        localSchoolNames: ["华东政法大学"],
      },
      { apiKey: "fixture-key", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", fetchImpl },
    );

    expect(result).not.toBeNull();
    expect(result!.mode).toBe("ai_knowledge");
    expect(result!.programs).toHaveLength(1);
    expect(result!.programs[0].groundedBySearch).toBe(false);
    expect(result!.disclaimer).toContain("请务必人工核实");
  });

  it("启用管控时二次相同查询直接命中 24 小时缓存，不重复计费", async () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-ext-cache-"));
    try {
      vi.stubEnv("DATABASE_PATH", join(dir, "app.db"));
      resetSearchGovernanceForTests();
      saveSearchGovernanceConfig({
        externalEnabled: true,
        webSearchEnabled: true,
        dailySearchLimit: 100,
        cacheTtlHours: 24,
      });

      let searchCalls = 0;
      const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: Array<{ type: string }> };
        if (body.tools?.length) {
          searchCalls += 1;
        }
        return Response.json({
          usage: { server_tool_use: { tool_search: 1 } },
          choices: [{
            finish_reason: "stop",
            message: {
              annotations: [
                { type: "url_citation", url_citation: { url: "https://iso.fudan.edu.cn/", title: "Fudan ISO" } },
              ],
              content: JSON.stringify({
                summary: "复旦本科项目",
                programs: [{
                  schoolName: "复旦大学",
                  programName: "国际政治",
                  city: "上海",
                  teachingLanguage: "英文授课",
                  duration: "4年",
                  scholarshipEligible: true,
                  scholarshipSummary: "上海市政府奖学金",
                  deadline: "2027年3月",
                  languageRequirement: "雅思 6.5",
                  officialUrl: "https://iso.fudan.edu.cn/",
                  sourceUrls: ["https://iso.fudan.edu.cn/"],
                  tier: "REACH",
                  fitReason: "上海顶尖公立",
                  caution: "核实官网",
                }],
              }),
            },
          }],
        });
      });

      const input = {
        sanitizedMessage: "上海 国际关系 本科",
        criteria: {
          programType: "UG" as const,
          teachingLanguage: "ENGLISH" as const,
          targetMajors: ["国际关系"],
          cities: ["上海"],
        },
        localSchoolNames: [],
      };
      const first = await generateExternalScreening(input, {
        apiKey: "fixture-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        fetchImpl,
        enforceGovernance: true,
      });
      const callsAfterFirst = searchCalls;
      expect(callsAfterFirst).toBeGreaterThanOrEqual(1);
      expect(first?.mode).toBe("web_search");

      const second = await generateExternalScreening(input, {
        apiKey: "fixture-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        fetchImpl,
        enforceGovernance: true,
      });
      expect(searchCalls).toBe(callsAfterFirst);
      expect(second?.mode).toBe("web_search");
      expect(second?.cacheHitCount).toBe(callsAfterFirst);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("达到每日搜索上限时自动降级为 AI 公开知识拓展并在提示中说明", async () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-ext-limit-"));
    try {
      vi.stubEnv("DATABASE_PATH", join(dir, "app.db"));
      resetSearchGovernanceForTests();
      saveSearchGovernanceConfig({
        externalEnabled: true,
        webSearchEnabled: true,
        dailySearchLimit: 0,
        cacheTtlHours: 24,
      });

      const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: Array<{ type: string }> };
        if (body.tools?.length) {
          throw new Error("should not call web search when daily limit is 0");
        }
        return Response.json({
          choices: [{
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary: "降级拓展结果",
                programs: [{
                  schoolName: "复旦大学",
                  programName: "国际关系",
                  city: "上海",
                  teachingLanguage: "英文授课",
                  duration: "4年",
                  scholarshipEligible: true,
                  scholarshipSummary: "上海市政府奖学金",
                  deadline: "以官网为准",
                  languageRequirement: "雅思 6.5",
                  tier: "REACH",
                  fitReason: "匹配",
                  caution: "核实",
                }],
              }),
            },
          }],
        });
      });

      const result = await generateExternalScreening({
        sanitizedMessage: "上海 国际关系",
        criteria: { programType: "UG", teachingLanguage: "ENGLISH", targetMajors: ["国际关系"], cities: ["上海"] },
        localSchoolNames: [],
      }, {
        apiKey: "fixture-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        fetchImpl,
        enforceGovernance: true,
      });

      expect(result?.mode).toBe("ai_knowledge");
      expect(result?.quotaLimited).toBe(true);
      expect(result?.disclaimer).toContain("今日实时联网搜索次数已达后台设定上限");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("差生场景优先搜索本科学院并硬拦截超档 985/211，不同 GPA 之间不串用缓存", async () => {
    const queries = buildExternalSearchQueries({
      programType: "UG",
      teachingLanguage: "ENGLISH",
      targetMajors: ["土木工程"],
      cities: ["上海"],
      gpa: 2.1,
      gpaScale: 4,
      targetSchools: ["同济大学"],
    });
    expect(queries.some((q) => q.includes("学院"))).toBe(true);
    expect(queries.some((q) => q.includes("同济大学"))).toBe(false);

    const weakMasterQueries = buildExternalSearchQueries({
      programType: "MASTER",
      teachingLanguage: "ENGLISH",
      targetMajor: "计算机科学与技术",
      cities: ["杭州"],
      gpa: 2.1,
      gpaScale: 4,
    });
    expect(weakMasterQueries.some((q) => q.includes("省属公办大学") && !q.includes("民办本科"))).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), "school-syt-ext-weak-"));
    try {
      vi.stubEnv("DATABASE_PATH", join(dir, "app.db"));
      resetSearchGovernanceForTests();
      saveSearchGovernanceConfig({
        externalEnabled: true,
        webSearchEnabled: true,
        dailySearchLimit: 100,
        cacheTtlHours: 24,
      });

      const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
        usage: { server_tool_use: { tool_search: 1 } },
        choices: [{
          finish_reason: "stop",
          message: {
            annotations: [{ type: "url_citation", url_citation: { url: "https://example.edu.cn/", title: "Example" } }],
            content: JSON.stringify({
              summary: "已按成绩档位筛选",
              programs: [
                { schoolName: "同济大学", programName: "土木工程本科", city: "上海", schoolNature: "公立 985", teachingLanguage: "英文授课", duration: "4年", tier: "REACH" },
                { schoolName: "上海某公办学院", programName: "土木工程本科", city: "上海", schoolNature: "公办本科院校", teachingLanguage: "英文授课", duration: "4年", tier: "SAFE" },
              ],
            }),
          },
        }],
      }));

      const weakRes = await generateExternalScreening({
        sanitizedMessage: "英文授课本科土木工程",
        criteria: { programType: "UG", teachingLanguage: "ENGLISH", targetMajor: "土木工程", gpa: 2.1, gpaScale: 4 },
        localSchoolNames: [],
      }, { apiKey: "fixture-key", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", fetchImpl, enforceGovernance: true });

      expect(weakRes?.programs.map((p) => p.schoolName)).toEqual(["上海某公办学院"]);
      expect(weakRes?.excludedNotes?.some((note) => note.includes("同济大学"))).toBe(true);

      // Different GPA student must NOT hit the weak student's cached result
      const strongRes = await generateExternalScreening({
        sanitizedMessage: "英文授课本科土木工程",
        criteria: { programType: "UG", teachingLanguage: "ENGLISH", targetMajor: "土木工程", gpa: 3.8, gpaScale: 4 },
        localSchoolNames: [],
      }, { apiKey: "fixture-key", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", fetchImpl, enforceGovernance: true });

      expect(strongRes?.cacheHitCount ?? 0).toBe(0);
      expect(strongRes?.programs.some((p) => p.schoolName === "同济大学")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

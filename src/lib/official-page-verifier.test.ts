import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOfficialPageExcerpt,
  isAllowedOfficialAcademicUrl,
  verifyAndPersistExternalPrograms,
} from "./official-page-verifier";
import { loadFactDb } from "./university-fact-db";
import type { ExternalProgramItem } from "./ai-screening-external";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("阶段四 .edu.cn 官网直连核验与事实沉淀", () => {
  it("仅允许 .edu.cn 与白名单中外合作官方域名，拒绝非官方与内网地址", () => {
    expect(isAllowedOfficialAcademicUrl("https://iso.fudan.edu.cn/en/admission")).toBe(true);
    expect(isAllowedOfficialAcademicUrl("https://www.xjtlu.edu.cn/en/study")).toBe(true);
    expect(isAllowedOfficialAcademicUrl("http://127.0.0.1:3000/test")).toBe(false);
    expect(isAllowedOfficialAcademicUrl("https://www.cucas.cn/program/1")).toBe(false);
  });

  it("识别 404 死链与验证码拦截页面（绝不绕过挑战）", async () => {
    const fetchDead: typeof fetch = vi.fn(async () => new Response("Not Found", { status: 404 }));
    const dead = await fetchOfficialPageExcerpt("https://io.example.edu.cn/404.htm", { fetchImpl: fetchDead });
    expect(dead.status).toBe("dead");

    const fetchCaptcha: typeof fetch = vi.fn(async () => new Response("<html><title>安全验证</title><body>Cloudflare Turnstile</body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
    const blocked = await fetchOfficialPageExcerpt("https://io.example.edu.cn/gate.htm", { fetchImpl: fetchCaptcha });
    expect(blocked.status).toBe("challenge_blocked");
  });

  it("成功抓取 .edu.cn 简章页面后原子写回事实库并记录 404 死链", async () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-official-verify-"));
    try {
      vi.stubEnv("DATABASE_PATH", join(dir, "app.db"));

      const fetchImpl: typeof fetch = vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("broken.htm")) {
          return new Response("Missing", { status: 404 });
        }
        return new Response(
          "<html><head><title>2027国际学生硕士招生简章</title></head><body><p>Computer Science English-taught 2027 admission open. Tuition 30000 RMB/year.</p></body></html>",
          { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      });

      const sample: ExternalProgramItem = {
        schoolName: "测试核验理工大学",
        programName: "Computer Science",
        city: "南京",
        schoolNature: "公办本科",
        teachingLanguage: "英文授课",
        duration: "3年",
        tuitionText: "30,000 元/年",
        tuitionAmount: 30000,
        tuitionBasis: "per_year",
        scholarshipEligible: true,
        scholarshipSummary: "中国政府奖学金/江苏省政府奖学金",
        deadline: "2027年5月31日",
        languageRequirement: "IELTS 6.0",
        officialUrl: "https://sie.testuni.edu.cn/broken.htm",
        sourceUrls: ["https://sie.testuni.edu.cn/broken.htm", "https://sie.testuni.edu.cn/2027/adm.htm"],
        tier: "TARGET",
        score: 82,
        fitReason: "英文授课匹配",
        caution: "核实当年简章",
        groundedBySearch: true,
      };

      const res = await verifyAndPersistExternalPrograms([sample], {
        programType: "MASTER",
        teachingLanguage: "ENGLISH",
        intakeYear: 2027,
      }, { fetchImpl });

      expect(res.deadUrlsRecorded).toBe(1);
      expect(res.persistedSchools).toBe(1);
      expect(res.verifiedPrograms[0].officialVerified).toBe(true);
      expect(res.verifiedPrograms[0].officialUrl).toBe("https://sie.testuni.edu.cn/2027/adm.htm");

      const saved = loadFactDb()["测试核验理工大学"];
      expect(saved?.urls?.dead_urls).toContain("https://sie.testuni.edu.cn/broken.htm");
      expect(saved?.programs?.[0]?.tuition).toBe(30000);
      expect(saved?.programs?.[0]?.data_year).toBe(2027);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

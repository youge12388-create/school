import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyAndPersistExternalPrograms } from "./official-page-verifier";
import type { ExternalProgramItem } from "./ai-screening-external";

afterEach(() => {
  vi.unstubAllEnvs();
});

function program(schoolName: string, programName: string, officialUrl: string): ExternalProgramItem {
  return {
    schoolName,
    programName,
    city: "南京",
    schoolNature: "公办本科",
    teachingLanguage: "英文授课",
    duration: "3年",
    tuitionText: "30,000 元/年",
    tuitionAmount: 30000,
    tuitionBasis: "per_year",
    scholarshipEligible: true,
    scholarshipSummary: "中国政府奖学金",
    deadline: "2027年5月31日",
    languageRequirement: "IELTS 6.0",
    officialUrl,
    sourceUrls: [officialUrl],
    tier: "TARGET",
    score: 80,
    fitReason: "英文授课匹配",
    caution: "核实当年简章",
    groundedBySearch: true,
  };
}

describe("官网核验并发上限不再截断候选项目", () => {
  it("超过 maxConcurrent 的项目同样完成核验，且同校只抓取一次页面", async () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-official-limit-"));
    try {
      vi.stubEnv("DATABASE_PATH", join(dir, "app.db"));

      const calls: string[] = [];
      const fetchImpl: typeof fetch = vi.fn(async (input) => {
        calls.push(String(input));
        return new Response(
          "<html><head><title>2027国际学生硕士招生简章</title></head><body>English-taught 2027 admission. Tuition 30000 RMB/year.</body></html>",
          { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      });

      // 8 schools with 3 programs each: previously only the first 6 items were
      // verified and the remaining 18 were passed through unverified.
      const items = Array.from({ length: 8 }, (_, schoolIndex) =>
        Array.from({ length: 3 }, (_, programIndex) =>
          program(
            `并发核验大学${schoolIndex}`,
            `项目${programIndex}`,
            `https://io${schoolIndex}.testuni.edu.cn/admission.htm`,
          ),
        ),
      ).flat();

      const result = await verifyAndPersistExternalPrograms(items, {
        programType: "MASTER",
        teachingLanguage: "ENGLISH",
        intakeYear: 2027,
      }, { fetchImpl, maxConcurrent: 3 });

      expect(result.verifiedPrograms).toHaveLength(24);
      expect(result.verifiedPrograms.every((item) => item.officialVerified === true)).toBe(true);
      // One fetch per school, not per program.
      expect(new Set(calls).size).toBe(8);
      expect(calls).toHaveLength(8);
      // Input order is preserved for downstream tier balancing.
      expect(result.verifiedPrograms.map((item) => `${item.schoolName}/${item.programName}`))
        .toEqual(items.map((item) => `${item.schoolName}/${item.programName}`));
      expect(result.persistedSchools).toBe(8);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("同校一个死链 + 一个有效链接时，该校所有项目都标记为已核验", async () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-official-limit-"));
    try {
      vi.stubEnv("DATABASE_PATH", join(dir, "app.db"));
      const fetchImpl: typeof fetch = vi.fn(async (input) => String(input).includes("broken")
        ? new Response("Missing", { status: 404 })
        : new Response("<html><head><title>2027招生</title></head><body>2027 admission open.</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }));
      const broken = program("同校核验大学", "项目A", "https://sie.sameuni.edu.cn/broken.htm");
      broken.sourceUrls = ["https://sie.sameuni.edu.cn/broken.htm", "https://sie.sameuni.edu.cn/adm.htm"];
      const second = program("同校核验大学", "项目B", "https://sie.sameuni.edu.cn/adm.htm");

      const result = await verifyAndPersistExternalPrograms([broken, second], {
        programType: "MASTER",
        teachingLanguage: "ENGLISH",
        intakeYear: 2027,
      }, { fetchImpl });

      expect(result.verifiedPrograms.every((item) => item.officialVerified)).toBe(true);
      expect(result.verifiedPrograms.every((item) => item.officialUrl === "https://sie.sameuni.edu.cn/adm.htm")).toBe(true);
      expect(result.deadUrlsRecorded).toBe(1);
      // The school is verified once even though it now feeds two programs.
      expect(result.persistedSchools).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

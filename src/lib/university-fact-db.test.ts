import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchUpsertFactEntries,
  filterUniversityFactDb,
  getCachedSchoolUrls,
  loadFactDb,
  upsertSchoolUrls,
  type FactProgramEntry,
  type FactSchoolUpsertInput,
} from "./university-fact-db";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("官网事实库与 URL 缓存管理引擎 (v3.1)", () => {
  it("从种子库加载不少于 34 所高校，命中缓存 URL 与已知 404 死链黑名单", () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-fact-db-"));
    try {
      vi.stubEnv("DATABASE_PATH", join(dir, "app.db"));
      const db = loadFactDb();
      const schools = Object.keys(db).filter((k) => !k.startsWith("_"));
      expect(schools.length).toBeGreaterThanOrEqual(34);
      expect(schools).toContain("南阳理工学院");
      expect(schools).toContain("湖南城市学院");

      const urls = getCachedSchoolUrls(["华南理工大学", "华北电力大学", "南阳理工学院"]);
      expect(urls["华南理工大学"].status).toBe("hit_fresh");
      expect(urls["南阳理工学院"].status).toBe("hit_fresh");
      expect(urls["华北电力大学"].status === "hit_fresh" && urls["华北电力大学"].dead_urls.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("支持 14 个细分学科族模糊/严格隔离与本专物理隔离", () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-fact-filter-"));
    try {
      vi.stubEnv("DATABASE_PATH", join(dir, "app.db"));

      const fuzzyAi = filterUniversityFactDb({
        level: "master",
        lang: "english",
        major: "人工智能",
        matchMode: "fuzzy",
        targetYear: 2027,
      });
      expect(fuzzyAi.fresh.length + fuzzyAi.historical.length).toBeGreaterThanOrEqual(10);

      const strictAi = filterUniversityFactDb({
        level: "master",
        lang: "english",
        major: "人工智能",
        matchMode: "strict",
        targetYear: 2027,
      });
      expect(strictAi.fresh.length).toBeGreaterThanOrEqual(1);
      expect(strictAi.fresh.every((item) => /人工智能|Artificial Intelligence/i.test(item.major))).toBe(true);

      const civilMaster = filterUniversityFactDb({
        level: "master",
        lang: "english",
        major: "土木工程",
        targetYear: 2027,
      });
      expect(civilMaster.fresh.length + civilMaster.historical.length + civilMaster.recheck.length).toBe(0);

      const civilUg = filterUniversityFactDb({
        level: "bachelor",
        lang: "english",
        major: "土木工程",
        targetYear: 2027,
      });
      const ugNames = new Set([...civilUg.fresh, ...civilUg.historical, ...civilUg.recheck].map((x) => x.school));
      expect(ugNames.has("浙江科技大学")).toBe(true);
      expect(ugNames.has("沈阳城市建设学院")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("支持原子去重合并、5 份备份滚动清理，并拦截 5 类事实库污染", () => {
    const dir = mkdtempSync(join(tmpdir(), "school-syt-fact-write-"));
    try {
      vi.stubEnv("DATABASE_PATH", join(dir, "app.db"));

      const validEntry: FactSchoolUpsertInput = {
        school_name: "北京邮电大学",
        city: "北京",
        tier: "211",
        urls: { iec_url: "https://io.bupt.edu.cn" },
        programs: [{
          major: "计算机技术（英文授课硕士，2027最新核实版）",
          degrees: ["master"],
          language: "english",
          duration: "2年",
          tuition: 32800,
          tuition_status: "published",
          tuition_basis: "per_year",
          data_year: 2027,
          verification_status: "verified",
          supervisor_letter: "none",
          source_url: "https://io.bupt.edu.cn/2027.htm",
        }],
      };

      const res = batchUpsertFactEntries([validEntry]);
      expect(res.ok).toBe(true);
      const buptProgs = loadFactDb()["北京邮电大学"]?.programs ?? [];
      expect(buptProgs).toHaveLength(1);
      expect(buptProgs[0].data_year).toBe(2027);

      // Rotate backup limit <= 5
      for (let i = 0; i < 7; i++) {
        upsertSchoolUrls({ schoolName: `测试缓存校_${i}`, iecUrl: `https://u${i}.edu.cn` });
      }
      const backupCount = readdirSync(join(dir, ".backups")).filter((n) => n.endsWith(".bak")).length;
      expect(backupCount).toBeLessThanOrEqual(5);

      const dirtyPatches: Array<Partial<FactProgramEntry>> = [
        { notes: "GPA基准3.0，申请稳录" },
        { notes: "成绩档位评估：普通院校约中等到偏弱" },
        { notes: "学费38000元超3.5万预算" },
        { scholarships: { "CSC/省政府奖学金/校级奖学金": { type: "full", data_year: 2027 } } },
        { tuition: 0, tuition_basis: "unknown", tuition_status: undefined },
      ];

      for (const patch of dirtyPatches) {
        const bad: FactSchoolUpsertInput = {
          ...validEntry,
          programs: [{ ...validEntry.programs![0], ...patch }],
        };
        const badRes = batchUpsertFactEntries([bad]);
        expect(badRes.ok).toBe(false);
        expect(badRes.errors.length).toBeGreaterThan(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

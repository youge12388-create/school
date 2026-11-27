import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSearchCache,
  DEFAULT_SEARCH_GOVERNANCE_CONFIG,
  getCachedSearchHits,
  getSearchGovernanceConfig,
  getSearchGovernanceStatus,
  reserveSearchQuota,
  resetSearchGovernanceForTests,
  saveSearchGovernanceConfig,
  SEARCH_COST_PER_CALL_CNY,
  setCachedSearchHits,
} from "./ai-search-governance";

let temporary: string;

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), "school-syt-search-gov-"));
  vi.stubEnv("DATABASE_PATH", join(temporary, "app.db"));
  resetSearchGovernanceForTests();
});

afterEach(() => {
  resetSearchGovernanceForTests();
  vi.unstubAllEnvs();
  const directory = resolve(temporary);
  if (dirname(directory) === resolve(tmpdir()) && basename(directory).startsWith("school-syt-search-gov-")) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("联网检索缓存与费用配额管控", () => {
  it("读取默认配置并支持持久化保存与读取", () => {
    expect(getSearchGovernanceConfig()).toEqual(DEFAULT_SEARCH_GOVERNANCE_CONFIG);
    const saved = saveSearchGovernanceConfig({
      externalEnabled: true,
      webSearchEnabled: false,
      dailySearchLimit: 120,
      cacheTtlHours: 48,
    });
    expect(saved).toEqual({
      externalEnabled: true,
      webSearchEnabled: false,
      dailySearchLimit: 120,
      cacheTtlHours: 48,
    });
    resetSearchGovernanceForTests();
    expect(getSearchGovernanceConfig()).toEqual(saved);
  });

  it("支持 24 小时查询缓存命中、TTL 过期清理与空结果不缓存", () => {
    const t0 = new Date("2026-11-25T10:00:00+08:00");
    setCachedSearchHits("空结果查询", [], t0);
    expect(getCachedSearchHits("空结果查询", t0)).toBeNull();

    setCachedSearchHits("  清华大学   Global MBA ", [{ title: "清华", url: "https://iso.tsinghua.edu.cn/" }], t0);
    // Normalized spacing & case still hit cache
    const hit = getCachedSearchHits<{ title: string; url: string }>("清华大学 global mba", new Date(t0.getTime() + 60_000));
    expect(hit).toEqual([{ title: "清华", url: "https://iso.tsinghua.edu.cn/" }]);
    expect(getSearchGovernanceStatus(new Date(t0.getTime() + 60_000)).today.cacheHits).toBe(1);

    // Expired after 24h
    const expired = getCachedSearchHits("清华大学 global mba", new Date(t0.getTime() + 24 * 3_600_000 + 1));
    expect(expired).toBeNull();
  });

  it("配额预占仅在 commit 时计次与计费，失败 release 不扣费，达到上限后拒绝", () => {
    saveSearchGovernanceConfig({
      externalEnabled: true,
      webSearchEnabled: true,
      dailySearchLimit: 2,
      cacheTtlHours: 24,
    });
    const now = new Date("2026-11-25T10:00:00+08:00");

    const r1 = reserveSearchQuota(now);
    const r2 = reserveSearchQuota(now);
    const r3Over = reserveSearchQuota(now);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3Over.allowed).toBe(false);

    r1.commit(now);
    r2.release(); // Failed call releases without charging
    const status = getSearchGovernanceStatus(now);
    expect(status.today.usedCalls).toBe(1);
    expect(status.today.estimatedCostCny).toBe(SEARCH_COST_PER_CALL_CNY);

    // Next call can still use remaining quota slot
    const r4 = reserveSearchQuota(now);
    expect(r4.allowed).toBe(true);
    r4.commit(now);
    expect(getSearchGovernanceStatus(now).today.usedCalls).toBe(2);

    // Next Shanghai day resets daily counter
    const tomorrow = new Date("2026-11-26T00:01:00+08:00");
    expect(getSearchGovernanceStatus(tomorrow).today.usedCalls).toBe(0);
    expect(reserveSearchQuota(tomorrow).allowed).toBe(true);
  });

  it("支持手工清空本地缓存条目", () => {
    const now = new Date("2026-11-25T10:00:00+08:00");
    setCachedSearchHits("复旦 国际关系", [{ title: "Fudan", url: "https://iso.fudan.edu.cn/" }], now);
    expect(getSearchGovernanceStatus(now).activeCacheEntries).toBe(1);
    clearSearchCache(now);
    expect(getSearchGovernanceStatus(now).activeCacheEntries).toBe(0);
    expect(getCachedSearchHits("复旦 国际关系", now)).toBeNull();
  });
});

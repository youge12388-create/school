import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import { dateInShanghai } from "@/lib/utils";

export const SEARCH_COST_PER_CALL_CNY = 0.005;
const MAX_CACHE_ENTRIES = 500;

export const searchGovernanceSchema = z.object({
  externalEnabled: z.boolean().default(true),
  webSearchEnabled: z.boolean().default(true),
  dailySearchLimit: z.number().int().min(0).max(50000).default(300),
  cacheTtlHours: z.number().int().min(0).max(168).default(24),
}).strict();

export type SearchGovernanceConfig = z.infer<typeof searchGovernanceSchema>;

const cacheEntrySchema = z.object({
  queryHash: z.string().min(1),
  expiresAt: z.number().finite(),
  hits: z.array(z.unknown()),
});

const cacheStateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  usedCalls: z.number().int().nonnegative().default(0),
  cacheHits: z.number().int().nonnegative().default(0),
  entries: z.array(cacheEntrySchema).default([]),
});

type CacheEntry = z.infer<typeof cacheEntrySchema>;
type CacheState = z.infer<typeof cacheStateSchema>;

export const DEFAULT_SEARCH_GOVERNANCE_CONFIG: SearchGovernanceConfig = {
  externalEnabled: true,
  webSearchEnabled: true,
  dailySearchLimit: 300,
  cacheTtlHours: 24,
};

function databaseDirectory() {
  return dirname(resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH ?? "./data/app.db"));
}

export function aiSearchSettingsPath() {
  return resolve(databaseDirectory(), "ai-search-settings.json");
}

export function aiSearchCachePath() {
  return resolve(databaseDirectory(), "ai-search-cache.json");
}

export function todayInShanghai(now = new Date()): string {
  return dateInShanghai(now);
}

function normalizeQueryKey(query: string): string {
  const normalized = query.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

function writeAtomicJson(path: string, value: unknown): boolean {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    mkdirSync(/* turbopackIgnore: true */ dirname(path), { recursive: true });
    writeFileSync(/* turbopackIgnore: true */ temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    renameSync(/* turbopackIgnore: true */ temporary, /* turbopackIgnore: true */ path);
    return true;
  } catch {
    try {
      unlinkSync(/* turbopackIgnore: true */ temporary);
    } catch {
      // No temporary file to remove.
    }
    return false;
  }
}

let cachedConfig: { path: string; mtimeMs: number; size: number; value: SearchGovernanceConfig } | null = null;
let memoryConfig: { path: string; value: SearchGovernanceConfig } | null = null;

export function getSearchGovernanceConfig(): SearchGovernanceConfig {
  const path = aiSearchSettingsPath();
  let fileStat: { mtimeMs: number; size: number } | null = null;
  try {
    const info = statSync(/* turbopackIgnore: true */ path);
    fileStat = { mtimeMs: info.mtimeMs, size: info.size };
  } catch {
    fileStat = null;
  }
  if (!fileStat) {
    if (memoryConfig?.path === path) return { ...memoryConfig.value };
    return { ...DEFAULT_SEARCH_GOVERNANCE_CONFIG };
  }
  if (
    cachedConfig
    && cachedConfig.path === path
    && cachedConfig.mtimeMs === fileStat.mtimeMs
    && cachedConfig.size === fileStat.size
  ) {
    return { ...cachedConfig.value };
  }
  try {
    const raw = readFileSync(/* turbopackIgnore: true */ path, "utf8");
    const parsed = searchGovernanceSchema.parse(JSON.parse(raw));
    cachedConfig = { path, mtimeMs: fileStat.mtimeMs, size: fileStat.size, value: parsed };
    memoryConfig = { path, value: parsed };
    return { ...parsed };
  } catch {
    if (memoryConfig?.path === path) return { ...memoryConfig.value };
    return { ...DEFAULT_SEARCH_GOVERNANCE_CONFIG };
  }
}

export function saveSearchGovernanceConfig(input: SearchGovernanceConfig): SearchGovernanceConfig {
  const parsed = searchGovernanceSchema.parse(input);
  const path = aiSearchSettingsPath();
  writeAtomicJson(path, parsed);
  cachedConfig = null;
  memoryConfig = { path, value: parsed };
  return { ...parsed };
}

let cachedState: { path: string; state: CacheState } | null = null;
let inFlightCalls = 0;

function emptyState(today: string): CacheState {
  return { date: today, usedCalls: 0, cacheHits: 0, entries: [] };
}

function loadCacheState(now = new Date()): CacheState {
  const path = aiSearchCachePath();
  const today = todayInShanghai(now);
  let state: CacheState;
  if (cachedState?.path === path) {
    state = cachedState.state;
  } else {
    state = emptyState(today);
    try {
      const raw = readFileSync(/* turbopackIgnore: true */ path, "utf8");
      const parsed = cacheStateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) state = parsed.data;
    } catch {
      // Missing or unreadable cache file falls back cleanly to memory.
    }
  }
  if (state.date !== today) {
    state = {
      date: today,
      usedCalls: 0,
      cacheHits: 0,
      entries: state.entries,
    };
  }
  const nowMs = now.getTime();
  state.entries = state.entries.filter((entry) => entry.expiresAt > nowMs);
  cachedState = { path, state };
  return state;
}

function persistCacheState(state: CacheState) {
  const path = aiSearchCachePath();
  cachedState = { path, state };
  writeAtomicJson(path, state);
}

export function reserveSearchQuota(now = new Date()): {
  allowed: boolean;
  commit: (nowOverride?: Date) => void;
  release: () => void;
} {
  const config = getSearchGovernanceConfig();
  const state = loadCacheState(now);
  if (state.usedCalls + inFlightCalls >= config.dailySearchLimit) {
    return {
      allowed: false,
      commit: () => {},
      release: () => {},
    };
  }
  inFlightCalls += 1;
  let settled = false;
  return {
    allowed: true,
    commit: (nowOverride?: Date) => {
      if (settled) return;
      settled = true;
      inFlightCalls = Math.max(0, inFlightCalls - 1);
      const latest = loadCacheState(nowOverride ?? now);
      latest.usedCalls += 1;
      persistCacheState(latest);
    },
    release: () => {
      if (settled) return;
      settled = true;
      inFlightCalls = Math.max(0, inFlightCalls - 1);
    },
  };
}

export function getCachedSearchHits<T>(query: string, now = new Date()): T[] | null {
  const config = getSearchGovernanceConfig();
  if (config.cacheTtlHours <= 0) return null;
  const state = loadCacheState(now);
  const queryHash = normalizeQueryKey(query);
  const nowMs = now.getTime();
  const index = state.entries.findIndex((entry) => entry.queryHash === queryHash);
  if (index < 0) return null;
  const entry = state.entries[index];
  if (entry.expiresAt <= nowMs) {
    state.entries.splice(index, 1);
    persistCacheState(state);
    return null;
  }
  state.cacheHits += 1;
  persistCacheState(state);
  return structuredClone(entry.hits) as T[];
}

export function setCachedSearchHits<T>(query: string, hits: readonly T[], now = new Date()): void {
  const config = getSearchGovernanceConfig();
  if (config.cacheTtlHours <= 0 || !hits.length) return;
  const state = loadCacheState(now);
  const queryHash = normalizeQueryKey(query);
  const expiresAt = now.getTime() + config.cacheTtlHours * 3_600_000;
  const remaining = state.entries.filter((entry) => entry.queryHash !== queryHash);
  remaining.push({
    queryHash,
    expiresAt,
    hits: structuredClone(hits) as unknown[],
  } satisfies CacheEntry);
  if (remaining.length > MAX_CACHE_ENTRIES) {
    remaining.sort((a, b) => a.expiresAt - b.expiresAt);
    state.entries = remaining.slice(remaining.length - MAX_CACHE_ENTRIES);
  } else {
    state.entries = remaining;
  }
  persistCacheState(state);
}

export function clearSearchCache(now = new Date()): void {
  const state = loadCacheState(now);
  state.entries = [];
  persistCacheState(state);
}

export type SearchGovernanceStatus = {
  config: SearchGovernanceConfig;
  today: {
    date: string;
    usedCalls: number;
    cacheHits: number;
    estimatedCostCny: number;
  };
  activeCacheEntries: number;
};

export function getSearchGovernanceStatus(now = new Date()): SearchGovernanceStatus {
  const config = getSearchGovernanceConfig();
  const state = loadCacheState(now);
  return {
    config,
    today: {
      date: state.date,
      usedCalls: state.usedCalls,
      cacheHits: state.cacheHits,
      estimatedCostCny: Number((state.usedCalls * SEARCH_COST_PER_CALL_CNY).toFixed(3)),
    },
    activeCacheEntries: state.entries.length,
  };
}

export function resetSearchGovernanceForTests(): void {
  cachedConfig = null;
  memoryConfig = null;
  cachedState = null;
  inFlightCalls = 0;
}

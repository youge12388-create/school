import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSearchGovernanceForTests, setCachedSearchHits } from "@/lib/ai-search-governance";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  audit: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));

const origin = "http://localhost:3000";
const secretKey = "sk-secret-do-not-leak-in-errors";
let temporary: string;

beforeEach(() => {
  vi.resetAllMocks();
  temporary = mkdtempSync(join(tmpdir(), "school-syt-ai-search-admin-"));
  vi.stubEnv("DATABASE_PATH", join(temporary, "app.db"));
  vi.stubEnv("DEEPSEEK_API_KEY", secretKey);
  vi.stubEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com");
  vi.stubGlobal("fetch", mocks.fetch);
  resetSearchGovernanceForTests();
  mocks.user.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
});

afterEach(() => {
  resetSearchGovernanceForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const directory = resolve(temporary);
  if (dirname(directory) === resolve(tmpdir()) && basename(directory).startsWith("school-syt-ai-search-admin-")) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function submit(body: unknown, source = origin) {
  return POST(new Request(`${origin}/api/admin/ai-search`, {
    method: "POST",
    headers: { Origin: source, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("管理员联网检索管控接口", () => {
  it("拒绝跨站、未登录及非管理员访问", async () => {
    expect((await submit({ intent: "clear_cache" }, "https://evil.example")).status).toBe(403);
    mocks.user.mockResolvedValueOnce(null);
    expect((await submit({ intent: "clear_cache" })).status).toBe(401);
    mocks.user.mockResolvedValueOnce({ id: "adv-1", role: "ADVISOR" });
    expect((await submit({ intent: "clear_cache" })).status).toBe(403);
  });

  it("管理员可保存开关与限额设置并记录审计日志", async () => {
    const res = await submit({
      intent: "save",
      externalEnabled: true,
      webSearchEnabled: false,
      dailySearchLimit: 150,
      cacheTtlHours: 12,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status.config).toEqual({
      externalEnabled: true,
      webSearchEnabled: false,
      dailySearchLimit: 150,
      cacheTtlHours: 12,
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      userId: "admin-1",
      action: "AI_SEARCH_GOVERNANCE_UPDATED",
      entityType: "SETTINGS",
      details: data.status.config,
    });
  });

  it("管理员可清空缓存并记录审计日志", async () => {
    setCachedSearchHits("测试查询", [{ title: "Test", url: "https://example.com" }]);
    const res = await submit({ intent: "clear_cache" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status.activeCacheEntries).toBe(0);
    expect(mocks.audit).toHaveBeenCalledWith({
      userId: "admin-1",
      action: "AI_SEARCH_CACHE_CLEARED",
      entityType: "SETTINGS",
    });
  });

  it("连通性测试返回清晰状态并在失败时绝不泄露 API Key", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({
      usage: { server_tool_use: { tool_search: 1 } },
      choices: [{
        finish_reason: "stop",
        message: {
          annotations: [
            { type: "url_citation", url_citation: { url: "https://iso.tsinghua.edu.cn/", title: "清华大学" } },
          ],
          content: JSON.stringify({ ok: true, url: "https://iso.tsinghua.edu.cn/" }),
        },
      }],
    }));
    const okRes = await submit({ intent: "test_search" });
    expect(okRes.status).toBe(200);
    const okData = await okRes.json();
    expect(okData.ok).toBe(true);
    expect(okData.resultCount).toBe(1);
    expect(okData.message).toContain("模型内置联网检索正常");

    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: secretKey }), { status: 401 }));
    const authFail = await submit({ intent: "test_search" });
    const authText = await authFail.text();
    expect(JSON.parse(authText).ok).toBe(false);
    expect(JSON.parse(authText).message).toContain("密钥无效");
    expect(authText).not.toContain(secretKey);

    mocks.fetch.mockResolvedValueOnce(new Response("tool unsupported", { status: 422 }));
    const unsupported = await submit({ intent: "test_search" });
    const unsupportedData = await unsupported.json();
    expect(unsupportedData.ok).toBe(false);
    expect(unsupportedData.message).toContain("降级为 AI 知识拓展");
  });
});

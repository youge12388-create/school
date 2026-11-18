import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aiProviderSettingsPath, getAiProviderConfig } from "@/lib/ai-provider";
import { extractScreeningIntent } from "@/lib/ai-screening-intent";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  audit: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));

const origin = "http://localhost:3000";
const oldKey = "fixture-original-key";
const newKey = "fixture-replacement-key";
const original = {
  intent: "save",
  revision: null,
  baseUrl: "https://api.deepseek.com",
  model: "fixture-model",
  apiKey: newKey,
};

let temporary: string;

beforeEach(() => {
  vi.resetAllMocks();
  temporary = mkdtempSync(join(tmpdir(), "school-syt-ai-settings-"));
  vi.stubEnv("DATABASE_PATH", join(temporary, "app.db"));
  vi.stubEnv("APP_KEY_PATH", join(temporary, "keys", "app.key"));
  vi.stubEnv("DEEPSEEK_API_KEY", oldKey);
  vi.stubEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com");
  vi.stubEnv("DEEPSEEK_MODEL", "previous-fixture-model");
  vi.stubEnv("AI_PROVIDER_ALLOWED_BASE_URLS", "");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.user.mockResolvedValue({ id: "admin-fixture", role: "ADMIN" });
  mocks.fetch.mockImplementation(async () => Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const directory = resolve(temporary);
  if (dirname(directory) === resolve(tmpdir()) && basename(directory).startsWith("school-syt-ai-settings-")) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function submit(overrides: Record<string, unknown> = {}, source = origin) {
  return POST(new Request(`${origin}/api/admin/ai-provider`, {
    method: "POST", headers: { Origin: source, "Content-Type": "application/json" },
    body: JSON.stringify({ ...original, ...overrides }),
  }));
}

describe("AI provider settings", () => {
  it("rejects requests outside the current origin, signed-out users, and non-admin users", async () => {
    expect((await submit({}, "https://unrelated.example.com")).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    mocks.user.mockResolvedValueOnce(null);
    expect((await submit()).status).toBe(401);
    mocks.user.mockResolvedValueOnce({ role: "ADVISOR" });
    expect((await submit()).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(existsSync(aiProviderSettingsPath())).toBe(false);
  });

  it("tests current credentials without persisting or exposing the key", async () => {
    const response = await submit({ intent: "test", apiKey: "" });
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(existsSync(aiProviderSettingsPath())).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledWith("https://api.deepseek.com/chat/completions", expect.objectContaining({
      redirect: "error",
      headers: expect.objectContaining({ Authorization: `Bearer ${oldKey}` }),
    }));
  });

  it("never forwards an existing key to a different endpoint or calls an unapproved base URL", async () => {
    expect((await submit({ baseUrl: "https://api.openai.com/v1", apiKey: "" })).status).toBe(400);
    expect((await submit({ baseUrl: "https://unapproved.example.com/v1" })).status).toBe(400);
    expect((await submit({ baseUrl: "https://api.deepseek.com?credential=example" })).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("preserves the current configuration after authentication failures or an incompatible model response", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: newKey }, { status: 401 }));
    const failed = await submit();
    expect(failed.status).toBe(422);
    expect(await failed.text()).not.toContain(newKey);
    mocks.fetch.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "invalid" } }] }));
    expect((await submit()).status).toBe(422);
    expect(getAiProviderConfig()).toMatchObject({ apiKey: oldKey, model: "previous-fixture-model" });
    expect(existsSync(aiProviderSettingsPath())).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("encrypts and activates the replacement for screening requests, rejecting stale saves", async () => {
    const baseUrl = "https://api.openai.com/v1";
    const response = await submit({ baseUrl });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.settings).toEqual({ baseUrl, model: original.model, configured: true, revision: expect.any(String) });
    expect(JSON.stringify(json)).not.toContain(newKey);
    expect(readFileSync(aiProviderSettingsPath(), "utf8")).not.toContain(newKey);
    expect(mocks.audit).toHaveBeenCalledWith({ userId: "admin-fixture", action: "AI_PROVIDER_UPDATED", entityType: "SETTINGS" });
    expect((await submit()).status).toBe(409);

    mocks.fetch.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"criteria":{},"intent":"chat","reply":"你好"}' } }] }));
    const screening = await extractScreeningIntent({ message: "你好", criteria: {}, history: [], hasPrevious: false });
    expect(screening.intent).toBe("chat");
    expect(mocks.fetch).toHaveBeenLastCalledWith(`${baseUrl}/chat/completions`, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${newKey}` }),
      body: expect.stringContaining(`"model":"${original.model}"`),
    }));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fetchWeComOrganization,
  getWeComConfig,
  getWeComIdentity,
  getWeComLoginUrl,
  isValidWeComState,
} from "@/lib/wecom";
import { resolveWeComRole } from "@/lib/wecom-service";

const previousCorpId = process.env.WECOM_CORP_ID;
const previousSecret = process.env.WECOM_SECRET;
const previousRedirectUri = process.env.WECOM_REDIRECT_URI;

afterEach(() => {
  vi.restoreAllMocks();
  if (previousCorpId === undefined) delete process.env.WECOM_CORP_ID;
  else process.env.WECOM_CORP_ID = previousCorpId;
  if (previousSecret === undefined) delete process.env.WECOM_SECRET;
  else process.env.WECOM_SECRET = previousSecret;
  if (previousRedirectUri === undefined) delete process.env.WECOM_REDIRECT_URI;
  else process.env.WECOM_REDIRECT_URI = previousRedirectUri;
});

beforeEach(() => {
  process.env.WECOM_CORP_ID = "ww-test-corp";
  process.env.WECOM_SECRET = "test-secret-that-is-not-real";
  process.env.WECOM_REDIRECT_URI = "https://app.example.com/api/auth/wecom/callback";
});

function jsonResponse(value: Record<string, unknown>) {
  return new Response(JSON.stringify({ errcode: 0, errmsg: "ok", ...value }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("WeCom configuration and OAuth helpers", () => {
  it("requires all server-side configuration values", () => {
    delete process.env.WECOM_SECRET;
    expect(() => getWeComConfig()).toThrow("WECOM_CORP_ID");
  });

  it("builds an OAuth URL without exposing the secret", () => {
    const url = getWeComLoginUrl("state-value");
    expect(url).toContain("appid=ww-test-corp");
    expect(url).toContain("state=state-value");
    expect(url).not.toContain("test-secret");
    expect(url).toContain("#wechat_redirect");
  });

  it("compares OAuth state in constant time and rejects missing or mismatched values", () => {
    expect(isValidWeComState("abc", "abc")).toBe(true);
    expect(isValidWeComState("abc", "abd")).toBe(false);
    expect(isValidWeComState(undefined, "abc")).toBe(false);
  });
});

describe("WeCom API adapter", () => {
  it("loads the authorized member identity with department IDs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ UserId: "zhangsan" }))
      .mockResolvedValueOnce(jsonResponse({
        userid: "zhangsan",
        name: "张三",
        department: [1, "3"],
        enable: 1,
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWeComIdentity("oauth-code")).resolves.toEqual({
      userId: "zhangsan",
      displayName: "张三",
      departmentIds: [1, 3],
      enabled: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain("gettoken");
    expect(String(fetchMock.mock.calls[0][0])).toContain("corpsecret=test-secret-that-is-not-real");
  });

  it("treats a member without an explicit active status as disabled", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ UserId: "former-member" }))
      .mockResolvedValueOnce(jsonResponse({
        userid: "former-member",
        name: "已离职成员",
        department: [1],
        status: 2,
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWeComIdentity("oauth-code")).resolves.toMatchObject({
      userId: "former-member",
      enabled: false,
    });
  });

  it("recursively loads departments and merges duplicate members", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token" }))
      .mockResolvedValueOnce(jsonResponse({ department: { id: 1, name: "根部门", parentid: 0, order: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ department_id: [{ id: 2, parentid: 1, order: 1, name: "顾问部" }] }))
      .mockResolvedValueOnce(jsonResponse({ department_id: [] }))
      .mockResolvedValueOnce(jsonResponse({ userlist: [{ userid: "zhangsan", name: "张三", department: [1], enable: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ userlist: [{ userid: "zhangsan", name: "张三", department: [2], enable: 1 }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWeComOrganization()).resolves.toEqual({
      departments: [
        { id: 1, name: "根部门", parentId: 0, displayOrder: 0 },
        { id: 2, name: "顾问部", parentId: 1, displayOrder: 1 },
      ],
      members: [{
        userId: "zhangsan",
        displayName: "张三",
        departmentIds: [1, 2],
        enabled: true,
      }],
    });
  });
});

describe("WeCom role resolution", () => {
  it("uses the highest-priority role across multiple departments", () => {
    expect(resolveWeComRole(
      [10, 20],
      new Map([[10, "MARKET_MANAGER"], [20, "DATA_MANAGER"]]),
    )).toBe("DATA_MANAGER");
    expect(resolveWeComRole([10], new Map())).toBeNull();
  });
});

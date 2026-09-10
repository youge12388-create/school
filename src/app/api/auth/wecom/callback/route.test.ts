import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookieStore,
  getCurrentUser,
  createSession,
  writeAudit,
  getClientIp,
  shouldUseSecureSessionCookie,
  getWeComIdentity,
  upsertWeComLogin,
} = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
  getCurrentUser: vi.fn(),
  createSession: vi.fn(),
  writeAudit: vi.fn(),
  getClientIp: vi.fn(),
  shouldUseSecureSessionCookie: vi.fn(),
  getWeComIdentity: vi.fn(),
  upsertWeComLogin: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/auth", () => ({ createSession, getCurrentUser }));
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("@/lib/request-security", () => ({ getClientIp, shouldUseSecureSessionCookie }));
vi.mock("@/lib/wecom-service", () => ({ upsertWeComLogin, WeComAccessError: class extends Error {} }));
vi.mock("@/lib/wecom", () => ({
  getWeComIdentity,
  isValidWeComState: (expected: string | undefined, received: string | null) => expected === received,
  WECOM_STATE_COOKIE: "school_syt_wecom_oauth_state",
  WeComApiError: class extends Error {},
  WeComConfigError: class extends Error {},
}));
vi.mock("@/lib/http", () => ({
  appUrl: (_request: Request, path: string) => new URL(path, "https://app.example.com"),
}));

import { GET } from "./route";

function request(query: string) {
  return new Request(`https://app.example.com/api/auth/wecom/callback?${query}`);
}

describe("GET /api/auth/wecom/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.get.mockReturnValue({ value: "state-1" });
    getCurrentUser.mockResolvedValue(null);
    getClientIp.mockReturnValue(null);
    shouldUseSecureSessionCookie.mockReturnValue(true);
    createSession.mockResolvedValue(undefined);
    writeAudit.mockResolvedValue(undefined);
  });

  it("rejects a callback with an invalid OAuth state", async () => {
    const response = await GET(request("code=oauth-code&state=wrong"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(303);
    expect(location.searchParams.get("error")).toBe("企业微信登录验证已过期，请重新尝试");
    expect(getWeComIdentity).not.toHaveBeenCalled();
  });

  it("creates the existing session after a successful WeCom callback", async () => {
    const identity = {
      userId: "zhangsan",
      displayName: "张三",
      departmentIds: [2],
      enabled: true,
    };
    getWeComIdentity.mockResolvedValue(identity);
    upsertWeComLogin.mockReturnValue({ userId: "user-1", role: "ADVISOR" });

    const response = await GET(request("code=oauth-code&state=state-1"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
    expect(upsertWeComLogin).toHaveBeenCalledWith(identity);
    expect(createSession).toHaveBeenCalledWith("user-1", {
      ipAddress: null,
      userAgent: null,
      secure: true,
    });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "LOGIN_SUCCEEDED",
      details: { provider: "WECOM", wecomUserId: "zhangsan" },
    }));
  });
});

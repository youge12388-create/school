import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auditLoginFailure,
  clearFailedLogins,
  createSession,
  db,
  getClientIp,
  getLoginAttemptLimit,
  recordFailedLogin,
  shouldUseSecureSessionCookie,
  verifyPassword,
  writeAudit,
} = vi.hoisted(() => ({
  auditLoginFailure: vi.fn(),
  clearFailedLogins: vi.fn(),
  createSession: vi.fn(),
  db: { select: vi.fn(), update: vi.fn() },
  getClientIp: vi.fn(),
  getLoginAttemptLimit: vi.fn(),
  recordFailedLogin: vi.fn(),
  shouldUseSecureSessionCookie: vi.fn(),
  verifyPassword: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auditLoginFailure, createSession }));
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/db/schema", () => ({ users: {} }));
vi.mock("@/lib/http", () => ({
  appUrl: (_request: Request, path: string) => new URL(path, "https://app.example.com"),
}));
vi.mock("@/lib/login-rate-limit", () => ({
  clearFailedLogins,
  getLoginAttemptLimit,
  recordFailedLogin,
}));
vi.mock("@/lib/password", () => ({ verifyPassword }));
vi.mock("@/lib/request-security", () => ({ getClientIp, shouldUseSecureSessionCookie }));

import { POST } from "./route";

function request(username = "advisor", password = "password") {
  const formData = new FormData();
  formData.set("username", username);
  formData.set("password", password);
  return new Request("https://app.example.com/api/auth/login", { method: "POST", body: formData });
}

function selectUser(user: { id: string; active: boolean; passwordHash: string } | undefined) {
  db.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(user ? [user] : []),
      }),
    }),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientIp.mockReturnValue(null);
    getLoginAttemptLimit.mockReturnValue(null);
    shouldUseSecureSessionCookie.mockReturnValue(true);
    db.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
  });

  it("rejects a locked login before querying account data", async () => {
    getLoginAttemptLimit.mockReturnValue(900);

    const response = await POST(request());
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(303);
    expect(location.searchParams.get("error")).toBe("登录尝试次数过多，请稍后再试");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("records a failed attempt without exposing whether the account exists", async () => {
    selectUser(undefined);

    const response = await POST(request("missing"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(303);
    expect(location.searchParams.get("error")).toBe("用户名或密码错误");
    expect(auditLoginFailure).toHaveBeenCalledWith("missing", undefined);
    expect(recordFailedLogin).toHaveBeenCalledWith("missing", null);
  });

  it("creates a secure session and clears failed attempts after a successful login", async () => {
    selectUser({ id: "user-1", active: true, passwordHash: "hash" });
    verifyPassword.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
    expect(clearFailedLogins).toHaveBeenCalledWith("advisor", null);
    expect(createSession).toHaveBeenCalledWith("user-1", {
      ipAddress: null,
      userAgent: null,
      secure: true,
    });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN_SUCCEEDED" }));
  });
});

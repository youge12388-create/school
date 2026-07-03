import { beforeEach, describe, expect, it, vi } from "vitest";

const { destroySession, getCurrentUser, writeAudit } = vi.hoisted(() => ({
  destroySession: vi.fn(),
  getCurrentUser: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("@/lib/auth", () => ({ destroySession, getCurrentUser }));

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the logout, destroys the session, and redirects", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });

    const response = await POST(
      new Request("https://internal.example/api/auth/logout", {
        method: "POST",
        headers: {
          host: "app.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(writeAudit).toHaveBeenCalledWith({
      userId: "user-1",
      action: "LOGOUT",
      entityType: "USER",
      entityId: "user-1",
    });
    expect(destroySession).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.com/login");
  });

  it("clears a stale session without writing an audit entry", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://127.0.0.1:3000/api/auth/logout", { method: "POST" }),
    );

    expect(writeAudit).not.toHaveBeenCalled();
    expect(destroySession).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/login");
  });
});

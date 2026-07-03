import { beforeEach, describe, expect, it, vi } from "vitest";

const { createUser, getCurrentUser, sqlite, UserManagementError } = vi.hoisted(() => ({
  createUser: vi.fn(),
  getCurrentUser: vi.fn(),
  sqlite: {},
  UserManagementError: class extends Error {},
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db", () => ({ sqlite }));
vi.mock("@/lib/user-service", () => ({ createUser, UserManagementError }));

import { POST } from "./route";

function request(formData?: FormData, origin = "https://app.example.com") {
  return new Request("https://internal.example/api/admin/users", {
    method: "POST",
    headers: {
      host: "app.example.com",
      origin,
      "x-forwarded-proto": "https",
    },
    body: formData,
  });
}

describe("POST /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "admin-id", role: "ADMIN" });
  });

  it("creates an account and redirects with a success marker", async () => {
    const formData = new FormData();
    formData.set("username", "advisor");
    formData.set("displayName", "顾问账号");
    formData.set("password", "test-password-123");
    formData.set("role", "ADVISOR");

    const response = await POST(request(formData));

    expect(createUser).toHaveBeenCalledWith(
      {
        username: "advisor",
        displayName: "顾问账号",
        password: "test-password-123",
        role: "ADVISOR",
      },
      "admin-id",
      sqlite,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/admin/users?created=1",
    );
  });

  it("returns a readable validation error", async () => {
    createUser.mockRejectedValueOnce(new UserManagementError("用户名已存在"));

    const response = await POST(request(new FormData()));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/admin/users");
    expect(location.searchParams.get("error")).toBe("用户名已存在");
  });
  it("rejects a cross-origin account creation request", async () => {
    const response = await POST(request(new FormData(), "https://evil.example"));

    expect(response.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated requests to login", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await POST(request(new FormData()));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.com/login");
    expect(createUser).not.toHaveBeenCalled();
  });
});

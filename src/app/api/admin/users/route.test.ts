import { beforeEach, describe, expect, it, vi } from "vitest";

const { createUser, updateUserRole, getCurrentUser, sqlite, UserManagementError } = vi.hoisted(() => ({
  createUser: vi.fn(),
  updateUserRole: vi.fn(),
  getCurrentUser: vi.fn(),
  sqlite: {},
  UserManagementError: class extends Error {},
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db", () => ({ sqlite }));
vi.mock("@/lib/user-service", () => ({
  createUser,
  updateUserRole,
  UserManagementError,
}));

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
  it("does not block an authenticated cross-origin request", async () => {
    const formData = new FormData();
    formData.set("username", "advisor");
    formData.set("displayName", "顾问账号");
    formData.set("password", "test-password-123");
    formData.set("role", "ADVISOR");

    const response = await POST(
      request(formData, "https://evil.example"),
    );

    expect(response.status).toBe(303);
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it("updates an existing account role and redirects with a success marker", async () => {
    const formData = new FormData();
    formData.set("intent", "update-role");
    formData.set("userId", "advisor-id");
    formData.set("role", "DATA_MANAGER");

    const response = await POST(request(formData));

    expect(updateUserRole).toHaveBeenCalledWith(
      { userId: "advisor-id", role: "DATA_MANAGER" },
      "admin-id",
      sqlite,
    );
    expect(createUser).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/admin/users?roleUpdated=1",
    );
  });

  it("redirects unauthenticated requests to login", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await POST(request(new FormData()));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.com/login");
    expect(createUser).not.toHaveBeenCalled();
  });
});

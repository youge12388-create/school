import { mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { cookieStore, mockRedirect } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  mockRedirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

import { migrateDatabase } from "@/lib/db/migration";

const previousDatabasePath = process.env.DATABASE_PATH;
const previousSessionTtlHours = process.env.SESSION_TTL_HOURS;

let testDir: string;
let databaseFile: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "school-syt-auth-"));
  databaseFile = join(testDir, "test.db");
  process.env.DATABASE_PATH = databaseFile;
  migrateDatabase(databaseFile);

  vi.resetModules();

  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
  mockRedirect.mockReset();
  mockRedirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

afterEach(() => {
  if (previousDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = previousDatabasePath;
  }
  if (previousSessionTtlHours === undefined) {
    delete process.env.SESSION_TTL_HOURS;
  } else {
    process.env.SESSION_TTL_HOURS = previousSessionTtlHours;
  }
  rmSync(testDir, { recursive: true, force: true });
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const now = Date.now();
const future = now + 86_400_000;
const past = now - 86_400_000;

describe("getCurrentUser", () => {
  it("returns user when a valid session token is present", async () => {
    const [{ getCurrentUser }, { sqlite }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/db"),
    ]);

    const token = "test-token-abc";
    const tokenHash = hashToken(token);

    sqlite
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("user-1", "testuser", "Test User", "unused", "ADMIN", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("session-1", "user-1", tokenHash, future, now, now);

    cookieStore.get.mockReturnValue({ value: token });

    const user = await getCurrentUser();
    expect(user).toMatchObject({
      id: "user-1",
      username: "testuser",
      displayName: "Test User",
      role: "ADMIN",
      active: true,
      sessionId: "session-1",
    });
    sqlite.close();
  });

  it("returns null when no cookie is present", async () => {
    const [{ getCurrentUser }, { sqlite }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/db"),
    ]);

    cookieStore.get.mockReturnValue(undefined);

    const user = await getCurrentUser();
    expect(user).toBeNull();
    sqlite.close();
  });

  it("returns null when session is expired", async () => {
    const [{ getCurrentUser }, { sqlite }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/db"),
    ]);

    const token = "expired-token";
    const tokenHash = hashToken(token);

    sqlite
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("user-2", "expireduser", "Expired", "unused", "ADVISOR", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("session-2", "user-2", tokenHash, past, now, now);

    cookieStore.get.mockReturnValue({ value: token });

    const user = await getCurrentUser();
    expect(user).toBeNull();
    sqlite.close();
  });

  it("returns null when user is inactive (active = 0)", async () => {
    const [{ getCurrentUser }, { sqlite }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/db"),
    ]);

    const token = "inactive-token";
    const tokenHash = hashToken(token);

    sqlite
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("user-3", "inactive", "Inactive User", "unused", "ADVISOR", 0, now, now);
    sqlite
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("session-3", "user-3", tokenHash, future, now, now);

    cookieStore.get.mockReturnValue({ value: token });

    const user = await getCurrentUser();
    expect(user).toBeNull();
    sqlite.close();
  });
});

describe("requireUser", () => {
  it("redirects to /login when no session exists", async () => {
    const [{ requireUser }, { sqlite }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/db"),
    ]);

    cookieStore.get.mockReturnValue(undefined);

    try {
      await requireUser();
      expect.unreachable("should have redirected");
    } catch (e) {
      expect((e as Error).message).toBe("NEXT_REDIRECT");
    }

    expect(mockRedirect).toHaveBeenCalledWith("/login");
    sqlite.close();
  });

  it("returns the authenticated user", async () => {
    const [{ requireUser }, { sqlite }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/db"),
    ]);

    const token = "require-user-token";
    const tokenHash = hashToken(token);

    sqlite
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("user-r1", "authuser", "Auth User", "unused", "ADMIN", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("session-r1", "user-r1", tokenHash, future, now, now);

    cookieStore.get.mockReturnValue({ value: token });

    const user = await requireUser();
    expect(user).toMatchObject({ id: "user-r1", role: "ADMIN" });
    sqlite.close();
  });
});

describe("requireRole", () => {
  it("redirects to / when the user role is not allowed", async () => {
    const [{ requireRole }, { sqlite }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/db"),
    ]);

    const token = "role-token";
    const tokenHash = hashToken(token);

    sqlite
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("user-role1", "advisor", "Advisor User", "unused", "ADVISOR", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("session-role1", "user-role1", tokenHash, future, now, now);

    cookieStore.get.mockReturnValue({ value: token });

    try {
      await requireRole(["ADMIN"]);
      expect.unreachable("should have redirected");
    } catch (e) {
      expect((e as Error).message).toBe("NEXT_REDIRECT");
    }

    expect(mockRedirect).toHaveBeenCalledWith("/");
    sqlite.close();
  });

  it("returns the user when role is allowed", async () => {
    const [{ requireRole }, { sqlite }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/db"),
    ]);

    const token = "admin-role-token";
    const tokenHash = hashToken(token);

    sqlite
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("user-admin1", "adminuser", "Admin", "unused", "ADMIN", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("session-admin1", "user-admin1", tokenHash, future, now, now);

    cookieStore.get.mockReturnValue({ value: token });

    const user = await requireRole(["ADMIN", "DATA_MANAGER"]);
    expect(user).toMatchObject({ id: "user-admin1", role: "ADMIN" });
    sqlite.close();
  });
});

describe("auditLoginFailure", () => {
  it("writes an audit log entry for failed login", async () => {
    const [{ auditLoginFailure }, { sqlite }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/db"),
    ]);

    await auditLoginFailure("faileduser", "192.168.1.100");

    const row = sqlite
      .prepare("SELECT action, entity_type AS entityType, details_json AS detailsJson, ip_address AS ipAddress FROM audit_logs")
      .get() as {
        action: string;
        entityType: string;
        detailsJson: string | null;
        ipAddress: string | null;
      };

    expect(row).toMatchObject({
      action: "LOGIN_FAILED",
      entityType: "USER",
      ipAddress: "192.168.1.100",
    });
    expect(JSON.parse(row.detailsJson ?? "{}")).toEqual({ username: "faileduser" });

    sqlite.close();
  });
});

describe("getSessionTtlHours", () => {
  it("falls back to twelve hours for invalid session configuration", async () => {
    process.env.SESSION_TTL_HOURS = "invalid";
    vi.resetModules();

    const { getSessionTtlHours } = await import("@/lib/auth");

    expect(getSessionTtlHours()).toBe(12);
  });
});

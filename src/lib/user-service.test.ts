import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { migrateDatabase } from "@/lib/db/migration";
import { verifyPassword } from "@/lib/password";
import {
  createUser,
  resetUserPassword,
  UserManagementError,
} from "@/lib/user-service";

let database: DatabaseSync;
let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await mkdtemp(join(tmpdir(), "school-syt-users-"));
  const databasePath = join(tempDirectory, "app.db");
  migrateDatabase(databasePath);
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const now = Date.now();
  database
    .prepare(
      `INSERT INTO users
       (id, username, display_name, password_hash, role, active, created_at, updated_at)
       VALUES ('admin-id', 'admin', '管理员', 'unused', 'ADMIN', 1, ?, ?)`,
    )
    .run(now, now);
});

afterEach(async () => {
  database.close();
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("user service", () => {
  it("persists a created account and its audit entry", async () => {
    const created = await createUser(
      {
        username: " Advisor ",
        displayName: "顾问账号",
        password: "test-password-123",
        role: "ADVISOR",
      },
      "admin-id",
      database,
    );

    const user = database
      .prepare("SELECT username, display_name AS displayName FROM users WHERE id = ?")
      .get(created.id);
    const audit = database
      .prepare("SELECT action, entity_id AS entityId FROM audit_logs WHERE entity_id = ?")
      .get(created.id);

    expect(user).toEqual({ username: "advisor", displayName: "顾问账号" });
    expect(audit).toEqual({ action: "USER_CREATED", entityId: created.id });
  });

  it("rejects a duplicate username without adding another account", async () => {
    await expect(
      createUser(
        {
          username: "ADMIN",
          displayName: "重复管理员",
          password: "test-password-123",
          role: "ADMIN",
        },
        "admin-id",
        database,
      ),
    ).rejects.toEqual(new UserManagementError("用户名已存在"));

    const count = database
      .prepare("SELECT COUNT(*) AS value FROM users WHERE username = 'admin'")
      .get() as { value: number };
    expect(count.value).toBe(1);
  });

  it("resets the password and invalidates existing sessions", async () => {
    database
      .prepare(
        `INSERT INTO sessions
         (id, user_id, token_hash, expires_at, last_seen_at, created_at)
         VALUES ('session-id', 'admin-id', 'token-hash', ?, ?, ?)`,
      )
      .run(Date.now() + 60_000, Date.now(), Date.now());

    await resetUserPassword("admin", "test-password-123", database);

    const row = database
      .prepare("SELECT password_hash AS passwordHash FROM users WHERE id = 'admin-id'")
      .get() as { passwordHash: string };
    const sessionCount = database
      .prepare("SELECT COUNT(*) AS value FROM sessions WHERE user_id = 'admin-id'")
      .get() as { value: number };

    expect(await verifyPassword("test-password-123", row.passwordHash)).toBe(true);
    expect(sessionCount.value).toBe(0);
  });
});

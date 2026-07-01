import { randomUUID } from "node:crypto";
import { access, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { migrateDatabase } from "./migration";

vi.mock("server-only", () => ({}));

const previousDatabasePath = process.env.DATABASE_PATH;
const tempDirs: string[] = [];

afterEach(async () => {
  if (previousDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = previousDatabasePath;
  }

  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("db module", () => {
  it("does not open SQLite when imported", async () => {
    const tempDir = join(process.cwd(), "data", `import-lazy-${randomUUID()}`);
    const databaseFile = join(tempDir, "app.db");
    tempDirs.push(tempDir);
    process.env.DATABASE_PATH = databaseFile;

    vi.resetModules();
    await import("./index");

    await expect(access(databaseFile)).rejects.toThrow();
  });

  it("keeps joined columns aligned when column names repeat", async () => {
    const tempDir = join(process.cwd(), "data", `joined-columns-${randomUUID()}`);
    const databaseFile = join(tempDir, "app.db");
    tempDirs.push(tempDir);
    process.env.DATABASE_PATH = databaseFile;
    migrateDatabase(databaseFile);

    vi.resetModules();
    const [{ db, sqlite }, { sessions, users }, { eq }] = await Promise.all([
      import("./index"),
      import("./schema"),
      import("drizzle-orm"),
    ]);

    const now = Date.now();
    sqlite.prepare(
      `INSERT INTO users
        (id, username, display_name, password_hash, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("user-1", "admin", "系统管理员", "hash", "ADMIN", 1, now, now);
    sqlite.prepare(
      `INSERT INTO sessions
        (id, user_id, token_hash, expires_at, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("session-1", "user-1", "token-hash", now + 60_000, now, now);

    const [row] = await db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        tokenHash: sessions.tokenHash,
        username: users.username,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId));

    expect(row).toEqual({
      sessionId: "session-1",
      userId: "user-1",
      tokenHash: "token-hash",
      username: "admin",
    });
    sqlite.close();
  });
});

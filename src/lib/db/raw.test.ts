import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRawDatabase, withTransaction } from "./raw";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "school-syt-with-transaction-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seed(databaseFile: string) {
  const database = openRawDatabase(databaseFile);
  database.exec("CREATE TABLE counters (id TEXT PRIMARY KEY, value INTEGER NOT NULL)");
  database.prepare("INSERT INTO counters (id, value) VALUES ('a', 0)").run();
  return database;
}

describe("withTransaction 同步事务封装", () => {
  it("提交后写入全部生效", () => {
    const database = seed(join(dir, "app.db"));
    try {
      withTransaction(database, (db) => {
        db.prepare("UPDATE counters SET value = value + 1 WHERE id = 'a'").run();
        db.prepare("INSERT INTO counters (id, value) VALUES ('b', 5)").run();
      });
      expect(database.prepare("SELECT COUNT(*) AS cnt FROM counters").get())
        .toMatchObject({ cnt: 2 });
    } finally {
      database.close();
    }
  });

  it("回调抛错时整体回滚，不留半成品数据", () => {
    const database = seed(join(dir, "app.db"));
    try {
      expect(() => withTransaction(database, (db) => {
        db.prepare("UPDATE counters SET value = value + 1 WHERE id = 'a'").run();
        db.prepare("INSERT INTO counters (id, value) VALUES ('b', 5)").run();
        throw new Error("boom");
      })).toThrow("boom");
      const row = database.prepare("SELECT value FROM counters WHERE id = 'a'").get() as { value: number };
      expect(row.value).toBe(0);
      expect(database.prepare("SELECT COUNT(*) AS cnt FROM counters").get())
        .toMatchObject({ cnt: 1 });
    } finally {
      database.close();
    }
  });

  it("拒绝 async 回调，避免并发请求的语句混入同一事务", () => {
    const database = seed(join(dir, "app.db"));
    try {
      expect(() => withTransaction(database, (async () => {
        database.prepare("UPDATE counters SET value = value + 1 WHERE id = 'a'").run();
      }) as unknown as (db: unknown) => void)).toThrow("只接受同步写入回调");
      const row = database.prepare("SELECT value FROM counters WHERE id = 'a'").get() as { value: number };
      expect(row.value).toBe(0);
    } finally {
      database.close();
    }
  });
});

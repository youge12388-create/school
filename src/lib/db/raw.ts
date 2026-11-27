import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openRawDatabase(databaseFile?: string) {
  const path = databaseFile
    ? databaseFile
    : process.env.DATABASE_PATH
      ? process.env.DATABASE_PATH
      : "./data/app.db";
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 5000");
  return database;
}

/**
 * Runs `write` inside a single synchronous SQLite transaction.
 *
 * The callback must stay synchronous: `node:sqlite` is a synchronous API and
 * awaiting inside the transaction would let other requests interleave their
 * statements into this transaction, so async callbacks are rejected at runtime.
 */
export function withTransaction<T>(database: DatabaseSync, write: (db: DatabaseSync) => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = write(database);
    if (result && typeof (result as { then?: unknown }).then === "function") {
      database.exec("ROLLBACK");
      throw new Error("withTransaction 只接受同步写入回调");
    }
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // The failure may already have rolled the transaction back.
    }
    throw error;
  }
}

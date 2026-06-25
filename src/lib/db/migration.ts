import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function migrateDatabase(databaseFile?: string) {
  const path = resolve(
    databaseFile ?? process.env.DATABASE_PATH ?? "./data/app.db",
  );
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0000_initial.sql"),
    "utf8",
  );

  database.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
  const applied = database
    .prepare("SELECT name FROM __migrations WHERE name = ?")
    .get("0000_initial");

  if (!applied) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration);
      database
        .prepare("INSERT INTO __migrations (name, applied_at) VALUES (?, ?)")
        .run("0000_initial", Date.now());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  database.close();
  return path;
}

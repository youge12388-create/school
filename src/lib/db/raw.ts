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

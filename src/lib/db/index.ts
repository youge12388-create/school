import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle, type AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";

import * as schema from "./schema";
import { migrateDatabase } from "./migration";

export function getDatabasePath() {
  return resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH ?? "./data/app.db",
  );
}

let sqliteInstance: DatabaseSync | null = null;

// 每次进程内首次建连前应用未执行的迁移，
// 保证任何部署路径（脚本/面板/手工）都不会遗漏数据库结构变更。
let migrationsEnsured = false;

function createDatabase() {
  const databasePath = getDatabasePath();
  mkdirSync(dirname(databasePath), { recursive: true });
  if (!migrationsEnsured) {
    migrateDatabase(databasePath);
    migrationsEnsured = true;
  }
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  return database;
}

export function getSqlite() {
  sqliteInstance ??= createDatabase();
  return sqliteInstance;
}

export const sqlite = new Proxy({} as DatabaseSync, {
  get(_target, property, receiver) {
    const database = getSqlite();
    const value = Reflect.get(database, property, receiver);
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export const databasePath = getDatabasePath();

type QueryMethod = "run" | "all" | "values" | "get";
type ProxyRows = unknown[] | unknown[][] | Record<string, unknown> | undefined;

async function execute(sql: string, params: unknown[], method: QueryMethod): Promise<{ rows: ProxyRows }> {
  const statement = getSqlite().prepare(sql);
  const values = params as SQLInputValue[];

  if (method === "run") {
    const result = statement.run(...values);
    return {
      rows: [
        {
          changes: Number(result.changes),
          lastInsertRowid: Number(result.lastInsertRowid),
        },
      ],
    };
  }

  statement.setReturnArrays(true);

  if (method === "get") {
    const row = statement.get(...values) as unknown[] | undefined;
    return { rows: row ?? undefined };
  }

  return { rows: statement.all(...values) as unknown as unknown[][] };
}

export const db = drizzle(execute as unknown as AsyncRemoteCallback, { schema });

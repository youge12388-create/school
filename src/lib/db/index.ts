import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle, type AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";

import * as schema from "./schema";

const databasePath = resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH ?? "./data/app.db");
mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");
sqlite.exec("PRAGMA busy_timeout = 5000");

type QueryMethod = "run" | "all" | "values" | "get";
type ProxyRows = unknown[] | unknown[][] | Record<string, unknown> | undefined;

async function execute(sql: string, params: unknown[], method: QueryMethod): Promise<{ rows: ProxyRows }> {
  const statement = sqlite.prepare(sql);
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

  if (method === "get") {
    const row = statement.get(...values);
    return { rows: row ?? undefined };
  }

  if (method === "values") {
    return { rows: statement.all(...values).map((row) => Object.values(row)) };
  }

  return { rows: statement.all(...values).map((row) => Object.values(row)) };
}

export const db = drizzle(execute as unknown as AsyncRemoteCallback, { schema });
export { sqlite, databasePath };

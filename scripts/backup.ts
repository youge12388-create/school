import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { openRawDatabase } from "../src/lib/db/raw";

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace("T", "-")
  .slice(0, 15);
const backupRoot = resolve("backups", stamp);
mkdirSync(backupRoot, { recursive: true });

const database = openRawDatabase();
database.exec("PRAGMA wal_checkpoint(FULL)");
const escapedPath = resolve(backupRoot, "app.db").replaceAll("'", "''");
database.exec(`VACUUM INTO '${escapedPath}'`);
database.close();

const uploadDir = resolve(process.env.UPLOAD_DIR ?? "./data/uploads");
const keyPath = resolve(process.env.APP_KEY_PATH ?? "./data/keys/app.key");

if (existsSync(uploadDir)) {
  cpSync(uploadDir, resolve(backupRoot, "uploads"), {
    recursive: true,
    force: false,
  });
}

if (existsSync(keyPath)) {
  mkdirSync(resolve(backupRoot, "keys"), { recursive: true });
  cpSync(keyPath, resolve(backupRoot, "keys", "app.key"), { force: false });
}

console.log(`Backup completed: ${backupRoot}`);
import type { DatabaseSync } from "node:sqlite";

import {
  type AuditInput,
  writeAuditRecord,
} from "@/lib/audit-record";
import { sqlite } from "@/lib/db";

export async function writeAudit(
  input: AuditInput,
  database: DatabaseSync = sqlite,
) {
  writeAuditRecord(input, database);
}

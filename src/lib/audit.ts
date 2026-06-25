import type { DatabaseSync } from "node:sqlite";

import { sqlite } from "@/lib/db";
import { newId } from "@/lib/utils";

type AuditInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: unknown;
  ipAddress?: string | null;
};

export async function writeAudit(
  input: AuditInput,
  database: DatabaseSync = sqlite,
) {
  database.prepare(`INSERT INTO audit_logs
    (id, user_id, action, entity_type, entity_id, details_json, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      newId(),
      input.userId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.details ? JSON.stringify(input.details) : null,
      input.ipAddress ?? null,
      Date.now(),
    );
}

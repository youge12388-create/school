import type { DatabaseSync } from "node:sqlite";

import { newId } from "@/lib/utils";

export type AuditInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: unknown;
  ipAddress?: string | null;
};

export function writeAuditRecord(input: AuditInput, database: DatabaseSync) {
  database
    .prepare(
      `INSERT INTO audit_logs
       (id, user_id, action, entity_type, entity_id, details_json, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
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

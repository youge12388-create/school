"use server";

import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { asText, newId } from "@/lib/utils";

export async function createApplicationFromRecommendationAction(formData: FormData) {
  const user = await requireUser();
  const recommendationId = asText(formData.get("recommendationId"));
  const programId = asText(formData.get("programId"));
  if (!recommendationId || !programId) throw new Error("方案和项目不能为空。");
  let applicationId = "";
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const match = sqlite.prepare(`SELECT r.customer_id AS customerId FROM recommendations r
      INNER JOIN recommendation_items i ON i.recommendation_id = r.id
      INNER JOIN customers c ON c.id = r.customer_id AND c.archived = 0
      INNER JOIN programs p ON p.id = i.program_id AND p.archived = 0
      WHERE r.id = ? AND i.program_id = ? LIMIT 1`).get(recommendationId, programId) as { customerId: string } | undefined;
    if (!match) throw new Error("方案项目不存在，或客户、项目已归档。");
    const existing = sqlite.prepare("SELECT id FROM applications WHERE customer_id = ? AND program_id = ? AND archived = 0 ORDER BY created_at DESC LIMIT 1").get(match.customerId, programId) as { id: string } | undefined;
    if (existing) applicationId = existing.id;
    else {
      applicationId = newId();
      const now = Date.now();
      sqlite.prepare("INSERT INTO applications (id, customer_id, program_id, owner_id, status, notes, archived, created_at, updated_at) VALUES (?, ?, ?, ?, 'MATERIAL_PREPARATION', NULL, 0, ?, ?)").run(applicationId, match.customerId, programId, user.id, now, now);
      sqlite.prepare("INSERT INTO application_events (id, application_id, from_status, to_status, reason, actor_id, created_at) VALUES (?, ?, NULL, 'MATERIAL_PREPARATION', '从选校方案创建申请', ?, ?)").run(newId(), applicationId, user.id, now);
      writeAudit({ userId: user.id, action: "APPLICATION_CREATED", entityType: "APPLICATION", entityId: applicationId }, sqlite);
    }
    sqlite.exec("COMMIT");
  } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  redirect(`/applications/${applicationId}`);
}

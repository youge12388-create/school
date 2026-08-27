import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { SCHOOL_EDITOR_ROLES } from "@/lib/permissions";
import { asText } from "@/lib/utils";

// 详情页内联备注编辑：只更新 info_note，避免整页表单一并提交
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireRole([...SCHOOL_EDITOR_ROLES]);
  const { id } = await context.params;
  const school = sqlite
    .prepare("SELECT id, name_zh FROM schools WHERE id = ? AND archived = 0")
    .get(id) as { id: string; name_zh: string } | undefined;
  if (!school) {
    return Response.json({ error: "学校不存在" }, { status: 404 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const infoNote = asText(body.infoNote) || null;
  sqlite
    .prepare("UPDATE schools SET info_note = ?, updated_at = ? WHERE id = ?")
    .run(infoNote, Date.now(), id);
  writeAudit({
    userId: user.id,
    action: "SCHOOL_UPDATED",
    entityType: "SCHOOL",
    entityId: id,
    details: { nameZh: school.name_zh, changed: ["infoNote"] },
  });
  revalidatePath(`/schools/${id}`);
  revalidatePath("/schools");
  revalidatePath("/schools/noted");
  return Response.json({ id, infoNote });
}

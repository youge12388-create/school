import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";
import { asText } from "@/lib/utils";

// 详情页内联备注编辑：只更新 info_note，避免整页表单一并提交
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "请求来源不受信任。" }, { status: 403 });
  }
  const user = await requirePermission("SCHOOL_VIEW_PUBLIC");
  const { id } = await context.params;
  const school = sqlite
    .prepare("SELECT id, name_zh FROM schools WHERE id = ? AND archived = 0")
    .get(id) as { id: string; name_zh: string } | undefined;
  if (!school) {
    return Response.json({ error: "学校不存在" }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "请求体格式无效" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求体格式无效" }, { status: 400 });
  }
  const infoNote = asText(body.infoNote) || null;
  const existingNote = sqlite
    .prepare("SELECT info_note AS infoNote FROM schools WHERE id = ?")
    .get(id) as { infoNote: string | null } | undefined;
  const changed =
    (existingNote?.infoNote ?? "") !== (infoNote ?? "");
  if (changed) {
    sqlite
      .prepare("UPDATE schools SET info_note = ?, updated_at = ? WHERE id = ?")
      .run(infoNote, Date.now(), id);
    writeAudit({
      userId: user.id,
      action: infoNote
        ? existingNote?.infoNote
          ? "SCHOOL_NOTE_UPDATED"
          : "SCHOOL_NOTE_CREATED"
        : "SCHOOL_NOTE_CLEARED",
      entityType: "SCHOOL",
      entityId: id,
      details: { nameZh: school.name_zh },
    });
  }
  revalidatePath(`/schools/${id}`);
  revalidatePath("/schools");
  revalidatePath("/schools/noted");
  return Response.json({ id, infoNote });
}

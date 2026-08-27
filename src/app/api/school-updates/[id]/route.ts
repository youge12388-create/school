import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { sqlite } from "@/lib/db";
import { SCHOOL_UPDATE_MANAGER_ROLES } from "@/lib/permissions";
import { stripSchoolUpdateInput } from "@/lib/school-updates";

const UPDATE_COLUMNS = [
  "title",
  "submitter",
  "submittedAt",
  "publicContent",
  "publicUrl",
  "publicOperator",
  "publicUpdatedAt",
  "secretContent",
  "secretUrl",
  "secretOperator",
  "secretUpdatedAt",
] as const;

const UPDATE_COLUMN_MAP: Record<(typeof UPDATE_COLUMNS)[number], string> = {
  title: "title",
  submitter: "submitter",
  submittedAt: "submitted_at",
  publicContent: "public_content",
  publicUrl: "public_url",
  publicOperator: "public_operator",
  publicUpdatedAt: "public_updated_at",
  secretContent: "secret_content",
  secretUrl: "secret_url",
  secretOperator: "secret_operator",
  secretUpdatedAt: "secret_updated_at",
};

function toMs(value: unknown) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireRole([...SCHOOL_UPDATE_MANAGER_ROLES]);
  const { id } = await context.params;
  const existing = sqlite
    .prepare(
      `SELECT su.id AS id, s.name_zh AS nameZh, su.title AS title
       FROM school_updates su JOIN schools s ON s.id = su.school_id
       WHERE su.id = ? AND su.archived = 0`,
    )
    .get(id) as { id: string; nameZh: string; title: string | null } | undefined;
  if (!existing) {
    return Response.json({ error: "更新记录不存在" }, { status: 404 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const input = stripSchoolUpdateInput(body, user.role);
  const changed = UPDATE_COLUMNS.filter((column) => column in input);
  if (!changed.length) {
    return Response.json({ error: "没有可更新的字段" }, { status: 400 });
  }
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const column of changed) {
    const value =
      column === "submittedAt" ||
      column === "publicUpdatedAt" ||
      column === "secretUpdatedAt"
        ? toMs(input[column])
        : typeof input[column] === "string"
          ? (input[column] as string).trim() || null
          : null;
    sets.push(`${UPDATE_COLUMN_MAP[column]} = ?`);
    values.push(value as string | number | null);
  }
  values.push(Date.now(), id);
  sqlite
    .prepare(`UPDATE school_updates SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`)
    .run(...values);
  writeAudit({
    userId: user.id,
    action: "SCHOOL_UPDATE_UPDATED",
    entityType: "SCHOOL_UPDATE",
    entityId: id,
    details: { nameZh: existing.nameZh, title: existing.title, changed },
  });
  return Response.json({ id });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireRole([...SCHOOL_UPDATE_MANAGER_ROLES]);
  const { id } = await context.params;
  const existing = sqlite
    .prepare(
      `SELECT su.id AS id, s.name_zh AS nameZh, su.title AS title
       FROM school_updates su JOIN schools s ON s.id = su.school_id
       WHERE su.id = ? AND su.archived = 0`,
    )
    .get(id) as { id: string; nameZh: string; title: string | null } | undefined;
  if (!existing) {
    return Response.json({ error: "更新记录不存在" }, { status: 404 });
  }
  sqlite
    .prepare("UPDATE school_updates SET archived = 1, updated_at = ? WHERE id = ?")
    .run(Date.now(), id);
  writeAudit({
    userId: user.id,
    action: "SCHOOL_UPDATE_DELETED",
    entityType: "SCHOOL_UPDATE",
    entityId: id,
    details: { nameZh: existing.nameZh, title: existing.title },
  });
  return Response.json({ id });
}

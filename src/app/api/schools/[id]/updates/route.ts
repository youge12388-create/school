import { requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { sqlite } from "@/lib/db";
import {
  SCHOOL_UPDATE_MANAGER_ROLES,
} from "@/lib/permissions";
import { getSchoolUpdates } from "@/lib/queries";
import {
  serializeSchoolUpdate,
  stripSchoolUpdateInput,
} from "@/lib/school-updates";
import { asText, newId } from "@/lib/utils";

function optionalText(value: unknown) {
  const text = asText(value);
  return text || null;
}

function optionalMs(value: unknown) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const items = await getSchoolUpdates(id);
  return Response.json(
    items.map((item) =>
      serializeSchoolUpdate(item.update, item.attachments, user.role),
    ),
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireRole([...SCHOOL_UPDATE_MANAGER_ROLES]);
  const { id } = await context.params;
  const school = sqlite
    .prepare("SELECT id, name_zh AS nameZh FROM schools WHERE id = ? AND archived = 0")
    .get(id) as { id: string; nameZh: string } | undefined;
  if (!school) {
    return Response.json({ error: "学校不存在" }, { status: 404 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const input = stripSchoolUpdateInput(body, user.role);
  const now = Date.now();
  const updateId = newId();
  sqlite
    .prepare(
      `INSERT INTO school_updates
       (id, school_id, title, submitter, submitted_at,
        public_content, public_url, public_operator, public_updated_at,
        secret_content, secret_url, secret_operator, secret_updated_at,
        archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      updateId,
      id,
      optionalText(input.title),
      optionalText(input.submitter),
      optionalMs(input.submittedAt),
      optionalText(input.publicContent),
      optionalText(input.publicUrl),
      optionalText(input.publicOperator),
      optionalMs(input.publicUpdatedAt),
      optionalText(input.secretContent),
      optionalText(input.secretUrl),
      optionalText(input.secretOperator),
      optionalMs(input.secretUpdatedAt),
      now,
      now,
    );
  writeAudit({
    userId: user.id,
    action: "SCHOOL_UPDATE_CREATED",
    entityType: "SCHOOL_UPDATE",
    entityId: updateId,
    details: { nameZh: school.nameZh, title: optionalText(input.title) },
  });
  const created = (await getSchoolUpdates(id)).find(
    (item) => item.update.id === updateId,
  );
  return Response.json(
    created
      ? serializeSchoolUpdate(created.update, created.attachments, user.role)
      : { id: updateId },
    { status: 201 },
  );
}

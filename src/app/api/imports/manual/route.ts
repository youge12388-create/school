import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { createManualEntry } from "@/lib/import-service";
import {
  canEditConfidentialSchoolFields,
  IMPORT_ROLES,
  stripConfidentialSchoolUpdates,
} from "@/lib/permissions";

export async function POST(request: Request) {
  const user = await requireRole([...IMPORT_ROLES]);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload = canEditConfidentialSchoolFields(user.role)
      ? body
      : stripConfidentialSchoolUpdates(body);
    const result = createManualEntry(payload, user.id);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? (error.issues[0]?.message ?? "录入内容格式不正确")
        : error instanceof Error
          ? error.message
          : "手动录入失败";
    return Response.json({ error: message }, { status: 400 });
  }
}

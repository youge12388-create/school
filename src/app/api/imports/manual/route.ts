import { ZodError } from "zod";

import { requirePermission } from "@/lib/auth";
import { userHasPermission } from "@/lib/access-control";
import { createManualEntry } from "@/lib/import-service";
import {
  stripConfidentialSchoolUpdates,
} from "@/lib/permissions";

export async function POST(request: Request) {
  const user = await requirePermission("DATA_IMPORT");
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload = userHasPermission(user, "SCHOOL_EDIT_CONFIDENTIAL")
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

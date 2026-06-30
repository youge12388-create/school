import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { createManualEntry } from "@/lib/import-service";

export async function POST(request: Request) {
  const user = await requireRole(["ADMIN", "DATA_MANAGER"]);
  try {
    const result = createManualEntry(await request.json(), user.id);
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

import { z } from "zod";

import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";

const feedbackSchema = z
  .object({
    programId: z.string().min(1).max(120),
    value: z.enum(["relevant", "not_relevant"]),
    reason: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "请求来源不受信任。" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  let parsed: ReturnType<typeof feedbackSchema.safeParse>;
  try {
    parsed = feedbackSchema.safeParse(await request.json());
  } catch {
    return Response.json({ error: "反馈内容无效。" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "反馈内容无效。" }, { status: 400 });
  }
  const { programId, value, reason } = parsed.data;
  try {
    const program = sqlite
      .prepare(
        "SELECT id FROM programs WHERE id = ? AND archived = 0",
      )
      .get(programId);
    if (!program) {
      return Response.json(
        { error: "项目不存在或已归档。" },
        { status: 404 },
      );
    }
    writeAudit(
      {
        userId: user.id,
        action: "SCREENING_FEEDBACK",
        entityType: "PROGRAM",
        entityId: programId,
        details: { value, reason: reason || null },
      },
      sqlite,
    );
    return Response.json(
      { saved: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "反馈未保存，请稍后重试。" },
      { status: 503 },
    );
  }
}

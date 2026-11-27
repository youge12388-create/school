import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/access-control";
import { criteriaSchema } from "@/lib/ai-screening";
import { listUserSessions, saveUserSession, type PersistedSavedPlan, type PersistedTurn } from "@/lib/ai-screening-sessions";
import type { DraftPlan } from "@/lib/ai-screening-plan";
import { isSameOrigin } from "@/lib/http";

export const runtime = "nodejs";

const saveSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{4,80}$/).optional(),
  title: z.string().trim().max(80).optional(),
  pinned: z.boolean().optional(),
  runMode: z.enum(["partner_priority", "standard_all", "partner_quick"]).default("partner_priority"),
  criteria: criteriaSchema.default({}),
  sensitiveContext: z.boolean().default(false),
  focusSchool: z.string().max(120).nullable().default(null),
  turns: z.array(z.unknown()).max(40).default([]),
  draft: z.unknown().nullable().default(null),
  savedPlan: z.unknown().nullable().default(null),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!userHasPermission(user, "SCREENING_VIEW")) {
    return Response.json({ error: "当前账号无权查看选校记录" }, { status: 403 });
  }
  const sessions = listUserSessions(user.id);
  return Response.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "请求来源不受信任" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!userHasPermission(user, "SCREENING_VIEW")) {
    return Response.json({ error: "当前账号无权保存选校记录" }, { status: 403 });
  }

  let parsed: ReturnType<typeof saveSchema.safeParse>;
  try {
    parsed = saveSchema.safeParse(await request.json());
  } catch {
    return Response.json({ error: "会话内容格式无效" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "会话参数校验失败" }, { status: 400 });
  }

  try {
    const summary = saveUserSession(user.id, {
      id: parsed.data.id,
      title: parsed.data.title,
      pinned: parsed.data.pinned,
      runMode: parsed.data.runMode,
      criteria: parsed.data.criteria,
      sensitiveContext: parsed.data.sensitiveContext,
      focusSchool: parsed.data.focusSchool,
      turns: parsed.data.turns as PersistedTurn[],
      draft: (parsed.data.draft ?? null) as DraftPlan | null,
      savedPlan: (parsed.data.savedPlan ?? null) as PersistedSavedPlan | null,
    });
    return Response.json({ session: summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "保存会话失败";
    return Response.json({ error: msg }, { status: 400 });
  }
}

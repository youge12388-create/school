import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/access-control";
import { deleteUserSession, getUserSession, updateUserSessionMeta } from "@/lib/ai-screening-sessions";
import { isSameOrigin } from "@/lib/http";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  pinned: z.boolean().optional(),
}).strict();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!userHasPermission(user, "SCREENING_VIEW")) {
    return Response.json({ error: "当前账号无权查看选校记录" }, { status: 403 });
  }
  const { id } = await context.params;
  const session = getUserSession(user.id, id);
  if (!session) return Response.json({ error: "会话不存在或已删除" }, { status: 404 });
  return Response.json({ session }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "请求来源不受信任" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!userHasPermission(user, "SCREENING_VIEW")) {
    return Response.json({ error: "当前账号无权修改选校记录" }, { status: 403 });
  }
  const { id } = await context.params;
  let parsed: ReturnType<typeof patchSchema.safeParse>;
  try {
    parsed = patchSchema.safeParse(await request.json());
  } catch {
    return Response.json({ error: "请求内容格式无效" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "会话更新参数无效" }, { status: 400 });
  }
  const updated = updateUserSessionMeta(user.id, id, parsed.data);
  if (!updated) return Response.json({ error: "会话不存在或已删除" }, { status: 404 });
  return Response.json({ session: updated }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "请求来源不受信任" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!userHasPermission(user, "SCREENING_VIEW")) {
    return Response.json({ error: "当前账号无权删除选校记录" }, { status: 403 });
  }
  const { id } = await context.params;
  const deleted = deleteUserSession(user.id, id);
  if (!deleted) return Response.json({ error: "会话不存在或已删除" }, { status: 404 });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

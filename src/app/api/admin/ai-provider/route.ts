import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { isSameOrigin } from "@/lib/http";
import {
  AiProviderError,
  providerUpdateSchema,
  resolveAiProviderUpdate,
  saveAiProvider,
  verifyAiProvider,
} from "@/lib/ai-provider";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "请求来源不受信任。" }, 403);
  const admin = await getCurrentUser();
  if (!admin) return json({ error: "请先登录" }, 401);
  if (admin.role !== "ADMIN") return json({ error: "仅管理员可以管理 AI API。" }, 403);

  const parsed = providerUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "请检查 API 地址、模型名称和密钥格式。" }, 400);

  try {
    const config = resolveAiProviderUpdate(parsed.data);
    await verifyAiProvider(config, request.signal);
    if (parsed.data.intent === "test") return json({ ok: true });
    if (request.signal.aborted) return json({ error: "请求已取消，请重试。" }, 408);

    const settings = saveAiProvider(config, parsed.data.revision);
    try {
      writeAudit({ userId: admin.id, action: "AI_PROVIDER_UPDATED", entityType: "SETTINGS" });
    } catch {
      console.warn("AI provider settings updated, but the audit record could not be saved.");
    }
    return json({ ok: true, settings });
  } catch (error) {
    if (error instanceof AiProviderError) return json({ error: error.message }, error.status);
    return json({ error: "操作未完成，请刷新页面后重试。" }, 500);
  }
}

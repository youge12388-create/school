import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  clearSearchCache,
  getSearchGovernanceStatus,
  saveSearchGovernanceConfig,
  searchGovernanceSchema,
} from "@/lib/ai-search-governance";
import { verifyDeepSeekWebSearch } from "@/lib/ai-screening-external";
import { isSameOrigin } from "@/lib/http";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("intent", [
  searchGovernanceSchema.extend({ intent: z.literal("save") }).strict(),
  z.object({ intent: z.literal("clear_cache") }).strict(),
  z.object({ intent: z.literal("test_search") }).strict(),
]);

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "请求来源不受信任。" }, 403);
  const admin = await getCurrentUser();
  if (!admin) return json({ error: "请先登录" }, 401);
  if (admin.role !== "ADMIN") return json({ error: "仅管理员可以管理联网检索设置。" }, 403);

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "请检查联网检索配置参数格式。" }, 400);
  }

  try {
    const data = parsed.data;
    if (data.intent === "save") {
      const saved = saveSearchGovernanceConfig({
        externalEnabled: data.externalEnabled,
        webSearchEnabled: data.webSearchEnabled,
        dailySearchLimit: data.dailySearchLimit,
        cacheTtlHours: data.cacheTtlHours,
      });
      try {
        writeAudit({
          userId: admin.id,
          action: "AI_SEARCH_GOVERNANCE_UPDATED",
          entityType: "SETTINGS",
          details: saved,
        });
      } catch {
        console.warn("AI search governance settings saved, but audit logging failed.");
      }
      return json({ ok: true, status: getSearchGovernanceStatus() });
    }

    if (data.intent === "clear_cache") {
      clearSearchCache();
      try {
        writeAudit({
          userId: admin.id,
          action: "AI_SEARCH_CACHE_CLEARED",
          entityType: "SETTINGS",
        });
      } catch {
        console.warn("AI search cache cleared, but audit logging failed.");
      }
      return json({ ok: true, status: getSearchGovernanceStatus() });
    }

    const testResult = await verifyDeepSeekWebSearch({ signal: request.signal });
    return json({
      ok: testResult.ok,
      message: testResult.message,
      resultCount: testResult.resultCount,
      latencyMs: testResult.latencyMs,
      status: getSearchGovernanceStatus(),
    });
  } catch {
    return json({ error: "操作未完成，请刷新页面后重试。" }, 500);
  }
}

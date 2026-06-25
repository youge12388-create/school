import { requireRole } from "@/lib/auth";
import { confirmImport } from "@/lib/import-service";

export async function POST(request: Request) {
  const user = await requireRole(["ADMIN", "DATA_MANAGER"]);
  try {
    const body = (await request.json()) as { batchId?: string };
    if (!body.batchId) {
      return Response.json({ error: "缺少导入批次" }, { status: 400 });
    }
    return Response.json({ summary: confirmImport(body.batchId, user.id) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "导入失败" },
      { status: 400 },
    );
  }
}

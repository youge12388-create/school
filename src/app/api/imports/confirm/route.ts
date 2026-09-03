import { requireRole } from "@/lib/auth";
import { confirmImport } from "@/lib/import-service";
import { IMPORT_ROLES } from "@/lib/permissions";
import { sqlite } from "@/lib/db";

export async function POST(request: Request) {
  const user = await requireRole([...IMPORT_ROLES]);
  try {
    const body = (await request.json()) as { batchId?: string };
    if (!body.batchId) {
      return Response.json({ error: "缺少导入批次" }, { status: 400 });
    }
    // 机密字段只在高级管理员的预览中保留；低权限角色确认他人批次会绕过
    // “仅 ADMIN 可导入机密字段”规则，因此只允许本人或 ADMIN 确认。
    const batch = sqlite
      .prepare("SELECT imported_by FROM import_batches WHERE id = ?")
      .get(body.batchId) as { imported_by: string | null } | undefined;
    if (!batch) {
      return Response.json({ error: "导入批次不存在" }, { status: 404 });
    }
    if (batch.imported_by !== user.id && user.role !== "ADMIN") {
      return Response.json(
        { error: "只能确认自己创建的导入批次（高级管理员除外）" },
        { status: 403 },
      );
    }
    return Response.json({ summary: confirmImport(body.batchId, user.id) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "导入失败" },
      { status: 400 },
    );
  }
}

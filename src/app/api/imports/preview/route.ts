import { requireRole } from "@/lib/auth";
import { createImportPreview } from "@/lib/import-service";
import { canEditConfidentialSchoolFields, IMPORT_ROLES } from "@/lib/permissions";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: Request) {
  const user = await requireRole([...IMPORT_ROLES]);
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "请选择 Excel 文件" }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return Response.json({ error: "仅支持 .xlsx 或 .xls 格式" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "文件大小不能超过 20MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = createImportPreview(
      {
        fileBuffer: buffer,
        fileName: file.name,
        userId: user.id,
      },
      { stripConfidential: !canEditConfidentialSchoolFields(user.role) },
    );

    return Response.json({
      batchId: preview.batchId,
      sourceNames: preview.sourceNames,
      summary: preview.summary,
      entries: preview.entries.slice(0, 120),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "解析失败" },
      { status: 400 },
    );
  }
}

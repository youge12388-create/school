import { requireRole } from "@/lib/auth";
import { createImportPreview } from "@/lib/import-service";

export async function POST(request: Request) {
  const user = await requireRole(["ADMIN", "DATA_MANAGER"]);
  try {
    const formData = await request.formData();
    const schoolFile = formData.get("schoolFile");
    const programFile = formData.get("programFile");
    if (!(schoolFile instanceof File) || !(programFile instanceof File)) {
      return Response.json({ error: "请同时选择两份 Excel 文件" }, { status: 400 });
    }
    const preview = createImportPreview({
      schoolBuffer: Buffer.from(await schoolFile.arrayBuffer()),
      schoolName: schoolFile.name,
      programBuffer: Buffer.from(await programFile.arrayBuffer()),
      programName: programFile.name,
      userId: user.id,
    });
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

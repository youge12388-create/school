import { requirePermission } from "@/lib/auth";
import { userHasPermission } from "@/lib/access-control";
import {
  importSchoolUpdateRows,
  parseSchoolUpdateWorkbook,
} from "@/lib/school-update-import";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await requirePermission("SCHOOL_UPDATE_MANAGE");
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
  const parsed = parseSchoolUpdateWorkbook(buffer);
  const canViewConfidential = userHasPermission(user, "SCHOOL_VIEW_CONFIDENTIAL");
  const rows = canViewConfidential
    ? parsed.rows
    : parsed.rows.map((row) => ({
        ...row,
        publicOperator: null,
        secretContent: null,
        secretUrl: null,
        secretUpdatedAt: null,
        secretOperator: null,
        submitter: null,
        submittedAt: null,
      }));
  const result = importSchoolUpdateRows(rows, user.id);
  return Response.json({
    summary: { ...result, skippedRows: parsed.skipped },
  });
}

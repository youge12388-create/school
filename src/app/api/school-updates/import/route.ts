import { requireRole } from "@/lib/auth";
import { SCHOOL_UPDATE_MANAGER_ROLES } from "@/lib/permissions";
import {
  importSchoolUpdateRows,
  parseSchoolUpdateWorkbook,
} from "@/lib/school-update-import";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await requireRole([...SCHOOL_UPDATE_MANAGER_ROLES]);
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
  const summary = importSchoolUpdateRows(parsed.rows, user.id);
  return Response.json({ summary, skippedRows: parsed.skipped });
}

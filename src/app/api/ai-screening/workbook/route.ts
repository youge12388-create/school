import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/http";
import { currentWorkbookInfo, MAX_WORKBOOK_BYTES, previewWorkbook, replaceWorkbook, restorePreviousWorkbook, WorkbookError } from "@/lib/ai-screening-workbook";

export const runtime = "nodejs";
const versionSchema = z.string().uuid();

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === appUrl(request, "/").origin; }
  catch { return false; }
}

async function readLimited(request: Request, limit: number): Promise<ArrayBuffer> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit || !request.body) throw new WorkbookError("文件过大或请求内容为空。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); throw new WorkbookError("文件过大，请选择不超过 10 MB 的名单。"); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result.buffer;
}

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof WorkbookError ? error.message : "名单操作未完成，请稍后重试。" }, { status: 400 });
}

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: "请先登录" }, { status: 401 });
  try { return Response.json(await currentWorkbookInfo(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "只有管理员可以更新合作名单。" }, { status: 403 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源不受信任。" }, { status: 403 });
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.startsWith("application/json")) {
      const body = new TextDecoder().decode(await readLimited(request, 4096));
      const value = z.object({ action: z.literal("restore"), expectedVersion: versionSchema }).strict().parse(JSON.parse(body));
      return Response.json(await restorePreviousWorkbook(value.expectedVersion));
    }
    if (!type.startsWith("multipart/form-data;")) throw new WorkbookError("请选择 .xlsx 格式的合作院校名单。");
    const body = await readLimited(request, MAX_WORKBOOK_BYTES + 65536);
    const form = await new Request(request.url, { method: "POST", headers: { "Content-Type": type }, body }).formData();
    const file = form.get("workbook");
    if (!(file instanceof File) || !file.size || file.size > MAX_WORKBOOK_BYTES) throw new WorkbookError("请选择不超过 10 MB 的 .xlsx 名单文件。");
    const rawVersion = form.get("expectedVersion");
    const expectedVersion = rawVersion === "" ? null : versionSchema.parse(rawVersion);
    const content = Buffer.from(await file.arrayBuffer());
    if (form.get("action") === "preview") return Response.json(await previewWorkbook(content, file.name, expectedVersion));
    if (form.get("action") !== "update") throw new WorkbookError("请先检查名单再确认更新。");
    const hash = z.string().regex(/^[a-f0-9]{64}$/u).parse(form.get("hash"));
    return Response.json(await replaceWorkbook(content, file.name, expectedVersion, hash));
  } catch (error) { return errorResponse(error); }
}

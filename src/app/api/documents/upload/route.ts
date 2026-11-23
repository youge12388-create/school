import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

import { NextResponse } from "next/server";

import { ALLOWED_DOCUMENT_TYPES } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db, sqlite } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { encryptBuffer } from "@/lib/file-crypto";
import { appUrl, isSameOrigin } from "@/lib/http";
import { getMaxUploadBytes, isPathWithinRoot } from "@/lib/request-security";
import { asText, newId } from "@/lib/utils";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源不受信任。" }, { status: 403 });
  }
  const user = await requirePermission("DOCUMENT_UPLOAD");
  const formData = await request.formData();
  const file = formData.get("file");
  const customerId = asText(formData.get("customerId"));
  const applicationId = asText(formData.get("applicationId")) || null;
  const category = asText(formData.get("category")) || "其他";
  if (!(file instanceof File) || !customerId) {
    return NextResponse.json({ error: "缺少客户或文件" }, { status: 400 });
  }
  const expectedExtension = ALLOWED_DOCUMENT_TYPES.get(file.type);
  if (!expectedExtension || extname(file.name).toLowerCase() !== expectedExtension) {
    return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
  }
  const maxBytes = getMaxUploadBytes(20);
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "文件超过上传上限" }, { status: 413 });
  }

  const customerExists = sqlite
    .prepare("SELECT id FROM customers WHERE id = ? AND archived = 0")
    .get(customerId);
  if (!customerExists) {
    return NextResponse.json({ error: "客户不存在或已归档" }, { status: 404 });
  }
  if (applicationId) {
    const appExists = sqlite
      .prepare("SELECT id FROM applications WHERE id = ? AND customer_id = ?")
      .get(applicationId, customerId);
    if (!appExists) {
      return NextResponse.json({ error: "申请记录不存在" }, { status: 404 });
    }
  }

  const id = newId();
  const uploadRoot = resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? "./data/uploads");
  const customerDir = resolve(uploadRoot, customerId);
  if (!isPathWithinRoot(uploadRoot, customerDir)) {
    return NextResponse.json({ error: "无效客户目录" }, { status: 400 });
  }
  const encrypted = encryptBuffer(Buffer.from(await file.arrayBuffer()));
  mkdirSync(customerDir, { recursive: true });
  const storagePath = resolve(customerDir, `${id}.enc`);
  if (!isPathWithinRoot(customerDir, storagePath)) {
    return NextResponse.json({ error: "无效文件路径" }, { status: 400 });
  }
  writeFileSync(storagePath, encrypted.encrypted, { flag: "wx" });

  try {
    await db.insert(documents).values({
      id,
      customerId,
      applicationId,
      category,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      storagePath,
      encryptionIv: encrypted.iv,
      encryptionTag: encrypted.tag,
      checksum: encrypted.checksum,
      uploadedBy: user.id,
    });
  } catch (error) {
    try { unlinkSync(storagePath); } catch { /* ignore cleanup failure */ }
    throw error;
  }
  await writeAudit({
    userId: user.id,
    action: "DOCUMENT_UPLOADED",
    entityType: "DOCUMENT",
    entityId: id,
    details: { customerId, applicationId, category, size: file.size },
  });
  return NextResponse.redirect(appUrl(request, `/customers/${customerId}`), 303);
}

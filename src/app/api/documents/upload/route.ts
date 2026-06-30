import { mkdirSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

import { NextResponse } from "next/server";

import { ALLOWED_DOCUMENT_TYPES } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { encryptBuffer } from "@/lib/file-crypto";
import { appUrl } from "@/lib/http";
import { asText, newId } from "@/lib/utils";

export async function POST(request: Request) {
  const user = await requireUser();
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
  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "文件超过上传上限" }, { status: 413 });
  }

  const id = newId();
  const encrypted = encryptBuffer(Buffer.from(await file.arrayBuffer()));
  const uploadRoot = resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? "./data/uploads");
  const customerDir = resolve(uploadRoot, customerId);
  if (!customerDir.startsWith(uploadRoot)) {
    return NextResponse.json({ error: "无效客户目录" }, { status: 400 });
  }
  mkdirSync(customerDir, { recursive: true });
  const storagePath = resolve(customerDir, `${id}.enc`);
  writeFileSync(storagePath, encrypted.encrypted, { flag: "wx" });

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
  await writeAudit({
    userId: user.id,
    action: "DOCUMENT_UPLOADED",
    entityType: "DOCUMENT",
    entityId: id,
    details: { customerId, applicationId, category, size: file.size },
  });
  return NextResponse.redirect(appUrl(request, `/customers/${customerId}`), 303);
}

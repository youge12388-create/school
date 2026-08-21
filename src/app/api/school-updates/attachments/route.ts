import { mkdirSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ALLOWED_DOCUMENT_TYPES } from "@/lib/constants";
import { sqlite } from "@/lib/db";
import { encryptBuffer } from "@/lib/file-crypto";
import { SCHOOL_UPDATE_MANAGER_ROLES } from "@/lib/permissions";
import { asText, newId } from "@/lib/utils";

export async function POST(request: Request) {
  const user = await requireRole([...SCHOOL_UPDATE_MANAGER_ROLES]);
  const formData = await request.formData();
  const file = formData.get("file");
  const schoolUpdateId = asText(formData.get("schoolUpdateId"));
  const groupName = asText(formData.get("group"));
  if (!(file instanceof File) || !schoolUpdateId || !groupName) {
    return Response.json({ error: "缺少文件、更新记录或分组" }, { status: 400 });
  }
  if (groupName !== "PUBLIC" && groupName !== "SECRET") {
    return Response.json({ error: "附件分组无效" }, { status: 400 });
  }
  const update = sqlite
    .prepare(
      "SELECT id FROM school_updates WHERE id = ? AND archived = 0",
    )
    .get(schoolUpdateId);
  if (!update) {
    return Response.json({ error: "更新记录不存在" }, { status: 404 });
  }
  const expectedExtension = ALLOWED_DOCUMENT_TYPES.get(file.type);
  if (
    !expectedExtension ||
    extname(file.name).toLowerCase() !== expectedExtension
  ) {
    return Response.json({ error: "不支持的文件类型" }, { status: 400 });
  }
  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;
  if (file.size > maxBytes) {
    return Response.json({ error: "文件超过上传上限" }, { status: 413 });
  }

  const id = newId();
  const encrypted = encryptBuffer(Buffer.from(await file.arrayBuffer()));
  const uploadRoot = resolve(
    /* turbopackIgnore: true */
    process.env.UPLOAD_DIR ?? "./data/uploads",
  );
  const updateDir = resolve(uploadRoot, "school-updates", schoolUpdateId);
  if (!updateDir.startsWith(uploadRoot)) {
    return Response.json({ error: "无效附件目录" }, { status: 400 });
  }
  mkdirSync(updateDir, { recursive: true });
  const storagePath = resolve(updateDir, `${id}.enc`);
  writeFileSync(storagePath, encrypted.encrypted, { flag: "wx" });

  const createdAt = Date.now();
  sqlite
    .prepare(
      `INSERT INTO school_update_attachments
       (id, school_update_id, group_name, original_name, mime_type, size,
        storage_path, encryption_iv, encryption_tag, checksum,
        uploaded_by, archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      id,
      schoolUpdateId,
      groupName,
      file.name,
      file.type,
      file.size,
      storagePath,
      encrypted.iv,
      encrypted.tag,
      encrypted.checksum,
      user.id,
      createdAt,
    );
  writeAudit({
    userId: user.id,
    action: "SCHOOL_UPDATE_ATTACHMENT_UPLOADED",
    entityType: "SCHOOL_UPDATE",
    entityId: schoolUpdateId,
    details: { attachmentId: id, groupName, size: file.size },
  });
  return Response.json(
    {
      id,
      schoolUpdateId,
      groupName,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      createdAt,
    },
    { status: 201 },
  );
}

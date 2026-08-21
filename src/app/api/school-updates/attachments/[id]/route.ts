import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { decryptBuffer } from "@/lib/file-crypto";
import { canViewSchoolUpdateSecret } from "@/lib/permissions";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const attachment = sqlite
    .prepare(
      `SELECT a.id, a.group_name AS groupName, a.original_name AS originalName,
              a.mime_type AS mimeType, a.storage_path AS storagePath,
              a.encryption_iv AS encryptionIv, a.encryption_tag AS encryptionTag,
              a.checksum, a.school_update_id AS schoolUpdateId
       FROM school_update_attachments a
       INNER JOIN school_updates u ON u.id = a.school_update_id
       WHERE a.id = ? AND a.archived = 0 AND u.archived = 0`,
    )
    .get(id) as
    | {
        id: string;
        groupName: string;
        originalName: string;
        mimeType: string;
        storagePath: string;
        encryptionIv: string;
        encryptionTag: string;
        checksum: string;
        schoolUpdateId: string;
      }
    | undefined;
  if (
    !attachment ||
    (attachment.groupName === "SECRET" &&
      !canViewSchoolUpdateSecret(user.role))
  ) {
    return new Response("文件不存在", { status: 404 });
  }
  const uploadRoot = resolve(
    /* turbopackIgnore: true */
    process.env.UPLOAD_DIR ?? "./data/uploads",
  );
  const storagePath = resolve(attachment.storagePath);
  if (!storagePath.startsWith(uploadRoot)) {
    return new Response("文件路径异常", { status: 400 });
  }
  const plain = decryptBuffer(
    readFileSync(storagePath),
    attachment.encryptionIv,
    attachment.encryptionTag,
    attachment.checksum,
  );
  writeAudit({
    userId: user.id,
    action: "SCHOOL_UPDATE_ATTACHMENT_DOWNLOADED",
    entityType: "SCHOOL_UPDATE",
    entityId: attachment.schoolUpdateId,
    details: { attachmentId: attachment.id, groupName: attachment.groupName },
  });
  const isImage = attachment.mimeType.startsWith("image/");
  const encodedName = encodeURIComponent(attachment.originalName);
  return new Response(new Uint8Array(plain), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(plain.length),
      "Content-Disposition": `${
        isImage ? "inline" : "attachment"
      }; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

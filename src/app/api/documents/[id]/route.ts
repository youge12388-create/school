import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { eq } from "drizzle-orm";

import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { decryptBuffer } from "@/lib/file-crypto";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!document || document.archived) {
    return new Response("文件不存在", { status: 404 });
  }
  const uploadRoot = resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? "./data/uploads");
  const storagePath = resolve(document.storagePath);
  if (!storagePath.startsWith(uploadRoot)) {
    return new Response("文件路径异常", { status: 400 });
  }
  const plain = decryptBuffer(
    readFileSync(storagePath),
    document.encryptionIv,
    document.encryptionTag,
    document.checksum,
  );
  await writeAudit({
    userId: user.id,
    action: "DOCUMENT_DOWNLOADED",
    entityType: "DOCUMENT",
    entityId: document.id,
    details: { customerId: document.customerId },
  });
  const encodedName = encodeURIComponent(document.originalName);
  return new Response(new Uint8Array(plain), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(plain.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/audit";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { appUrl, isSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源不受信任。" }, { status: 403 });
  }
  const user = await getCurrentUser();

  if (user) {
    await writeAudit({
      userId: user.id,
      action: "LOGOUT",
      entityType: "USER",
      entityId: user.id,
    });
  }

  await destroySession();
  return NextResponse.redirect(appUrl(request, "/login"), 303);
}

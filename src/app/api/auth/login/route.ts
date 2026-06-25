import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auditLoginFailure, createSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";
import { asText } from "@/lib/utils";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = asText(formData.get("username")).toLowerCase();
  const password = asText(formData.get("password"));
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user?.active || !(await verifyPassword(password, user.passwordHash))) {
    await auditLoginFailure(username, ipAddress ?? undefined);
    return NextResponse.redirect(
      new URL("/login?error=用户名或密码错误", request.url),
      303,
    );
  }

  await createSession(user.id, {
    ipAddress,
    userAgent: request.headers.get("user-agent"),
  });
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await writeAudit({
    userId: user.id,
    action: "LOGIN_SUCCEEDED",
    entityType: "USER",
    entityId: user.id,
    ipAddress,
  });
  return NextResponse.redirect(new URL("/dashboard", request.url), 303);
}

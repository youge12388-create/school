import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auditLoginFailure, createSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { appUrl } from "@/lib/http";
import {
  clearFailedLogins,
  getLoginAttemptLimit,
  recordFailedLogin,
} from "@/lib/login-rate-limit";
import { verifyPassword } from "@/lib/password";
import { getClientIp, shouldUseSecureSessionCookie } from "@/lib/request-security";
import { asText } from "@/lib/utils";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = asText(formData.get("username")).toLowerCase();
  const password = asText(formData.get("password"));
  const ipAddress = getClientIp(request);
  const retryAfterSeconds = getLoginAttemptLimit(username, ipAddress);
  if (retryAfterSeconds) {
    return NextResponse.redirect(
      appUrl(request, "/login?error=登录尝试次数过多，请稍后再试"),
      303,
    );
  }
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user?.active || !(await verifyPassword(password, user.passwordHash))) {
    await auditLoginFailure(username, ipAddress ?? undefined);
    recordFailedLogin(username, ipAddress);
    return NextResponse.redirect(
      appUrl(request, "/login?error=用户名或密码错误"),
      303,
    );
  }

  clearFailedLogins(username, ipAddress);
  await createSession(user.id, {
    ipAddress,
    userAgent: request.headers.get("user-agent"),
    secure: shouldUseSecureSessionCookie(request),
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
  return NextResponse.redirect(appUrl(request, "/dashboard"), 303);
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createSession, getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { appUrl } from "@/lib/http";
import { getClientIp, shouldUseSecureSessionCookie } from "@/lib/request-security";
import {
  WeComAccessError,
  upsertWeComLogin,
} from "@/lib/wecom-service";
import {
  getWeComIdentity,
  isValidWeComState,
  WECOM_STATE_COOKIE,
  WeComApiError,
  WeComConfigError,
} from "@/lib/wecom";

function publicError(error: unknown) {
  if (error instanceof WeComAccessError) return error.message;
  if (error instanceof WeComConfigError) return "企业微信登录尚未配置，请联系管理员";
  return "企业微信登录失败，请重试或联系管理员";
}

async function redirectToLogin(request: Request, error: string) {
  return NextResponse.redirect(appUrl(request, `/login?error=${encodeURIComponent(error)}`), 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const receivedState = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(WECOM_STATE_COOKIE)?.value;
  const secure = shouldUseSecureSessionCookie(request);
  cookieStore.set(WECOM_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/auth/wecom/callback",
    maxAge: 0,
  });

  if (!isValidWeComState(expectedState, receivedState)) {
    return redirectToLogin(request, "企业微信登录验证已过期，请重新尝试");
  }
  if (!code) return redirectToLogin(request, "企业微信没有返回授权码，请重新尝试");

  if (await getCurrentUser()) return NextResponse.redirect(appUrl(request, "/dashboard"), 303);

  const ipAddress = getClientIp(request);
  let identity: Awaited<ReturnType<typeof getWeComIdentity>> | undefined;
  try {
    identity = await getWeComIdentity(code);
    const account = upsertWeComLogin(identity);
    await createSession(account.userId, {
      ipAddress,
      userAgent: request.headers.get("user-agent"),
      secure,
    });
    await writeAudit({
      userId: account.userId,
      action: "LOGIN_SUCCEEDED",
      entityType: "USER",
      entityId: account.userId,
      details: { provider: "WECOM", wecomUserId: identity.userId },
      ipAddress,
    });
    return NextResponse.redirect(appUrl(request, "/dashboard"), 303);
  } catch (error) {
    const details = {
      provider: "WECOM",
      ...(identity ? { wecomUserId: identity.userId } : {}),
      reason:
        error instanceof WeComAccessError || error instanceof WeComApiError
          ? error.message
          : "oauth_callback_failed",
    };
    await writeAudit({
      action: "LOGIN_FAILED",
      entityType: "USER",
      details,
      ipAddress,
    });
    return redirectToLogin(request, publicError(error));
  }
}

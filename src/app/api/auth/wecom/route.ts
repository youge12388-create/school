import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/http";
import { shouldUseSecureSessionCookie } from "@/lib/request-security";
import {
  createWeComState,
  getWeComLoginUrl,
  getWeComStateCookieOptions,
  isWeComConfigured,
  WECOM_STATE_COOKIE,
  WeComConfigError,
} from "@/lib/wecom";

export async function GET(request: Request) {
  if (await getCurrentUser()) return NextResponse.redirect(appUrl(request, "/dashboard"), 303);
  if (!isWeComConfigured()) {
    return NextResponse.redirect(
      appUrl(request, "/login?error=企业微信登录尚未配置，请联系管理员"),
      303,
    );
  }

  const state = createWeComState();
  try {
    const response = NextResponse.redirect(getWeComLoginUrl(state), 303);
    response.cookies.set(
      WECOM_STATE_COOKIE,
      state,
      getWeComStateCookieOptions(shouldUseSecureSessionCookie(request)),
    );
    return response;
  } catch (error) {
    if (!(error instanceof WeComConfigError)) console.error("WeCom OAuth start failed", error);
    return NextResponse.redirect(
      appUrl(request, "/login?error=企业微信登录暂时不可用，请联系管理员"),
      303,
    );
  }
}

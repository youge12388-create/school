import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/http";
import { sqlite } from "@/lib/db";
import { createUser, UserManagementError } from "@/lib/user-service";
import { asText } from "@/lib/utils";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // 没有 Origin 头（浏览器表单直接提交常见）→ 信任
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host;
    const host =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      new URL(request.url).host;
    // 只比较 host（域名+端口），忽略协议
    // 因为反向代理转发时 http/https 可能不一致
    return originHost === host;
  } catch {
    return false;
  }
}

function usersUrl(request: Request, params: Record<string, string>) {
  const url = appUrl(request, "/admin/users");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.redirect(appUrl(request, "/login"), 303);
  }
  if (admin.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const formData = await request.formData();
  try {
    await createUser(
      {
        username: asText(formData.get("username")),
        displayName: asText(formData.get("displayName")),
        password: asText(formData.get("password")),
        role: asText(formData.get("role")),
      },
      admin.id,
      sqlite,
    );
  } catch (error) {
    if (error instanceof UserManagementError) {
      return NextResponse.redirect(
        usersUrl(request, { error: error.message }),
        303,
      );
    }
    throw error;
  }

  return NextResponse.redirect(usersUrl(request, { created: "1" }), 303);
}

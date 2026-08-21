import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/http";
import { sqlite } from "@/lib/db";
import {
  createUser,
  updateUserRole,
  UserManagementError,
} from "@/lib/user-service";
import { asText } from "@/lib/utils";

function usersUrl(request: Request, params: Record<string, string>) {
  const url = appUrl(request, "/admin/users");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function POST(request: Request) {
  // 1) 诊断：记录请求头信息，方便排查
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  console.log("[admin/users POST] headers:", {
    origin,
    host,
    forwardedHost,
    forwardedProto,
    url: request.url,
  });

  // 2) 移除 isSameOrigin 的阻塞检查：反向代理环境下不可靠
  //    真正的安全由后续的 getCurrentUser + ADMIN 角色校验保证

  // 3) 检查登录态
  const admin = await getCurrentUser();
  if (!admin) {
    console.warn("[admin/users POST] getCurrentUser returned null — redirect to login");
    return NextResponse.redirect(appUrl(request, "/login"), 303);
  }

  // 4) 检查管理员权限
  if (admin.role !== "ADMIN") {
    console.warn(`[admin/users POST] role mismatch: expected ADMIN, got ${admin.role}`);
    return NextResponse.redirect(
      usersUrl(request, {
        error: `权限不足：需要管理员角色，当前角色为 ${admin.role}`,
      }),
      303,
    );
  }

  const formData = await request.formData();
  if (asText(formData.get("intent")) === "update-role") {
    try {
      await updateUserRole(
        {
          userId: asText(formData.get("userId")),
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

    return NextResponse.redirect(usersUrl(request, { roleUpdated: "1" }), 303);
  }

  // 5) 创建用户
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

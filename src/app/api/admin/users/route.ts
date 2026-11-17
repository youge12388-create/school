import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { appUrl, isSameOrigin } from "@/lib/http";
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
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源不受信任。" }, { status: 403 });
  }

  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.redirect(appUrl(request, "/login"), 303);
  }

  if (admin.role !== "ADMIN") {
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

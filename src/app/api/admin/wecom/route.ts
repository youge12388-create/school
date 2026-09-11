import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/http";
import {
  syncWeComOrganization,
  updateWeComDepartmentRole,
  updateWeComUserAccess,
  WeComAccessError,
} from "@/lib/wecom-service";
import { asText } from "@/lib/utils";

function usersUrl(request: Request, params: Record<string, string>) {
  const url = appUrl(request, "/admin/users");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.redirect(appUrl(request, "/login"), 303);
  if (admin.role !== "ADMIN") {
    return NextResponse.redirect(usersUrl(request, { wecomError: "权限不足：需要管理员角色" }), 303);
  }

  const formData = await request.formData();
  const intent = asText(formData.get("intent"));
  try {
    if (intent === "sync") {
      const result = await syncWeComOrganization(admin.id);
      return NextResponse.redirect(
        usersUrl(request, {
          wecomSynced: String(result.memberCount),
          wecomDepartments: String(result.departmentCount),
        }),
        303,
      );
    }
    if (intent === "update-role") {
      const hasPermissionToggle = formData.get("permissionToggle") === "1";
      const enabled = formData.get("enabled") === "1";
      const submittedRole = asText(formData.get("role"));
      const role = hasPermissionToggle
        ? enabled
          ? submittedRole || "ADVISOR"
          : ""
        : submittedRole;
      updateWeComDepartmentRole(
        asText(formData.get("departmentId")),
        role,
        admin.id,
      );
      return NextResponse.redirect(usersUrl(request, { wecomRoleUpdated: "1" }), 303);
    }
    if (intent === "update-user-access") {
      updateWeComUserAccess(
        asText(formData.get("userId")),
        asText(formData.get("accessMode")),
        asText(formData.get("role")),
        admin.id,
      );
      return NextResponse.redirect(usersUrl(request, { wecomUserUpdated: "1" }), 303);
    }
    throw new WeComAccessError("企业微信管理操作无效");
  } catch (error) {
    const message = error instanceof Error ? error.message : "企业微信操作失败";
    return NextResponse.redirect(usersUrl(request, { wecomError: message }), 303);
  }
}

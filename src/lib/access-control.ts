import type { DatabaseSync } from "node:sqlite";

import type { AuthProvider, UserRole } from "@/lib/constants";
import { sqlite } from "@/lib/db";
import {
  defaultPermissionsForRole,
  hasPermission,
  type PermissionKey,
} from "@/lib/permissions";
import { getWeComEffectivePermissions } from "@/lib/wecom-service";

export type AccessUser = {
  id: string;
  role: UserRole;
  authProvider: AuthProvider;
};

export function getUserPermissions(
  user: AccessUser,
  database: DatabaseSync = sqlite,
): PermissionKey[] {
  const permissions = user.authProvider === "WECOM"
    ? getWeComEffectivePermissions(user.id, database)
    : defaultPermissionsForRole(user.role);
  // 审计包含全员操作与登录记录，仅管理员可查看，历史自定义授权也不能绕过。
  return user.role === "ADMIN"
    ? permissions
    : permissions.filter((permission) => permission !== "AUDIT_VIEW");
}

export function userHasPermission(
  user: AccessUser,
  permission: PermissionKey,
  database: DatabaseSync = sqlite,
) {
  return hasPermission(getUserPermissions(user, database), permission);
}

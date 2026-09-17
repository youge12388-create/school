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
  return user.authProvider === "WECOM"
    ? getWeComEffectivePermissions(user.id, database)
    : defaultPermissionsForRole(user.role);
}

export function userHasPermission(
  user: AccessUser,
  permission: PermissionKey,
  database: DatabaseSync = sqlite,
) {
  return hasPermission(getUserPermissions(user, database), permission);
}

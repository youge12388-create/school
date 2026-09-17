import "server-only";

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { USER_ROLES, type UserRole } from "@/lib/constants";
import { writeAudit as writeAuditRecord } from "@/lib/audit";
import { sqlite } from "@/lib/db";
import { newId } from "@/lib/utils";
import {
  defaultPermissionsForRole,
  normalizePermissionSet,
  parsePermissionSet,
  type PermissionKey,
  type PermissionSource,
} from "@/lib/permissions";
import {
  fetchWeComOrganization,
  type WeComIdentity,
  type WeComMember,
} from "@/lib/wecom";

export const WECOM_ROLE_PRIORITY: readonly UserRole[] = [
  "ADMIN",
  "DATA_MANAGER",
  "CHANNEL_RESOURCE",
  "ADVISOR",
  "MARKET_MANAGER",
];

export const WECOM_ACCESS_MODES = ["INHERIT", "ROLE", "DENY"] as const;
export type WeComAccessMode = (typeof WECOM_ACCESS_MODES)[number];

const WECOM_PASSWORD_SENTINEL = "wecom$external$account$no-password";

function weComUsername(userId: string) {
  return `wecom:${createHash("sha256").update(userId).digest("base64url")}`;
}

export class WeComAccessError extends Error {}

export type WeComDepartmentRow = {
  id: number;
  name: string;
  parentId: number;
  displayOrder: number;
  role: UserRole | null;
  memberCount: number;
  path: string;
  depth: number;
  permissions: PermissionKey[];
  permissionSource: PermissionSource | "NONE";
};

export type WeComMemberDepartmentRow = {
  id: number;
  path: string;
  role: UserRole | null;
};

export type WeComMemberRow = {
  id: string;
  displayName: string;
  role: UserRole | null;
  accessMode: WeComAccessMode;
  accessRole: UserRole | null;
  active: boolean;
  wecomEnabled: boolean;
  canLogin: boolean;
  accessReason:
    | "可登录"
    | "企业微信成员未启用"
    | "个人权限已禁止登录"
    | "所属部门未配置登录角色"
    | "账号状态待同步";
  departments: WeComMemberDepartmentRow[];
  permissions: PermissionKey[];
  permissionSource: PermissionSource | "INHERIT" | "DENY";
};

type RoleMappingRow = { departmentId: number; role: UserRole };
type WeComUserAccessRow = {
  mode: WeComAccessMode;
  role: UserRole | null;
  permissions?: PermissionKey[] | null;
};

export type WeComPermissionInput = {
  source?: string | null;
  permissions?: readonly string[];
};

export type WeComEffectiveAccess = {
  role: UserRole | null;
  permissions: PermissionKey[];
  permissionSource: PermissionSource | "INHERIT" | "DENY";
  departmentId: number | null;
};

type DepartmentPermissionMap = ReadonlyMap<number, PermissionKey[] | null>;

function roleMapping(database: DatabaseSync) {
  const rows = database
    .prepare(
      "SELECT department_id AS departmentId, role FROM wecom_department_roles",
    )
    .all() as RoleMappingRow[];
  return new Map(rows.map((row) => [row.departmentId, row.role]));
}

function departmentPermissionMapping(database: DatabaseSync): DepartmentPermissionMap {
  const rows = database
    .prepare(
      `SELECT department_id AS departmentId, permissions_json AS permissionsJson
       FROM wecom_department_roles`,
    )
    .all() as Array<{ departmentId: number; permissionsJson: string | null }>;
  return new Map(
    rows.map((row) => [row.departmentId, parsePermissionSet(row.permissionsJson)]),
  );
}

function permissionJsonForInput(
  role: UserRole | null,
  input: WeComPermissionInput,
) {
  const source = input.source == null || input.source === "" ? "TEMPLATE" : input.source;
  if (source !== "TEMPLATE" && source !== "CUSTOM") {
    throw new WeComAccessError("企业微信权限来源无效");
  }
  if (input.permissions !== undefined) {
    const normalized = normalizePermissionSet([...input.permissions]);
    if (role && source === "CUSTOM") return JSON.stringify(normalized);
  }
  return null;
}

function permissionSource(value: string | null | undefined): PermissionSource {
  if (value === "CUSTOM") return "CUSTOM";
  return "TEMPLATE";
}

function accessMode(value: string | null | undefined): WeComAccessMode {
  return WECOM_ACCESS_MODES.includes(value as WeComAccessMode)
    ? (value as WeComAccessMode)
    : "INHERIT";
}

function userAccessFromRow(row: {
  mode?: string | null;
  role?: string | null;
  permissionsJson?: string | null;
} | undefined): WeComUserAccessRow {
  const mode = accessMode(row?.mode);
  return {
    mode,
    role: mode === "ROLE" ? assertRole(row?.role ?? null) : null,
    permissions: mode === "ROLE" ? parsePermissionSet(row?.permissionsJson) : null,
  };
}

function getWeComUserAccess(
  database: DatabaseSync,
  userId: string,
): WeComUserAccessRow {
  const row = database
    .prepare(
      `SELECT mode, role, permissions_json AS permissionsJson
       FROM wecom_user_access WHERE user_id = ? LIMIT 1`,
    )
    .get(userId) as
    | { mode: string; role: UserRole | null; permissionsJson: string | null }
    | undefined;
  return userAccessFromRow(row);
}

// 子部门权限不再继承父部门：仅按成员直接所属部门的角色配置解析。
export function resolveWeComRole(
  departmentIds: readonly number[],
  mapping: ReadonlyMap<number, UserRole>,
) {
  const roles = new Set(
    [...departmentIds]
      .map((departmentId) => mapping.get(departmentId))
      .filter((role): role is UserRole => Boolean(role)),
  );
  return WECOM_ROLE_PRIORITY.find((role) => roles.has(role)) ?? null;
}

function resolveWeComDepartmentRole(
  departmentIds: readonly number[],
  mapping: ReadonlyMap<number, UserRole>,
) {
  const orderedDepartmentIds = [...new Set(departmentIds)].sort((left, right) => left - right);
  for (const role of WECOM_ROLE_PRIORITY) {
    const departmentId = orderedDepartmentIds.find(
      (candidate) => mapping.get(candidate) === role,
    );
    if (departmentId !== undefined) return { role, departmentId };
  }
  return { role: null, departmentId: null };
}

export function resolveWeComEffectiveAccess(
  departmentIds: readonly number[],
  mapping: ReadonlyMap<number, UserRole>,
  access: WeComUserAccessRow = { mode: "INHERIT", role: null, permissions: null },
  departmentPermissions: DepartmentPermissionMap = new Map(),
): WeComEffectiveAccess {
  if (access.mode === "DENY") {
    return {
      role: null,
      permissions: [],
      permissionSource: "DENY",
      departmentId: null,
    };
  }

  if (access.mode === "ROLE") {
    const role = access.role;
    if (!role) {
      return {
        role: null,
        permissions: [],
        permissionSource: "INHERIT",
        departmentId: null,
      };
    }
    return {
      role,
      permissions: access.permissions ?? defaultPermissionsForRole(role),
      permissionSource: access.permissions ? "CUSTOM" : "TEMPLATE",
      departmentId: null,
    };
  }

  const selected = resolveWeComDepartmentRole(departmentIds, mapping);
  if (!selected.role || selected.departmentId === null) {
    return {
      role: null,
      permissions: [],
      permissionSource: "INHERIT",
      departmentId: null,
    };
  }
  const explicitPermissions = departmentPermissions.get(selected.departmentId) ?? null;
  return {
    role: selected.role,
    permissions: explicitPermissions ?? defaultPermissionsForRole(selected.role),
    permissionSource: explicitPermissions ? "CUSTOM" : "TEMPLATE",
    departmentId: selected.departmentId,
  };
}

export function resolveWeComEffectiveRole(
  departmentIds: readonly number[],
  mapping: ReadonlyMap<number, UserRole>,
  access: WeComUserAccessRow = { mode: "INHERIT", role: null },
) {
  return resolveWeComEffectiveAccess(departmentIds, mapping, access).role;
}

function assertRole(role: string | null, message = "企业微信部门角色无效") {
  if (role === null || role === "") return null;
  if (!USER_ROLES.includes(role as UserRole)) throw new WeComAccessError(message);
  return role as UserRole;
}

function assertAccessMode(mode: string | null): WeComAccessMode {
  if (WECOM_ACCESS_MODES.includes(mode as WeComAccessMode)) {
    return mode as WeComAccessMode;
  }
  throw new WeComAccessError("企业微信成员个人权限模式无效");
}

function closeSessionsIfChanged(
  database: DatabaseSync,
  userId: string,
  previous: { role: UserRole; active: number; wecomEnabled: number } | undefined,
  next: { role: UserRole | null; active: boolean; wecomEnabled: boolean },
  permissionsChanged = false,
) {
  if (
    previous &&
    (previous.role !== next.role ||
      Boolean(previous.active) !== next.active ||
      Boolean(previous.wecomEnabled) !== next.wecomEnabled ||
      permissionsChanged)
  ) {
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }
}

function upsertWeComMember(
  database: DatabaseSync,
  member: WeComMember,
  knownDepartmentIds: ReadonlySet<number>,
  mapping: ReadonlyMap<number, UserRole>,
) {
  const previous = database
    .prepare(
      `SELECT id, role, active, wecom_enabled AS wecomEnabled
       FROM users WHERE wecom_user_id = ? LIMIT 1`,
    )
    .get(member.userId) as
    | { id: string; role: UserRole; active: number; wecomEnabled: number }
    | undefined;
  const userId = previous?.id ?? newId();
  const access = previous
    ? getWeComUserAccess(database, userId)
    : { mode: "INHERIT", role: null } satisfies WeComUserAccessRow;
  const departmentPermissions = departmentPermissionMapping(database);
  const previousDepartmentIds = previous
    ? (database
        .prepare(
          "SELECT department_id AS departmentId FROM wecom_user_departments WHERE user_id = ?",
        )
        .all(userId) as Array<{ departmentId: number }>)
        .map((department) => department.departmentId)
    : [];
  const previousEffective = previous
    ? resolveWeComEffectiveAccess(
        previousDepartmentIds,
        mapping,
        access,
        departmentPermissions,
      )
    : null;
  const effective = resolveWeComEffectiveAccess(
    member.departmentIds,
    mapping,
    access,
    departmentPermissions,
  );
  const role = effective.role;
  const active = member.enabled && role !== null;
  const now = Date.now();

  if (previous) {
    database
      .prepare(
        `UPDATE users
         SET display_name = ?, role = ?, active = ?, wecom_enabled = ?,
             auth_provider = 'WECOM', updated_at = ?
         WHERE id = ?`,
      )
      .run(member.displayName, role ?? "ADVISOR", active ? 1 : 0, member.enabled ? 1 : 0, now, userId);
    closeSessionsIfChanged(database, userId, previous, {
      role,
      active,
      wecomEnabled: member.enabled,
    }, Boolean(
      previousEffective &&
        JSON.stringify(previousEffective.permissions) !== JSON.stringify(effective.permissions),
    ));
  } else {
    database
      .prepare(
        `INSERT INTO users
         (id, username, display_name, password_hash, auth_provider, wecom_user_id,
          wecom_enabled, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'WECOM', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        weComUsername(member.userId),
        member.displayName,
        WECOM_PASSWORD_SENTINEL,
        member.userId,
        member.enabled ? 1 : 0,
        role ?? "ADVISOR",
        active ? 1 : 0,
        now,
        now,
      );
  }

  database.prepare("DELETE FROM wecom_user_departments WHERE user_id = ?").run(userId);
  const departmentIds = [...new Set(member.departmentIds)].filter((id) => knownDepartmentIds.has(id));
  for (const departmentId of departmentIds) {
    database
      .prepare(
        "INSERT INTO wecom_user_departments (user_id, department_id) VALUES (?, ?)",
      )
      .run(userId, departmentId);
  }
  return { userId, created: !previous, active, role };
}

function recomputeExternalUserAccess(database: DatabaseSync) {
  const mapping = roleMapping(database);
  const departmentPermissions = departmentPermissionMapping(database);
  const externalUsers = database
    .prepare(
      `SELECT
         u.id, u.role, u.active, u.wecom_enabled AS wecomEnabled,
         a.mode AS accessMode, a.role AS accessRole,
         a.permissions_json AS permissionsJson
       FROM users u
       LEFT JOIN wecom_user_access a ON a.user_id = u.id
       WHERE u.auth_provider = 'WECOM'`,
    )
    .all() as Array<{
    id: string;
    role: UserRole;
    active: number;
    wecomEnabled: number;
    accessMode: string | null;
    accessRole: UserRole | null;
    permissionsJson: string | null;
  }>;

  for (const user of externalUsers) {
    const departments = database
      .prepare(
        "SELECT department_id AS departmentId FROM wecom_user_departments WHERE user_id = ?",
      )
      .all(user.id) as Array<{ departmentId: number }>;
    const effective = resolveWeComEffectiveAccess(
      departments.map((department) => department.departmentId),
      mapping,
      userAccessFromRow({
        mode: user.accessMode,
        role: user.accessRole,
        permissionsJson: user.permissionsJson,
      }),
      departmentPermissions,
    );
    const active = Boolean(user.wecomEnabled) && effective.role !== null;
    if (user.role === effective.role && Boolean(user.active) === active) continue;
    database
      .prepare("UPDATE users SET role = ?, active = ?, updated_at = ? WHERE id = ?")
      .run(effective.role ?? "ADVISOR", active ? 1 : 0, Date.now(), user.id);
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  }
}

function disableMissingWeComMembers(
  database: DatabaseSync,
  knownDepartmentIds: Set<number>,
  seenWeComUserIds: Set<string>,
) {
  const externalUsers = database
    .prepare(
      `SELECT id, wecom_user_id AS wecomUserId, wecom_enabled AS wecomEnabled
       FROM users WHERE auth_provider = 'WECOM'`,
    )
    .all() as Array<{ id: string; wecomUserId: string | null; wecomEnabled: number }>;
  const membershipsByUser = database.prepare(
    "SELECT department_id AS departmentId FROM wecom_user_departments WHERE user_id = ?",
  );
  const disableUser = database.prepare(
    "UPDATE users SET active = 0, wecom_enabled = 0, updated_at = ? WHERE id = ?",
  );
  const revokeSessions = database.prepare("DELETE FROM sessions WHERE user_id = ?");
  const now = Date.now();
  let disabledUsers = 0;

  for (const user of externalUsers) {
    if (!user.wecomEnabled || !user.wecomUserId || seenWeComUserIds.has(user.wecomUserId)) {
      continue;
    }

    const memberships = membershipsByUser.all(user.id) as Array<{ departmentId: number }>;
    const belongsToKnownScope =
      memberships.length > 0 && memberships.every(({ departmentId }) => knownDepartmentIds.has(departmentId));

    // Do not revoke access from a partial directory snapshot.
    if (!belongsToKnownScope) continue;

    disableUser.run(now, user.id);
    revokeSessions.run(user.id);
    disabledUsers += 1;
  }

  return disabledUsers;
}

export async function syncWeComOrganization(actorId: string, database: DatabaseSync = sqlite) {
  const organization = await fetchWeComOrganization();
  const knownDepartmentIds = new Set(organization.departments.map((department) => department.id));
  const seenWeComUserIds = new Set(organization.members.map((member) => member.userId));
  let createdUsers = 0;
  let updatedUsers = 0;
  let disabledUsers = 0;
  const now = Date.now();

  database.exec("BEGIN IMMEDIATE");
  try {
    for (const department of organization.departments) {
      database
        .prepare(
          `INSERT INTO wecom_departments
           (id, name, parent_id, display_order, synced_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             parent_id = excluded.parent_id,
             display_order = excluded.display_order,
             synced_at = excluded.synced_at,
             updated_at = excluded.updated_at`,
        )
        .run(
          department.id,
          department.name,
          department.parentId,
          department.displayOrder,
          now,
          now,
          now,
        );
    }

    const mapping = roleMapping(database);
    for (const member of organization.members) {
      const result = upsertWeComMember(database, member, knownDepartmentIds, mapping);
      if (result.created) createdUsers += 1;
      else updatedUsers += 1;
    }
    disabledUsers = disableMissingWeComMembers(database, knownDepartmentIds, seenWeComUserIds);
    recomputeExternalUserAccess(database);
    writeAuditRecord(
      {
        userId: actorId,
        action: "WECOM_ORGANIZATION_SYNCED",
        entityType: "USER",
        details: {
          departmentCount: organization.departments.length,
          memberCount: organization.members.length,
          createdUsers,
          updatedUsers,
          disabledUsers,
        },
      },
      database,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return {
    departmentCount: organization.departments.length,
    memberCount: organization.members.length,
    createdUsers,
    updatedUsers,
    disabledUsers,
  };
}

export function listWeComDepartments(database: DatabaseSync = sqlite): WeComDepartmentRow[] {
  const rows = database
    .prepare(
      `SELECT
         d.id, d.name, d.parent_id AS parentId, d.display_order AS displayOrder,
         r.role AS role, r.permissions_json AS permissionsJson,
         COUNT(ud.user_id) AS memberCount
       FROM wecom_departments d
       LEFT JOIN wecom_department_roles r ON r.department_id = d.id
       LEFT JOIN wecom_user_departments ud ON ud.department_id = d.id
       GROUP BY d.id
       ORDER BY d.parent_id, d.display_order, d.id`,
    )
    .all() as Array<{
    id: number;
    name: string;
    parentId: number;
    displayOrder: number;
    role: UserRole | null;
    permissionsJson: string | null;
    memberCount: number;
  }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathCache = new Map<number, { path: string; depth: number }>();
  const getPath = (id: number, visiting = new Set<number>()): { path: string; depth: number } => {
    const cached = pathCache.get(id);
    if (cached) return cached;
    const row = byId.get(id);
    if (!row || visiting.has(id)) return { path: row?.name ?? String(id), depth: 0 };
    const nextVisiting = new Set(visiting).add(id);
    const parent = row.parentId > 0 ? getPath(row.parentId, nextVisiting) : { path: "", depth: -1 };
    const result = {
      path: parent.path ? `${parent.path} / ${row.name}` : row.name,
      depth: parent.depth + 1,
    };
    pathCache.set(id, result);
    return result;
  };

  return rows
    .map((row) => {
      const explicitPermissions = parsePermissionSet(row.permissionsJson);
      return {
        ...row,
        ...getPath(row.id),
        permissions: row.role
          ? explicitPermissions ?? defaultPermissionsForRole(row.role)
          : [],
        permissionSource: row.role
          ? explicitPermissions
            ? "CUSTOM"
            : "TEMPLATE"
          : "NONE",
      } satisfies WeComDepartmentRow;
    })
    .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

export function listWeComMembers(database: DatabaseSync = sqlite): WeComMemberRow[] {
  const departments = listWeComDepartments(database);
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const mapping = roleMapping(database);
  const users = database
    .prepare(
      `SELECT
         u.id, u.display_name AS displayName, u.role, u.active,
         u.wecom_enabled AS wecomEnabled,
         a.mode AS accessMode, a.role AS accessRole,
         a.permissions_json AS permissionsJson
       FROM users u
       LEFT JOIN wecom_user_access a ON a.user_id = u.id
       WHERE u.auth_provider = 'WECOM'
       ORDER BY u.display_name COLLATE NOCASE, u.id`,
    )
    .all() as Array<{
    id: string;
    displayName: string;
    role: UserRole;
    active: number;
    wecomEnabled: number;
    accessMode: string | null;
    accessRole: UserRole | null;
    permissionsJson: string | null;
  }>;
  const memberships = database.prepare(
    "SELECT department_id AS departmentId FROM wecom_user_departments WHERE user_id = ?",
  );
  const departmentPermissions = departmentPermissionMapping(database);

  return users.map((user) => {
    const directDepartmentIds = (memberships.all(user.id) as Array<{ departmentId: number }>)
      .map((department) => department.departmentId);
    const access = userAccessFromRow({
      mode: user.accessMode,
      role: user.accessRole,
      permissionsJson: user.permissionsJson,
    });
    const effective = resolveWeComEffectiveAccess(
      directDepartmentIds,
      mapping,
      access,
      departmentPermissions,
    );
    const role = effective.role;
    const active = Boolean(user.active);
    const wecomEnabled = Boolean(user.wecomEnabled);
    const canLogin = wecomEnabled && active && role !== null;
    const accessReason = !wecomEnabled
      ? "企业微信成员未启用"
      : access.mode === "DENY"
        ? "个人权限已禁止登录"
      : role === null
        ? "所属部门未配置登录角色"
        : canLogin
          ? "可登录"
          : "账号状态待同步";

    return {
      id: user.id,
      displayName: user.displayName,
      role,
      accessMode: access.mode,
      accessRole: access.role,
      active,
      wecomEnabled,
      canLogin,
      accessReason,
      permissions: effective.permissions,
      permissionSource: effective.permissionSource,
      departments: directDepartmentIds
        .map((departmentId) => {
          const department = departmentById.get(departmentId);
          if (!department) return null;
          return {
            id: department.id,
            path: department.path,
            role: mapping.get(department.id) ?? null,
          } satisfies WeComMemberDepartmentRow;
        })
        .filter((department): department is WeComMemberDepartmentRow => department !== null)
        .sort((left, right) => left.path.localeCompare(right.path, "zh-CN")),
    } satisfies WeComMemberRow;
  });
}

export function getWeComEffectiveAccess(
  userId: string,
  database: DatabaseSync = sqlite,
): WeComEffectiveAccess {
  const user = database
    .prepare(
      `SELECT role, auth_provider AS authProvider, wecom_enabled AS wecomEnabled
       FROM users WHERE id = ? LIMIT 1`,
    )
    .get(userId) as
    | { role: UserRole; authProvider: string; wecomEnabled: number }
    | undefined;
  if (!user || user.authProvider !== "WECOM" || !user.wecomEnabled) {
    return {
      role: null,
      permissions: [],
      permissionSource: "INHERIT",
      departmentId: null,
    };
  }

  const departments = database
    .prepare(
      "SELECT department_id AS departmentId FROM wecom_user_departments WHERE user_id = ?",
    )
    .all(userId) as Array<{ departmentId: number }>;
  return resolveWeComEffectiveAccess(
    departments.map((department) => department.departmentId),
    roleMapping(database),
    getWeComUserAccess(database, userId),
    departmentPermissionMapping(database),
  );
}

export function getWeComEffectivePermissions(
  userId: string,
  database: DatabaseSync = sqlite,
) {
  return getWeComEffectiveAccess(userId, database).permissions;
}

function closeSessionsForDepartmentMembers(database: DatabaseSync, departmentId: number) {
  database
    .prepare(
      `DELETE FROM sessions
       WHERE user_id IN (
         SELECT user_id FROM wecom_user_departments WHERE department_id = ?
       )`,
    )
    .run(departmentId);
}

export function updateWeComDepartmentRole(
  departmentIdInput: string,
  roleInput: string,
  actorId: string,
  database: DatabaseSync = sqlite,
  permissionInput: WeComPermissionInput = {},
) {
  const departmentId = Number(departmentIdInput);
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    throw new WeComAccessError("企业微信部门无效");
  }
  const role = assertRole(roleInput);
  const department = database
    .prepare("SELECT id FROM wecom_departments WHERE id = ? LIMIT 1")
    .get(departmentId);
  if (!department) throw new WeComAccessError("企业微信部门不存在，请先同步组织架构");

  database.exec("BEGIN IMMEDIATE");
  try {
    const permissionsJson = permissionJsonForInput(role, permissionInput);
    if (role) {
      database
        .prepare(
          `INSERT INTO wecom_department_roles
             (department_id, role, permissions_json, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(department_id) DO UPDATE SET
             role = excluded.role, permissions_json = excluded.permissions_json,
             updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        )
        .run(departmentId, role, permissionsJson, actorId, Date.now(), Date.now());
    } else {
      database.prepare("DELETE FROM wecom_department_roles WHERE department_id = ?").run(departmentId);
    }
    recomputeExternalUserAccess(database);
    closeSessionsForDepartmentMembers(database, departmentId);
    writeAuditRecord(
      {
        userId: actorId,
        action: "WECOM_DEPARTMENT_ROLE_UPDATED",
        entityType: "USER",
        entityId: String(departmentId),
        details: {
          departmentId,
          role,
          permissionSource: permissionSource(permissionInput.source),
          permissions: permissionsJson ? JSON.parse(permissionsJson) : null,
        },
      },
      database,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function updateWeComUserAccess(
  userIdInput: string,
  modeInput: string,
  roleInput: string,
  actorId: string,
  database: DatabaseSync = sqlite,
  permissionInput: WeComPermissionInput = {},
) {
  const userId = userIdInput.trim();
  if (!userId) throw new WeComAccessError("企业微信成员无效，请先同步组织架构");

  const mode = assertAccessMode(modeInput);
  const role = mode === "ROLE"
    ? assertRole(roleInput, "企业微信成员个人角色无效")
    : null;
  if (mode === "ROLE" && !role) {
    throw new WeComAccessError("单独允许时必须选择有效角色");
  }

  const user = database
    .prepare(
      `SELECT id, display_name AS displayName, auth_provider AS authProvider,
              role, active, wecom_enabled AS wecomEnabled
       FROM users WHERE id = ? LIMIT 1`,
    )
    .get(userId) as
    | {
        id: string;
        displayName: string;
        authProvider: string;
        role: UserRole;
        active: number;
        wecomEnabled: number;
      }
    | undefined;
  if (!user || user.authProvider !== "WECOM") {
    throw new WeComAccessError("只有企业微信成员支持个人权限设置");
  }

  const mapping = roleMapping(database);
  const departmentPermissions = departmentPermissionMapping(database);
  const departments = database
    .prepare(
      "SELECT department_id AS departmentId FROM wecom_user_departments WHERE user_id = ?",
    )
    .all(userId) as Array<{ departmentId: number }>;
  const previousEffective = resolveWeComEffectiveAccess(
    departments.map((department) => department.departmentId),
    mapping,
    getWeComUserAccess(database, userId),
    departmentPermissions,
  );
  const permissionsJson = permissionJsonForInput(role, permissionInput);
  const nextAccess: WeComUserAccessRow = {
    mode,
    role,
    permissions: parsePermissionSet(permissionsJson),
  };
  const effective = resolveWeComEffectiveAccess(
    departments.map((department) => department.departmentId),
    mapping,
    nextAccess,
    departmentPermissions,
  );
  const effectiveRole = effective.role;
  const active = Boolean(user.wecomEnabled) && effectiveRole !== null;
  const now = Date.now();

  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO wecom_user_access
           (user_id, mode, role, permissions_json, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           mode = excluded.mode,
           role = excluded.role,
           permissions_json = excluded.permissions_json,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .run(userId, mode, role, permissionsJson, actorId, now, now);
    database
      .prepare(
        "UPDATE users SET role = ?, active = ?, updated_at = ? WHERE id = ?",
      )
      .run(effectiveRole ?? "ADVISOR", active ? 1 : 0, now, userId);
    closeSessionsIfChanged(database, userId, user, {
      role: effectiveRole,
      active,
      wecomEnabled: Boolean(user.wecomEnabled),
    }, JSON.stringify(previousEffective.permissions) !== JSON.stringify(effective.permissions));
    writeAuditRecord(
      {
        userId: actorId,
        action: "WECOM_USER_ACCESS_UPDATED",
        entityType: "USER",
        entityId: userId,
        details: {
          displayName: user.displayName,
          mode,
          role,
          permissionSource: permissionSource(permissionInput.source),
          permissions: permissionsJson ? JSON.parse(permissionsJson) : null,
          effectiveRole,
          active,
        },
      },
      database,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { userId, mode, role, effectiveRole, active };
}

export function upsertWeComLogin(identity: WeComIdentity, database: DatabaseSync = sqlite) {
  const mapping = roleMapping(database);
  const existing = database
    .prepare("SELECT id FROM users WHERE wecom_user_id = ? LIMIT 1")
    .get(identity.userId) as { id: string } | undefined;
  const access = existing
    ? getWeComUserAccess(database, existing.id)
    : { mode: "INHERIT", role: null } satisfies WeComUserAccessRow;
  const role = resolveWeComEffectiveRole(
    identity.departmentIds,
    mapping,
    access,
  );
  if (!identity.enabled || !role) {
    throw new WeComAccessError(
      access.mode === "DENY"
        ? "企业微信成员的个人权限已禁止登录"
        : "企业微信账号尚未配置可用的部门权限",
    );
  }
  const knownDepartmentIds = new Set(
    (
      database.prepare("SELECT id FROM wecom_departments").all() as Array<{ id: number }>
    ).map((department) => department.id),
  );
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = upsertWeComMember(database, identity, knownDepartmentIds, mapping);
    database
      .prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
      .run(Date.now(), Date.now(), result.userId);
    database.exec("COMMIT");
    return { userId: result.userId, role };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

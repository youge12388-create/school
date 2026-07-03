import type { DatabaseSync } from "node:sqlite";

import { USER_ROLES, type UserRole } from "@/lib/constants";
import { writeAuditRecord } from "@/lib/audit-record";
import { hashPassword } from "@/lib/password";
import { newId } from "@/lib/utils";

export class UserManagementError extends Error {}

type CreateUserInput = {
  username: string;
  displayName: string;
  password: string;
  role: string;
};

function normalizedUsername(username: string) {
  return username.trim().toLowerCase();
}

function assertPassword(password: string) {
  if (password.length < 10) {
    throw new UserManagementError("密码至少需要 10 个字符");
  }
}

export async function createUser(
  input: CreateUserInput,
  actorId: string,
  database: DatabaseSync,
) {
  const username = normalizedUsername(input.username);
  const displayName = input.displayName.trim();
  const role = input.role as UserRole;

  if (!username || !displayName || !USER_ROLES.includes(role)) {
    throw new UserManagementError("账号信息不完整");
  }
  assertPassword(input.password);

  const exists = database
    .prepare("SELECT 1 FROM users WHERE username = ? LIMIT 1")
    .get(username);
  if (exists) {
    throw new UserManagementError("用户名已存在");
  }

  const id = newId();
  const now = Date.now();
  const passwordHash = await hashPassword(input.password);

  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO users
         (id, username, display_name, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(id, username, displayName, passwordHash, role, now, now);
    writeAuditRecord(
      {
        userId: actorId,
        action: "USER_CREATED",
        entityType: "USER",
        entityId: id,
        details: { username, role },
      },
      database,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    if (error instanceof Error && error.message.includes("users.username")) {
      throw new UserManagementError("用户名已存在");
    }
    throw error;
  }

  return { id, username };
}

export async function resetUserPassword(
  usernameInput: string,
  password: string,
  database: DatabaseSync,
) {
  const username = normalizedUsername(usernameInput);
  if (!username) {
    throw new UserManagementError("用户名不能为空");
  }
  assertPassword(password);

  const user = database
    .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
    .get(username) as { id: string } | undefined;
  if (!user) {
    throw new UserManagementError("用户不存在");
  }

  const passwordHash = await hashPassword(password);
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, Date.now(), user.id);
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    writeAuditRecord(
      {
        userId: user.id,
        action: "PASSWORD_RESET_CLI",
        entityType: "USER",
        entityId: user.id,
      },
      database,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

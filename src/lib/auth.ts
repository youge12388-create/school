import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { UserRole } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { db, sqlite } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { newId } from "@/lib/utils";

const COOKIE_NAME = "school_syt_session";
const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 12);

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  metadata: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: newId(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    lastSeenAt: now,
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent ?? null,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const row = sqlite.prepare(`SELECT
      u.id AS id,
      u.username AS username,
      u.display_name AS displayName,
      u.role AS role,
      u.active AS active,
      s.id AS sessionId
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.expires_at > ?
      AND u.active = 1
    LIMIT 1`)
    .get(hashToken(token), Date.now()) as
      | {
          id: string;
          username: string;
          displayName: string;
          role: UserRole;
          active: number;
          sessionId: string;
        }
      | undefined;

  return row ? { ...row, active: Boolean(row.active) } : null;
}
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(allowed: UserRole[]) {
  const user = await requireUser();
  if (!allowed.includes(user.role)) redirect("/");
  return user;
}

export async function auditLoginFailure(username: string, ipAddress?: string) {
  await writeAudit({
    action: "LOGIN_FAILED",
    entityType: "USER",
    details: { username },
    ipAddress,
  });
}

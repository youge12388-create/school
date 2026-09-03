"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { asText } from "@/lib/utils";

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  const currentPassword = asText(formData.get("currentPassword"));
  const newPassword = asText(formData.get("newPassword"));
  const confirmPassword = asText(formData.get("confirmPassword"));
  if (newPassword !== confirmPassword) throw new Error("两次新密码不一致");
  const [account] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
    throw new Error("当前密码不正确");
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  // 改密后吊销除当前会话外的全部会话，防止被盗会话继续有效。
  if (user.sessionId) {
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)));
  }
  await writeAudit({
    userId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "USER",
    entityId: user.id,
  });
  revalidatePath("/account");
}

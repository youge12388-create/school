import type { UserRole } from "@/lib/constants";
import { canViewSchoolUpdateSecret } from "@/lib/permissions";

export type SchoolUpdateRow = {
  id: string;
  externalId: string | null;
  schoolId: string;
  title: string | null;
  submitter: string | null;
  submittedAt: number | null;
  publicContent: string | null;
  publicUrl: string | null;
  publicOperator: string | null;
  publicUpdatedAt: number | null;
  secretContent: string | null;
  secretUrl: string | null;
  secretOperator: string | null;
  secretUpdatedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type SchoolUpdateAttachment = {
  id: string;
  schoolUpdateId: string;
  groupName: "PUBLIC" | "SECRET";
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: number;
};

export type SchoolUpdateView = {
  id: string;
  schoolId: string;
  title: string | null;
  publicContent: string | null;
  publicUrl: string | null;
  publicUpdatedAt: number | null;
  createdAt: number;
  attachments: Array<{
    id: string;
    groupName: "PUBLIC" | "SECRET";
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: number;
  }>;
  submitter?: string | null;
  publicOperator?: string | null;
  secretContent?: string | null;
  secretUrl?: string | null;
  secretOperator?: string | null;
  secretUpdatedAt?: number | null;
};

const SECRET_INPUT_KEYS = [
  "submitter",
  "publicOperator",
  "secretContent",
  "secretUrl",
  "secretOperator",
  "secretUpdatedAt",
] as const;

export function serializeSchoolUpdate(
  update: SchoolUpdateRow,
  attachments: SchoolUpdateAttachment[],
  role: UserRole,
): SchoolUpdateView {
  const canSecret = canViewSchoolUpdateSecret(role);
  const base: SchoolUpdateView = {
    id: update.id,
    schoolId: update.schoolId,
    title: update.title,
    publicContent: update.publicContent,
    publicUrl: update.publicUrl,
    publicUpdatedAt: update.publicUpdatedAt,
    createdAt: update.createdAt,
    attachments: attachments
      .filter((attachment) => canSecret || attachment.groupName !== "SECRET")
      .map((attachment) => ({
        id: attachment.id,
        groupName: attachment.groupName,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt,
      })),
  };
  if (!canSecret) return base;
  return {
    ...base,
    submitter: update.submitter,
    publicOperator: update.publicOperator,
    secretContent: update.secretContent,
    secretUrl: update.secretUrl,
    secretOperator: update.secretOperator,
    secretUpdatedAt: update.secretUpdatedAt,
  };
}

// 非机密人员提交机密/人员字段时，防御性剥离，避免绕过前端写入。
export function stripSchoolUpdateInput<
  T extends Record<string, unknown>,
>(input: T, role: UserRole): T {
  if (canViewSchoolUpdateSecret(role)) return input;
  const copy = { ...input };
  for (const key of SECRET_INPUT_KEYS) {
    delete copy[key];
  }
  return copy;
}

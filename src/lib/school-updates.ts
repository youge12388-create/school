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

type SchoolUpdateSecretAccess = boolean | UserRole;

function hasSecretAccess(access: SchoolUpdateSecretAccess) {
  return typeof access === "boolean" ? access : canViewSchoolUpdateSecret(access);
}

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
  canSecret: SchoolUpdateSecretAccess,
): SchoolUpdateView {
  const canViewSecret = hasSecretAccess(canSecret);
  const base: SchoolUpdateView = {
    id: update.id,
    schoolId: update.schoolId,
    title: update.title,
    publicContent: update.publicContent,
    publicUrl: update.publicUrl,
    publicUpdatedAt: update.publicUpdatedAt,
    createdAt: update.createdAt,
    attachments: attachments
      .filter((attachment) => canViewSecret || attachment.groupName !== "SECRET")
      .map((attachment) => ({
        id: attachment.id,
        groupName: attachment.groupName,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt,
      })),
  };
  if (!canViewSecret) return base;
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
>(input: T, canSecret: SchoolUpdateSecretAccess): T {
  if (hasSecretAccess(canSecret)) return input;
  const copy = { ...input };
  for (const key of SECRET_INPUT_KEYS) {
    delete copy[key];
  }
  return copy;
}

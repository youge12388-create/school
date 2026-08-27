import type { DatabaseSync } from "node:sqlite";

import { sqlite } from "@/lib/db";
import { newId } from "@/lib/utils";

export const AUDIT_ACTIONS = [
  "LOGIN_FAILED",
  "LOGIN_SUCCEEDED",
  "LOGOUT",
  "USER_CREATED",
  "USER_ROLE_UPDATED",
  "USER_ENABLED",
  "USER_DISABLED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_CLI",
  "CUSTOMER_CREATED",
  "CUSTOMER_ARCHIVED",
  "CUSTOMER_MANAGEMENT_UPDATED",
  "FOLLOW_UP_ADDED",
  "APPLICATION_CREATED",
  "APPLICATION_STATUS_CHANGED",
  "SCHOOL_UPDATED",
  "PROGRAM_UPDATED",
  "MANUAL_PROGRAM_CREATED",
  "IMPORT_CONFIRMED",
  "RECOMMENDATION_SAVED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_DOWNLOADED",
  "SCHOOL_UPDATE_CREATED",
  "SCHOOL_UPDATE_UPDATED",
  "SCHOOL_UPDATE_DELETED",
  "SCHOOL_UPDATES_IMPORTED",
  "SCHOOL_UPDATE_ATTACHMENT_UPLOADED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  "USER",
  "CUSTOMER",
  "APPLICATION",
  "SCHOOL",
  "PROGRAM",
  "IMPORT_BATCH",
  "RECOMMENDATION",
  "DOCUMENT",
  "SCHOOL_UPDATE",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  USER: "用户",
  CUSTOMER: "客户",
  APPLICATION: "申请",
  SCHOOL: "学校",
  PROGRAM: "项目",
  IMPORT_BATCH: "导入批次",
  RECOMMENDATION: "推荐方案",
  DOCUMENT: "文件",
  SCHOOL_UPDATE: "院校动态",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN_FAILED: "登录失败",
  LOGIN_SUCCEEDED: "登录成功",
  LOGOUT: "退出",
  USER_CREATED: "创建账号",
  USER_ROLE_UPDATED: "更新账号角色",
  USER_ENABLED: "启用账号",
  USER_DISABLED: "停用账号",
  PASSWORD_CHANGED: "修改密码",
  PASSWORD_RESET_CLI: "重置密码(CLI)",
  CUSTOMER_CREATED: "新建客户",
  CUSTOMER_ARCHIVED: "归档客户",
  CUSTOMER_MANAGEMENT_UPDATED: "更新客户管理",
  FOLLOW_UP_ADDED: "跟进记录",
  APPLICATION_CREATED: "新建申请",
  APPLICATION_STATUS_CHANGED: "申请状态变更",
  SCHOOL_UPDATED: "更新学校",
  PROGRAM_UPDATED: "更新项目",
  MANUAL_PROGRAM_CREATED: "手工创建项目",
  IMPORT_CONFIRMED: "导入确认",
  RECOMMENDATION_SAVED: "保存推荐方案",
  DOCUMENT_UPLOADED: "上传文件",
  DOCUMENT_DOWNLOADED: "下载文件",
  SCHOOL_UPDATE_CREATED: "新增院校动态",
  SCHOOL_UPDATE_UPDATED: "更新院校动态",
  SCHOOL_UPDATE_DELETED: "删除院校动态",
  SCHOOL_UPDATES_IMPORTED: "导入院校动态",
  SCHOOL_UPDATE_ATTACHMENT_UPLOADED: "上传动态附件",
};

export type AuditInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: unknown;
  ipAddress?: string | null;
};

export function writeAudit(input: AuditInput, database: DatabaseSync = sqlite) {
  database
    .prepare(
      `INSERT INTO audit_logs
       (id, user_id, action, entity_type, entity_id, details_json, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      input.userId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.details ? JSON.stringify(input.details) : null,
      input.ipAddress ?? null,
      Date.now(),
    );
}

export function formatAuditObject(
  entityType: string,
  details: Record<string, unknown> | null,
) {
  const label = ENTITY_TYPE_LABELS[entityType as AuditEntityType] || entityType;

  let identifier = "";
  if (details) {
    if (details.nameZh) identifier = String(details.nameZh);
    else if (details.name) identifier = String(details.name);
    else if (details.username) identifier = String(details.username);
    else if (details.customerName) identifier = String(details.customerName);
  }

  return identifier ? `${label} ${identifier}` : label;
}

export function formatAuditDetails(
  action: string,
  details: Record<string, unknown> | null,
) {
  if (!details) return "—";
  const actionLabel = AUDIT_ACTION_LABELS[action];

  if (
    action === "CUSTOMER_CREATED" &&
    "name" in details &&
    "customerNo" in details
  ) {
    return `${details.name}（${details.customerNo}）`;
  }
  if (
    action === "APPLICATION_STATUS_CHANGED" &&
    "to" in details &&
    "reason" in details
  ) {
    return `→ ${details.to}${details.reason ? `：${details.reason}` : ""}`;
  }
  if (action === "LOGIN_FAILED" && "username" in details) {
    return `用户名：${details.username}`;
  }
  if (
    action === "RECOMMENDATION_SAVED" &&
    "itemCount" in details &&
    "customerId" in details
  ) {
    return `客户 ${details.customerId}，${details.itemCount} 个项目`;
  }
  if (action === "DOCUMENT_UPLOADED" && "category" in details) {
    return `分类：${details.category}`;
  }
  if (
    action === "SCHOOL_UPDATE_CREATED" ||
    action === "SCHOOL_UPDATE_UPDATED" ||
    action === "SCHOOL_UPDATE_DELETED"
  ) {
    const parts: string[] = [];
    if (typeof details.title === "string" && details.title) {
      parts.push(`《${details.title}》`);
    }
    const changed = (details as Record<string, unknown>).changed;
    if (Array.isArray(changed) && changed.length) {
      parts.push(`修改：${changed.join("、")}`);
    }
    return parts.join(" ") || actionLabel || action;
  }
  if (action === "SCHOOL_UPDATE_ATTACHMENT_UPLOADED") {
    const groupLabel =
      details.groupName === "SECRET"
        ? "机密"
        : details.groupName === "PUBLIC"
          ? "公开"
          : String(details.groupName ?? "");
    return details.fileName
      ? `${groupLabel}附件：${details.fileName}`
      : `分组：${groupLabel}`;
  }
  if (action === "SCHOOL_UPDATES_IMPORTED") {
    const s = details as Record<string, number>;
    const parts: string[] = [];
    if (s.imported) parts.push(`导入 ${s.imported}`);
    if (s.updated) parts.push(`更新 ${s.updated}`);
    if (s.skipped) parts.push(`跳过 ${s.skipped}`);
    return parts.length ? parts.join("，") : "—";
  }
  if (action === "IMPORT_CONFIRMED") {
    const s = details as Record<string, number>;
    const parts: string[] = [];
    if (s.created) parts.push(`新增 ${s.created}`);
    if (s.updated) parts.push(`更新 ${s.updated}`);
    if (s.skipped) parts.push(`跳过 ${s.skipped}`);
    return parts.length ? parts.join("，") : "—";
  }

  const changed = (details as Record<string, unknown>).changed;
  if (Array.isArray(changed) && changed.length) {
    return `修改：${changed.join("、")}`;
  }

  const entries = Object.entries(details).filter(
    ([k, v]) =>
      v != null &&
      !["customerId", "ownerId", "entityId", "nameZh"].includes(k) &&
      k !== "changed",
  );
  if (entries.length === 0) return actionLabel || action;

  return entries
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
}

import {
  ClipboardList, Database, FileClock, GraduationCap, LayoutDashboard,
  MessageCircle, SearchCheck, Settings2, StickyNote, UserRoundCog,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

type Access = (role: string, permissions: readonly PermissionKey[]) => boolean;

const permit = (permission: PermissionKey): Access => (_, permissions) => permissions.includes(permission);
const admin: Access = (role) => role === "ADMIN";

const groups = [
  { label: null, items: [
    { href: "/dashboard", label: "工作台", icon: LayoutDashboard, access: permit("WORKSPACE_VIEW") },
  ] },
  { label: "院校业务", items: [
    { href: "/schools", label: "学校库", icon: GraduationCap, access: permit("SCHOOL_VIEW_PUBLIC") },
    { href: "/schools/noted", label: "特别备注院校", icon: StickyNote, access: permit("SCHOOL_VIEW_PUBLIC") },
    { href: "/screening", label: "学校筛查", icon: SearchCheck, access: permit("SCREENING_VIEW") },
    { href: "/ai-screening", label: "AI 选校", icon: MessageCircle, access: permit("SCREENING_VIEW") },
    { href: "/recommendations", label: "方案记录", icon: ClipboardList, access: permit("CUSTOMER_VIEW") },
  ] },
  { label: "管理", items: [
    { href: "/imports", label: "数据导入", icon: Database, access: permit("DATA_IMPORT") },
    { href: "/audit", label: "操作审计", icon: FileClock, access: permit("AUDIT_VIEW") },
    { href: "/admin/users", label: "账号管理", icon: UserRoundCog, access: admin },
    { href: "/settings", label: "设置", icon: Settings2, access: admin },
  ] },
];

export function workspaceNavGroups(role: string, permissions: readonly PermissionKey[]) {
  return groups.map(({ label, items }) => ({ label, items: items.filter(({ access }) => access(role, permissions)) }))
    .filter(({ items }) => items.length > 0);
}

export function isWorkspaceNavActive(path: string, href: string) {
  if (path === href) return true;
  if (href === "/schools" && path.startsWith("/schools/noted")) return false;
  return href !== "/dashboard" && path.startsWith(`${href}/`);
}

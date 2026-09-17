"use client";

import {
  Database,
  FileClock,
  GraduationCap,
  LayoutDashboard,
  SearchCheck,
  ShieldCheck,
  StickyNote,
  UserRoundCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebarCollapsed } from "@/components/sidebar-shell";
import { useT } from "@/lib/i18n/locale-context";
import type { PermissionKey } from "@/lib/permissions";

const items = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/screening", label: "学校筛查", icon: SearchCheck },
  { href: "/schools", label: "学校库", icon: GraduationCap },
  { href: "/schools/noted", label: "特别备注院校", icon: StickyNote },
  { href: "/imports", label: "数据导入", icon: Database },
  { href: "/audit", label: "操作审计", icon: FileClock },
  { href: "/admin/users", label: "账号管理", icon: UserRoundCog },
];

export function AppNav({
  role,
  permissions,
}: {
  role: string;
  permissions: readonly PermissionKey[];
}) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();
  const t = useT();
  return (
    <nav className="nav" aria-label={t("主导航")}>
      {items
        .filter((item) => {
          if (item.href === "/dashboard") return permissions.includes("WORKSPACE_VIEW");
          if (item.href === "/screening") return permissions.includes("SCREENING_VIEW");
          if (item.href === "/schools" || item.href === "/schools/noted") {
            return permissions.includes("SCHOOL_VIEW_PUBLIC");
          }
          if (item.href === "/admin/users") return role === "ADMIN";
          if (item.href === "/imports") {
            return permissions.includes("DATA_IMPORT");
          }
          if (item.href === "/audit") {
            return permissions.includes("AUDIT_VIEW");
          }
          return true;
        })
        .map((item) => {
          const isNotedRoute = pathname.startsWith("/schools/noted");
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(`${item.href}/`) &&
              !(item.href === "/schools" && isNotedRoute));
          const Icon = item.icon;
          return (
            <Link
              className={`nav-link${active ? " active" : ""}`}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" />
              {!collapsed && t(item.label)}
            </Link>
          );
        })}
      {role !== "MARKET_MANAGER" ? (
        <Link className="nav-link" href="/security">
          <ShieldCheck aria-hidden="true" />
          {!collapsed && t("安全说明")}
        </Link>
      ) : null}
    </nav>
  );
}

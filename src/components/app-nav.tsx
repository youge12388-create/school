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

const items = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/screening", label: "学校筛查", icon: SearchCheck },
  { href: "/schools", label: "学校库", icon: GraduationCap },
  { href: "/schools/noted", label: "特别备注院校", icon: StickyNote },
  { href: "/imports", label: "数据导入", icon: Database },
  { href: "/audit", label: "操作审计", icon: FileClock },
  { href: "/admin/users", label: "账号管理", icon: UserRoundCog },
];

export function AppNav({ role }: { role: string }) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();
  return (
    <nav className="nav" aria-label="主导航">
      {items
        .filter((item) => {
          if (item.href === "/admin/users") return role === "ADMIN";
          if (item.href === "/imports") {
            return (
              role !== "MARKET_MANAGER" &&
              (
              role === "ADMIN" ||
              role === "DATA_MANAGER" ||
              role === "CHANNEL_RESOURCE"
              )
            );
          }
          if (item.href === "/audit") {
            return role !== "MARKET_MANAGER" && (role === "ADMIN" || role === "DATA_MANAGER");
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
              {!collapsed && item.label}
            </Link>
          );
        })}
      {role !== "MARKET_MANAGER" ? (
        <Link className="nav-link" href="/security">
          <ShieldCheck aria-hidden="true" />
          {!collapsed && "安全说明"}
        </Link>
      ) : null}
    </nav>
  );
}

"use client";

import {
  BookOpen,
  ClipboardList,
  Database,
  FileClock,
  GraduationCap,
  LayoutDashboard,
  SearchCheck,
  ShieldCheck,
  Users,
  UserRoundCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/screening", label: "学校筛查", icon: SearchCheck },
  { href: "/customers", label: "客户管理", icon: Users },
  { href: "/applications", label: "申请流程", icon: ClipboardList },
  { href: "/schools", label: "学校库", icon: GraduationCap },
  { href: "/programs", label: "项目库", icon: BookOpen },
  { href: "/imports", label: "数据导入", icon: Database },
  { href: "/audit", label: "操作审计", icon: FileClock },
  { href: "/admin/users", label: "账号管理", icon: UserRoundCog },
];

export function AppNav({ role }: { role: string }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="主导航">
      {items
        .filter((item) => {
          if (item.href === "/admin/users") return role === "ADMIN";
          if (item.href === "/imports") return role !== "ADVISOR";
          if (item.href === "/audit") return role === "ADMIN" || role === "DATA_MANAGER";
          return true;
        })
        .map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              className={`nav-link${active ? " active" : ""}`}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      <Link className="nav-link" href="/security">
        <ShieldCheck aria-hidden="true" />
        安全说明
      </Link>
    </nav>
  );
}

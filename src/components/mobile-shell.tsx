"use client";

import {
  ClipboardList,
  Database,
  FileClock,
  GraduationCap,
  LayoutDashboard,
  SearchCheck,
  ShieldCheck,
  Users,
  UserRoundCog,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";

const drawerItems = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/screening", label: "学校筛查", icon: SearchCheck },
  { href: "/customers", label: "客户管理", icon: Users },
  { href: "/applications", label: "申请流程", icon: ClipboardList },
  { href: "/schools", label: "学校库", icon: GraduationCap },
  { href: "/imports", label: "数据导入", icon: Database },
  { href: "/audit", label: "操作审计", icon: FileClock },
  { href: "/admin/users", label: "账号管理", icon: UserRoundCog },
  { href: "/security", label: "安全说明", icon: ShieldCheck },
];

const MobileDrawerContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

export function useMobileDrawer() {
  return useContext(MobileDrawerContext);
}

export function MobileShell({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <MobileDrawerContext.Provider value={{ open, setOpen }}>
      {children}
      <MobileDrawer role={role} open={open} onClose={() => setOpen(false)} />
    </MobileDrawerContext.Provider>
  );
}

function MobileDrawer({
  role,
  open,
  onClose,
}: {
  role: string;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const items = drawerItems.filter((item) => {
    if (item.href === "/admin/users") return role === "ADMIN";
    if (item.href === "/imports") return role !== "ADVISOR";
    if (item.href === "/audit") return role === "ADMIN" || role === "DATA_MANAGER";
    return true;
  });

  return (
    <>
      <div
        className="mobile-drawer-backdrop"
        data-open={open}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="mobile-drawer" data-open={open} aria-label="主导航抽屉">
        <div className="mobile-drawer-header">
          <div className="brand-mark">SYT</div>
          <button
            className="mobile-drawer-close"
            onClick={onClose}
            aria-label="关闭导航"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <nav className="mobile-drawer-nav" aria-label="主导航">
          {items.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-drawer-link${active ? " active" : ""}`}
                onClick={onClose}
              >
                <Icon aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <form className="mobile-drawer-footer" action="/api/auth/logout" method="post">
          <button type="submit">退出登录</button>
        </form>
      </aside>
    </>
  );
}

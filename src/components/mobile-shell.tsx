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
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { useT } from "@/lib/i18n/locale-context";

const drawerItems = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/screening", label: "学校筛查", icon: SearchCheck },
  { href: "/schools", label: "学校库", icon: GraduationCap },
  { href: "/schools/noted", label: "特别备注院校", icon: StickyNote },
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
  const t = useT();
  const isNotedRoute = pathname.startsWith("/schools/noted");
  const items = drawerItems.filter((item) => {
    if (item.href === "/admin/users") return role === "ADMIN";
    if (item.href === "/imports") {
      return (
        role === "ADMIN" ||
        role === "DATA_MANAGER" ||
        role === "CHANNEL_RESOURCE"
      );
    }
    if (item.href === "/audit") return role === "ADMIN" || role === "DATA_MANAGER";
    if (item.href === "/security") return role !== "MARKET_MANAGER";
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
      <aside
        className="mobile-drawer"
        data-open={open}
        aria-label={t("主导航抽屉")}
      >
        <div className="mobile-drawer-header">
          <div className="brand-mark">SYT</div>
          <button
            className="mobile-drawer-close"
            onClick={onClose}
            aria-label={t("关闭导航")}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <nav className="mobile-drawer-nav" aria-label={t("主导航")}>
          {items.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (
                item.href !== "/dashboard" &&
                pathname.startsWith(`${item.href}/`) &&
                !(item.href === "/schools" && isNotedRoute)
              );
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-drawer-link${active ? " active" : ""}`}
                onClick={onClose}
              >
                <Icon aria-hidden="true" />
                {t(item.label)}
              </Link>
            );
          })}
        </nav>
        <form className="mobile-drawer-footer" action="/api/auth/logout" method="post">
          <button type="submit">{t("退出登录")}</button>
        </form>
      </aside>
    </>
  );
}

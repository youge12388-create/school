"use client";

import { LayoutDashboard, Search, UserCircle, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMobileDrawer } from "@/components/mobile-shell";
import { useT } from "@/lib/i18n/locale-context";
import type { PermissionKey } from "@/lib/permissions";

const tabs = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard, permission: "WORKSPACE_VIEW" },
  { href: "/screening", label: "筛查", icon: Search, permission: "SCREENING_VIEW" },
  { href: "/account", label: "我的", icon: UserCircle, permission: null },
] as const;

export function MobileNav({ permissions }: { permissions: readonly PermissionKey[] }) {
  const pathname = usePathname();
  const t = useT();
  const { setOpen } = useMobileDrawer();
  return (
    <nav className="mobile-nav" aria-label={t("底部导航")}>
      {tabs.filter((tab) => !tab.permission || permissions.includes(tab.permission)).map((tab) => {
        const Icon = tab.icon;
        const active =
          pathname === tab.href ||
          (tab.href !== "/dashboard" && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`mobile-nav-tab${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{t(tab.label)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className="mobile-nav-tab mobile-nav-more"
        onClick={() => setOpen(true)}
        aria-label={t("更多功能")}
        aria-haspopup="dialog"
        aria-controls="mobile-workspace-nav"
      >
        <Menu aria-hidden="true" />
        <span>{t("更多")}</span>
      </button>
    </nav>
  );
}

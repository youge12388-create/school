"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSidebarCollapsed } from "@/components/sidebar-shell";
import { isWorkspaceNavActive, workspaceNavGroups } from "@/components/workspace-navigation";
import { useT } from "@/lib/i18n/locale-context";
import type { PermissionKey } from "@/lib/permissions";

export function AppNav({ role, permissions }: { role: string; permissions: readonly PermissionKey[] }) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();
  const t = useT();
  return (
    <nav id="workspace-nav" className="nav" aria-label={t("主导航")}>
      {workspaceNavGroups(role, permissions).map(({ label, items }) => (
        <div className="nav-group" key={label ?? "home"}>
          {label && !collapsed && <p className="nav-group-label">{t(label)}</p>}
          {items.map(({ href, label, icon: Icon }) => {
            const active = isWorkspaceNavActive(pathname, href);
            return (
              <Link className={`nav-link${active ? " active" : ""}`} href={href} key={href}
                aria-current={active ? "page" : undefined} title={collapsed ? t(label) : undefined}
                aria-label={collapsed ? t(label) : undefined}>
                <Icon aria-hidden="true" />
                {!collapsed && <span>{t(label)}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

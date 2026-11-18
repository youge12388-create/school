"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { isWorkspaceNavActive, workspaceNavGroups } from "@/components/workspace-navigation";
import { useT } from "@/lib/i18n/locale-context";
import type { PermissionKey } from "@/lib/permissions";

const MobileDrawerContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

export function useMobileDrawer() {
  return useContext(MobileDrawerContext);
}

export function MobileShell({
  role,
  permissions,
  children,
}: {
  role: string;
  permissions: readonly PermissionKey[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <MobileDrawerContext.Provider value={{ open, setOpen }}>
      {children}
      <MobileDrawer role={role} permissions={permissions} open={open} onClose={() => setOpen(false)} />
    </MobileDrawerContext.Provider>
  );
}

function MobileDrawer({
  role,
  permissions,
  open,
  onClose,
}: {
  role: string;
  permissions: readonly PermissionKey[];
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <dialog id="mobile-workspace-nav" ref={dialog} className="mobile-drawer"
      aria-label={t("主导航抽屉")} onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mobile-drawer-inner">
        <div className="mobile-drawer-header">
          <div className="brand-mark" aria-hidden="true">SYT</div>
          <strong>{t("留学项目工作台")}</strong>
          <button className="mobile-drawer-close" type="button" onClick={onClose} aria-label={t("关闭导航")}>
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <nav className="mobile-drawer-nav" aria-label={t("主导航")}>
          {workspaceNavGroups(role, permissions).map(({ label, items }) => (
            <div className="nav-group" key={label ?? "home"}>
              {label && <p className="nav-group-label">{t(label)}</p>}
              {items.map(({ href, label, icon: Icon }) => {
                const active = isWorkspaceNavActive(pathname, href);
                return (
                  <Link key={href} href={href} className={`mobile-drawer-link${active ? " active" : ""}`}
                    aria-current={active ? "page" : undefined} onClick={onClose}>
                    <Icon aria-hidden="true" />
                    {t(label)}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <form className="mobile-drawer-footer" action="/api/auth/logout" method="post">
          <button type="submit">{t("退出登录")}</button>
        </form>
      </div>
    </dialog>
  );
}

import Link from "next/link";
import { LogOut } from "lucide-react";

import { AppNav } from "@/components/app-nav";
import { BrandLogo } from "@/components/brand-logo";
import { LocaleToggle } from "@/components/locale-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { MobileShell } from "@/components/mobile-shell";
import { SidebarShell } from "@/components/sidebar-shell";
import { GlobalSearch } from "@/components/global-search";
import { getUserPermissions } from "@/lib/access-control";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { translate } from "@/lib/i18n/dict";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getUiLocale } from "@/lib/i18n/server";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const locale = await getUiLocale();
  const t = (s: string) => translate(locale, s);
  const roleLabel = t(ROLE_LABELS[user.role]);
  const permissions = getUserPermissions(user);

  return (
    <LocaleProvider locale={locale}>
      <MobileShell role={user.role} permissions={permissions}>
        <div className="app-shell">
          <SidebarShell brand={(
            <div className="brand">
              <BrandLogo size={34} className="brand-mark" />
              <div className="brand-name">{t("高校筛查与申请管理")}</div>
            </div>
          )}>
            <AppNav role={user.role} permissions={permissions} />
            <div className="sidebar-user">
              <Link href="/account" className="sidebar-account" aria-label={t("个人账号")} title={t("个人账号")}>
                <span className="sidebar-avatar" aria-hidden="true">{Array.from(user.displayName.trim()).slice(0, 1).join("").toUpperCase() || "U"}</span>
                <span className="sidebar-account-text"><strong>{user.displayName}</strong><small>{roleLabel}</small></span>
              </Link>
              <form action="/api/auth/logout" method="post">
                <button type="submit" aria-label={t("退出登录")} title={t("退出登录")}><LogOut size={16} aria-hidden="true" /></button>
              </form>
            </div>
          </SidebarShell>
          <main className="main">
            <header className="topbar">
              <span className="topbar-title">{t("留学项目工作台")}</span>
              <div className="topbar-actions">
                <GlobalSearch />
                <LocaleToggle locale={locale} />
              </div>
            </header>
            <div className="mobile-search-bar mobile-only">
              <GlobalSearch />
            </div>
            <div className="page-content">{children}</div>
          </main>
        </div>
        <MobileNav permissions={permissions} />
      </MobileShell>
    </LocaleProvider>
  );
}

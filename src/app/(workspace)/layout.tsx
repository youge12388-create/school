import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { LocaleToggle } from "@/components/locale-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { MobileShell } from "@/components/mobile-shell";
import { SidebarShell } from "@/components/sidebar-shell";
import { GlobalSearch } from "@/components/global-search";
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

  return (
    <LocaleProvider locale={locale}>
      <MobileShell role={user.role}>
        <div className="app-shell">
          <SidebarShell>
            <div className="brand">
              <div className="brand-mark">SYT</div>
              <div className="brand-name">{t("高校筛查与申请管理")}</div>
            </div>
            <AppNav role={user.role} />
            <div className="sidebar-user">
              <Link href="/account"><strong>{user.displayName}</strong></Link>
              <small>{roleLabel}</small>
              <form action="/api/auth/logout" method="post">
                <button type="submit">{t("退出登录")}</button>
              </form>
            </div>
          </SidebarShell>
          <main className="main">
            <header className="topbar">
              <h1>{t("留学项目工作台")}</h1>
              <div className="topbar-actions">
                <GlobalSearch />
                <LocaleToggle locale={locale} />
                <span className="topbar-note">{t("本地数据 · 登录后访问 · 操作留痕")}</span>
              </div>
            </header>
            <div className="mobile-search-bar mobile-only">
              <GlobalSearch />
            </div>
            <div className="page-content">{children}</div>
          </main>
        </div>
        <MobileNav />
      </MobileShell>
    </LocaleProvider>
  );
}

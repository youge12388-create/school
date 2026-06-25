import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { logoutAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const roleLabel =
    user.role === "ADMIN"
      ? "管理员"
      : user.role === "DATA_MANAGER"
        ? "数据管理员"
        : "顾问";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SYT</div>
          <div className="brand-name">高校筛查与申请管理</div>
        </div>
        <AppNav role={user.role} />
        <div className="sidebar-user">
          <Link href="/account"><strong>{user.displayName}</strong></Link>
          <small>{roleLabel}</small>
          <form action={logoutAction}>
            <button type="submit">退出登录</button>
          </form>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <h1>留学项目工作台</h1>
          <span className="topbar-note">本地数据 · 登录后访问 · 操作留痕</span>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

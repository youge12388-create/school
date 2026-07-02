import { Calendar, Settings } from "lucide-react";
import Link from "next/link";

import { toggleUserAction } from "@/app/actions";
import { Badge, PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { listUsers } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

const roleLabels: Record<string, string> = {
  ADMIN: "管理员",
  ADVISOR: "顾问",
  DATA_MANAGER: "数据管理员",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { created, error } = await searchParams;
  const rows = await listUsers();

  return (
    <>
      <PageHeading
        title="账号管理"
        description="管理员创建和停用账号。停用后原有会话无法继续访问系统。"
        action={
          <Link className="button mobile-header-icon-only" href="/account" aria-label="账号设置">
            <Settings aria-hidden="true" />
          </Link>
        }
      />
      <section className="grid cols-2 desktop-only">
        <form className="card" action="/api/admin/users" method="post">
          <div className="card-header">
            <h3>创建账号</h3>
          </div>
          <div className="card-body">
            {error ? <div className="alert error">{error}</div> : null}
            {created ? (
              <div className="alert success">账号已创建并写入当前数据库。</div>
            ) : null}
            <div className="form-grid">
              <label>
                用户名
                <input name="username" required />
              </label>
              <label>
                显示名称
                <input name="displayName" required />
              </label>
              <label>
                角色
                <select name="role">
                  <option value="ADVISOR">顾问</option>
                  <option value="DATA_MANAGER">数据管理员</option>
                  <option value="ADMIN">管理员</option>
                </select>
              </label>
              <label>
                初始密码
                <input name="password" type="password" minLength={10} required />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary" type="submit">
                创建账号
              </button>
            </div>
          </div>
        </form>
        <div className="card">
          <div className="card-header">
            <h3>权限说明</h3>
          </div>
          <div className="card-body">
            <p>
              <strong>顾问：</strong>筛选、客户、跟进、申请和材料。
            </p>
            <p>
              <strong>数据管理员：</strong>顾问权限，加 Excel 导入与项目复核。
            </p>
            <p>
              <strong>管理员：</strong>全部权限，加账号与审计管理。
            </p>
          </div>
        </div>
      </section>

      <section className="card desktop-only" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>已有账号</h3>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>账号</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>最近登录</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName}</strong>
                      <div className="small muted">{user.username}</div>
                    </td>
                    <td>{roleLabels[user.role] ?? user.role}</td>
                    <td>
                      <Badge tone={user.active ? "green" : "red"}>
                        {user.active ? "启用" : "停用"}
                      </Badge>
                    </td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>
                      <form action={toggleUserAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(!user.active)}
                        />
                        <button type="submit">
                          {user.active ? "停用" : "启用"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mobile-only mobile-account-form">
        <form className="card" action="/api/admin/users" method="post">
          <div className="card-header">
            <h3>创建账号</h3>
          </div>
          <div className="card-body">
            {error ? <div className="alert error">{error}</div> : null}
            {created ? (
              <div className="alert success">账号已创建并写入当前数据库。</div>
            ) : null}
            <div className="form-grid mobile-two-col">
              <label>
                用户名
                <input name="username" placeholder="请输入用户名" required />
              </label>
              <label>
                显示名称
                <input name="displayName" placeholder="请输入显示名称" required />
              </label>
              <label>
                角色
                <select name="role">
                  <option value="">请选择角色</option>
                  <option value="ADVISOR">顾问</option>
                  <option value="DATA_MANAGER">数据管理员</option>
                  <option value="ADMIN">管理员</option>
                </select>
              </label>
              <label>
                初始密码
                <input name="password" type="password" placeholder="请输入初始密码" minLength={10} required />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary" type="submit">
                创建账号
              </button>
            </div>
          </div>
        </form>

        <div className="card mobile-permissions">
          <div className="card-header">
            <h3>权限说明</h3>
          </div>
          <div className="card-body">
            <p>
              <strong>顾问：</strong>筛选、客户、跟进、申请和材料。
            </p>
            <p>
              <strong>数据管理员：</strong>顾问权限，加 Excel 导入与项目复核。
            </p>
            <p>
              <strong>管理员：</strong>全部权限，加账号与审计管理。
            </p>
          </div>
        </div>

        <div className="mobile-account-list">
          <h3 className="mobile-section-title">已有账号</h3>
          {rows.map((user) => (
            <div key={user.id} className="mobile-account-card">
              <div className="mobile-account-avatar">
                {user.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="mobile-account-info">
                <div className="mobile-account-name">{user.displayName}</div>
                <div className="small muted">{user.username}</div>
                <div className="small muted mobile-login-line"><Calendar aria-hidden="true" /> 最近登录：{formatDate(user.lastLoginAt) || "—"}</div>
              </div>
              <div className="mobile-account-actions">
                <div className="mobile-account-role">{roleLabels[user.role] ?? user.role}</div>
                <Badge tone={user.active ? "green" : "red"}>
                  {user.active ? "启用" : "停用"}
                </Badge>
                <form action={toggleUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={String(!user.active)}
                  />
                  <button type="submit" className="mobile-toggle-btn">
                    {user.active ? "停用" : "启用"}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

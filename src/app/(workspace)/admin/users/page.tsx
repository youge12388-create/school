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
      />
      <section className="grid cols-2">
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
      <section className="card" style={{ marginTop: 16 }}>
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
    </>
  );
}

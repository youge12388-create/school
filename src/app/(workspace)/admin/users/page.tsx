import { Calendar, Settings } from "lucide-react";
import Link from "next/link";

import { toggleUserAction } from "@/app/actions";
import { Badge, PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { makeBadgeT, makeMessageT, makeT, makeTv } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import { listUsers } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

const roleOptions = [
  "ADVISOR",
  "DATA_MANAGER",
  "CHANNEL_RESOURCE",
  "MARKET_MANAGER",
  "ADMIN",
] as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; roleUpdated?: string; error?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { created, roleUpdated, error } = await searchParams;
  const locale = await getUiLocale();
  const t = makeT(locale);
  const bt = makeBadgeT(locale);
  const tv = makeTv(locale);
  const tm = makeMessageT(locale);
  const rows = await listUsers();

  return (
    <>
      <PageHeading
        title={t("账号管理")}
        description={t("管理员创建和停用账号。停用后原有会话无法继续访问系统。")}
        action={
          <Link className="button mobile-header-icon-only" href="/account" aria-label={t("账号设置")}>
            <Settings aria-hidden="true" />
          </Link>
        }
      />
      <section className="grid cols-2 desktop-only">
        <form className="card" action="/api/admin/users" method="post">
          <div className="card-header">
            <h3>{t("创建账号")}</h3>
          </div>
          <div className="card-body">
            {error ? <div className="alert error">{tm(error)}</div> : null}
            {created ? (
              <div className="alert success">{t("账号已创建并写入当前数据库。")}</div>
            ) : null}
            {roleUpdated ? <div className="alert success">{t("账号角色已更新。")}</div> : null}
            <div className="form-grid">
              <label>
                {t("用户名")}
                <input name="username" required />
              </label>
              <label>
                {t("显示名称")}
                <input name="displayName" required />
              </label>
              <label>
                {t("角色")}
                <select name="role">
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{t(ROLE_OPTION_LABELS[role])}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("初始密码")}
                <input name="password" type="password" minLength={10} required />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary" type="submit">
                {t("创建账号")}
              </button>
            </div>
          </div>
        </form>
        <div className="card">
          <div className="card-header">
            <h3>{t("权限说明")}</h3>
          </div>
          <div className="card-body">
            <p>
              <strong>{t("顾问：")}</strong>{t("筛选、客户、跟进、申请和材料。")}
            </p>
            <p>
              <strong>{t("数据管理员：")}</strong>{t("顾问权限，加 Excel 导入与项目复核；可查看院校机密字段，不可修改或导入机密字段。")}
            </p>
            <p>
              <strong>{t("渠道资源部：")}</strong>{t("院校信息录入与更新，不包含机密字段。")}
            </p>
            <p>
              <strong>{t("市场经理：")}</strong>{t("只读查看院校公开信息和备注。")}
            </p>
            <p>
              <strong>{t("高级管理员：")}</strong>{t("全部权限，加账号与审计管理，含院校机密字段的查看、修改与导入。")}
            </p>
          </div>
        </div>
      </section>

      <section className="card desktop-only" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>{t("已有账号")}</h3>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("账号")}</th>
                  <th>{t("角色")}</th>
                  <th>{t("状态")}</th>
                  <th>{t("最近登录")}</th>
                  <th>{t("操作")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName}</strong>
                      <div className="small muted">{user.username}</div>
                    </td>
                    <td>
                      <form action="/api/admin/users" method="post">
                        <input type="hidden" name="intent" value="update-role" />
                        <input type="hidden" name="userId" value={user.id} />
                        <select name="role" defaultValue={user.role} aria-label={tv("{name} 的角色", { name: user.displayName })}>
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>{t(ROLE_OPTION_LABELS[role])}</option>
                          ))}
                        </select>
                        <button type="submit">{t("保存角色")}</button>
                      </form>
                    </td>
                    <td>
                      <Badge tone={user.active ? "green" : "red"}>
                        {bt(user.active ? "启用" : "停用")}
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
                          {t(user.active ? "停用" : "启用")}
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
            <h3>{t("创建账号")}</h3>
          </div>
          <div className="card-body">
            {error ? <div className="alert error">{tm(error)}</div> : null}
            {created ? (
              <div className="alert success">{t("账号已创建并写入当前数据库。")}</div>
            ) : null}
            {roleUpdated ? <div className="alert success">{t("账号角色已更新。")}</div> : null}
            <div className="form-grid mobile-two-col">
              <label>
                {t("用户名")}
                <input name="username" placeholder={t("请输入用户名")} required />
              </label>
              <label>
                {t("显示名称")}
                <input name="displayName" placeholder={t("请输入显示名称")} required />
              </label>
              <label>
                {t("角色")}
                <select name="role" defaultValue="ADVISOR">
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{t(ROLE_OPTION_LABELS[role])}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("初始密码")}
                <input name="password" type="password" placeholder={t("请输入初始密码")} minLength={10} required />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary" type="submit">
                {t("创建账号")}
              </button>
            </div>
          </div>
        </form>

        <div className="card mobile-permissions">
          <div className="card-header">
            <h3>{t("权限说明")}</h3>
          </div>
          <div className="card-body">
            <p>
              <strong>{t("顾问：")}</strong>{t("筛选、客户、跟进、申请和材料。")}
            </p>
            <p>
              <strong>{t("数据管理员：")}</strong>{t("顾问权限，加 Excel 导入与项目复核；可查看院校机密字段，不可修改或导入机密字段。")}
            </p>
            <p>
              <strong>{t("渠道资源部：")}</strong>{t("院校信息录入与更新，不包含机密字段。")}
            </p>
            <p>
              <strong>{t("市场经理：")}</strong>{t("只读查看院校公开信息和备注。")}
            </p>
            <p>
              <strong>{t("高级管理员：")}</strong>{t("全部权限，加账号与审计管理，含院校机密字段的查看、修改与导入。")}
            </p>
          </div>
        </div>

        <div className="mobile-account-list">
          <h3 className="mobile-section-title">{t("已有账号")}</h3>
          {rows.map((user) => (
            <div key={user.id} className="mobile-account-card">
              <div className="mobile-account-avatar">
                {user.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="mobile-account-info">
                <div className="mobile-account-name">{user.displayName}</div>
                <div className="small muted">{user.username}</div>
                <div className="small muted mobile-login-line"><Calendar aria-hidden="true" /> {tv("最近登录：{date}", { date: formatDate(user.lastLoginAt) || "—" })}</div>
              </div>
              <div className="mobile-account-actions">
                <form action="/api/admin/users" method="post">
                  <input type="hidden" name="intent" value="update-role" />
                  <input type="hidden" name="userId" value={user.id} />
                  <select name="role" defaultValue={user.role} aria-label={tv("{name} 的角色", { name: user.displayName })}>
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>{t(ROLE_OPTION_LABELS[role])}</option>
                    ))}
                  </select>
                  <button type="submit" className="mobile-toggle-btn">{t("保存角色")}</button>
                </form>
                <Badge tone={user.active ? "green" : "red"}>
                  {bt(user.active ? "启用" : "停用")}
                </Badge>
                <form action={toggleUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={String(!user.active)}
                  />
                  <button type="submit" className="mobile-toggle-btn">
                    {t(user.active ? "停用" : "启用")}
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

const ROLE_OPTION_LABELS: Record<string, string> = {
  ADVISOR: "顾问",
  DATA_MANAGER: "数据管理员",
  CHANNEL_RESOURCE: "渠道资源部",
  MARKET_MANAGER: "市场经理",
  ADMIN: "高级管理员",
};

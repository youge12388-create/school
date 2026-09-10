import { Calendar, Settings } from "lucide-react";
import Link from "next/link";

import { toggleUserAction } from "@/app/actions";
import { Badge, PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { makeBadgeT, makeMessageT, makeT, makeTv } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import { listUsers } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { isWeComConfigured } from "@/lib/wecom";
import { listWeComDepartments } from "@/lib/wecom-service";

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
    searchParams: Promise<{
      created?: string;
      roleUpdated?: string;
      error?: string;
      wecomSynced?: string;
      wecomDepartments?: string;
      wecomRoleUpdated?: string;
      wecomError?: string;
    }>;
}) {
  await requireRole(["ADMIN"]);
  const {
    created,
    roleUpdated,
    error,
    wecomSynced,
    wecomDepartments,
    wecomRoleUpdated,
    wecomError,
  } = await searchParams;
  const locale = await getUiLocale();
  const t = makeT(locale);
  const bt = makeBadgeT(locale);
  const tv = makeTv(locale);
  const tm = makeMessageT(locale);
  const rows = await listUsers();
  const wecomDepartmentsRows = listWeComDepartments();
  const wecomConfigured = isWeComConfigured();

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

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <h3>{t("企业微信组织架构")}</h3>
            <p className="muted small">
              {t("同步企业微信部门和成员，并按部门映射系统角色。未配置角色的成员不能登录。")}
            </p>
          </div>
          <form action="/api/admin/wecom" method="post">
            <input type="hidden" name="intent" value="sync" />
            <button className="primary" type="submit" disabled={!wecomConfigured}>
              {t("立即同步")}
            </button>
          </form>
        </div>
        <div className="card-body">
          {!wecomConfigured ? (
            <div className="alert error">
              {t("企业微信配置未完成，请在运行环境设置 WECOM_CORP_ID、WECOM_SECRET 和 WECOM_REDIRECT_URI。")}
            </div>
          ) : null}
          {wecomSynced ? (
            <div className="alert success">
              {tv("组织架构同步完成：{departments} 个部门，{members} 名成员。", {
                departments: wecomDepartments || "0",
                members: wecomSynced,
              })}
            </div>
          ) : null}
          {wecomRoleUpdated ? <div className="alert success">{t("部门角色映射已更新，相关账号的现有会话已刷新。")}</div> : null}
          {wecomError ? <div className="alert error">{tm(wecomError)}</div> : null}
          {wecomDepartmentsRows.length ? (
            <div className="table-wrap">
              <table className="wecom-department-table">
                <thead>
                  <tr>
                    <th>{t("部门")}</th>
                    <th>{t("成员数")}</th>
                    <th>{t("登录角色")}</th>
                    <th>{t("操作")}</th>
                  </tr>
                </thead>
                <tbody>
                  {wecomDepartmentsRows.map((department) => (
                    <tr key={department.id}>
                      <td data-label={t("部门")}>
                        <span style={{ paddingLeft: `${department.depth * 18}px` }}>
                          {department.path}
                        </span>
                        <div className="small muted">ID: {department.id}</div>
                      </td>
                      <td data-label={t("成员数")}>{department.memberCount}</td>
                      <td data-label={t("登录角色")}>
                        {department.role ? t(ROLE_OPTION_LABELS[department.role]) : t("无权限（禁止登录）")}
                      </td>
                      <td data-label={t("操作")}>
                        <form action="/api/admin/wecom" method="post" className="form-inline">
                          <input type="hidden" name="intent" value="update-role" />
                          <input type="hidden" name="departmentId" value={department.id} />
                          <select name="role" defaultValue={department.role ?? ""} aria-label={tv("{name} 的登录角色", { name: department.path })}>
                            <option value="">{t("无权限（禁止登录）")}</option>
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>{t(ROLE_OPTION_LABELS[role])}</option>
                            ))}
                          </select>
                          <button type="submit">{t("保存")}</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{t("尚未同步企业微信组织架构。")}</p>
          )}
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
                  <th>{t("来源")}</th>
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
                      {user.authProvider === "WECOM" ? (
                        <>
                          {t(ROLE_OPTION_LABELS[user.role])}
                          <div className="small muted">{t("由部门映射")}</div>
                        </>
                      ) : (
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
                      )}
                    </td>
                    <td>{user.authProvider === "WECOM" ? t("企业微信") : t("本地账号")}</td>
                    <td>
                      <Badge tone={user.active ? "green" : "red"}>
                        {bt(user.active ? "启用" : "停用")}
                      </Badge>
                    </td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>
                      {user.authProvider === "WECOM" ? (
                        <span className="small muted">{t("由企业微信状态控制")}</span>
                      ) : (
                        <form action={toggleUserAction}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="active" value={String(!user.active)} />
                          <button type="submit">{t(user.active ? "停用" : "启用")}</button>
                        </form>
                      )}
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
                <div className="small muted">{user.authProvider === "WECOM" ? t("企业微信") : t("本地账号")}</div>
                <div className="small muted mobile-login-line"><Calendar aria-hidden="true" /> {tv("最近登录：{date}", { date: formatDate(user.lastLoginAt) || "—" })}</div>
              </div>
              <div className="mobile-account-actions">
                  {user.authProvider === "WECOM" ? (
                    <span className="small muted">{t("角色由部门映射")}</span>
                  ) : (
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
                  )}
                <Badge tone={user.active ? "green" : "red"}>
                  {bt(user.active ? "启用" : "停用")}
                </Badge>
                {user.authProvider === "WECOM" ? null : (
                  <form action={toggleUserAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="active" value={String(!user.active)} />
                    <button type="submit" className="mobile-toggle-btn">
                      {t(user.active ? "停用" : "启用")}
                    </button>
                  </form>
                )}
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

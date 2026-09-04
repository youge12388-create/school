import { changePasswordAction } from "@/app/account-actions";
import { PageHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { translate } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";

export default async function AccountPage() {
  const user = await requireUser();
  const locale = await getUiLocale();
  const t = (s: string) => translate(locale, s);
  const roleLabel = t(ROLE_LABELS[user.role]);

  return (
    <>
      <PageHeading
        title={t("个人账号")}
        description={`${user.displayName} · ${user.username}`}
      />

      <div className="mobile-only mobile-account-profile">
        <div className="mobile-account-profile-avatar">
          {user.displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="mobile-account-profile-name">{user.displayName}</div>
        <div className="small muted">{user.username} · {roleLabel}</div>
      </div>

      <form className="card" action={changePasswordAction} style={{ maxWidth: 620 }}>
        <div className="card-header"><h3>{t("修改密码")}</h3></div>
        <div className="card-body">
          <label>{t("当前密码")}<input name="currentPassword" type="password" required /></label>
          <label style={{ marginTop: 12 }}>{t("新密码")}<input name="newPassword" type="password" minLength={10} required /></label>
          <label style={{ marginTop: 12 }}>{t("确认新密码")}<input name="confirmPassword" type="password" minLength={10} required /></label>
          <p className="small muted" style={{ marginTop: 10 }}>{t("至少 10 个字符，建议同时包含大小写字母、数字和符号。")}</p>
          <div className="form-actions"><button className="primary" type="submit">{t("更新密码")}</button></div>
        </div>
      </form>
    </>
  );
}

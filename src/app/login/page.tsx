import { ArrowRight, ClipboardList, GraduationCap, MessagesSquare, SearchCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { LocaleToggle } from "@/components/locale-toggle";
import { getCurrentUser } from "@/lib/auth";
import { makeMessageT, translate } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";

import styles from "./page.module.css";

const workAreas = [
  { icon: GraduationCap, label: "院校访查" },
  { icon: SearchCheck, label: "项目筛查" },
  { icon: ClipboardList, label: "申请跟进" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { error } = await searchParams;
  const locale = await getUiLocale();
  const t = (s: string) => translate(locale, s);
  const tm = makeMessageT(locale);

  return (
    <main className={styles.page}>
      <header className={styles.topline}>
        <div className={styles.brand}>
          <BrandLogo size={34} className={styles.brandMark} />
          <span>{t("高校访查与申请管理")}</span>
        </div>
        <LocaleToggle locale={locale} />
      </header>

      <div className={styles.layout}>
        <section className={styles.intro} aria-labelledby="login-overview">
          <div className={styles.introContent}>
            <h2 id="login-overview">{t("从院校访查到申请跟进")}</h2>
            <p>{t("集中记录院校访查、项目判断和申请进度，让团队始终掌握下一步该做什么。")}</p>
            <ul className={styles.areas} aria-label={t("系统覆盖范围")}>
              {workAreas.map(({ icon: Icon, label }) => (
                <li key={label}><Icon size={17} aria-hidden="true" /><span>{t(label)}</span></li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="login-title">
          <form className={styles.form} action="/api/auth/login" method="post">
            <header className={styles.formHeading}>
              <h1 id="login-title">{t("登录工作台")}</h1>
              <p>{t("使用管理员为你创建的账号登录。")}</p>
            </header>

            {error ? <p className={styles.error} role="alert">{tm(error)}</p> : null}

            <label className={styles.field}>
              <span>{t("用户名")}</span>
              <input name="username" autoComplete="username" placeholder={t("请输入用户名")} required />
            </label>
            <label className={styles.field}>
              <span>{t("密码")}</span>
              <input name="password" type="password" autoComplete="current-password" placeholder={t("请输入密码")} required />
            </label>

            <button className={`primary ${styles.submit}`} type="submit">
              {t("进入工作台")} <ArrowRight size={17} aria-hidden="true" />
            </button>

            <div className={styles.divider}><span>{t("或")}</span></div>
            <a className={`button ${styles.wecomButton}`} href="/api/auth/wecom">
              <MessagesSquare size={16} aria-hidden="true" /> {t("企业微信登录")}
            </a>
            <p className={styles.helpText}>{t("无法登录？请联系系统管理员协助处理。")}</p>
          </form>
        </section>
      </div>
    </main>
  );
}

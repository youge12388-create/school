import { LocaleToggle } from "@/components/locale-toggle";
import { getCurrentUser } from "@/lib/auth";
import { translate } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";
import { redirect } from "next/navigation";

import styles from "./page.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const { error } = await searchParams;
  const locale = await getUiLocale();
  const t = (s: string) => translate(locale, s);

  return (
    <main className={styles.page}>
      <section className={styles.intro} aria-labelledby="login-title">
        <div className={styles.introContent}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              SYT
            </span>
            <span>{t("高校访查与申请管理")}</span>
          </div>

          <div className={styles.hero}>
            <p className={styles.eyebrow}>INTERNATIONAL EDUCATION WORKSPACE</p>
            <h1 id="login-title">
              {t("让每一次访查，")}
              <br />
              {t("都走向更清晰的申请。")}
            </h1>
            <p className={styles.heroCopy}>
              {t(
                "集中记录院校访查、项目判断和申请进度，让团队始终掌握下一步该做什么。"
              )}
            </p>
          </div>

          <div className={styles.featureList} aria-label={t("系统覆盖范围")}>
            <span>{t("院校访查")}</span>
            <span>{t("项目筛查")}</span>
            <span>{t("申请跟进")}</span>
          </div>
        </div>

        <div className={styles.pathway} aria-hidden="true">
          <svg viewBox="0 0 620 400" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M-20 318C104 311 81 130 217 150C341 168 282 334 416 298C503 275 509 140 650 94"
              className={styles.pathLine}
            />
            <path
              d="M-16 336C110 325 134 206 259 221C369 234 362 365 493 334C567 317 576 249 641 222"
              className={styles.pathLineSoft}
            />
            <circle cx="115" cy="212" r="9" className={styles.nodeOne} />
            <circle cx="217" cy="150" r="13" className={styles.nodeTwo} />
            <circle cx="416" cy="298" r="10" className={styles.nodeThree} />
            <circle cx="535" cy="246" r="7" className={styles.nodeFour} />
          </svg>
        </div>
      </section>

      <section className={styles.panel} aria-label={t("登录区域")}>
        <div style={{ position: "absolute", top: 22, right: 26 }}>
          <LocaleToggle locale={locale} />
        </div>
        <form className={styles.form} action="/api/auth/login" method="post">
          <div className={styles.formHeading}>
            <span className={styles.formAccent} aria-hidden="true" />
            <p>{t("工作台入口")}</p>
            <h2>{t("欢迎回来")}</h2>
            <span>{t("使用管理员为你创建的账号登录。")}</span>
          </div>

          {error ? <div className={styles.error}>{t(error)}</div> : null}

          <label className={styles.field}>
            <span>{t("用户名")}</span>
            <input
              name="username"
              autoComplete="username"
              placeholder={t("请输入用户名")}
              required
            />
          </label>
          <label className={styles.field}>
            <span>{t("密码")}</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder={t("请输入密码")}
              required
            />
          </label>

          <button className={styles.submit} type="submit">
            {t("进入工作台")}
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 10h11M11 5l5 5-5 5" />
            </svg>
          </button>

          <p className={styles.helpText}>{t("无法登录？请联系系统管理员协助处理。")}</p>
        </form>
      </section>
    </main>
  );
}

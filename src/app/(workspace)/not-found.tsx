import Link from "next/link";
import { translate } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";

export default async function WorkspaceNotFound() {
  const locale = await getUiLocale();
  const t = (s: string) => translate(locale, s);

  return (
    <section className="card" style={{ maxWidth: 560, margin: "40px auto", padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t("未找到对应页面或记录")}</h2>
      <p style={{ color: "var(--muted)" }}>
        {t("该记录可能已归档或链接地址无效。")}
      </p>
      <div style={{ marginTop: 16 }}>
        <Link href="/dashboard" className="button primary">
          {t("返回工作台")}
        </Link>
      </div>
    </section>
  );
}

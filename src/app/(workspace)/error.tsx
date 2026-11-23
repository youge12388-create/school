"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/locale-context";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("[workspace-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <section className="card" role="alert" style={{ maxWidth: 560, margin: "40px auto", padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t("页面加载出现异常")}</h2>
      <p style={{ color: "var(--muted)" }}>
        {t("读取数据时遇到意外错误，请重试或返回首页。")}
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" className="button primary" onClick={() => reset()}>
          {t("重试")}
        </button>
        <Link href="/dashboard" className="button">
          {t("返回工作台")}
        </Link>
      </div>
    </section>
  );
}

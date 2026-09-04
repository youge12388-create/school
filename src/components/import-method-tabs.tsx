"use client";

import { useT } from "@/lib/i18n/locale-context";

export function ImportMethodTabs({ active }: { active: "excel" | "manual" }) {
  const t = useT();
  return (
    <nav aria-label={t("数据录入方式")} className="import-method-tabs">
      <a
        aria-current={active === "excel" ? "page" : undefined}
        className={active === "excel" ? "active" : ""}
        href="/imports"
      >
        {t("Excel 批量导入")}
      </a>
      <a
        aria-current={active === "manual" ? "page" : undefined}
        className={active === "manual" ? "active" : ""}
        href="/imports/manual"
      >
        {t("手动录入一条")}
      </a>
    </nav>
  );
}

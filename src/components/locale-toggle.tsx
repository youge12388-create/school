"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import clsx from "clsx";

import { type UiLocale } from "@/lib/i18n/dict";

/** 中文 / English segmented switcher. Writes the ui_locale cookie, then refreshes. */
export function LocaleToggle({
  locale,
  className,
}: {
  locale: UiLocale;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const switchTo = async (next: UiLocale) => {
    if (next === locale || busy) return;
    setBusy(true);
    try {
      await fetch("/api/i18n/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={clsx("locale-toggle", className)}
      role="group"
      aria-label="Language / 语言"
    >
      <button
        type="button"
        className={locale === "zh" ? "active" : undefined}
        aria-pressed={locale === "zh"}
        onClick={() => switchTo("zh")}
      >
        中
      </button>
      <button
        type="button"
        className={locale === "en" ? "active" : undefined}
        aria-pressed={locale === "en"}
        onClick={() => switchTo("en")}
      >
        EN
      </button>
    </div>
  );
}

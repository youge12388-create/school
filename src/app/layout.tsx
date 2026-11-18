import type { Metadata } from "next";

import { translate } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";

import "./globals.css";
import "./google-ui.css";
import "./workspace.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  return {
    title: translate(locale, "高校筛查与申请管理"),
    description: translate(
      locale,
      "在华留学学校项目筛查、客户跟进与申请管理系统"
    ),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getUiLocale();
  return (
    <html lang={locale === "en" ? "en" : "zh-CN"}>
      <body>{children}</body>
    </html>
  );
}

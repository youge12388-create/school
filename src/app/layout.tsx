import type { Metadata } from "next";
import Script from "next/script";

import "./globals.css";
import "./google-ui.css";

export const metadata: Metadata = {
  title: "高校筛查与申请管理",
  description: "在华留学学校项目筛查、客户跟进与申请管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Script
          src="https://canhuo.site/widget.js"
          data-site-id="cmrexwgio0000by7f3izi80v5"
          data-api-host="https://canhuo.site"
        />
      </body>
    </html>
  );
}
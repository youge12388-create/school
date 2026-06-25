import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
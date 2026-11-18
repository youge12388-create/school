"use client";

import clsx from "clsx";
import { Menu } from "lucide-react";
import { useMobileDrawer } from "@/components/mobile-shell";
import { useT } from "@/lib/i18n/locale-context";

export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "gray";
}) {
  return <span className={clsx("badge", tone)}>{children}</span>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const { setOpen } = useMobileDrawer();
  const t = useT();
  return (
    <header className="page-heading">
      <button type="button" className="page-heading-menu" onClick={() => setOpen(true)}
        aria-label={t("打开导航")} aria-haspopup="dialog" aria-controls="mobile-workspace-nav">
        <Menu size={20} aria-hidden="true" />
      </button>
      <div className="page-heading-copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="page-heading-action">{action}</div> : null}
    </header>
  );
}

"use client";

import clsx from "clsx";
import { Menu } from "lucide-react";
import { useMobileDrawer } from "@/components/mobile-shell";

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
  return (
    <>
      <div className="page-heading desktop-only">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      <header className="mobile-page-header mobile-only">
        <button
          className="mobile-menu-btn"
          onClick={() => setOpen(true)}
          aria-label="打开导航"
        >
          <Menu aria-hidden="true" />
        </button>
        <div className="mobile-page-header-title">
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="mobile-page-header-action">{action}</div> : null}
      </header>
    </>
  );
}

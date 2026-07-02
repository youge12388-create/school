"use client";

import { LayoutDashboard, Search, Users, UserCircle, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMobileDrawer } from "@/components/mobile-shell";

const tabs = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/screening", label: "筛查", icon: Search },
  { href: "/customers", label: "客户", icon: Users },
  { href: "/account", label: "我的", icon: UserCircle },
];

export function MobileNav() {
  const pathname = usePathname();
  const { setOpen } = useMobileDrawer();
  return (
    <nav className="mobile-nav" aria-label="底部导航">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active =
          pathname === tab.href ||
          (tab.href !== "/dashboard" && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`mobile-nav-tab${active ? " active" : ""}`}
          >
            <Icon aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className="mobile-nav-tab mobile-nav-more"
        onClick={() => setOpen(true)}
        aria-label="更多功能"
      >
        <Menu aria-hidden="true" />
        <span>更多</span>
      </button>
    </nav>
  );
}

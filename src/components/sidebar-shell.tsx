"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, createContext, useContext } from "react";
import { useT } from "@/lib/i18n/locale-context";

const SidebarCollapsedContext = createContext(false);

export function useSidebarCollapsed() {
  return useContext(SidebarCollapsedContext);
}

export function SidebarShell({ brand, children }: { brand: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const isAgentPage = pathname === "/ai-screening" || pathname?.startsWith("/ai-screening/");
  const [manualOverride, setManualOverride] = useState<{ path: string; collapsed: boolean } | null>(null);
  const collapsed = manualOverride && manualOverride.path === pathname ? manualOverride.collapsed : isAgentPage;
  const t = useT();
  const handleToggle = () => {
    const nextCollapsed = !collapsed;
    setManualOverride({ path: pathname ?? "", collapsed: nextCollapsed });
    try {
      window.dispatchEvent(new CustomEvent("workspace:sidebar-toggle", { detail: { collapsed: nextCollapsed } }));
    } catch {
      // Ignore environments without CustomEvent support.
    }
  };
  return (
    <SidebarCollapsedContext.Provider value={collapsed}>
      <aside className={"sidebar" + (collapsed ? " sidebar--collapsed" : "")}>
        <div className="sidebar-head">
          {brand}
          <button
            className="sidebar-collapse-btn"
            type="button"
            onClick={handleToggle}
            aria-expanded={!collapsed}
            aria-controls="workspace-nav"
            aria-label={collapsed ? t("展开侧边栏") : t("收起侧边栏")}
            title={collapsed ? t("展开侧边栏") : t("收起侧边栏")}
          >
            {collapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
          </button>
        </div>
        {children}
      </aside>
    </SidebarCollapsedContext.Provider>
  );
}

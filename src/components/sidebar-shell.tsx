"use client";

import { useState, createContext, useContext } from "react";
import { useT } from "@/lib/i18n/locale-context";

const SidebarCollapsedContext = createContext(false);

export function useSidebarCollapsed() {
  return useContext(SidebarCollapsedContext);
}

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const t = useT();
  return (
    <SidebarCollapsedContext.Provider value={collapsed}>
      <aside className={"sidebar" + (collapsed ? " sidebar--collapsed" : "")}>
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t("展开侧边栏") : t("收起侧边栏")}
        >
          ☰
        </button>
        {children}
      </aside>
    </SidebarCollapsedContext.Provider>
  );
}

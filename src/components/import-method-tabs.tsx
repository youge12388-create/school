export function ImportMethodTabs({ active }: { active: "excel" | "manual" }) {
  return (
    <nav aria-label="数据录入方式" className="import-method-tabs">
      <a
        aria-current={active === "excel" ? "page" : undefined}
        className={active === "excel" ? "active" : ""}
        href="/imports"
      >
        Excel 批量导入
      </a>
      <a
        aria-current={active === "manual" ? "page" : undefined}
        className={active === "manual" ? "active" : ""}
        href="/imports/manual"
      >
        手动录入一条
      </a>
    </nav>
  );
}

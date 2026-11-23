export default function WorkspaceLoading() {
  return (
    <div className="card" role="status" aria-busy="true" style={{ padding: 24, margin: "16px 0" }}>
      <p style={{ margin: 0, color: "var(--muted)" }}>正在加载页面数据…</p>
    </div>
  );
}

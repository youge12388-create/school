"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "48px 24px", maxWidth: 520, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 8 }}>页面加载出现异常</h2>
        <p style={{ color: "#556070", marginBottom: 20 }}>
          请尝试重新加载页面；如果问题持续，请联系管理员检查服务状态。
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #d0d7e2",
            background: "#2563eb",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          重试
        </button>
      </body>
    </html>
  );
}

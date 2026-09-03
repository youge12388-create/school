// 只读健康检查：供发布脚本确认“重启确实切换到了新进程”。
// 返回进程启动时间（startedAt），deploy.sh 据此判断 restart 是否真正生效，
// 避免把“旧进程仍存活”误判为发布成功。无需登录。
export const dynamic = "force-dynamic";

const startedAt = Date.now();

export async function GET() {
  return Response.json(
    {
      ok: true,
      pid: process.pid,
      startedAt,
      uptimeSec: Math.round(process.uptime()),
      now: Date.now(),
      version: "1",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

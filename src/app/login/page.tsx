import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand-mark">SYT</div>
        <h1>高校筛查与申请管理</h1>
        <p>
          集中维护学校项目、客户需求、推荐方案、申请进度和材料记录。
          未明确的规则始终显示“数据库未有相关信息”，由顾问做最终判断。
        </p>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" action="/api/auth/login" method="post">
          <div>
            <h2>登录</h2>
            <p className="muted">账号由系统管理员创建。</p>
          </div>
          {error ? <div className="alert error">{error}</div> : null}
          <label>
            用户名
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" type="submit">
            登录
          </button>
        </form>
      </section>
    </main>
  );
}

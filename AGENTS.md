<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 本机工作区与本地启动

- 唯一维护工作区为 `E:\codex-all\school-syt`，使用 `master` 分支；旧的 `school-syt-master`、`school-syt-merge` 及历史预览副本不作为启动入口。
- 本地预览使用 `scripts\open-local.ps1`，或根目录的 `start-dashboard.cmd` / `start-dashboard-hidden.vbs`。入口按脚本所在目录启动当前源码的开发服务，不复用历史生产构建，也不直接复用未知来源的端口服务。
- `.env.local` 的 `DATABASE_PATH` 指向本地业务库 `./data/app.db`。应用首次连接会检查并应用未执行的迁移；切换数据库或升级迁移前，必须先做一致性备份并取得迁移授权。
- 历史改动、数据库及旧代码归档放在项目目录之外的 `E:\codex-all\school-syt-backups`；备份只用于恢复，不作为应用源码或预览入口。

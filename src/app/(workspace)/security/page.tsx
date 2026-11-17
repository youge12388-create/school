import { PageHeading } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function SecurityPage() {
  const t = await getT();
  return (
    <>
      <PageHeading
        title={t("安全与数据说明")}
        description={t(
          "本系统处理护照、成绩单等敏感个人资料，真实使用前必须完成主机与备份安全检查。"
        )}
      />
      <section className="grid cols-2">
        <div className="card">
          <div className="card-header"><h3>{t("系统已实施")}</h3></div>
          <div className="card-body">
            <ul>
              <li>{t("密码使用 scrypt 加盐哈希，不保存明文。")}</li>
              <li>{t("会话 Cookie 为 HttpOnly、SameSite Strict。")}</li>
              <li>{t("材料使用 AES-256-GCM 逐文件加密并校验完整性。")}</li>
              <li>{t("文件下载必须登录，上传和下载均记录审计。")}</li>
              <li>{t("登录、导入、客户、文件和名单等写入接口拒绝跨站请求。")}</li>
              <li>{t("限制文件类型和单文件大小，存储目录不对网页公开。")}</li>
              <li>{t("客户和材料采用归档，不给普通用户永久删除入口。")}</li>
              <li>{t("AI 选校只把当前条件和近期对话发送给模型；客户画像仅在顾问主动保存时回写。")}</li>
            </ul>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>{t("主机必须配置")}</h3></div>
          <div className="card-body">
            <ul>
              <li>{t("启用 Windows BitLocker，并设置独立管理员账号。")}</li>
              <li>{t("仅允许可信人员登录主机，离职当天停用系统账号。")}</li>
              <li>{t("数据库、附件和加密密钥必须同时备份，但分开保管。")}</li>
              <li>{t("备份介质也需要加密，并定期执行恢复演练。")}</li>
              <li>{t("如开放局域网访问，应配置 HTTPS 和防火墙白名单。")}</li>
              <li>{t("客户材料保留期和删除审批仍待业务负责人确认，确认前不自动删除。")}</li>
            </ul>
          </div>
        </div>
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>{t("备份范围")}</h3></div>
        <div className="card-body">
          <p><code>data/app.db</code>：{t("业务数据库。")}</p>
          <p><code>data/uploads/</code>：{t("加密后的客户材料。")}</p>
          <p><code>data/keys/app.key</code>：{t("解密密钥，丢失后材料无法恢复。")}</p>
          <p>{t("客户画像、方案和反馈日志仍需纳入备份范围；反馈日志不保存聊天正文。")}</p>
          <p className="alert error" style={{ marginTop: 12 }}>
            {t("不要只备份数据库，也不要把密钥放入 Git、聊天软件或普通网盘。")}
          </p>
        </div>
      </section>
    </>
  );
}

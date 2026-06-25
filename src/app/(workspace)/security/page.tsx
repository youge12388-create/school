import { PageHeading } from "@/components/ui";

export default function SecurityPage() {
  return (
    <>
      <PageHeading
        title="安全与数据说明"
        description="本系统处理护照、成绩单等敏感个人资料，真实使用前必须完成主机与备份安全检查。"
      />
      <section className="grid cols-2">
        <div className="card">
          <div className="card-header"><h3>系统已实施</h3></div>
          <div className="card-body">
            <ul>
              <li>密码使用 scrypt 加盐哈希，不保存明文。</li>
              <li>会话 Cookie 为 HttpOnly、SameSite Strict。</li>
              <li>材料使用 AES-256-GCM 逐文件加密并校验完整性。</li>
              <li>文件下载必须登录，上传和下载均记录审计。</li>
              <li>限制文件类型和单文件大小，存储目录不对网页公开。</li>
              <li>客户和材料采用归档，不给普通用户永久删除入口。</li>
            </ul>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>主机必须配置</h3></div>
          <div className="card-body">
            <ul>
              <li>启用 Windows BitLocker，并设置独立管理员账号。</li>
              <li>仅允许可信人员登录主机，离职当天停用系统账号。</li>
              <li>数据库、附件和加密密钥必须同时备份，但分开保管。</li>
              <li>备份介质也需要加密，并定期执行恢复演练。</li>
              <li>如开放局域网访问，应配置 HTTPS 和防火墙白名单。</li>
              <li>客户材料超过业务保留期限后，应由管理员制定删除流程。</li>
            </ul>
          </div>
        </div>
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>备份范围</h3></div>
        <div className="card-body">
          <p><code>data/app.db</code>：业务数据库。</p>
          <p><code>data/uploads/</code>：加密后的客户材料。</p>
          <p><code>data/keys/app.key</code>：解密密钥，丢失后材料无法恢复。</p>
          <p className="alert error" style={{ marginTop: 12 }}>
            不要只备份数据库，也不要把密钥放入 Git、聊天软件或普通网盘。
          </p>
        </div>
      </section>
    </>
  );
}

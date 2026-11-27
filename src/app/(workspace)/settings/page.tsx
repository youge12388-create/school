import { Cable, Globe, LockKeyhole } from "lucide-react";

import { AiProviderForm } from "@/components/ai-provider-form";
import { AiSearchGovernanceForm } from "@/components/ai-search-governance-form";
import { PageHeading } from "@/components/ui";
import { allowedAiBaseUrls, describeAiProvider, getAiProviderConfig } from "@/lib/ai-provider";
import { getSearchGovernanceStatus } from "@/lib/ai-search-governance";
import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

function readSettings() {
  try {
    return describeAiProvider(getAiProviderConfig());
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  await requireRole(["ADMIN"]);
  const t = await getT();
  const settings = readSettings();
  const searchStatus = getSearchGovernanceStatus();

  return (
    <>
      <PageHeading title={t("设置")} description={t("管理此工作台的系统连接。")} />
      <div className="settings-layout">
        <div className="settings-main">
          <section className="card settings-panel" aria-labelledby="ai-api-title">
            <div className="card-header settings-panel-header">
              <Cable size={18} aria-hidden="true" />
              <div>
                <h2 id="ai-api-title">AI API</h2>
                <p>{t("用于理解选校条件、整理推荐理由和回答追问。")}</p>
              </div>
            </div>
            {settings ? (
              <AiProviderForm initial={settings} allowedUrls={allowedAiBaseUrls()} />
            ) : (
              <div className="card-body">
                <p className="settings-feedback is-error" role="alert">
                  {t("无法读写 AI 配置，请联系管理员检查配置目录和加密密钥。")}
                </p>
              </div>
            )}
          </section>

          <section className="card settings-panel" aria-labelledby="ai-search-title">
            <div className="card-header settings-panel-header">
              <Globe size={18} aria-hidden="true" />
              <div>
                <h2 id="ai-search-title">{t("库外检索与费用管控")}</h2>
                <p>{t("控制库外院校拓展、DeepSeek 实时联网搜索、每日次数上限及本地 24 小时缓存。")}</p>
              </div>
            </div>
            <AiSearchGovernanceForm initial={searchStatus} />
          </section>
        </div>
        <aside className="settings-note" aria-label={t("连接说明")}>
          <LockKeyhole size={18} aria-hidden="true" />
          <h2>{t("连接说明")}</h2>
          <p>{t("测试只发送一条示例消息。实际选校时，脱敏后的对话会发送给所选服务。")}</p>
          <p>{t("配置保存后，对所有顾问的下一次 AI 请求生效。")}</p>
          <p>{t("联网搜索优先复用本地缓存；达到每日上限后自动平滑降级为 AI 知识整理。")}</p>
        </aside>
      </div>
    </>
  );
}

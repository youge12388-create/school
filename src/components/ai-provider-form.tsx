"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import type { describeAiProvider } from "@/lib/ai-provider";
import { useT } from "@/lib/i18n/locale-context";

type Settings = ReturnType<typeof describeAiProvider>;
type Intent = "test" | "save";
type Feedback = { tone: "success" | "error"; message: string };

export function AiProviderForm({ initial, allowedUrls }: { initial: Settings; allowedUrls: string[] }) {
  const t = useT();
  const [current, setCurrent] = useState(initial);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [hasNewKey, setHasNewKey] = useState(false);
  const [pending, setPending] = useState<Intent | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const needsKey = !current.configured || baseUrl !== current.baseUrl;
  const changed = baseUrl !== current.baseUrl || model.trim() !== current.model || hasNewKey;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const intent: Intent = button?.getAttribute("value") === "save" ? "save" : "test";
    if (submitting.current || (intent === "save" && !changed)) return;

    const apiKey = keyInput.current?.value.trim() ?? "";
    submitting.current = true;
    setPending(intent);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, baseUrl, model, apiKey, revision: current.revision }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string; ok?: true; settings?: Settings } | null;
      if (!response.ok || !result?.ok) {
        setFeedback({ tone: "error", message: result?.error ?? "操作未完成，请刷新页面后重试。" });
        return;
      }
      if (intent === "save" && result.settings) {
        setCurrent(result.settings);
        setModel(result.settings.model);
        setHasNewKey(false);
        if (keyInput.current) keyInput.current.value = "";
      }
      setFeedback({ tone: "success", message: intent === "save" ? "配置已保存。" : "连接正常，模型已返回有效响应。" });
    } catch {
      setFeedback({ tone: "error", message: "操作未完成，请刷新页面后重试。" });
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  return (
    <form className="provider-form" method="post" aria-busy={pending !== null} onSubmit={submit}>
      <div className="provider-status">
        <span className="provider-status-label">{t("当前配置")}</span>
        <span className={`provider-state${current.configured ? " is-ready" : ""}`}>
          <span aria-hidden="true" />
          {t(current.configured ? "已配置" : "未配置")}
        </span>
        {current.configured && (
          <span className="provider-status-source">{t(current.revision ? "来自工作台设置" : "来自本地环境配置")}</span>
        )}
      </div>
      <fieldset disabled={pending !== null} className="provider-fields">
        <label>
          <span>{t("API 地址")}</span>
          <select name="baseUrl" value={baseUrl} onChange={(event) => {
            setBaseUrl(event.target.value);
            setHasNewKey(false);
            if (keyInput.current) keyInput.current.value = "";
            setFeedback(null);
          }}>
            {allowedUrls.map((url) => <option key={url} value={url}>{url}</option>)}
          </select>
        </label>
        <label>
          <span>{t("模型名称")}</span>
          <input required name="model" value={model} maxLength={160} placeholder="deepseek-chat" spellCheck={false}
            onChange={(event) => { setModel(event.target.value); setFeedback(null); }} />
        </label>
        <label>
          <span>{t("API 密钥")}</span>
          <input ref={keyInput} required={needsKey} type="password" name="apiKey" maxLength={1024}
            autoComplete="new-password" spellCheck={false} aria-describedby="provider-key-hint"
            placeholder={t(needsKey ? "输入此服务的密钥" : "留空保留现有密钥")}
            onChange={(event) => { setHasNewKey(Boolean(event.target.value.trim())); setFeedback(null); }} />
          <small id="provider-key-hint">
            {t(needsKey ? "请提供所选服务的密钥。" : "新密钥保存后会加密，不会在此页面显示。")}
          </small>
        </label>
      </fieldset>
      {feedback && (
        <p className={`settings-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
          {feedback.tone === "error" ? <CircleAlert size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
          {t(feedback.message)}
        </p>
      )}
      <div className="provider-actions">
        <button type="submit" value="test" disabled={pending !== null}>
          {pending === "test" && <LoaderCircle className="provider-spinner" size={15} aria-hidden="true" />}
          {t(pending === "test" ? "正在测试…" : "测试连接")}
        </button>
        <button className="primary" type="submit" value="save" disabled={pending !== null || !changed}>
          {pending === "save" && <LoaderCircle className="provider-spinner" size={15} aria-hidden="true" />}
          {t(pending === "save" ? "正在验证并保存…" : "验证并保存")}
        </button>
      </div>
    </form>
  );
}

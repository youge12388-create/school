import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import { decryptBuffer, encryptBuffer } from "@/lib/file-crypto";

const defaultBaseUrl = "https://api.deepseek.com";
const defaultModel = "deepseek-chat";
const credentialsSchema = z.object({
  baseUrl: z.string().max(300),
  model: z.string().trim().min(1).max(160).regex(/^[\w.\-/:]+$/u),
  apiKey: z.string().trim().max(1024).regex(/^[\x21-\x7e]*$/u),
}).strict();
const storedConfigSchema = credentialsSchema.extend({ revision: z.string().uuid() });
const envelopeSchema = z.object({
  iv: z.string(),
  tag: z.string(),
  checksum: z.string(),
  ciphertext: z.string(),
}).strict();

export const providerUpdateSchema = credentialsSchema.extend({
  intent: z.enum(["test", "save"]),
  revision: z.string().uuid().nullable(),
});

type Credentials = z.infer<typeof credentialsSchema>;
type Config = Credentials & { revision: string | null };
type Update = z.infer<typeof providerUpdateSchema>;
type ChatMessage = { role: "system" | "user"; content: string };

const errors = {
  missing: [400, "尚未配置 AI API，请联系管理员在设置中添加密钥。"],
  destination: [400, "请选择已允许的 HTTPS API 地址。"],
  newKey: [400, "更换 API 地址时，请输入该服务对应的密钥。"],
  changed: [409, "配置已被更新，请刷新页面后重试。"],
  auth: [422, "密钥无效或没有模型访问权限，请核对后重试。"],
  quota: [422, "模型服务余额不足或请求受限，请检查账户后重试。"],
  model: [422, "模型或接口不支持所需的 JSON 响应，请核对模型和 API 地址。"],
  network: [502, "暂时无法连接模型服务，请检查地址和网络后重试。"],
  timeout: [504, "模型服务响应超时，请稍后重试。"],
  storage: [500, "无法读写 AI 配置，请联系管理员检查配置目录和加密密钥。"],
} as const;

export class AiProviderError extends Error {
  readonly status: number;

  constructor(readonly code: keyof typeof errors) {
    super(errors[code][1]);
    this.status = errors[code][0];
  }
}

function normalizedBaseUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return (url.origin + url.pathname).replace(/\/+$/u, "");
  } catch {
    return null;
  }
}

export function allowedAiBaseUrls() {
  const values = [
    defaultBaseUrl,
    "https://api.openai.com/v1",
    process.env.DEEPSEEK_BASE_URL ?? "",
    ...(process.env.AI_PROVIDER_ALLOWED_BASE_URLS ?? "").split(","),
  ];
  return [...new Set(values.map(normalizedBaseUrl).filter((url): url is string => url !== null))];
}

export function aiProviderSettingsPath() {
  const databaseDir = dirname(resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH ?? "./data/app.db"));
  return resolve(databaseDir, "ai-provider.json");
}

let cachedStoredConfig: {
  path: string;
  mtimeMs: number;
  size: number;
  value: z.infer<typeof storedConfigSchema>;
} | null = null;

function loadStoredConfig(): z.infer<typeof storedConfigSchema> | null {
  const path = aiProviderSettingsPath();
  let fileStat: { mtimeMs: number; size: number };
  try {
    const info = statSync(/* turbopackIgnore: true */ path);
    fileStat = { mtimeMs: info.mtimeMs, size: info.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      cachedStoredConfig = null;
      return null;
    }
    throw new AiProviderError("storage");
  }
  if (
    cachedStoredConfig &&
    cachedStoredConfig.path === path &&
    cachedStoredConfig.mtimeMs === fileStat.mtimeMs &&
    cachedStoredConfig.size === fileStat.size
  ) {
    return cachedStoredConfig.value;
  }
  let raw: string;
  try {
    raw = readFileSync(/* turbopackIgnore: true */ path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      cachedStoredConfig = null;
      return null;
    }
    throw new AiProviderError("storage");
  }
  try {
    const value = envelopeSchema.parse(JSON.parse(raw));
    const data = decryptBuffer(Buffer.from(value.ciphertext, "base64url"), value.iv, value.tag, value.checksum);
    const parsed = storedConfigSchema.parse(JSON.parse(data.toString("utf8")));
    cachedStoredConfig = { path, mtimeMs: fileStat.mtimeMs, size: fileStat.size, value: parsed };
    return parsed;
  } catch {
    cachedStoredConfig = null;
    throw new AiProviderError("storage");
  }
}

export function getAiProviderConfig(): Config {
  return loadStoredConfig() ?? {
    baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || defaultBaseUrl,
    model: process.env.DEEPSEEK_MODEL?.trim() || defaultModel,
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() || "",
    revision: null,
  };
}

export function describeAiProvider(config: Config) {
  const baseUrl = normalizedBaseUrl(config.baseUrl);
  const allowed = allowedAiBaseUrls();
  const recognized = baseUrl !== null && allowed.includes(baseUrl);
  return {
    baseUrl: recognized ? baseUrl : defaultBaseUrl,
    model: config.model,
    configured: Boolean(config.apiKey) && recognized,
    revision: config.revision,
  };
}

export function resolveAiProviderUpdate(input: Update): Credentials {
  const current = getAiProviderConfig();
  if (current.revision !== input.revision) throw new AiProviderError("changed");
  const baseUrl = normalizedBaseUrl(input.baseUrl);
  if (!baseUrl || !allowedAiBaseUrls().includes(baseUrl)) throw new AiProviderError("destination");
  if (!input.apiKey && baseUrl !== normalizedBaseUrl(current.baseUrl)) throw new AiProviderError("newKey");
  const apiKey = input.apiKey || current.apiKey;
  if (!apiKey) throw new AiProviderError("missing");
  return { baseUrl, model: input.model, apiKey };
}

export function saveAiProvider(config: Credentials, expectedRevision: string | null) {
  if (getAiProviderConfig().revision !== expectedRevision) throw new AiProviderError("changed");
  const path = aiProviderSettingsPath();
  const temporary = `${path}.${randomUUID()}.tmp`;
  const next = { ...config, revision: randomUUID() };
  try {
    const { encrypted, iv, tag, checksum } = encryptBuffer(Buffer.from(JSON.stringify(next)));
    mkdirSync(/* turbopackIgnore: true */ dirname(path), { recursive: true });
    writeFileSync(/* turbopackIgnore: true */ temporary, JSON.stringify({
      iv, tag, checksum, ciphertext: encrypted.toString("base64url"),
    }), { flag: "wx", mode: 0o600 });
    renameSync(/* turbopackIgnore: true */ temporary, /* turbopackIgnore: true */ path);
    cachedStoredConfig = null;
  } catch {
    try { unlinkSync(/* turbopackIgnore: true */ temporary); } catch { /* No temporary file to remove. */ }
    throw new AiProviderError("storage");
  }
  return describeAiProvider(next);
}

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)?.[1];
    if (fenced) return JSON.parse(fenced.trim());
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new SyntaxError("Invalid JSON object");
  }
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function waitBeforeRetry(delayMs: number, signal?: AbortSignal) {
  await new Promise<void>((resolveWait, rejectWait) => {
    if (signal?.aborted) {
      rejectWait(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolveWait();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      rejectWait(signal?.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type AiCompletionPayload = {
  choices?: {
    message?: {
      content?: unknown;
      annotations?: Array<{ type?: string; url_citation?: { url?: unknown; title?: unknown } }>;
      server_tool_calls?: Array<{
        calls?: Array<{
          type?: string;
          status?: string;
          sources?: Array<{ url?: unknown; title?: unknown; snippet?: unknown }>;
        }>;
      }>;
    };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    server_tool_use?: { tool_search?: number; tool_fetch?: number };
  };
};

export async function requestAiCompletion(
  config: Credentials,
  messages: ChatMessage[],
  options: {
    timeoutMs: number;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    maxTokens?: number;
    retries?: number;
    tools?: Array<{ type: string }>;
    responseFormat?: "json_object" | "text";
  },
) {
  if (!config.apiKey) throw new AiProviderError("missing");
  const baseUrl = normalizedBaseUrl(config.baseUrl);
  if (!baseUrl || !allowedAiBaseUrls().includes(baseUrl)) throw new AiProviderError("destination");
  const deadline = Date.now() + options.timeoutMs;
  const maxAttempts = 1 + Math.max(0, options.retries ?? 1);
  const fetchFn = options.fetchImpl ?? fetch;
  const hasTools = Boolean(options.tools?.length);
  const useJsonFormat = !hasTools && options.responseFormat !== "text";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new AiProviderError("timeout");
    const timeout = AbortSignal.timeout(remainingMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}/chat/completions`, {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          ...(useJsonFormat ? { response_format: { type: "json_object" } } : {}),
          ...(hasTools ? { tools: options.tools } : {}),
          temperature: 0,
          max_tokens: options.maxTokens,
          messages,
        }),
      });
    } catch {
      if (timeout.aborted) throw new AiProviderError("timeout");
      if (options.signal?.aborted) throw new AiProviderError("network");
      if (attempt < maxAttempts && deadline - Date.now() > 1500) {
        await waitBeforeRetry(250, options.signal).catch(() => {});
        continue;
      }
      throw new AiProviderError("network");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const status = response.status;
      if (isRetryableStatus(status) && attempt < maxAttempts && deadline - Date.now() > 1500 && !options.signal?.aborted) {
        await waitBeforeRetry(250, options.signal).catch(() => {});
        continue;
      }
      if (status === 401 || status === 403) throw new AiProviderError("auth");
      if (status === 402 || status === 429) throw new AiProviderError("quota");
      if (status === 400 || status === 404 || status === 422) throw new AiProviderError("model");
      throw new AiProviderError("network");
    }
    try {
      return await response.json() as AiCompletionPayload;
    } catch {
      throw new AiProviderError(timeout.aborted ? "timeout" : "model");
    }
  }
  throw new AiProviderError("network");
}

export async function verifyAiProvider(config: Credentials, signal: AbortSignal) {
  const payload = await requestAiCompletion(config, [
    { role: "system", content: 'Reply with exactly the JSON object {"ok":true}.' },
    { role: "user", content: "JSON connectivity check." },
  ], { signal, timeoutMs: 15_000, maxTokens: 128, retries: 0 });
  const choice = payload?.choices?.[0];
  try {
    if (typeof choice?.message?.content === "string" && choice.finish_reason !== "length" &&
        (extractJsonObject(choice.message.content) as { ok?: unknown })?.ok === true) return;
  } catch { /* Treat malformed responses like incompatible models. */ }
  throw new AiProviderError("model");
}

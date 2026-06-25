export function newId() {
  return crypto.randomUUID();
}

export function asText(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export function asOptionalText(value: unknown) {
  const text = asText(value);
  return text || null;
}

export function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asText(value).replace(/,/g, "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseDateInput(value: FormDataEntryValue | null) {
  const text = asText(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: Date | number | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatMoney(value: number | null | undefined) {
  if (value == null) return "数据库未有相关信息";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value);
}

export function normalizeKeyword(value: string) {
  return value
    .toLowerCase()
    .replace(/[（）()【】[\]\s·•、，,。./\\_-]/g, "");
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

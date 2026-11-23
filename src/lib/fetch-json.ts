export async function readJsonResponse<T = Record<string, unknown>>(
  response: Response,
  fallbackError = "请求未完成，请稍后重试。",
): Promise<T> {
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: unknown })
    | null;
  if (!response.ok) {
    const message =
      data && typeof data.error === "string" && data.error.trim()
        ? data.error
        : fallbackError;
    throw new Error(message);
  }
  if (data === null) {
    throw new Error(fallbackError);
  }
  return data;
}

import { describe, expect, it, vi } from "vitest";
import { extractJsonObject, requestAiCompletion } from "./ai-provider";

describe("ai-provider helpers", () => {
  it("parses plain, markdown-fenced, and wrapped JSON objects", () => {
    expect(extractJsonObject('{"ok":true}')).toEqual({ ok: true });
    expect(extractJsonObject('```json\n{"intent":"search"}\n```')).toEqual({
      intent: "search",
    });
    expect(extractJsonObject('Here is the result:\n{"a":1}\nThanks')).toEqual({
      a: 1,
    });
    expect(() => extractJsonObject("not json at all")).toThrow();
  });

  it("retries once on transient 503 responses and succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("upstream unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
        }),
      );

    const payload = await requestAiCompletion(
      { baseUrl: "https://api.deepseek.com", model: "deepseek-chat", apiKey: "sk-test" },
      [{ role: "user", content: "hi" }],
      { timeoutMs: 10_000, fetchImpl: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(payload.choices?.[0]?.message?.content).toBe('{"ok":true}');
  });
});

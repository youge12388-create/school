import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as XLSX from "xlsx";

const auth = vi.hoisted(() => ({ user: { role: "ADMIN" } as { role: string } | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
import { GET, POST } from "./route";

function workbook(name: string) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["院校名称（中文）", "推荐项目"], [name, ""]]), "名单");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
function request(action: string, content = workbook("新学校"), hash?: string, origin = "http://localhost") {
  const form = new FormData();
  form.set("action", action); form.set("expectedVersion", "");
  form.set("workbook", new File([new Uint8Array(content)], "新名单.xlsx"));
  if (hash) form.set("hash", hash);
  return new Request("http://localhost/api/ai-screening/workbook", { method: "POST", headers: { Origin: origin, Host: "localhost" }, body: form });
}

let root: string, shared: string, original: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ai-school-api-"));
  shared = join(root, "shared"); original = join(root, "original.xlsx");
  await writeFile(original, workbook("原学校"));
  vi.stubEnv("AI_SCREENING_SHARED_DIR", shared); vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", original);
  auth.user = { role: "ADMIN" };
});
afterEach(async () => {
  vi.unstubAllEnvs();
  try {
    for (const name of await readdir(shared)) {
      const file = resolve(shared, name);
      if (dirname(file) !== resolve(shared)) throw new Error("不安全的测试路径");
      await unlink(file);
    }
    await rmdir(shared);
  } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  await unlink(original); await rmdir(root);
});

describe("统一合作名单接口", () => {
  it("未登录不能读取，顾问可查看状态但不能更新", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    auth.user = { role: "CONSULTANT" };
    expect((await GET()).status).toBe(200);
    expect((await POST(request("preview"))).status).toBe(403);
  });
  it("拒绝跨站请求和未经预览的更新", async () => {
    expect((await POST(request("preview", workbook("新学校"), undefined, "http://evil.test"))).status).toBe(403);
    expect((await POST(request("update"))).status).toBe(400);
    expect((await (await GET()).json()).version).toBeNull();
  });
  it("管理员先预览再确认，全局生效且可以恢复原名单", async () => {
    const content = workbook("新学校");
    const previewResponse = await POST(request("preview", content));
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview).toMatchObject({ schools: 1, added: 1, removed: 1 });
    expect((await (await GET()).json()).version).toBeNull();
    expect((await POST(request("update", workbook("更改内容"), preview.hash))).status).toBe(400);
    const updated = await POST(request("update", content, preview.hash));
    expect(updated.status).toBe(200);
    const info = await updated.json();
    expect((await (await GET()).json()).version).toBe(info.version);
    const restore = new Request("http://localhost/api/ai-screening/workbook", { method: "POST", headers: { Origin: "http://localhost", Host: "localhost", "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", expectedVersion: info.version }) });
    expect((await POST(restore)).status).toBe(200);
    expect((await (await GET()).json()).version).toBeNull();
  });
});

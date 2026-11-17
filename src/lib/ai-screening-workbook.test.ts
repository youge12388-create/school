import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as XLSX from "xlsx";
import { currentWorkbookInfo, loadCurrentWorkbook, parseWorkbook, previewWorkbook, replaceWorkbook, restorePreviousWorkbook } from "./ai-screening-workbook";

function workbook(name: string, sheet = "春季名单") {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[], ["硕士", "院校名称（中文）", "申请 截止", "推荐项目"], ["学费12万元/年", name, "2027年1月31日截止", "不合作"]]), sheet);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

let root: string;
let shared: string;
let original: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ai-school-workbook-"));
  shared = join(root, "shared"); original = join(root, "original.xlsx");
  await writeFile(original, workbook("原名单学校"));
  vi.stubEnv("AI_SCREENING_SHARED_DIR", shared);
  vi.stubEnv("AI_SCREENING_WORKBOOK_PATH", original);
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
  try { await unlink(original); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  await rmdir(root);
});

describe("合作名单读取与版本管理", () => {
  it("按表头识别调整过的列，保留工作表、行号和不合作标记", () => {
    const result = parseWorkbook(workbook("测试学校"), "春季.xlsx");
    expect(result.schools).toBe(1);
    expect(result.rows[0]).toMatchObject({ name: "测试学校", row: 3, sheet: "春季名单", noCooperation: true });
    expect(result.rows[0].fields[11]).toBe("学费12万元/年");
    expect(result.rows[0].fields[15]).toBe("2027年1月31日截止");
  });
  it("更新对所有后续读取生效，历史版本可逐级恢复，原文件不变", async () => {
    const before = await readFile(original);
    const first = await replaceWorkbook(workbook("第一版学校"), "第一版.xlsx", null);
    expect((await loadCurrentWorkbook()).rows[0].name).toBe("第一版学校");
    const second = await replaceWorkbook(workbook("第二版学校"), "第二版.xlsx", first.version);
    expect((await loadCurrentWorkbook()).rows[0].name).toBe("第二版学校");
    await expect(replaceWorkbook(workbook("过期更新"), "过期.xlsx", first.version)).rejects.toThrow("其他管理员更新");
    await restorePreviousWorkbook(second.version!);
    expect((await loadCurrentWorkbook()).rows[0].name).toBe("第一版学校");
    await restorePreviousWorkbook(first.version!);
    expect((await loadCurrentWorkbook()).rows[0].name).toBe("原名单学校");
    expect(await readFile(original)).toEqual(before);
  });
  it("无效名单不会切换当前版本", async () => {
    const first = await replaceWorkbook(workbook("当前学校"), "当前.xlsx", null);
    await expect(replaceWorkbook(Buffer.from("not an xlsx"), "坏文件.xlsx", first.version)).rejects.toThrow();
    expect((await currentWorkbookInfo()).version).toBe(first.version);
    expect((await loadCurrentWorkbook()).rows[0].name).toBe("当前学校");
  });
  it("先预览增减与缺列，不写入；内容改变后不能确认", async () => {
    const content = workbook("新名单学校");
    const preview = await previewWorkbook(content, "新名单.xlsx", null);
    expect(preview).toMatchObject({ version: null, rows: 1, schools: 1, notCooperating: 1, added: 1, removed: 1 });
    expect(preview.missingColumns).toContain("本科");
    expect((await currentWorkbookInfo()).version).toBeNull();
    await expect(replaceWorkbook(workbook("被替换的内容"), "新名单.xlsx", null, preview.hash)).rejects.toThrow("文件内容已改变");
    expect((await loadCurrentWorkbook()).rows[0].name).toBe("原名单学校");
    await replaceWorkbook(content, "新名单.xlsx", null, preview.hash);
    expect((await loadCurrentWorkbook()).rows[0].name).toBe("新名单学校");
  });
  it("原名单丢失时不切换到不可用的上一版", async () => {
    const first = await replaceWorkbook(workbook("当前学校"), "当前.xlsx", null);
    await unlink(original);
    await expect(restorePreviousWorkbook(first.version!)).rejects.toThrow("原名单无法读取");
    expect((await currentWorkbookInfo()).version).toBe(first.version);
  });
  it("当前文件意外缺失时管理员仍可预览并上传新版本修复", async () => {
    const first = await replaceWorkbook(workbook("当前学校"), "当前.xlsx", null);
    await unlink(join(shared, `workbook-${first.version}.xlsx`));
    expect(await currentWorkbookInfo()).toMatchObject({ version: first.version, available: false, canRestore: true });
    const content = workbook("修复后的学校");
    const preview = await previewWorkbook(content, "修复.xlsx", first.version);
    expect(preview.added).toBeNull();
    await replaceWorkbook(content, "修复.xlsx", first.version, preview.hash);
    expect((await loadCurrentWorkbook()).rows[0].name).toBe("修复后的学校");
  });
});

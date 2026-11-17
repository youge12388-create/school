import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import * as XLSX from "xlsx";
import { z } from "zod";
import { schoolKey, type ListRow } from "@/lib/ai-screening";

export const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;
const DEFAULT_FILE = "C:/Users/EDY/Documents/WXWork/1688857755951099/Cache/File/2026-11/2027春季招生院校名单（标黄）20261026.xlsx";
const idSchema = z.string().uuid();
const pointerSchema = z.object({ active: idSchema.nullable() }).strict();
const versionSchema = z.object({ id: idSchema, name: z.string().min(1).max(120), uploadedAt: z.string().datetime(), rows: z.number().int().nonnegative(), schools: z.number().int().nonnegative(), previous: idSchema.nullable() }).strict();
type Version = z.infer<typeof versionSchema>;
export type WorkbookInfo = { name: string; version: string | null; updatedAt: string | null; schools: number | null; available: boolean; canRestore: boolean };
export type WorkbookPreview = { name: string; version: string | null; rows: number; schools: number; notCooperating: number; added: number | null; removed: number | null; missingColumns: string[]; hash: string };

export class WorkbookError extends Error {}

function storageDirectory() { return resolve(process.env.AI_SCREENING_SHARED_DIR || join(process.cwd(), "data", "ai-screening-workbooks")); }
function configuredFile() { return resolve(process.env.AI_SCREENING_WORKBOOK_PATH || DEFAULT_FILE); }
function safeName(name: string) { return name.split(/[\\/]/u).pop()?.replace(/[\u0000-\u001f]/gu, "").trim().slice(0, 120) || "合作院校名单.xlsx"; }
function isMissing(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }
function normalizedHeader(value: unknown) { return String(value ?? "").normalize("NFKC").replace(/\s+/gu, "").trim(); }

const headerPatterns: Array<[number, RegExp]> = [
  [0, /^序号$/u], [1, /^院校分类$/u], [3, /^(?:院校|学校)名称\(英文.*\)$/u],
  [4, /^合作级别/u], [5, /^(?:所在)?城市$/u], [6, /^推荐项目$/u], [7, /^语言$/u],
  [8, /^预科$/u], [9, /^专科$/u], [10, /^本科$/u], [11, /^硕士$/u], [12, /^博士$/u],
  [13, /^住宿$/u], [14, /^奖学金$/u], [15, /^(?:申请)?截止(?:日期|时间)?$/u], [16, /^要求$/u], [17, /^备注$/u],
];

export function parseWorkbook(buffer: Buffer, name: string): { rows: ListRow[]; name: string; schools: number; missingColumns: string[] } {
  if (buffer.length < 4 || buffer.length > MAX_WORKBOOK_BYTES || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new WorkbookError("请上传不超过 10 MB 的 .xlsx 名单文件。");
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: "buffer", cellStyles: true, cellFormula: true }); }
  catch { throw new WorkbookError("无法读取名单文件，请检查 Excel 格式。"); }
  const rows: ListRow[] = [];
  const missingColumns = new Set<string>();
  let matchedSheet = false;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    if (range.e.c > 100 || range.e.r > 10010) throw new WorkbookError("名单范围过大，请检查工作表格式。");
    let headerRow = -1, nameColumn = -1;
    for (let r = 0; r <= Math.min(range.e.r, 9); r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const value = normalizedHeader(sheet[XLSX.utils.encode_cell({ r, c })]?.v);
        if (/^(?:院校|学校)名称(?:\(中文\))?$/u.test(value)) { headerRow = r; nameColumn = c; break; }
      }
      if (headerRow >= 0) break;
    }
    if (headerRow < 0) continue;
    matchedSheet = true;
    const columns = new Map<number, number>([[2, nameColumn]]);
    for (let c = 0; c <= range.e.c; c++) {
      const value = normalizedHeader(sheet[XLSX.utils.encode_cell({ r: headerRow, c })]?.v);
      for (const [canonical, pattern] of headerPatterns) if (!columns.has(canonical) && pattern.test(value)) columns.set(canonical, c);
    }
    for (const [column, label] of [[6, "推荐项目"], [10, "本科"], [11, "硕士"], [12, "博士"], [15, "申请截止"], [16, "要求"], [17, "备注"]] as const) {
      if (!columns.has(column)) missingColumns.add(label);
    }
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const cells = Array.from({ length: range.e.c + 1 }, (_, c) => sheet[XLSX.utils.encode_cell({ r, c })]);
      const rawFields = cells.map((cell) => String(cell?.t === "n" && cell.w ? cell.w : cell?.v ?? ""));
      const schoolName = String(rawFields[nameColumn] ?? "").trim();
      if (!schoolName) continue;
      const fields = Array.from({ length: 18 }, (_, i) => rawFields[columns.get(i) ?? -1] ?? "");
      const yellow = cells.some((cell) => cell?.s?.patternType === "solid" && /^(FFF2CA|FFF2CC|FFF3CA)$/i.test(cell?.s?.fgColor?.rgb ?? ""));
      rows.push({ name: schoolName, row: r + 1, sheet: sheetName, fields, rawFields, yellow, image: cells.some((cell) => /DISPIMG\(/i.test(`${cell?.f ?? ""}${cell?.v ?? ""}`)), noCooperation: /不合作|停止合作|暂停合作/.test(rawFields.join(" ")) });
      if (rows.length > 10000) throw new WorkbookError("名单院校过多，请检查工作表格式。");
    }
  }
  if (!matchedSheet || !rows.length) throw new WorkbookError("名单缺少可识别的院校名称列或没有院校数据。");
  return { rows, name: safeName(name), schools: new Set(rows.map((row) => schoolKey(row.name))).size, missingColumns: [...missingColumns] };
}

async function activeVersion(): Promise<string | null> {
  try { return pointerSchema.parse(JSON.parse(await readFile(join(storageDirectory(), "active.json"), "utf8"))).active; }
  catch (error) { if (isMissing(error)) return null; throw new WorkbookError("合作名单配置无法读取，请联系管理员检查。"); }
}

async function versionInfo(id: string): Promise<Version> {
  try {
    const value = versionSchema.parse(JSON.parse(await readFile(join(storageDirectory(), `version-${id}.json`), "utf8")));
    if (value.id !== id) throw new Error("version mismatch");
    return value;
  } catch { throw new WorkbookError("合作名单版本信息无法读取，请联系管理员检查。"); }
}

export async function currentWorkbookInfo(): Promise<WorkbookInfo> {
  const active = await activeVersion();
  if (active) {
    const version = await versionInfo(active);
    let available = true;
    try { await stat(join(storageDirectory(), `workbook-${active}.xlsx`)); }
    catch (error) { if (isMissing(error)) available = false; else throw new WorkbookError("当前合作名单无法读取，请联系管理员检查。"); }
    let canRestore = Boolean(version.previous);
    if (!canRestore) { try { await stat(configuredFile()); canRestore = true; } catch { /* 原名单不可用时不展示恢复入口。 */ } }
    return { name: version.name, version: active, updatedAt: version.uploadedAt, schools: version.schools, available, canRestore };
  }
  const file = configuredFile();
  try { const info = await stat(file); return { name: basename(file), version: null, updatedAt: info.mtime.toISOString(), schools: null, available: true, canRestore: false }; }
  catch (error) { if (isMissing(error)) return { name: basename(file), version: null, updatedAt: null, schools: null, available: false, canRestore: false }; throw new WorkbookError("无法读取合作名单，请联系管理员检查。"); }
}

export async function loadCurrentWorkbook() {
  const info = await currentWorkbookInfo();
  if (!info.available) throw new WorkbookError("找不到合作院校名单，请联系管理员更新。");
  const file = info.version ? join(storageDirectory(), `workbook-${info.version}.xlsx`) : configuredFile();
  try { return parseWorkbook(await readFile(file), info.name); }
  catch (error) { if (error instanceof WorkbookError) throw error; throw new WorkbookError("无法读取合作院校名单，请联系管理员检查。"); }
}

export async function previewWorkbook(buffer: Buffer, name: string, expectedVersion: string | null): Promise<WorkbookPreview> {
  if (!/\.xlsx$/iu.test(name)) throw new WorkbookError("请选择 .xlsx 格式的合作院校名单。");
  const parsed = parseWorkbook(buffer, name);
  if (await activeVersion() !== expectedVersion) throw new WorkbookError("名单已被其他管理员更新，请刷新后再试。");
  let oldSchools: Set<string> | null = null;
  try { oldSchools = new Set((await loadCurrentWorkbook()).rows.map((row) => schoolKey(row.name))); } catch { /* 允许用新名单修复不可读取的原名单。 */ }
  if (await activeVersion() !== expectedVersion) throw new WorkbookError("名单已被其他管理员更新，请刷新后再试。");
  const schools = new Set(parsed.rows.map((row) => schoolKey(row.name)));
  return {
    name: parsed.name, version: expectedVersion, rows: parsed.rows.length, schools: schools.size,
    notCooperating: new Set(parsed.rows.filter((row) => row.noCooperation).map((row) => schoolKey(row.name))).size,
    added: oldSchools ? [...schools].filter((key) => !oldSchools!.has(key)).length : null,
    removed: oldSchools ? [...oldSchools].filter((key) => !schools.has(key)).length : null,
    missingColumns: parsed.missingColumns, hash: createHash("sha256").update(buffer).digest("hex"),
  };
}

async function withUpdateLock<T>(run: () => Promise<T>): Promise<T> {
  const directory = storageDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, "update.lock");
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) { if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") throw new WorkbookError("已有名单更新正在进行，请稍后重试。"); throw new WorkbookError("无法写入名单，请联系管理员检查目录权限。"); }
  try { return await run(); }
  finally { await lock.close(); await unlink(lockPath); }
}

async function writePointer(active: string | null) {
  const temporary = join(storageDirectory(), `active-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify({ active }), { flag: "wx", mode: 0o600 });
  await rename(temporary, join(storageDirectory(), "active.json"));
}

export async function replaceWorkbook(buffer: Buffer, name: string, expectedVersion: string | null, expectedHash?: string): Promise<WorkbookInfo> {
  if (!/\.xlsx$/iu.test(name)) throw new WorkbookError("请选择 .xlsx 格式的合作院校名单。");
  if (expectedHash && createHash("sha256").update(buffer).digest("hex") !== expectedHash) throw new WorkbookError("文件内容已改变，请重新检查名单。");
  const parsed = parseWorkbook(buffer, name);
  return withUpdateLock(async () => {
    const previous = await activeVersion();
    if (previous !== expectedVersion) throw new WorkbookError("名单已被其他管理员更新，请刷新后再试。");
    const id = randomUUID();
    const version: Version = { id, name: parsed.name, uploadedAt: new Date().toISOString(), rows: parsed.rows.length, schools: parsed.schools, previous };
    await writeFile(join(storageDirectory(), `workbook-${id}.xlsx`), buffer, { flag: "wx", mode: 0o600 });
    await writeFile(join(storageDirectory(), `version-${id}.json`), JSON.stringify(version), { flag: "wx", mode: 0o600 });
    await writePointer(id);
    return { name: version.name, version: id, updatedAt: version.uploadedAt, schools: version.schools, available: true, canRestore: true };
  });
}

export async function restorePreviousWorkbook(expectedVersion: string): Promise<WorkbookInfo> {
  return withUpdateLock(async () => {
    const active = await activeVersion();
    if (!active || active !== expectedVersion) throw new WorkbookError("名单已被其他管理员更新，请刷新后再试。");
    const current = await versionInfo(active);
    if (current.previous) {
      const previous = await versionInfo(current.previous);
      try { parseWorkbook(await readFile(join(storageDirectory(), `workbook-${previous.id}.xlsx`)), previous.name); }
      catch { throw new WorkbookError("上一版名单无法读取，未切换当前名单。"); }
    } else {
      try { parseWorkbook(await readFile(configuredFile()), basename(configuredFile())); }
      catch { throw new WorkbookError("原名单无法读取，未切换当前名单。"); }
    }
    await writePointer(current.previous);
    return currentWorkbookInfo();
  });
}

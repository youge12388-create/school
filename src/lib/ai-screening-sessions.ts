import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ChatCriteria } from "@/lib/ai-screening";
import type { ScreeningResponse, ScreeningRunMode, SearchStep } from "@/lib/ai-screening-events";
import type { DraftPlan } from "@/lib/ai-screening-plan";

export type PersistedSavedPlan = {
  id: string;
  title: string;
  studentName: string | null;
  schoolCount: number;
  programCount: number;
  createdAt: number;
};

export type PersistedTurn = {
  id: number;
  question: string;
  runMode: ScreeningRunMode;
  criteriaBefore: ChatCriteria;
  sensitiveBefore: boolean;
  focusBefore: string | null;
  showOther: boolean;
  providedCriteria?: ChatCriteria;
  steps: SearchStep[];
  result?: ScreeningResponse;
  error?: string;
  revealed?: { programIds: string[]; schoolNames: string[] };
  startedAt?: number;
  durationMs?: number;
};

export type ScreeningSessionSummary = {
  id: string;
  title: string;
  runMode: ScreeningRunMode;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  turnCount: number;
  preview: string;
  criteriaTags: string[];
};

export type ScreeningSessionRecord = ScreeningSessionSummary & {
  userId: string;
  criteria: ChatCriteria;
  sensitiveContext: boolean;
  focusSchool: string | null;
  turns: PersistedTurn[];
  draft: DraftPlan | null;
  savedPlan: PersistedSavedPlan | null;
};

export type SaveSessionInput = {
  id?: string;
  title?: string;
  pinned?: boolean;
  runMode: ScreeningRunMode;
  criteria: ChatCriteria;
  sensitiveContext: boolean;
  focusSchool: string | null;
  turns: PersistedTurn[];
  draft: DraftPlan | null;
  savedPlan: PersistedSavedPlan | null;
};

const MAX_SESSIONS_PER_USER = 100;
const MAX_SESSION_BYTES = 2 * 1024 * 1024;
const SAFE_ID_RE = /^[A-Za-z0-9_-]{4,80}$/;

export function resolveSessionsRootDir(customBaseDir?: string): string {
  if (customBaseDir) return customBaseDir;
  const dbPath = process.env.DATABASE_PATH?.trim() || "./data/app.db";
  const dataDir = path.dirname(path.resolve(process.cwd(), dbPath));
  return path.join(dataDir, "ai-screening-sessions");
}

function sanitizeUserFolder(userId: string): string {
  const cleaned = userId.trim().replace(/[^A-Za-z0-9_-]/g, "_");
  if (!cleaned) throw new Error("无效的用户标识");
  if (cleaned.length <= 64 && cleaned === userId.trim()) return cleaned;
  const hash = crypto.createHash("sha256").update(userId).digest("hex").slice(0, 16);
  return `${cleaned.slice(0, 32)}_${hash}`;
}

function validateSessionId(sessionId: string): string {
  const id = sessionId.trim();
  if (!SAFE_ID_RE.test(id)) {
    throw new Error("无效的会话 ID");
  }
  return id;
}

function userDir(userId: string, baseDir?: string): string {
  return path.join(resolveSessionsRootDir(baseDir), sanitizeUserFolder(userId));
}

function sessionFilePath(userId: string, sessionId: string, baseDir?: string): string {
  const dir = userDir(userId, baseDir);
  const safeId = validateSessionId(sessionId);
  const target = path.resolve(dir, `${safeId}.json`);
  const resolvedDir = path.resolve(dir);
  if (!target.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new Error("非法的会话路径");
  }
  return target;
}

function degreeShort(programType?: string | null): string | null {
  if (programType === "UG") return "本科";
  if (programType === "MASTER") return "硕士";
  if (programType === "PHD") return "博士";
  if (programType === "LONG_TERM") return "长期语言";
  if (programType === "SHORT_TERM") return "短期项目";
  return null;
}

export function extractSessionCriteriaTags(criteria: ChatCriteria): string[] {
  const tags: string[] = [];
  if (criteria.nationality) tags.push(`${criteria.nationality}籍`);
  const deg = degreeShort(criteria.programType);
  if (deg) tags.push(deg);
  const major = criteria.targetMajors?.[0] ?? criteria.targetMajor;
  if (major) tags.push(major.slice(0, 12));
  const city = criteria.cities?.[0] ?? criteria.city;
  if (city) tags.push(city);
  if (criteria.teachingLanguage === "ENGLISH") tags.push("英授");
  else if (criteria.teachingLanguage === "CHINESE") tags.push("中授");
  if (criteria.intakeYear) tags.push(`${criteria.intakeYear}入学`);
  return tags.slice(0, 4);
}

export function deriveSessionTitle(criteria: ChatCriteria, turns: PersistedTurn[], explicitTitle?: string): string {
  const trimmed = explicitTitle?.trim();
  if (trimmed) return trimmed.slice(0, 60);

  const parts: string[] = [];
  if (criteria.nationality) parts.push(criteria.nationality);
  const city = criteria.cities?.length ? criteria.cities.slice(0, 2).join("/") : criteria.city;
  if (city) parts.push(city);
  const major = criteria.targetMajors?.[0] ?? criteria.targetMajor;
  if (major) parts.push(major.slice(0, 14));
  const deg = degreeShort(criteria.programType);
  if (deg) parts.push(`${criteria.teachingLanguage === "ENGLISH" ? "英授" : ""}${deg}`);

  if (parts.length >= 2) {
    return parts.join(" · ").slice(0, 42);
  }

  const firstQuestion = turns[0]?.question?.replace(/\s+/g, " ").trim();
  if (firstQuestion) {
    const cleaned = firstQuestion
      .replace(/^(?:【[^】]{1,28}】\s*)/u, "")
      .replace(/^(?:学生基础|筛选强制条件|模式[一二三][:：]?\s*)/u, "")
      .trim();
    const base = cleaned || firstQuestion;
    return base.length > 28 ? `${base.slice(0, 28)}…` : base;
  }

  return "新建选校对话";
}

function derivePreview(turns: PersistedTurn[]): string {
  const last = turns[turns.length - 1];
  if (!last) return "";
  const lead = last.result?.narrative?.lead ?? last.result?.answer?.lead ?? last.question;
  const flat = lead.replace(/\s+/g, " ").trim();
  return flat.length > 72 ? `${flat.slice(0, 72)}…` : flat;
}

function toSummary(record: ScreeningSessionRecord): ScreeningSessionSummary {
  return {
    id: record.id,
    title: record.title,
    runMode: record.runMode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    pinned: Boolean(record.pinned),
    turnCount: record.turns.length,
    preview: record.preview,
    criteriaTags: record.criteriaTags ?? [],
  };
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const raw = JSON.stringify(data);
  if (Buffer.byteLength(raw, "utf-8") > MAX_SESSION_BYTES) {
    throw new Error("会话数据超过体积上限（2MB），请开启新对话继续。");
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, raw, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function pruneOldSessions(userId: string, baseDir?: string): void {
  const summaries = listUserSessions(userId, baseDir);
  if (summaries.length <= MAX_SESSIONS_PER_USER) return;
  const removable = summaries.filter((s) => !s.pinned).slice(MAX_SESSIONS_PER_USER - summaries.filter((s) => s.pinned).length);
  for (const item of removable) {
    try {
      fs.unlinkSync(sessionFilePath(userId, item.id, baseDir));
    } catch {
      // Ignore cleanup race.
    }
  }
}

export function listUserSessions(userId: string, baseDir?: string): ScreeningSessionSummary[] {
  const dir = userDir(userId, baseDir);
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const summaries: ScreeningSessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const full = path.join(dir, entry.name);
    try {
      const parsed = JSON.parse(fs.readFileSync(full, "utf-8")) as Partial<ScreeningSessionRecord>;
      if (!parsed.id || !SAFE_ID_RE.test(parsed.id)) continue;
      summaries.push({
        id: parsed.id,
        title: parsed.title || "未命名选校对话",
        runMode: parsed.runMode || "partner_priority",
        createdAt: Number(parsed.createdAt) || 0,
        updatedAt: Number(parsed.updatedAt) || 0,
        pinned: Boolean(parsed.pinned),
        turnCount: Array.isArray(parsed.turns) ? parsed.turns.length : Number(parsed.turnCount) || 0,
        preview: parsed.preview || "",
        criteriaTags: Array.isArray(parsed.criteriaTags) ? parsed.criteriaTags : [],
      });
    } catch {
      // Skip malformed session files without affecting others.
    }
  }

  summaries.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  return summaries;
}

export function getUserSession(userId: string, sessionId: string, baseDir?: string): ScreeningSessionRecord | null {
  let file: string;
  try {
    file = sessionFilePath(userId, sessionId, baseDir);
  } catch {
    return null;
  }
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as ScreeningSessionRecord;
    if (parsed.userId && parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveUserSession(userId: string, input: SaveSessionInput, baseDir?: string): ScreeningSessionSummary {
  const now = Date.now();
  const id = input.id ? validateSessionId(input.id) : `ses_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const existing = getUserSession(userId, id, baseDir);

  const sanitizedTurns: PersistedTurn[] = (input.turns ?? []).slice(-40).map((turn) => ({
    ...turn,
    steps: (turn.steps ?? []).slice(-12),
  }));

  const isAutoDefaultTitle = !existing?.title || existing.title === "新建选校对话";
  const effectiveTitle = input.title?.trim()
    ? input.title.trim().slice(0, 60)
    : isAutoDefaultTitle
      ? deriveSessionTitle(input.criteria ?? {}, sanitizedTurns)
      : existing.title;

  const record: ScreeningSessionRecord = {
    id,
    userId,
    title: effectiveTitle,
    runMode: input.runMode ?? existing?.runMode ?? "partner_priority",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    pinned: input.pinned ?? existing?.pinned ?? false,
    turnCount: sanitizedTurns.length,
    preview: derivePreview(sanitizedTurns),
    criteriaTags: extractSessionCriteriaTags(input.criteria ?? {}),
    criteria: input.criteria ?? {},
    sensitiveContext: Boolean(input.sensitiveContext),
    focusSchool: input.focusSchool ?? null,
    turns: sanitizedTurns,
    draft: input.draft ?? null,
    savedPlan: input.savedPlan ?? null,
  };

  atomicWriteJson(sessionFilePath(userId, id, baseDir), record);
  pruneOldSessions(userId, baseDir);
  return toSummary(record);
}

export function updateUserSessionMeta(
  userId: string,
  sessionId: string,
  patch: { title?: string; pinned?: boolean },
  baseDir?: string,
): ScreeningSessionSummary | null {
  const existing = getUserSession(userId, sessionId, baseDir);
  if (!existing) return null;
  const next: ScreeningSessionRecord = {
    ...existing,
    ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 60) || existing.title } : {}),
    ...(patch.pinned !== undefined ? { pinned: Boolean(patch.pinned) } : {}),
    updatedAt: Date.now(),
  };
  atomicWriteJson(sessionFilePath(userId, existing.id, baseDir), next);
  return toSummary(next);
}

export function deleteUserSession(userId: string, sessionId: string, baseDir?: string): boolean {
  let file: string;
  try {
    file = sessionFilePath(userId, sessionId, baseDir);
  } catch {
    return false;
  }
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteUserSession,
  deriveSessionTitle,
  getUserSession,
  listUserSessions,
  saveUserSession,
  updateUserSessionMeta,
} from "@/lib/ai-screening-sessions";

describe("ai-screening-sessions persistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "school-syt-sessions-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("derives readable titles from structured criteria and falls back to question text", () => {
    const titleFromCriteria = deriveSessionTitle(
      {
        nationality: "俄罗斯",
        cities: ["北京", "上海"],
        targetMajor: "可持续建筑",
        programType: "MASTER",
        teachingLanguage: "ENGLISH",
      },
      [],
    );
    expect(titleFromCriteria).toContain("俄罗斯");
    expect(titleFromCriteria).toContain("北京/上海");
    expect(titleFromCriteria).toContain("可持续建筑");

    const titleFromQuestion = deriveSessionTitle(
      {},
      [{
        id: 1,
        question: "【来华留学院校匹配】请帮我筛选一下 2027 年上海英语授课国际关系本科项目",
        runMode: "partner_priority",
        criteriaBefore: {},
        sensitiveBefore: false,
        focusBefore: null,
        showOther: false,
        steps: [],
      }],
    );
    expect(titleFromQuestion).toContain("上海英语授课");
  });

  it("persists, lists (pinned first), reloads, updates meta, and deletes user sessions", () => {
    const first = saveUserSession("user-a", {
      runMode: "partner_priority",
      criteria: { nationality: "孟加拉", programType: "UG", targetMajor: "计算机" },
      sensitiveContext: true,
      focusSchool: null,
      turns: [{
        id: 1,
        question: "孟加拉籍本科计算机选校",
        runMode: "partner_priority",
        criteriaBefore: {},
        sensitiveBefore: false,
        focusBefore: null,
        showOther: false,
        steps: [{ id: "understand", status: "done", message: "ok", progress: 22 }],
      }],
      draft: null,
      savedPlan: null,
    }, tmpDir);

    const second = saveUserSession("user-a", {
      runMode: "standard_all",
      criteria: { city: "上海", programType: "MASTER", targetMajor: "绿色建筑" },
      sensitiveContext: false,
      focusSchool: null,
      turns: [{
        id: 1,
        question: "上海绿色建筑硕士",
        runMode: "standard_all",
        criteriaBefore: {},
        sensitiveBefore: false,
        focusBefore: null,
        showOther: false,
        steps: [],
      }],
      draft: null,
      savedPlan: null,
    }, tmpDir);

    const pinnedFirst = updateUserSessionMeta("user-a", first.id, { title: "重点客户-孟加拉CS", pinned: true }, tmpDir);
    expect(pinnedFirst?.title).toBe("重点客户-孟加拉CS");
    expect(pinnedFirst?.pinned).toBe(true);

    const list = listUserSessions("user-a", tmpDir);
    expect(list.map((s) => s.id)).toEqual([first.id, second.id]);

    const loaded = getUserSession("user-a", first.id, tmpDir);
    expect(loaded?.turns.length).toBe(1);
    expect(loaded?.criteria.targetMajor).toBe("计算机");

    expect(deleteUserSession("user-a", second.id, tmpDir)).toBe(true);
    expect(listUserSessions("user-a", tmpDir).map((s) => s.id)).toEqual([first.id]);
  });

  it("isolates sessions between users and blocks path traversal session ids", () => {
    const saved = saveUserSession("user-alpha", {
      runMode: "partner_quick",
      criteria: { programType: "LONG_TERM" },
      sensitiveContext: false,
      focusSchool: null,
      turns: [],
      draft: null,
      savedPlan: null,
    }, tmpDir);

    expect(getUserSession("user-beta", saved.id, tmpDir)).toBeNull();
    expect(updateUserSessionMeta("user-beta", saved.id, { title: "hack" }, tmpDir)).toBeNull();
    expect(deleteUserSession("user-beta", saved.id, tmpDir)).toBe(false);
    expect(getUserSession("user-alpha", "../user-beta/evil", tmpDir)).toBeNull();
    expect(() => saveUserSession("user-alpha", {
      id: "../escape",
      runMode: "partner_priority",
      criteria: {},
      sensitiveContext: false,
      focusSchool: null,
      turns: [],
      draft: null,
      savedPlan: null,
    }, tmpDir)).toThrow(/无效的会话 ID/);
  });
});

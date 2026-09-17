import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchWeComOrganization } = vi.hoisted(() => ({
  fetchWeComOrganization: vi.fn(),
}));

vi.mock("@/lib/wecom", () => ({ fetchWeComOrganization }));

import { migrateDatabase } from "@/lib/db/migration";
import {
  syncWeComOrganization,
  listWeComMembers,
  updateWeComDepartmentRole,
  updateWeComUserAccess,
  upsertWeComLogin,
  WeComAccessError,
} from "@/lib/wecom-service";

const tempDirs: string[] = [];
const openDatabases: DatabaseSync[] = [];

afterEach(() => {
  fetchWeComOrganization.mockReset();
  for (const database of openDatabases.splice(0)) database.close();
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function openDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "school-syt-wecom-"));
  tempDirs.push(directory);
  const path = join(directory, "app.db");
  migrateDatabase(path);
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  openDatabases.push(database);
  return database;
}

function addDepartment(database: DatabaseSync, id: number, name: string, parentId = 1) {
  database
    .prepare(
      `INSERT INTO wecom_departments
       (id, name, parent_id, display_order, synced_at, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(id, name, parentId, Date.now(), Date.now(), Date.now());
}

function addAdmin(database: DatabaseSync) {
  database
    .prepare(
      `INSERT INTO users
       (id, username, display_name, password_hash, auth_provider, wecom_enabled, role, active)
       VALUES ('admin-1', 'admin', '管理员', 'hash', 'LOCAL', 1, 'ADMIN', 1)`,
    )
    .run();
}

describe("WeCom identity persistence", () => {
  it("creates an external account and resolves the highest mapped role", () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addDepartment(database, 3, "数据部");
    addAdmin(database);
    database
      .prepare(
        "INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (2, 'MARKET_MANAGER', 'admin-1'), (3, 'DATA_MANAGER', 'admin-1')",
      )
      .run();

    const result = upsertWeComLogin({
      userId: "zhangsan",
      displayName: "张三",
      departmentIds: [2, 3],
      enabled: true,
    }, database);

    expect(result.role).toBe("DATA_MANAGER");
    expect(database.prepare("SELECT auth_provider AS provider, role, active FROM users WHERE id = ?").get(result.userId)).toMatchObject({
      provider: "WECOM",
      role: "DATA_MANAGER",
      active: 1,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM wecom_user_departments WHERE user_id = ?").get(result.userId)).toEqual({ count: 2 });
  });

  it("denies an external account when no department role is mapped", () => {
    const database = openDatabase();
    addDepartment(database, 2, "未配置部");

    expect(() => upsertWeComLogin({
      userId: "unmapped",
      displayName: "未配置",
      departmentIds: [2],
      enabled: true,
    }, database)).toThrow(WeComAccessError);
  });

  it("does not inherit a role from a mapped parent department", () => {
    const database = openDatabase();
    addDepartment(database, 1, "企业", 0);
    addDepartment(database, 2, "申请服务部", 1);
    addAdmin(database);
    // 父部门配置了 ADVISOR，但子部门未单独配置
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (1, 'ADVISOR', 'admin-1')")
      .run();

    // 成员仅属于子部门 → 不继承父部门角色，拒绝登录
    expect(() => upsertWeComLogin({
      userId: "child-member",
      displayName: "子部门成员",
      departmentIds: [2],
      enabled: true,
    }, database)).toThrow(WeComAccessError);
  });

  it("allows a member with an individual role when the department is not mapped", async () => {
    const database = openDatabase();
    addDepartment(database, 2, "申请服务部");
    addAdmin(database);
    fetchWeComOrganization.mockResolvedValue({
      departments: [{ id: 2, name: "申请服务部", parentId: 1, displayOrder: 0 }],
      members: [{
        userId: "individual-allow",
        displayName: "单独允许",
        departmentIds: [2],
        enabled: true,
      }],
    });

    await syncWeComOrganization("admin-1", database);
    const account = database
      .prepare("SELECT id, active FROM users WHERE wecom_user_id = ?")
      .get("individual-allow") as { id: string; active: number };
    expect(account.active).toBe(0);

    updateWeComUserAccess(account.id, "ROLE", "DATA_MANAGER", "admin-1", database);

    expect(upsertWeComLogin({
      userId: "individual-allow",
      displayName: "单独允许",
      departmentIds: [2],
      enabled: true,
    }, database)).toMatchObject({ role: "DATA_MANAGER" });
    expect(listWeComMembers(database)[0]).toMatchObject({
      accessMode: "ROLE",
      accessRole: "DATA_MANAGER",
      role: "DATA_MANAGER",
      canLogin: true,
    });
  });

  it("applies custom department permissions and revokes sessions when they change", () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addAdmin(database);

    updateWeComDepartmentRole(
      "2",
      "ADVISOR",
      "admin-1",
      database,
      { source: "CUSTOM", permissions: ["WORKSPACE_VIEW", "SCHOOL_VIEW_PUBLIC"] },
    );
    const account = upsertWeComLogin({
      userId: "custom-department",
      displayName: "部门自定义",
      departmentIds: [2],
      enabled: true,
    }, database);

    expect(listWeComMembers(database)[0]).toMatchObject({
      permissionSource: "CUSTOM",
      permissions: ["WORKSPACE_VIEW", "SCHOOL_VIEW_PUBLIC"],
    });
    database
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at)
         VALUES ('session-permission-change', ?, 'hash-permission-change', ?, ?)`,
      )
      .run(account.userId, Date.now() + 60_000, Date.now());

    updateWeComDepartmentRole(
      "2",
      "ADVISOR",
      "admin-1",
      database,
      {
        source: "CUSTOM",
        permissions: ["WORKSPACE_VIEW", "SCHOOL_VIEW_PUBLIC", "AUDIT_VIEW"],
      },
    );

    expect(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(account.userId)).toEqual({ count: 0 });
    expect(listWeComMembers(database)[0].permissions).toEqual([
      "WORKSPACE_VIEW",
      "SCHOOL_VIEW_PUBLIC",
      "AUDIT_VIEW",
    ]);
  });

  it("supports a custom member permission set while retaining the selected role", () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addAdmin(database);
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (2, 'ADVISOR', 'admin-1')")
      .run();
    const account = upsertWeComLogin({
      userId: "custom-member",
      displayName: "成员自定义",
      departmentIds: [2],
      enabled: true,
    }, database);

    updateWeComUserAccess(
      account.userId,
      "ROLE",
      "ADVISOR",
      "admin-1",
      database,
      { source: "CUSTOM", permissions: ["WORKSPACE_VIEW", "CUSTOMER_VIEW"] },
    );

    expect(listWeComMembers(database)[0]).toMatchObject({
      accessMode: "ROLE",
      accessRole: "ADVISOR",
      permissionSource: "CUSTOM",
      permissions: ["WORKSPACE_VIEW", "CUSTOMER_VIEW"],
    });
  });

  it("rejects unknown permission identifiers at the persistence boundary", () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addAdmin(database);

    expect(() => updateWeComDepartmentRole(
      "2",
      "ADVISOR",
      "admin-1",
      database,
      { source: "CUSTOM", permissions: ["WORKSPACE_VIEW", "NOT_A_PERMISSION"] },
    )).toThrow("权限标识无效");
    expect(database.prepare("SELECT COUNT(*) AS count FROM wecom_department_roles").get()).toEqual({ count: 0 });
  });

  it("blocks an individually denied member and revokes existing sessions", () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addAdmin(database);
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (2, 'ADVISOR', 'admin-1')")
      .run();
    const account = upsertWeComLogin({
      userId: "individual-deny",
      displayName: "单独禁止",
      departmentIds: [2],
      enabled: true,
    }, database);
    database
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at)
         VALUES ('session-denied', ?, 'hash-denied', ?, ?)`,
      )
      .run(account.userId, Date.now() + 60_000, Date.now());

    updateWeComUserAccess(account.userId, "DENY", "", "admin-1", database);

    expect(database.prepare("SELECT active FROM users WHERE id = ?").get(account.userId)).toEqual({ active: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(account.userId)).toEqual({ count: 0 });
    expect(listWeComMembers(database)[0]).toMatchObject({
      accessMode: "DENY",
      accessRole: null,
      role: null,
      canLogin: false,
      accessReason: "个人权限已禁止登录",
    });
    expect(() => upsertWeComLogin({
      userId: "individual-deny",
      displayName: "单独禁止",
      departmentIds: [2],
      enabled: true,
    }, database)).toThrow(WeComAccessError);
  });

  it("keeps an individual role across department changes and restores inheritance", () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addAdmin(database);
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (2, 'ADVISOR', 'admin-1')")
      .run();
    const account = upsertWeComLogin({
      userId: "individual-inherit",
      displayName: "恢复继承",
      departmentIds: [2],
      enabled: true,
    }, database);

    updateWeComUserAccess(account.userId, "ROLE", "DATA_MANAGER", "admin-1", database);
    updateWeComDepartmentRole("2", "", "admin-1", database);
    expect(database.prepare("SELECT role, active FROM users WHERE id = ?").get(account.userId)).toEqual({
      role: "DATA_MANAGER",
      active: 1,
    });

    updateWeComUserAccess(account.userId, "INHERIT", "", "admin-1", database);
    expect(database.prepare("SELECT role, active FROM users WHERE id = ?").get(account.userId)).toEqual({
      role: "ADVISOR",
      active: 0,
    });
    expect(listWeComMembers(database)[0]).toMatchObject({
      accessMode: "INHERIT",
      accessRole: null,
      role: null,
      canLogin: false,
      accessReason: "所属部门未配置登录角色",
    });
  });

  it("preserves an individual role during organization sync", async () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addAdmin(database);
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (2, 'ADVISOR', 'admin-1')")
      .run();
    const account = upsertWeComLogin({
      userId: "individual-sync",
      displayName: "同步保留",
      departmentIds: [2],
      enabled: true,
    }, database);
    updateWeComUserAccess(account.userId, "ROLE", "DATA_MANAGER", "admin-1", database);
    fetchWeComOrganization.mockResolvedValue({
      departments: [{ id: 2, name: "顾问部", parentId: 1, displayOrder: 0 }],
      members: [{
        userId: "individual-sync",
        displayName: "同步保留",
        departmentIds: [2],
        enabled: true,
      }],
    });

    await syncWeComOrganization("admin-1", database);

    expect(listWeComMembers(database)[0]).toMatchObject({
      accessMode: "ROLE",
      accessRole: "DATA_MANAGER",
      role: "DATA_MANAGER",
      canLogin: true,
    });
  });

  it("resolves role only from direct departments and lists only them as the source", () => {
    const database = openDatabase();
    addDepartment(database, 1, "企业", 0);
    addDepartment(database, 2, "申请服务部", 1);
    addAdmin(database);
    // 父部门配置 ADMIN（更高优先级），子部门配置 ADVISOR：成员仅在子部门时应取子部门角色
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (1, 'ADMIN', 'admin-1'), (2, 'ADVISOR', 'admin-1')")
      .run();

    const result = upsertWeComLogin({
      userId: "child-member",
      displayName: "子部门成员",
      departmentIds: [2],
      enabled: true,
    }, database);

    expect(result.role).toBe("ADVISOR");
    const member = listWeComMembers(database)[0];
    expect(member).toMatchObject({
      displayName: "子部门成员",
      role: "ADVISOR",
      canLogin: true,
      accessReason: "可登录",
    });
    // 权限来源只列直接部门（子部门），父部门不在列表中
    expect(member.departments).toEqual([
      { id: 2, path: "企业 / 申请服务部", role: "ADVISOR" },
    ]);
  });

  it("recomputes access and revokes sessions when a department mapping is removed", () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addAdmin(database);
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (2, 'ADVISOR', 'admin-1')")
      .run();
    const account = upsertWeComLogin({
      userId: "lisi",
      displayName: "李四",
      departmentIds: [2],
      enabled: true,
    }, database);
    database
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at)
         VALUES ('session-1', ?, 'hash-1', ?, ?)`,
      )
      .run(account.userId, Date.now() + 60_000, Date.now());

    updateWeComDepartmentRole("2", "", "admin-1", database);

    expect(database.prepare("SELECT active FROM users WHERE id = ?").get(account.userId)).toEqual({ active: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(account.userId)).toEqual({ count: 0 });
  });

  it("disables and signs out members missing from a complete organization snapshot", async () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addAdmin(database);
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (2, 'ADVISOR', 'admin-1')")
      .run();
    const account = upsertWeComLogin({
      userId: "departed-member",
      displayName: "离职成员",
      departmentIds: [2],
      enabled: true,
    }, database);
    database
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at)
         VALUES ('session-departed', ?, 'hash-departed', ?, ?)`,
      )
      .run(account.userId, Date.now() + 60_000, Date.now());
    fetchWeComOrganization.mockResolvedValue({
      departments: [{ id: 2, name: "顾问部", parentId: 1, displayOrder: 0 }],
      members: [],
    });

    await expect(syncWeComOrganization("admin-1", database)).resolves.toMatchObject({
      disabledUsers: 1,
    });
    expect(database.prepare("SELECT active, wecom_enabled AS wecomEnabled FROM users WHERE id = ?").get(account.userId)).toEqual({
      active: 0,
      wecomEnabled: 0,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(account.userId)).toEqual({ count: 0 });
  });

  it("does not disable a missing member when its department scope is incomplete", async () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addDepartment(database, 3, "历史部门");
    addAdmin(database);
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (2, 'ADVISOR', 'admin-1')")
      .run();
    const account = upsertWeComLogin({
      userId: "unverified-member",
      displayName: "待确认成员",
      departmentIds: [2, 3],
      enabled: true,
    }, database);
    database
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at)
         VALUES ('session-unverified', ?, 'hash-unverified', ?, ?)`,
      )
      .run(account.userId, Date.now() + 60_000, Date.now());
    fetchWeComOrganization.mockResolvedValue({
      departments: [{ id: 2, name: "顾问部", parentId: 1, displayOrder: 0 }],
      members: [],
    });

    await syncWeComOrganization("admin-1", database);

    expect(database.prepare("SELECT active, wecom_enabled AS wecomEnabled FROM users WHERE id = ?").get(account.userId)).toEqual({
      active: 1,
      wecomEnabled: 1,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(account.userId)).toEqual({ count: 1 });
  });

  it("uses a collision-resistant username for a new enterprise WeChat account", () => {
    const database = openDatabase();
    addDepartment(database, 2, "顾问部");
    addAdmin(database);
    database
      .prepare("INSERT INTO wecom_department_roles (department_id, role, updated_by) VALUES (2, 'ADVISOR', 'admin-1')")
      .run();
    database
      .prepare(
        `INSERT INTO users
         (id, username, display_name, password_hash, auth_provider, wecom_enabled, role, active)
         VALUES ('local-collision', 'wecom:zhangsan', '本地账号', 'hash', 'LOCAL', 1, 'ADVISOR', 1)`,
      )
      .run();

    const account = upsertWeComLogin({
      userId: "zhangsan",
      displayName: "张三",
      departmentIds: [2],
      enabled: true,
    }, database);

    expect(database.prepare("SELECT username, auth_provider AS provider FROM users WHERE id = ?").get(account.userId)).toEqual({
      username: expect.not.stringMatching(/^wecom:zhangsan$/),
      provider: "WECOM",
    });
  });
});

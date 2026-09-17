import { describe, expect, it } from "vitest";

import type { UserRole } from "@/lib/constants";
import {
  defaultPermissionsForRole,
  canEditConfidentialSchoolFields,
  canEditSchool,
  canEditSchoolNote,
  canManageImports,
  canManageSchoolUpdates,
  canViewConfidentialSchoolFields,
  canViewSchoolUpdateSecret,
  isMarketManager,
  stripConfidentialSchoolData,
  stripConfidentialSchoolUpdates,
  normalizePermissionSet,
  PERMISSION_KEYS,
} from "@/lib/permissions";

const ROLES: UserRole[] = [
  "ADMIN",
  "ADVISOR",
  "DATA_MANAGER",
  "CHANNEL_RESOURCE",
  "MARKET_MANAGER",
];

describe("permissions", () => {
  it("exposes a workspace-safe template for every login role", () => {
    for (const role of ROLES) {
      const permissions = defaultPermissionsForRole(role);
      expect(permissions).toContain("WORKSPACE_VIEW");
      expect(new Set(permissions).size).toBe(permissions.length);
    }
    expect(defaultPermissionsForRole("ADMIN")).toEqual([...PERMISSION_KEYS]);
    expect(defaultPermissionsForRole("ADVISOR")).toContain("AUDIT_VIEW");
    expect(defaultPermissionsForRole("CHANNEL_RESOURCE")).toContain("AUDIT_VIEW");
    expect(defaultPermissionsForRole("MARKET_MANAGER")).not.toContain("AUDIT_VIEW");
  });

  it("normalizes custom permissions and rejects unknown or non-loginable sets", () => {
    expect(normalizePermissionSet(["DOCUMENT_UPLOAD", "WORKSPACE_VIEW", "DOCUMENT_UPLOAD"])).toEqual([
      "WORKSPACE_VIEW",
      "DOCUMENT_UPLOAD",
    ]);
    expect(() => normalizePermissionSet(["UNKNOWN_PERMISSION"])).toThrow("权限标识无效");
    expect(() => normalizePermissionSet([])).toThrow("工作台访问权限");
  });

  it("ADMIN and DATA_MANAGER can view confidential school fields", () => {
    for (const role of ROLES) {
      expect(canViewConfidentialSchoolFields(role)).toBe(
        role === "ADMIN" || role === "DATA_MANAGER",
      );
    }
  });

  it("only ADMIN can edit or import confidential school fields", () => {
    for (const role of ROLES) {
      expect(canEditConfidentialSchoolFields(role)).toBe(role === "ADMIN");
    }
  });

  it("editors and import managers are ADMIN, DATA_MANAGER and CHANNEL_RESOURCE", () => {
    const expected = (role: UserRole) =>
      role === "ADMIN" ||
      role === "DATA_MANAGER" ||
      role === "CHANNEL_RESOURCE";
    for (const role of ROLES) {
      expect(canEditSchool(role)).toBe(expected(role));
      expect(canManageImports(role)).toBe(expected(role));
    }
  });

  it("all active roles can maintain ordinary school notes", () => {
    for (const role of ROLES) {
      expect(canEditSchoolNote(role)).toBe(true);
    }
  });

  it("only MARKET_MANAGER is the market manager view", () => {
    for (const role of ROLES) {
      expect(isMarketManager(role)).toBe(role === "MARKET_MANAGER");
    }
  });

  it("only ADMIN and DATA_MANAGER manage school updates and view secrets", () => {
    const expected = (role: UserRole) =>
      role === "ADMIN" || role === "DATA_MANAGER";
    for (const role of ROLES) {
      expect(canManageSchoolUpdates(role)).toBe(expected(role));
      expect(canViewSchoolUpdateSecret(role)).toBe(expected(role));
    }
  });

  it("strips confidential keys from update payloads", () => {
    const updates = {
      nameZh: "深圳大学",
      province: "广东",
      recruitmentPreferenceText: "偏好华南生源",
      cooperationNote: "内部备注",
    };
    const result = stripConfidentialSchoolUpdates(updates);
    expect(result.nameZh).toBe("深圳大学");
    expect(result.province).toBe("广东");
    expect(result.recruitmentPreferenceText).toBeUndefined();
    expect(result.cooperationNote).toBeUndefined();
  });

  it("strips confidential keys and raw Excel values from import rows", () => {
    const row = {
      nameZh: "深圳大学",
      city: "深圳",
      groupApplicationAccount: "group-a",
      rawJson: JSON.stringify({
        学校中文名: "深圳大学",
        招生偏向: "东南亚生源",
        合作备注: "内部备注",
      }),
    };
    const result = stripConfidentialSchoolData(row);
    expect(result.nameZh).toBe("深圳大学");
    expect(result.city).toBe("深圳");
    expect(result.groupApplicationAccount).toBeUndefined();
    const raw = JSON.parse(result.rawJson as string) as Record<string, unknown>;
    expect(raw["学校中文名"]).toBe("深圳大学");
    expect(raw["招生偏向"]).toBeUndefined();
    expect(raw["合作备注"]).toBeUndefined();
  });

  it("keeps invalid rawJson unchanged", () => {
    const row = { rawJson: "not-json", groupApplicationAccount: "group-a" };
    const result = stripConfidentialSchoolData(row);
    expect(result.rawJson).toBe("not-json");
    expect(result.groupApplicationAccount).toBeUndefined();
  });
});

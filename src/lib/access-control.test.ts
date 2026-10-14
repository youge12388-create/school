import { describe, expect, it, vi } from "vitest";

import { USER_ROLES } from "@/lib/constants";
import type { PermissionKey } from "@/lib/permissions";

vi.mock("@/lib/db", () => ({ sqlite: {} }));
vi.mock("@/lib/wecom-service", () => ({
  getWeComEffectivePermissions: () => ["WORKSPACE_VIEW", "SCHOOL_VIEW_PUBLIC", "AUDIT_VIEW"],
}));

import { getUserPermissions, userHasPermission } from "@/lib/access-control";

describe("audit access", () => {
  for (const authProvider of ["LOCAL", "WECOM"] as const) {
    it.each(USER_ROLES)(`${authProvider} %s only permits administrators to view audit`, (role) => {
      const user = { id: "member", role, authProvider };
      expect(userHasPermission(user, "AUDIT_VIEW")).toBe(role === "ADMIN");
    });
  }

  it("preserves other custom permissions while blocking a historical audit grant", () => {
    const permissions: PermissionKey[] = getUserPermissions({
      id: "member",
      role: "ADVISOR",
      authProvider: "WECOM",
    });
    expect(permissions).toEqual(["WORKSPACE_VIEW", "SCHOOL_VIEW_PUBLIC"]);
  });
});

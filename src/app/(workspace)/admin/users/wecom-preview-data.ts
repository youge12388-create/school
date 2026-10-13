import { defaultPermissionsForRole, type PermissionKey } from "@/lib/permissions";

import type { Department, Member, Role } from "./wecom-access-workspace";

const path = (...segments: string[]) => segments.join(" / ");

export const previewDepartments: Department[] = [
  { id: 100, name: "示例留学集团", parentId: 0, displayOrder: 0, role: null, memberCount: 0, path: "示例留学集团", depth: 0, permissions: [], permissionSource: "NONE" },
  { id: 110, name: "国际业务中心", parentId: 100, displayOrder: 1, role: "DATA_MANAGER", memberCount: 3, path: path("示例留学集团", "国际业务中心"), depth: 1, permissions: defaultPermissionsForRole("DATA_MANAGER"), permissionSource: "TEMPLATE" },
  { id: 111, name: "申请服务部", parentId: 110, displayOrder: 1, role: "ADVISOR", memberCount: 3, path: path("示例留学集团", "国际业务中心", "申请服务部"), depth: 2, permissions: defaultPermissionsForRole("ADVISOR"), permissionSource: "TEMPLATE" },
  { id: 112, name: "顾问一组", parentId: 111, displayOrder: 1, role: "ADVISOR", memberCount: 2, path: path("示例留学集团", "国际业务中心", "申请服务部", "顾问一组"), depth: 3, permissions: defaultPermissionsForRole("ADVISOR"), permissionSource: "TEMPLATE" },
  { id: 113, name: "顾问二组", parentId: 111, displayOrder: 2, role: null, memberCount: 3, path: path("示例留学集团", "国际业务中心", "申请服务部", "顾问二组"), depth: 3, permissions: [], permissionSource: "NONE" },
  { id: 120, name: "渠道合作部", parentId: 100, displayOrder: 2, role: "CHANNEL_RESOURCE", memberCount: 4, path: path("示例留学集团", "渠道合作部"), depth: 1, permissions: defaultPermissionsForRole("CHANNEL_RESOURCE"), permissionSource: "TEMPLATE" },
  { id: 130, name: "品牌市场部", parentId: 100, displayOrder: 3, role: "MARKET_MANAGER", memberCount: 2, path: path("示例留学集团", "品牌市场部"), depth: 1, permissions: defaultPermissionsForRole("MARKET_MANAGER").filter((key) => key !== "CUSTOMER_VIEW"), permissionSource: "CUSTOM" },
  { id: 140, name: "数据与运营部", parentId: 100, displayOrder: 4, role: "DATA_MANAGER", memberCount: 3, path: path("示例留学集团", "数据与运营部"), depth: 1, permissions: defaultPermissionsForRole("DATA_MANAGER").filter((key) => key !== "SCHOOL_VIEW_CONFIDENTIAL"), permissionSource: "CUSTOM" },
];

const departmentById = new Map(previewDepartments.map((department) => [department.id, department]));

type MemberOverrides = Partial<Pick<
  Member,
  | "role"
  | "accessMode"
  | "accessRole"
  | "active"
  | "wecomEnabled"
  | "canLogin"
  | "accessReason"
  | "permissions"
  | "permissionSource"
>>;

function previewMember(id: number, displayName: string, departmentIds: number[], overrides: MemberOverrides = {}): Member {
  const departments = departmentIds.flatMap((departmentId) => {
    const department = departmentById.get(departmentId);
    return department ? [{ id: department.id, path: department.path, role: department.role }] : [];
  });
  const departmentRole = departments.find((department) => department.role)?.role ?? null;
  const role = overrides.role === undefined ? departmentRole : overrides.role;
  const accessMode = overrides.accessMode ?? "INHERIT";
  const accessRole = overrides.accessRole === undefined
    ? accessMode === "ROLE" ? role : null
    : overrides.accessRole;
  const active = overrides.active ?? true;
  const wecomEnabled = overrides.wecomEnabled ?? true;
  const canLogin = overrides.canLogin ?? (active && wecomEnabled && role !== null && accessMode !== "DENY");
  const accessReason = overrides.accessReason ?? (
    !wecomEnabled ? "企业微信成员未启用"
      : accessMode === "DENY" ? "个人权限已禁止登录"
        : role === null ? "所属部门未配置登录角色"
          : canLogin ? "可登录" : "账号状态待同步"
  );
  const sourceDepartment = previewDepartments.find((department) =>
    departmentIds.includes(department.id) && department.role === role,
  );
  const permissionSource = overrides.permissionSource ?? (
    accessMode === "DENY" ? "DENY"
      : accessMode === "ROLE" ? "TEMPLATE"
        : role === null ? "INHERIT"
          : sourceDepartment?.permissionSource === "CUSTOM" ? "CUSTOM" : "TEMPLATE"
  );
  const permissions: PermissionKey[] = overrides.permissions ?? (
    accessMode === "DENY" || role === null ? [] : defaultPermissionsForRole(role as Role)
  );

  return {
    id: `preview-member-${String(id).padStart(3, "0")}`,
    displayName,
    role,
    accessMode,
    accessRole,
    active,
    wecomEnabled,
    canLogin,
    accessReason,
    departments,
    permissions,
    permissionSource,
  };
}

export const previewMembers: Member[] = [
  previewMember(1, "周沐言", [110]),
  previewMember(2, "林嘉树", [110, 140]),
  previewMember(3, "沈书瑶", [111]),
  previewMember(4, "陆景行", [111], { role: "MARKET_MANAGER", accessMode: "ROLE", accessRole: "MARKET_MANAGER" }),
  previewMember(5, "姜知意", [111], { role: null, accessMode: "DENY", accessReason: "个人权限已禁止登录" }),
  previewMember(6, "许星然", [112]),
  previewMember(7, "程予安", [112], { active: false }),
  previewMember(8, "叶清越", [113]),
  previewMember(9, "顾亦辰", [113], { role: "ADVISOR", accessMode: "ROLE", accessRole: "ADVISOR", permissions: defaultPermissionsForRole("ADVISOR").filter((key) => key !== "DOCUMENT_DOWNLOAD"), permissionSource: "CUSTOM" }),
  previewMember(10, "宋时雨", [113], { wecomEnabled: false }),
  previewMember(11, "赵明澈", [120]),
  previewMember(12, "唐念初", [120]),
  previewMember(13, "秦知遥", [120, 130]),
  previewMember(14, "苏以宁", [120]),
  previewMember(15, "温慕白", [130]),
  previewMember(16, "许闻溪", [130]),
  previewMember(17, "白予书", [140]),
  previewMember(18, "段星野", [140]),
  previewMember(19, "方予澄", [110, 140]),
];

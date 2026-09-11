"use client";

import {
  ChevronDown,
  ChevronRight,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui";
import { useT, useTv } from "@/lib/i18n/locale-context";

type Role = "ADVISOR" | "DATA_MANAGER" | "CHANNEL_RESOURCE" | "MARKET_MANAGER" | "ADMIN";
type AccessMode = "INHERIT" | "ROLE" | "DENY";

type Department = {
  id: number;
  name: string;
  parentId: number;
  displayOrder: number;
  role: Role | null;
  memberCount: number;
  path: string;
  depth: number;
};

type MemberDepartment = {
  id: number;
  path: string;
  role: Role | null;
};

type Member = {
  id: string;
  displayName: string;
  role: Role | null;
  accessMode: AccessMode;
  accessRole: Role | null;
  active: boolean;
  wecomEnabled: boolean;
  canLogin: boolean;
  accessReason: string;
  departments: MemberDepartment[];
};

type DepartmentNode = Department & {
  children: DepartmentNode[];
  directMemberIds: Set<string>;
  memberIds: Set<string>;
};

const roleLabels: Record<Role, string> = {
  ADVISOR: "顾问",
  DATA_MANAGER: "数据管理员",
  CHANNEL_RESOURCE: "渠道资源部",
  MARKET_MANAGER: "市场经理",
  ADMIN: "高级管理员",
};

const accessModeLabels: Record<AccessMode, string> = {
  INHERIT: "跟随部门",
  ROLE: "单独允许",
  DENY: "单独禁止",
};

function buildTree(departments: Department[], members: Member[]) {
  const nodes = new Map<number, DepartmentNode>();
  for (const department of departments) {
    nodes.set(department.id, {
      ...department,
      children: [],
      directMemberIds: new Set(),
      memberIds: new Set(),
    });
  }

  for (const member of members) {
    for (const department of member.departments) nodes.get(department.id)?.directMemberIds.add(member.id);
  }

  const roots: DepartmentNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parentId);
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const finish = (node: DepartmentNode) => {
    node.children.sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id);
    const memberIds = new Set(node.directMemberIds);
    for (const child of node.children) {
      finish(child);
      for (const memberId of child.memberIds) memberIds.add(memberId);
    }
    node.memberIds = memberIds;
  };
  roots.sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id);
  for (const root of roots) finish(root);
  return { roots, nodes };
}

function roleLabel(role: Role | null, t: (source: string) => string) {
  return role ? t(roleLabels[role]) : t("无权限");
}

function memberSource(member: Member, t: (source: string) => string) {
  if (member.accessMode === "ROLE") return t("个人设置");
  if (member.accessMode === "DENY") return t("个人禁止");
  const department = member.departments.find((item) => item.role === member.role);
  return department?.path ?? t("部门规则");
}

export function WeComAccessWorkspace({
  departments,
  members,
}: {
  departments: Department[];
  members: Member[];
}) {
  const t = useT();
  const tv = useTv();
  const { roots, nodes } = useMemo(() => buildTree(departments, members), [departments, members]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(roots[0]?.id ?? null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "LOGINABLE" | "BLOCKED" | "EXCEPTIONS">("ALL");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set(departments.filter((department) => department.depth < 2).map((department) => department.id)),
  );

  const selectedDepartment = selectedDepartmentId === null ? null : nodes.get(selectedDepartmentId) ?? null;
  const selectedMember = selectedMemberId === null
    ? null
    : members.find((member) => member.id === selectedMemberId) ?? null;
  const scopedMembers = useMemo(() => {
    const allowedMemberIds = selectedDepartment?.memberIds;
    return members.filter((member) => !allowedMemberIds || allowedMemberIds.has(member.id));
  }, [members, selectedDepartment]);
  const visibleMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return scopedMembers.filter((member) => {
      if (filter === "LOGINABLE" && !member.canLogin) return false;
      if (filter === "BLOCKED" && member.canLogin) return false;
      if (filter === "EXCEPTIONS" && member.accessMode === "INHERIT") return false;
      return !normalizedQuery || member.displayName.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    });
  }, [filter, query, scopedMembers]);
  const loginableCount = members.filter((member) => member.canLogin).length;
  const blockedCount = members.length - loginableCount;
  const exceptionCount = members.filter((member) => member.accessMode !== "INHERIT").length;

  const selectDepartment = (departmentId: number) => {
    setSelectedDepartmentId(departmentId);
    setSelectedMemberId(null);
  };
  const toggleNode = (departmentId: number) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(departmentId)) next.delete(departmentId);
      else next.add(departmentId);
      return next;
    });
  };

  const renderTree = (node: DepartmentNode) => {
    const expanded = expandedIds.has(node.id);
    const selected = node.id === selectedDepartmentId;
    const hasChildren = node.children.length > 0;
    return (
      <li className="wecom-org-node" key={node.id}>
        <div className={`wecom-org-row${selected ? " is-selected" : ""}`} style={{ "--wecom-depth": node.depth } as React.CSSProperties}>
          {hasChildren ? (
            <button
              type="button"
              className="wecom-tree-toggle"
              onClick={() => toggleNode(node.id)}
              aria-label={expanded ? tv("收起{name}", { name: node.name }) : tv("展开{name}", { name: node.name })}
            >
              {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            </button>
          ) : <span className="wecom-tree-toggle-placeholder" aria-hidden="true" />}
          <button type="button" className="wecom-org-select" onClick={() => selectDepartment(node.id)}>
            <span className="wecom-org-name">{node.name}</span>
            <span className="wecom-org-count">{node.memberIds.size}</span>
          </button>
        </div>
        {hasChildren && expanded ? <ul>{node.children.map(renderTree)}</ul> : null}
      </li>
    );
  };

  return (
    <div className="wecom-access-workspace">
      <div className="wecom-status-strip" aria-label={t("企业微信权限概览")}>
        <span><strong>{members.length}</strong>{t("名成员")}</span>
        <span className="is-good"><strong>{loginableCount}</strong>{t("可登录")}</span>
        <span className="is-muted"><strong>{blockedCount}</strong>{t("不可登录")}</span>
        <span><strong>{exceptionCount}</strong>{t("个人例外")}</span>
      </div>

      <div className="wecom-workbench">
        <nav className="wecom-org-nav" aria-label={t("企业微信组织架构")}>
          <div className="wecom-pane-heading">
            <div>
              <span className="wecom-pane-kicker">{t("组织架构")}</span>
              <strong>{t("按部门浏览成员")}</strong>
            </div>
            <Users aria-hidden="true" />
          </div>
          <ul className="wecom-org-tree">{roots.map(renderTree)}</ul>
        </nav>

        <section className="wecom-member-workbench" aria-label={t("成员权限")}>
          <div className="wecom-member-toolbar">
            <div>
              <span className="wecom-pane-kicker">{t("成员权限")}</span>
              <h3>{selectedDepartment?.name ?? t("全部成员")}</h3>
              <p>
                {selectedDepartment
                  ? tv("范围内 {count} 名成员 · 直属 {directCount} 名", {
                    count: selectedDepartment.memberIds.size,
                    directCount: selectedDepartment.directMemberIds.size,
                  })
                  : tv("共 {count} 名成员", { count: members.length })}
              </p>
            </div>
            <div className="wecom-member-controls">
              <label className="wecom-search-field">
                <Search aria-hidden="true" />
                <span className="sr-only">{t("搜索成员")}</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("搜索成员")}
                />
              </label>
              <label className="wecom-filter-field">
                <SlidersHorizontal aria-hidden="true" />
                <span className="sr-only">{t("筛选成员")}</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                  <option value="ALL">{t("全部状态")}</option>
                  <option value="LOGINABLE">{t("仅可登录")}</option>
                  <option value="BLOCKED">{t("仅不可登录")}</option>
                  <option value="EXCEPTIONS">{t("仅个人例外")}</option>
                </select>
              </label>
            </div>
          </div>

          <div className="wecom-member-table-wrap">
            <table className="wecom-member-table">
              <thead>
                <tr>
                  <th>{t("成员")}</th>
                  <th>{t("登录状态")}</th>
                  <th>{t("生效角色")}</th>
                  <th>{t("权限来源")}</th>
                  <th><span className="sr-only">{t("操作")}</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleMembers.map((member) => (
                  <tr className={member.id === selectedMemberId ? "is-selected" : ""} key={member.id}>
                    <td><strong>{member.displayName}</strong></td>
                    <td>
                      <Badge tone={member.canLogin ? "green" : "red"}>
                        {t(member.canLogin ? "可登录" : "不可登录")}
                      </Badge>
                    </td>
                    <td>{roleLabel(member.role, t)}</td>
                    <td><span className="wecom-source-cell" title={memberSource(member, t)}>{memberSource(member, t)}</span></td>
                    <td>
                      <button
                        type="button"
                        className="wecom-row-action"
                        onClick={() => setSelectedMemberId(member.id)}
                      >
                        {t("查看")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleMembers.length ? (
              <div className="wecom-workspace-empty">
                <Users aria-hidden="true" />
                <strong>{t("没有符合条件的成员")}</strong>
                <span>{t("尝试调整组织范围或筛选条件。")}</span>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="wecom-inspector" aria-label={t("权限编辑器")}>
          {selectedMember ? (
            <>
              <div className="wecom-inspector-heading">
                <span className="wecom-pane-kicker">{t("成员权限")}</span>
                <h3>{selectedMember.displayName}</h3>
                <p>{t("个人设置仅在需要覆盖部门规则时使用")}</p>
              </div>
              <div className="wecom-effective-access">
                <span>{t("当前生效")}</span>
                <strong>{roleLabel(selectedMember.role, t)}</strong>
                <Badge tone={selectedMember.canLogin ? "green" : "red"}>
                  {t(selectedMember.accessReason)}
                </Badge>
              </div>
              <div className="wecom-inspector-section">
                <span className="small muted">{t("直接所属部门")}</span>
                {selectedMember.departments.length ? selectedMember.departments.map((department) => (
                  <div className="wecom-inspector-source" key={`${selectedMember.id}-${department.id}`}>
                    <span>{department.path}</span>
                    <Badge tone={department.role ? "blue" : "gray"}>
                      {department.role ? roleLabel(department.role, t) : t("未配置")}
                    </Badge>
                  </div>
                )) : <p className="small muted">{t("未找到部门归属，请重新同步组织架构")}</p>}
              </div>
              <form action="/api/admin/wecom" method="post" className="wecom-inspector-form">
                <input type="hidden" name="intent" value="update-user-access" />
                <input type="hidden" name="userId" value={selectedMember.id} />
                <label>
                  <span>{t("权限处理方式")}</span>
                  <select name="accessMode" defaultValue={selectedMember.accessMode}>
                    {(Object.keys(accessModeLabels) as AccessMode[]).map((mode) => (
                      <option key={mode} value={mode}>{t(accessModeLabels[mode])}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("单独角色")}</span>
                  <select name="role" defaultValue={selectedMember.accessRole ?? selectedMember.role ?? "ADVISOR"}>
                    {(Object.keys(roleLabels) as Role[]).map((role) => (
                      <option key={role} value={role}>{t(roleLabels[role])}</option>
                    ))}
                  </select>
                </label>
                <p className="wecom-form-hint">{t("跟随部门会恢复部门默认；单独禁止会立即阻止登录。")}</p>
                <button className="primary" type="submit">{t("保存成员权限")}</button>
              </form>
            </>
          ) : selectedDepartment ? (
            <>
              <div className="wecom-inspector-heading">
                <span className="wecom-pane-kicker">{t("部门规则")}</span>
                <h3>{selectedDepartment.name}</h3>
                <p>{t("仅对直属成员生效，子部门不会继承")}</p>
              </div>
              <div className="wecom-department-impact">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>
                    {selectedDepartment.directMemberIds.size === 0
                      ? t("当前无直属成员")
                      : selectedDepartment.role
                        ? t("已配置登录规则")
                        : t("尚未配置登录规则")}
                  </strong>
                  <span>
                    {selectedDepartment.directMemberIds.size === 0
                      ? t("该节点仅用于组织导航，规则暂不影响成员")
                      : tv("直属 {count} 名成员", { count: selectedDepartment.directMemberIds.size })}
                  </span>
                </div>
              </div>
              <form action="/api/admin/wecom" method="post" className="wecom-inspector-form">
                <input type="hidden" name="intent" value="update-role" />
                <input type="hidden" name="departmentId" value={selectedDepartment.id} />
                <input type="hidden" name="permissionToggle" value="1" />
                <label className="wecom-enabled-control">
                  <input type="checkbox" name="enabled" value="1" defaultChecked={Boolean(selectedDepartment.role)} />
                  <span>{t("允许直属成员登录")}</span>
                </label>
                <label>
                  <span>{t("登录角色")}</span>
                  <select name="role" defaultValue={selectedDepartment.role ?? "ADVISOR"}>
                    {(Object.keys(roleLabels) as Role[]).map((role) => (
                      <option key={role} value={role}>{t(roleLabels[role])}</option>
                    ))}
                  </select>
                </label>
                <p className="wecom-form-hint">{t("保存后会重新计算相关成员权限，并刷新已登录会话。")}</p>
                <button className="primary" type="submit">{t("保存部门规则")}</button>
              </form>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

const WECOM_API_BASE = "https://qyapi.weixin.qq.com/cgi-bin";
export const WECOM_STATE_COOKIE = "school_syt_wecom_oauth_state";
const WECOM_STATE_TTL_SECONDS = 10 * 60;

export class WeComConfigError extends Error {}

export class WeComApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

export type WeComConfig = {
  corpId: string;
  secret: string;
  redirectUri: string;
};

export type WeComIdentity = {
  userId: string;
  displayName: string;
  departmentIds: number[];
  enabled: boolean;
};

export type WeComDepartment = {
  id: number;
  name: string;
  parentId: number;
  displayOrder: number;
};

export type WeComMember = WeComIdentity;

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getWeComConfig(): WeComConfig {
  const corpId = envValue("WECOM_CORP_ID");
  const secret = envValue("WECOM_SECRET");
  const redirectUri = envValue("WECOM_REDIRECT_URI");
  if (!corpId || !secret || !redirectUri) {
    throw new WeComConfigError(
      "企业微信登录尚未配置，请设置 WECOM_CORP_ID、WECOM_SECRET 和 WECOM_REDIRECT_URI",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new WeComConfigError("WECOM_REDIRECT_URI 不是有效地址");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new WeComConfigError("WECOM_REDIRECT_URI 不得包含账号、密码或片段");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new WeComConfigError("生产环境的 WECOM_REDIRECT_URI 必须使用 HTTPS");
  }

  return { corpId, secret, redirectUri };
}

export function isWeComConfigured() {
  try {
    getWeComConfig();
    return true;
  } catch {
    return false;
  }
}

export function createWeComState() {
  return randomBytes(32).toString("base64url");
}

export function isValidWeComState(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function getWeComStateCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/api/auth/wecom/callback",
    maxAge: WECOM_STATE_TTL_SECONDS,
  };
}

export function getWeComLoginUrl(state: string) {
  const { corpId, redirectUri } = getWeComConfig();
  const url = new URL("https://open.weixin.qq.com/connect/oauth2/authorize");
  url.searchParams.set("appid", corpId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "snsapi_base");
  url.searchParams.set("state", state);
  url.hash = "wechat_redirect";
  return url.toString();
}

type WeComResponse = {
  errcode?: number;
  errmsg?: string;
};

async function requestWeCom<T extends object>(
  path: string,
  query: Record<string, string>,
) {
  const url = new URL(`${WECOM_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new WeComApiError("企业微信接口暂时无法访问", -1);
  }
  if (!response.ok) {
    throw new WeComApiError("企业微信接口返回网络错误", response.status);
  }

  let payload: T & WeComResponse;
  try {
    payload = (await response.json()) as T & WeComResponse;
  } catch {
    throw new WeComApiError("企业微信接口返回了无效数据", -2);
  }
  if (payload.errcode && payload.errcode !== 0) {
    throw new WeComApiError(
      `企业微信接口调用失败：${payload.errmsg || "未知错误"}`,
      payload.errcode,
    );
  }
  return payload as T;
}

async function getAccessToken() {
  const { corpId, secret } = getWeComConfig();
  const payload = await requestWeCom<{ access_token?: string; expires_in?: number }>(
    "gettoken",
    { corpid: corpId, corpsecret: secret },
  );
  if (!payload.access_token) {
    throw new WeComApiError("企业微信未返回 access_token", -3);
  }
  return payload.access_token;
}

async function getUserIdByCode(accessToken: string, code: string) {
  const payload = await requestWeCom<{ UserId?: string; userid?: string }>(
    "user/getuserinfo",
    { access_token: accessToken, code },
  );
  const userId = payload.UserId || payload.userid;
  if (!userId) throw new WeComApiError("企业微信授权结果中没有成员身份", -4);
  return userId;
}

async function getMember(accessToken: string, userId: string) {
  return requestWeCom<{
    userid?: string;
    name?: string;
    department?: Array<number | string>;
    enable?: number;
    status?: number;
  }>("user/get", { access_token: accessToken, userid: userId });
}

function numberValue(value: unknown, fallback = 0) {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isInteger(result) && result >= 0 ? result : fallback;
}

function departmentIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => numberValue(item)).filter((item) => item > 0))];
}

function memberIsEnabled(member: { enable?: number; status?: number }) {
  if (member.enable !== undefined) return member.enable === 1;
  return member.status === 1;
}

export async function getWeComIdentity(code: string): Promise<WeComIdentity> {
  if (!code || code.length > 512) throw new WeComApiError("企业微信授权码无效", -5);
  const accessToken = await getAccessToken();
  const userId = await getUserIdByCode(accessToken, code);
  const member = await getMember(accessToken, userId);
  return {
    userId,
    displayName: member.name?.trim() || userId,
    departmentIds: departmentIds(member.department),
    enabled: memberIsEnabled(member),
  };
}

type DepartmentListItem = {
  id?: number | string;
  parentid?: number | string;
  order?: number | string;
  name?: string;
};

async function getDepartmentDetails(accessToken: string, id: number) {
  const payload = await requestWeCom<{
    department?: DepartmentListItem;
    id?: number | string;
    name?: string;
    parentid?: number | string;
    order?: number | string;
  }>("department/get", { access_token: accessToken, id: String(id) });
  const department = payload.department ?? payload;
  const departmentId = numberValue(department.id, id);
  return {
    id: departmentId,
    name: department.name?.trim() || `部门 ${departmentId}`,
    parentId: numberValue(department.parentid),
    displayOrder: numberValue(department.order),
  } satisfies WeComDepartment;
}

async function getChildDepartmentIds(accessToken: string, parentId: number) {
  const payload = await requestWeCom<{
    department_id?: DepartmentListItem[];
    department?: DepartmentListItem[];
  }>("department/simplelist", { access_token: accessToken, id: String(parentId) });
  const children = payload.department_id ?? payload.department ?? [];
  return children
    .map((child) => ({
      id: numberValue(child.id),
      parentId: numberValue(child.parentid, parentId),
      displayOrder: numberValue(child.order),
      name: child.name?.trim(),
    }))
    .filter((child) => child.id > 0 && child.id !== parentId);
}

async function getDepartments(accessToken: string) {
  const departments = new Map<number, WeComDepartment>();
  const root = await getDepartmentDetails(accessToken, 1);
  departments.set(root.id, root);
  const visited = new Set<number>();

  async function visit(parentId: number): Promise<void> {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    const children = await getChildDepartmentIds(accessToken, parentId);
    for (const child of children) {
      if (!departments.has(child.id)) {
        departments.set(
          child.id,
          child.name
            ? {
                id: child.id,
                name: child.name,
                parentId: child.parentId,
                displayOrder: child.displayOrder,
              }
            : await getDepartmentDetails(accessToken, child.id),
        );
      }
      await visit(child.id);
    }
  }

  await visit(root.id);
  return [...departments.values()];
}

async function getDepartmentMembers(accessToken: string, departmentId: number) {
  const payload = await requestWeCom<{
    userlist?: Array<{
      userid?: string;
      name?: string;
      department?: Array<number | string>;
      enable?: number;
      status?: number;
    }>;
  }>("user/list", { access_token: accessToken, department_id: String(departmentId) });
  return (payload.userlist ?? [])
    .filter((member) => member.userid?.trim())
    .map((member) => ({
      userId: member.userid!.trim(),
      displayName: member.name?.trim() || member.userid!.trim(),
      departmentIds: [departmentId, ...departmentIds(member.department)],
      enabled: memberIsEnabled(member),
    } satisfies WeComMember));
}

export async function fetchWeComOrganization() {
  const accessToken = await getAccessToken();
  const departments = await getDepartments(accessToken);
  const members = new Map<string, WeComMember>();
  for (const department of departments) {
    for (const member of await getDepartmentMembers(accessToken, department.id)) {
      const existing = members.get(member.userId);
      if (!existing) {
        members.set(member.userId, member);
        continue;
      }
      existing.departmentIds = [
        ...new Set([...existing.departmentIds, ...member.departmentIds]),
      ];
      existing.enabled = existing.enabled && member.enabled;
      if (existing.displayName === existing.userId && member.displayName !== member.userId) {
        existing.displayName = member.displayName;
      }
    }
  }
  return { departments, members: [...members.values()] };
}

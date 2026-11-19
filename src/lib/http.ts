import { getTrustedForwardedProtocol } from "@/lib/request-security";

const SAFE_HOST_PATTERN = /^(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(:\d+)?$/;

function firstHeaderValue(request: Request, name: string) {
  return request.headers.get(name)?.split(",")[0]?.trim() || null;
}

function requestHost(request: Request) {
  const host = request.headers.get("host")?.trim();
  return host && SAFE_HOST_PATTERN.test(host) ? host : null;
}

function forwardedHost(request: Request) {
  if (process.env.TRUST_PROXY !== "true") return null;
  const host = firstHeaderValue(request, "x-forwarded-host");
  return host && SAFE_HOST_PATTERN.test(host) ? host : null;
}

function configuredOrigin(): string | null {
  const value = process.env.APP_PUBLIC_ORIGIN;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch {
    return null;
  }
}

export function appUrl(request: Request, path: string) {
  const origin = configuredOrigin();
  if (origin) return new URL(path, origin);
  const url = new URL(request.url);
  const host = requestHost(request);
  const protocol = getTrustedForwardedProtocol(request);

  if (host) url.host = host;
  if (protocol) url.protocol = `${protocol}:`;

  const target = new URL(path, url);
  target.host = url.host;
  target.protocol = url.protocol;
  return target;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;

  const configured = configuredOrigin();
  if (configured) return originUrl.origin === configured;

  const requestUrl = new URL(request.url);
  const protocol = getTrustedForwardedProtocol(request);
  const host = requestHost(request) ?? requestUrl.host;
  const proxyHost = forwardedHost(request) ?? host;
  const candidates = new Set<string>([requestUrl.origin]);

  const addCandidate = (value: string) => {
    try {
      candidates.add(new URL(value).origin);
    } catch {
      // Ignore malformed proxy headers rather than trusting a partially parsed origin.
    }
  };

  addCandidate(`${requestUrl.protocol}//${host}`);
  if (protocol) {
    addCandidate(`${protocol}://${host}`);
    addCandidate(`${protocol}://${proxyHost}`);
  } else {
    addCandidate(`${requestUrl.protocol}//${proxyHost}`);
  }

  return candidates.has(originUrl.origin);
}

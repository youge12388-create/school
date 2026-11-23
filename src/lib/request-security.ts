import { isAbsolute, relative, resolve } from "node:path";

function isTrustedProxy() {
  return process.env.TRUST_PROXY === "true";
}

function forwardedProtocol(request: Request) {
  const value = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return value === "http" || value === "https" ? value : null;
}

export function getClientIp(request: Request) {
  if (!isTrustedProxy()) return null;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export function getTrustedForwardedProtocol(request: Request) {
  return isTrustedProxy() ? forwardedProtocol(request) : null;
}

export function shouldUseSecureSessionCookie(request: Request) {
  const protocol = getTrustedForwardedProtocol(request);
  if (protocol) return protocol === "https";
  return process.env.NODE_ENV === "production";
}

export function isPathWithinRoot(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedRoot, resolvedTarget);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function getMaxUploadBytes(defaultMb = 20): number {
  const parsed = Number(process.env.MAX_UPLOAD_MB);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMb;
  return mb * 1024 * 1024;
}

import { getTrustedForwardedProtocol } from "@/lib/request-security";

const SAFE_HOST_PATTERN = /^(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(:\d+)?$/;

function requestHost(request: Request) {
  const host = request.headers.get("host")?.trim();
  return host && SAFE_HOST_PATTERN.test(host) ? host : null;
}

export function appUrl(request: Request, path: string) {
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

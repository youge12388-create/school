const SAFE_HOST_PATTERN = /^(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(:\d+)?$/;

function forwardedProtocol(request: Request) {
  const value = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return value === "http" || value === "https" ? value : null;
}

function requestHost(request: Request) {
  const host = request.headers.get("host")?.trim();
  return host && SAFE_HOST_PATTERN.test(host) ? host : null;
}

export function appUrl(request: Request, path: string) {
  const url = new URL(request.url);
  const host = requestHost(request);
  const protocol = forwardedProtocol(request);

  if (host) url.host = host;
  if (protocol) url.protocol = `${protocol}:`;

  const target = new URL(path, url);
  target.host = url.host;
  target.protocol = url.protocol;
  return target;
}

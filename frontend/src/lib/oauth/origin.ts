/**
 * The origin a browser can actually reach this app on.
 *
 * OAuth callbacks finish by redirecting the user back into the dashboard, and the
 * obvious way to build that URL — the origin of `request.url` — is wrong behind a proxy.
 * Railway terminates TLS at its edge and forwards to the container on an internal port,
 * so the incoming request looks like `http://localhost:8080/...` and the user gets sent
 * to a host that only exists inside the container.
 */

/**
 * @param request The inbound request, used only as a fallback when nothing is configured.
 * @param configuredUrl An explicit URL for this deployment, such as a registered OAuth
 * redirect URI. Trusted first, because a proxy header is a guess and this is a statement.
 */
export function publicOrigin(request: Request, configuredUrl?: string): string {
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      // A malformed value should not take the callback down; fall through to the headers.
    }
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');

  if (host) {
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    const protocol = forwardedProto?.split(',')[0].trim() || (isLocal ? 'http' : 'https');
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

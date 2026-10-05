interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GAME_ORIGIN: string;
  GAME_PROXY_KEY?: string;
}

const errorResponse = (error: string, status: number) => Response.json({ error }, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
    const socket = url.pathname === '/ws' || url.pathname.startsWith('/ws/');
    if (!api && !socket) return env.ASSETS.fetch(request);

    const origin = request.headers.get('Origin');
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    // Validate the browser's real origin before the authenticated VPS ingress rewrites it.
    if ((origin !== null && origin !== url.origin) ||
        ((write || socket) && request.headers.get('Sec-Fetch-Site') === 'cross-site') ||
        (socket && origin !== url.origin)) return errorResponse('origin_forbidden', 403);
    if (socket && (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')) {
      return errorResponse('websocket_upgrade_required', 426);
    }
    if (!env.GAME_PROXY_KEY) return errorResponse('game_proxy_unconfigured', 503);

    let target: URL;
    try { target = new URL(env.GAME_ORIGIN); }
    catch { return errorResponse('invalid_game_origin', 503); }
    if (target.protocol !== 'https:' || target.username || target.password || target.origin === url.origin) {
      return errorResponse('invalid_game_origin', 503);
    }
    // Assign pathname separately: a path beginning // must never change the upstream host.
    target.pathname = url.pathname;
    target.search = url.search;
    target.hash = '';
    // Use a fresh upgrade request rather than inheriting the visitor's HTTP request metadata.
    const upstream = new Request(target, socket ? { method: 'GET', headers: request.headers } : request);
    for (const header of ['Host', 'Forwarded', 'X-Forwarded-For', 'X-Forwarded-Host', 'X-Real-IP', 'X-Arena-Proxy-Key', 'X-Arena-Client-IP']) {
      upstream.headers.delete(header);
    }
    upstream.headers.set('X-Arena-Proxy-Key', env.GAME_PROXY_KEY);
    // Cloudflare overwrites this on ingress. Never forward a visitor's own proxy identity headers.
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) upstream.headers.set('X-Arena-Client-IP', clientIp);
    const options: RequestInit & { cf: { cacheTtl: number; cacheEverything: boolean } } = {
      redirect: 'manual', cf: { cacheTtl: 0, cacheEverything: false },
    };
    try {
      const response = await fetch(upstream, socket ? { redirect: 'manual' } : options);
      // Returning the upgrade response directly lets Cloudflare tunnel binary frames without a JS relay.
      if (response.status === 101) return response;
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      const location = headers.get('Location');
      if (location) {
        const redirect = new URL(location, target);
        if (redirect.origin !== target.origin) return errorResponse('unexpected_game_redirect', 502);
        headers.set('Location', url.origin + redirect.pathname + redirect.search + redirect.hash);
      }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch {
      return errorResponse('game_server_unavailable', 502);
    }
  },
};

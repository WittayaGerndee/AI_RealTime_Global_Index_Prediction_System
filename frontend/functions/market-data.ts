// Cloudflare Pages Function: GET /market-data?symbol=^HSI
// Proxies Yahoo Finance 5-minute chart data (the browser cannot call Yahoo directly because of CORS).
// Also used by the Vite dev server (see vite.config.ts).

const ALLOWED_SYMBOLS = new Set(['^N225', '^HSI', '399001.SZ', '^DJI']);
const CACHE_SECONDS = 30;

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const symbol = new URL(request.url).searchParams.get('symbol') || '';
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    return Response.json({ error: 'Unsupported symbol' }, { status: 400 });
  }

  const upstream = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1mo`;
  const init: RequestInit & { cf?: Record<string, unknown> } = {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
  };

  try {
    const res = await fetch(upstream, init);
    if (!res.ok) {
      return Response.json({ error: `Upstream responded ${res.status}` }, { status: 502 });
    }
    return new Response(await res.text(), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    });
  } catch (e) {
    return Response.json({ error: `Upstream fetch failed: ${(e as Error).message}` }, { status: 502 });
  }
}

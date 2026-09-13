// GET /market-data?symbol=^HSI&range=1d|60d
// Proxies Yahoo Finance 5-minute chart data (the browser cannot call Yahoo directly because of CORS).
// Served by the Cloudflare Worker (worker/index.ts) and by the Vite dev server (vite.config.ts).

const ALLOWED_SYMBOLS = new Set(['^N225', '^HSI', '399001.SZ', '^DJI']);
// Today's bars change every few seconds; 60-day history only needs occasional refreshes
const CACHE_SECONDS: Record<string, number> = { '1d': 30, '60d': 900 };

export async function handleMarketData(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol') || '';
  const range = params.get('range') || '1d';
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    return Response.json({ error: 'Unsupported symbol' }, { status: 400 });
  }
  const cacheSeconds = CACHE_SECONDS[range];
  if (!cacheSeconds) {
    return Response.json({ error: 'Unsupported range' }, { status: 400 });
  }

  const upstream = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=${range}`;
  const init: RequestInit & { cf?: Record<string, unknown> } = {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    cf: { cacheTtl: cacheSeconds, cacheEverything: true },
  };

  try {
    const res = await fetch(upstream, init);
    if (!res.ok) {
      return Response.json({ error: `Upstream responded ${res.status}` }, { status: 502 });
    }
    return new Response(await res.text(), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${cacheSeconds}`,
      },
    });
  } catch (e) {
    return Response.json({ error: `Upstream fetch failed: ${(e as Error).message}` }, { status: 502 });
  }
}

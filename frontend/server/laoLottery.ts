// GET /lao-lottery?date=YYYY-MM-DD
// Returns one Lao Development Lottery draw parsed from Sanook's result page, or `draw: null`
// when nothing was published that day. Used to fill in draws newer than the bundled
// data/lao-lottery.json (built by scripts/fetch_lao_lottery.py with the same parsing).

const PAST_CACHE_SECONDS = 30 * 24 * 3600;
const RECENT_CACHE_SECONDS = 10 * 60;

function sanookSlug(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}${m}${Number(y) + 543}`;
}

export async function handleLaoLottery(request: Request): Promise<Response> {
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  // Results for the last two days may still appear; older answers never change
  const ageDays = (Date.now() - Date.parse(`${date}T13:00:00Z`)) / 86_400_000;
  const cacheSeconds = ageDays > 2 ? PAST_CACHE_SECONDS : RECENT_CACHE_SECONDS;
  const slug = sanookSlug(date);
  const init: RequestInit & { cf?: Record<string, unknown> } = {
    headers: { 'User-Agent': 'Mozilla/5.0 (lao-lottery-stats)' },
    cf: { cacheTtl: cacheSeconds, cacheEverything: true },
  };

  try {
    const res = await fetch(`https://www.sanook.com/news/laolotto/${slug}/`, init);
    if (!res.ok) return Response.json({ error: `Upstream responded ${res.status}` }, { status: 502 });
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    const data = match ? JSON.parse(match[1])?.props?.serverState?.apollo?.data : null;
    const result = data?.[`$ROOT_QUERY.laoLotto({"date":"${slug}"}).prizeResult`];
    const last4 = result?.last4Prize;
    const draw = typeof last4 === 'string' && /^\d{4}$/.test(last4) ? { date, last4, animal: result.animalName ?? '' } : null;
    return Response.json({ date, draw }, { headers: { 'Cache-Control': `public, max-age=${cacheSeconds}` } });
  } catch (e) {
    return Response.json({ error: `Upstream fetch failed: ${(e as Error).message}` }, { status: 502 });
  }
}

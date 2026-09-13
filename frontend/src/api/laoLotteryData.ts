import type { LaoDraw } from '../utils/laoLotteryStats';

// Loads the bundled draw history (data/lao-lottery.json) and fills in draws published
// since it was built, via the /lao-lottery Worker endpoint.

const MAX_GAP_DAYS = 45;
const PARALLEL = 6;

export interface LaoDataset {
  draws: LaoDraw[];
  source: string;
  bundledUntil: string;
  /** Draws fetched live because they are newer than the bundled file. */
  fetchedLive: number;
}

function thaiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function loadLaoDataset(): Promise<LaoDataset> {
  const res = await fetch('/data/lao-lottery.json');
  if (!res.ok) throw new Error(`lao-lottery.json: HTTP ${res.status}`);
  const bundle = await res.json();
  const draws: LaoDraw[] = bundle.draws;
  const bundledUntil = draws.length ? draws[draws.length - 1].date : '';

  const today = thaiToday();
  const missing: string[] = [];
  for (let d = addDays(bundledUntil, 1); d <= today && missing.length < MAX_GAP_DAYS; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    // Draws are only published on weekdays in the collected history
    if (dow !== 0 && dow !== 6) missing.push(d);
  }

  const fresh: LaoDraw[] = [];
  for (let i = 0; i < missing.length; i += PARALLEL) {
    const batch = await Promise.allSettled(
      missing.slice(i, i + PARALLEL).map((date) => fetch(`/lao-lottery?date=${date}`).then((r) => (r.ok ? r.json() : null))),
    );
    for (const r of batch) {
      if (r.status === 'fulfilled' && r.value?.draw) fresh.push(r.value.draw);
    }
  }

  return {
    draws: [...draws, ...fresh.sort((a, b) => a.date.localeCompare(b.date))],
    source: bundle.source,
    bundledUntil,
    fetchedLive: fresh.length,
  };
}

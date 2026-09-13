import { SYMBOLS } from '../utils/marketSessions';
import { Bar, round2 } from '../utils/closeForecast';
import type { BarSource, Quote } from './marketEngine';

// Real index data: 5-minute bars from Yahoo Finance via the /market-data Worker endpoint.
// 60 days of history (for the statistical model) is refreshed every 30 minutes; today's
// bars and quote every 30 seconds.

const YAHOO_SYMBOLS: Record<string, string> = {
  NIKKEI225: '^N225',
  HSI: '^HSI',
  SZSE: '399001.SZ',
  DJI: '^DJI',
};

const LIVE_REFRESH_MS = 30_000;
const HISTORY_REFRESH_MS = 30 * 60_000;

interface Chart {
  bars: Bar[];
  quote: Quote;
}

async function fetchChart(symbol: string, range: '1d' | '60d'): Promise<Chart> {
  const url = `/market-data?symbol=${encodeURIComponent(YAHOO_SYMBOLS[symbol])}&range=${range}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`market-data ${symbol} ${range}: HTTP ${res.status}`);
  const result = (await res.json())?.chart?.result?.[0];
  if (!result?.timestamp) throw new Error(`market-data ${symbol} ${range}: no data`);

  const q = result.indicators.quote[0];
  const bars: Bar[] = [];
  result.timestamp.forEach((ts: number, i: number) => {
    const close = q.close[i];
    if (close == null) return;
    bars.push({
      t: ts * 1000,
      open: round2(q.open[i] ?? close),
      high: round2(q.high[i] ?? close),
      low: round2(q.low[i] ?? close),
      close: round2(close),
    });
  });
  const m = result.meta;
  return {
    bars,
    quote: {
      price: m.regularMarketPrice,
      time: m.regularMarketTime ? m.regularMarketTime * 1000 : undefined,
      previousClose: m.previousClose,
      dayHigh: m.regularMarketDayHigh,
      dayLow: m.regularMarketDayLow,
    },
  };
}

export class YahooBarSource implements BarSource {
  public historyVersion = 0;
  private history: Record<string, Bar[]> = {};
  private live: Record<string, Chart> = {};
  private merged: Record<string, Bar[]> = {};
  private historyFetchedAt = 0;
  private liveFetchedAt = 0;
  private inflight: Promise<boolean> | null = null;

  get ready(): boolean {
    return SYMBOLS.every((s) => this.live[s]);
  }

  refresh(now: Date = new Date()): Promise<boolean> {
    const t = now.getTime();
    const needLive = !this.ready || t - this.liveFetchedAt >= LIVE_REFRESH_MS;
    const needHistory = t - this.historyFetchedAt >= HISTORY_REFRESH_MS;
    if (!needLive && !needHistory) return Promise.resolve(this.ready);
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      const tasks: Promise<void>[] = [];
      if (needHistory) {
        tasks.push(
          ...SYMBOLS.map(async (s) => {
            this.history[s] = (await fetchChart(s, '60d')).bars;
          }),
        );
      }
      tasks.push(
        ...SYMBOLS.map(async (s) => {
          this.live[s] = await fetchChart(s, '1d');
        }),
      );
      const results = await Promise.allSettled(tasks);
      results.forEach((r) => r.status === 'rejected' && console.warn(r.reason));

      if (needHistory && SYMBOLS.some((s) => this.history[s])) {
        this.historyFetchedAt = Date.now();
        this.historyVersion++;
      }
      this.liveFetchedAt = Date.now();
      this.merged = {};
      this.inflight = null;
      return this.ready;
    })();
    return this.inflight;
  }

  bars(symbol: string): Bar[] {
    if (!this.merged[symbol]) {
      const live = this.live[symbol]?.bars ?? [];
      const history = this.history[symbol] ?? [];
      const firstLive = live.length ? live[0].t : Infinity;
      this.merged[symbol] = [...history.filter((b) => b.t < firstLive), ...live];
    }
    return this.merged[symbol];
  }

  quote(symbol: string): Quote | null {
    return this.live[symbol]?.quote ?? null;
  }
}

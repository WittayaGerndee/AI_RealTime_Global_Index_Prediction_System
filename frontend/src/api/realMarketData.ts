import { MarketSummary, Candle, HorizonPrediction, AccuracyReport, CloseForecast } from '../types/market';
import {
  TradingSession,
  getSessionState,
  sessionOnOrBefore,
  previousSession,
  totalTradingSeconds,
} from '../utils/marketSessions';
import { forecastClose, calculateAccuracy, round2, CloseForecastResult, EvaluatedForecast } from '../utils/closeForecast';

// Real index data: 5-minute bars from Yahoo Finance via the /market-data Pages Function.
// Forecasts use only bars completed before the moment they represent, so the close
// forecast locked 30 minutes before the close is reproducible after a page reload.

const BAR_MS = 5 * 60_000;
const REFRESH_MS = 30_000;
const SESSIONS_BACK = 30;
// HKEX closing auction prints after the 16:00 continuous-trading close
const CLOSE_GRACE_MS = 15 * 60_000;
const MODEL_VERSION = 'v1.2.0-RealData';

const METAS: Record<string, { yahoo: string; name: string; market: string; currency: string; tickSize: number }> = {
  NIKKEI225: { yahoo: '^N225', name: 'Nikkei 225', market: 'TSE', currency: 'JPY', tickSize: 1 },
  HSI: { yahoo: '^HSI', name: 'Hang Seng Index', market: 'HKEX', currency: 'HKD', tickSize: 1 },
  SZSE: { yahoo: '399001.SZ', name: 'SZSE Component', market: 'SZSE', currency: 'CNY', tickSize: 0.01 },
  DJI: { yahoo: '^DJI', name: 'Dow Jones Industrial', market: 'NYSE', currency: 'USD', tickSize: 1 },
};

interface Bar {
  t: number; // bucket start, ms
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartMeta {
  regularMarketPrice?: number;
  regularMarketTime?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
}

interface SessionBars {
  session: TradingSession;
  bars: Bar[];
  closes: number[];
  totalSteps: number;
}

interface SymbolData {
  meta: ChartMeta;
  bars: Bar[];
  sessions: SessionBars[]; // newest first, only sessions with bars
  dailyVol: number;
  fetchedAt: number;
}

async function fetchChart(symbol: string): Promise<{ meta: ChartMeta; bars: Bar[] }> {
  const res = await fetch(`/market-data?symbol=${encodeURIComponent(METAS[symbol].yahoo)}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`market-data ${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp) throw new Error(`market-data ${symbol}: no data`);

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
  return { meta: result.meta, bars };
}

function groupSessions(symbol: string, bars: Bar[], now: Date): SessionBars[] {
  const out: SessionBars[] = [];
  let session = sessionOnOrBefore(symbol, now);
  for (let i = 0; i < SESSIONS_BACK; i++) {
    const from = session.open.getTime();
    const to = session.close.getTime() + CLOSE_GRACE_MS;
    const sessionBars = bars.filter((b) => b.t >= from && b.t < to);
    if (sessionBars.length) {
      out.push({
        session,
        bars: sessionBars,
        closes: sessionBars.map((b) => b.close),
        totalSteps: Math.max(sessionBars.length, Math.round(totalTradingSeconds(session) / 300)),
      });
    }
    session = previousSession(session);
  }
  return out;
}

/** Pooled 5-minute log-return volatility scaled to a full session. */
function estimateDailyVol(sessions: SessionBars[]): number {
  let sumSq = 0, count = 0, steps = 0;
  for (const s of sessions) {
    for (let i = 1; i < s.closes.length; i++) {
      const r = Math.log(s.closes[i] / s.closes[i - 1]);
      sumSq += r * r;
      count++;
    }
    steps += s.totalSteps;
  }
  if (!count) return 0.01;
  const perBar = Math.sqrt(sumSq / count);
  return Math.min(0.04, Math.max(0.004, perBar * Math.sqrt(steps / sessions.length)));
}

export class RealMarketEngine {
  private data: Record<string, SymbolData> = {};
  private inflight: Promise<boolean> | null = null;

  get ready(): boolean {
    return Object.keys(METAS).every((s) => this.data[s]);
  }

  /** Fetches all symbols at most every 30 seconds; resolves to whether real data is available. */
  public refresh(now: Date = new Date()): Promise<boolean> {
    const stale = Object.keys(METAS).some((s) => !this.data[s] || now.getTime() - this.data[s].fetchedAt >= REFRESH_MS);
    if (!stale) return Promise.resolve(this.ready);
    if (!this.inflight) {
      this.inflight = Promise.allSettled(
        Object.keys(METAS).map(async (sym) => {
          const { meta, bars } = await fetchChart(sym);
          const sessions = groupSessions(sym, bars, now);
          if (!sessions.length) throw new Error(`market-data ${sym}: no session bars`);
          this.data[sym] = { meta, bars, sessions, dailyVol: estimateDailyVol(sessions.slice(1)), fetchedAt: Date.now() };
        }),
      ).then((results) => {
        results.forEach((r) => r.status === 'rejected' && console.warn(r.reason));
        this.inflight = null;
        return this.ready;
      });
    }
    return this.inflight;
  }

  /** Latest session with data that has started by `now`. */
  private latest(symbol: string, now: Date): SessionBars {
    const d = this.data[symbol];
    return d.sessions.find((s) => s.session.open.getTime() <= now.getTime()) ?? d.sessions[d.sessions.length - 1];
  }

  private forecastAt(symbol: string, sb: SessionBars, step: number): CloseForecastResult {
    return forecastClose({
      prices: sb.closes,
      step,
      totalSteps: sb.totalSteps,
      dailyVol: this.data[symbol].dailyVol,
      trendWindow: 6,
    });
  }

  /** Index of the last bar completed at the lock time (-1 if none). */
  private lockStep(sb: SessionBars): number {
    const lockAt = sb.session.lockAt.getTime();
    let idx = -1;
    sb.bars.forEach((b, i) => {
      if (b.t + BAR_MS <= lockAt) idx = i;
    });
    return idx;
  }

  private isLatestSession(symbol: string, sb: SessionBars): boolean {
    return this.data[symbol].sessions[0] === sb;
  }

  /** Last traded price of a session; the quote price covers auction prints after the last bar. */
  private lastPrice(symbol: string, sb: SessionBars): number {
    const meta = this.data[symbol].meta;
    if (this.isLatestSession(symbol, sb) && meta.regularMarketPrice && meta.regularMarketTime) {
      const t = meta.regularMarketTime * 1000;
      if (t >= sb.session.open.getTime() && t < sb.session.close.getTime() + CLOSE_GRACE_MS) return round2(meta.regularMarketPrice);
    }
    return sb.closes[sb.closes.length - 1];
  }

  private previousClose(symbol: string, sb: SessionBars): number {
    const d = this.data[symbol];
    if (this.isLatestSession(symbol, sb) && d.meta.previousClose) return round2(d.meta.previousClose);
    const idx = d.sessions.indexOf(sb);
    const prev = d.sessions[idx + 1];
    return prev ? this.lastPrice(symbol, prev) : sb.bars[0].open;
  }

  private closeForecast(symbol: string, sb: SessionBars, now: Date) {
    const locked = now.getTime() >= sb.session.lockAt.getTime();
    const lockStep = this.lockStep(sb);
    const step = locked && lockStep >= 0 ? lockStep : sb.closes.length - 1;
    const f = this.forecastAt(symbol, sb, step);
    const closed = now.getTime() >= sb.session.close.getTime();
    const actual = closed ? this.lastPrice(symbol, sb) : null;

    const forecast: CloseForecast = {
      session_date: sb.session.dateKey,
      value: f.expected,
      lower: f.lower,
      upper: f.upper,
      locked,
      locked_at: locked ? sb.session.lockAt.toISOString() : null,
      price_at_lock: locked && lockStep >= 0 ? sb.closes[lockStep] : null,
      actual_close: actual,
      error: actual !== null ? round2(actual - f.expected) : null,
      error_pct: actual !== null ? Math.round(((actual - f.expected) / actual) * 10000) / 100 : null,
    };
    return { forecast, f };
  }

  public getMarkets(now: Date = new Date()): MarketSummary[] {
    return Object.keys(METAS).map((sym) => {
      const meta = METAS[sym];
      const d = this.data[sym];
      const sb = this.latest(sym, now);
      const curr = this.lastPrice(sym, sb);
      const prevClose = this.previousClose(sym, sb);
      const change = round2(curr - prevClose);
      const { forecast, f } = this.closeForecast(sym, sb, now);
      const probUp = f.direction === 'SIDEWAYS' ? 0.3 : f.pUp;

      // No bars for today's session well after the scheduled open: exchange holiday
      const calendar = getSessionState(sym, now);
      const noTradingToday =
        calendar.current.dateKey !== sb.session.dateKey && now.getTime() > calendar.current.open.getTime() + 20 * 60_000;
      const useQuote = this.isLatestSession(sym, sb);

      return {
        symbol: sym,
        name: meta.name,
        market: meta.market,
        currency: meta.currency,
        current_price: curr,
        day_open: sb.bars[0].open,
        day_high: useQuote && d.meta.regularMarketDayHigh ? round2(d.meta.regularMarketDayHigh) : round2(Math.max(...sb.bars.map((b) => b.high))),
        day_low: useQuote && d.meta.regularMarketDayLow ? round2(d.meta.regularMarketDayLow) : round2(Math.min(...sb.bars.map((b) => b.low))),
        previous_close: prevClose,
        change,
        change_percent: Math.round((change / prevClose) * 10000) / 100,
        data_latency_ms: 0,
        is_stale: calendar.status !== 'OPEN' && calendar.status !== 'LOCKED',
        market_status: noTradingToday ? 'HOLIDAY' : calendar.status,
        last_update: new Date((d.meta.regularMarketTime ?? sb.bars[sb.bars.length - 1].t / 1000) * 1000).toISOString(),
        expected_close: forecast.value,
        close_forecast: forecast,
        prediction_range: { lower: forecast.lower, upper: forecast.upper, probability: 0.8 },
        direction: f.direction,
        direction_probability: Math.round(Math.max(probUp, 1 - probUp) * 100) / 100,
        stabilization_zone: {
          stabilization_low: f.stabLow,
          stabilization_high: f.stabHigh,
          stabilization_probability: 0.7,
        },
        confidence: f.confidence,
        convergence_stability: forecast.locked || f.confidence >= 0.7 ? 'HIGH' : 'LOW',
      };
    });
  }

  public getCandles(symbol: string, now: Date = new Date(), limit = 60): Candle[] {
    return this.data[symbol].bars
      .filter((b) => b.t <= now.getTime())
      .slice(-limit)
      .map((b) => ({ instrument_code: symbol, timeframe: '5m', bucket_time: new Date(b.t).toISOString(), open: b.open, high: b.high, low: b.low, close: b.close, volume: 0 }));
  }

  public getPrediction(symbol: string, horizonMinutes = 5, now: Date = new Date()): HorizonPrediction {
    const sb = this.latest(symbol, now);
    return this.predictionFromStep(symbol, sb, sb.closes.length - 1, horizonMinutes, now);
  }

  public getClosePrediction(symbol: string, now: Date = new Date()): HorizonPrediction {
    const sb = this.latest(symbol, now);
    const lockStep = this.lockStep(sb);
    const locked = now.getTime() >= sb.session.lockAt.getTime() && lockStep >= 0;
    return { ...this.predictionFromStep(symbol, sb, locked ? lockStep : sb.closes.length - 1, 24 * 60, now), horizon: 'Close' };
  }

  private predictionFromStep(symbol: string, sb: SessionBars, step: number, horizonMinutes: number, now: Date): HorizonPrediction {
    const f = this.forecastAt(symbol, sb, step);
    const remaining = Math.max(0, sb.totalSteps - 1 - step);
    const frac = remaining > 0 ? Math.min(1, horizonMinutes / 5 / remaining) : 0;
    const p = f.price;
    const expected = round2(p + (f.expected - p) * frac);
    const sigma = f.sigma * Math.sqrt(frac);
    const threshold = p * 0.0003;
    const diff = expected - p;
    const direction: 'UP' | 'DOWN' | 'SIDEWAYS' = diff > threshold ? 'UP' : diff < -threshold ? 'DOWN' : 'SIDEWAYS';
    const pUp = direction === 'SIDEWAYS' ? 0.3 : f.pUp;
    const pDown = direction === 'SIDEWAYS' ? 0.3 : 1 - f.pUp;
    const target = new Date(now.getTime() + horizonMinutes * 60_000);
    const band = (z: number) => ({ lower: round2(expected - z * sigma), upper: round2(expected + z * sigma) });

    return {
      symbol,
      horizon: `${horizonMinutes}m`,
      horizon_minutes: horizonMinutes,
      model_version: MODEL_VERSION,
      current_price: p,
      expected_price: expected,
      expected_close: f.expected,
      lower_bound: band(1.282).lower,
      upper_bound: band(1.282).upper,
      intervals: { 50: band(0.674), 80: band(1.282), 95: band(1.96) },
      direction,
      direction_probability: Math.round(Math.max(pUp, pDown, 1 - pUp - pDown) * 100) / 100,
      probabilities: {
        up: Math.round(pUp * 100) / 100,
        down: Math.round(pDown * 100) / 100,
        sideways: Math.round(Math.max(0, 1 - pUp - pDown) * 100) / 100,
      },
      stabilization_zone: { stabilization_low: f.stabLow, stabilization_high: f.stabHigh, stabilization_probability: 0.7 },
      confidence: f.confidence,
      convergence_stability: f.confidence >= 0.7 ? 'HIGH' : 'LOW',
      prediction_time: now.toISOString(),
      target_time: target.getTime() > sb.session.close.getTime() ? sb.session.close.toISOString() : target.toISOString(),
    };
  }

  /** Close forecast after each bar of the latest session, frozen from the lock time. */
  public getTimeline(symbol: string, now: Date = new Date()) {
    const sb = this.latest(symbol, now);
    const lockStep = this.lockStep(sb);
    const lockAt = sb.session.lockAt.getTime();
    return sb.bars.map((b, k) => {
      const frozen = lockStep >= 0 && b.t + BAR_MS > lockAt;
      const f = this.forecastAt(symbol, sb, frozen ? lockStep : k);
      return {
        timestamp: new Date(b.t).toISOString(),
        current_price: b.close,
        expected_price: f.expected,
        lower_bound: f.lower,
        upper_bound: f.upper,
        stabilization_low: f.stabLow,
        stabilization_high: f.stabHigh,
      };
    });
  }

  /** Locked close forecasts versus actual closes for every completed session in the data. */
  public getAccuracy(symbol: string, now: Date = new Date()): AccuracyReport {
    const evals: EvaluatedForecast[] = [];
    for (const sb of this.data[symbol].sessions) {
      if (now.getTime() < sb.session.close.getTime()) continue;
      const lockStep = this.lockStep(sb);
      if (lockStep < 2) continue;
      const f = this.forecastAt(symbol, sb, lockStep);
      evals.push({ ...f, current: sb.closes[lockStep], actual: this.lastPrice(symbol, sb) });
    }
    return calculateAccuracy(evals, METAS[symbol].tickSize);
  }
}

export const realEngine = new RealMarketEngine();

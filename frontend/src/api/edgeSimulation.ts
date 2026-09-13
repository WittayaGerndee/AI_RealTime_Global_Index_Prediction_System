import { MarketSummary, Candle, HorizonPrediction, AccuracyReport, CloseForecast } from '../types/market';
import {
  TradingSession,
  getSessionState,
  sessionOnOrBefore,
  previousSession,
  tradingSecondsElapsed,
  totalTradingSeconds,
  instantAtTradingSecond,
} from '../utils/marketSessions';

// Offline demo engine used when the backend is unreachable.
// Prices are a deterministic, seeded path per trading session: they only move while
// the exchange is open, stay flat during lunch breaks and after the close, and are
// identical across page reloads. Every forecast uses only prices up to that moment.

const STEP_SEC = 5;
const MODEL_VERSION = 'v1.1.0-SessionClose';

const METAS: Record<string, { name: string; market: string; currency: string; base: number; dailyVol: number; tickSize: number; phase: number }> = {
  NIKKEI225: { name: 'Nikkei 225', market: 'TSE', currency: 'JPY', base: 38450, dailyVol: 0.011, tickSize: 5, phase: 0.3 },
  HSI: { name: 'Hang Seng Index', market: 'HKEX', currency: 'HKD', base: 17820, dailyVol: 0.013, tickSize: 1, phase: 1.7 },
  SSE: { name: 'Shanghai Composite', market: 'SSE', currency: 'CNY', base: 2860, dailyVol: 0.009, tickSize: 0.01, phase: 2.9 },
  DJI: { name: 'Dow Jones Industrial', market: 'NYSE', currency: 'USD', base: 40850, dailyVol: 0.008, tickSize: 1, phase: 4.1 },
};

export const SYMBOLS = ['NIKKEI225', 'HSI', 'SSE', 'DJI'];

interface SessionPath {
  session: TradingSession;
  prevClose: number;
  totalSec: number;
  prices: Float64Array; // prices[k] = price after k steps; prices[0] = open
  volumes: Float64Array;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Deterministic closing level for a session date. */
function closeAnchor(symbol: string, dateKey: string): number {
  const meta = METAS[symbol];
  const day = Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000;
  const noise = mulberry32(hashString(`anchor:${symbol}:${dateKey}`))() - 0.5;
  return meta.base * (1 + 0.035 * Math.sin(day / 11 + meta.phase) + 0.015 * Math.sin(day / 3.7 + meta.phase * 2) + 0.012 * noise);
}

export class EdgeSimulationEngine {
  private pathCache = new Map<string, SessionPath>();

  private getPath(session: TradingSession): SessionPath {
    const key = `${session.symbol}:${session.dateKey}`;
    const cached = this.pathCache.get(key);
    if (cached) return cached;

    const { symbol, dateKey } = session;
    const meta = METAS[symbol];
    const rand = mulberry32(hashString(`path:${symbol}:${dateKey}`));
    const prevClose = closeAnchor(symbol, previousSession(session).dateKey);
    const close = closeAnchor(symbol, dateKey);
    const open = prevClose * (1 + gaussian(rand) * 0.003);

    const totalSec = totalTradingSeconds(session);
    const n = Math.max(1, Math.round(totalSec / STEP_SEC));
    const stepVol = meta.dailyVol / Math.sqrt(n);

    // Brownian bridge in log-price from open to close
    const walk = new Float64Array(n + 1);
    for (let k = 1; k <= n; k++) walk[k] = walk[k - 1] + gaussian(rand) * stepVol;
    const logOpen = Math.log(open);
    const logClose = Math.log(close);
    const prices = new Float64Array(n + 1);
    const volumes = new Float64Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const frac = k / n;
      prices[k] = round2(Math.exp(logOpen + (logClose - logOpen) * frac + walk[k] - frac * walk[n]));
      volumes[k] = Math.floor(rand() * 40 + 10);
    }

    const path = { session, prevClose: round2(prevClose), totalSec, prices, volumes };
    this.pathCache.set(key, path);
    if (this.pathCache.size > 120) {
      const oldest = this.pathCache.keys().next().value;
      if (oldest) this.pathCache.delete(oldest);
    }
    return path;
  }

  private stepAt(path: SessionPath, now: Date): number {
    const sec = Math.min(path.totalSec, tradingSecondsElapsed(path.session, now));
    return Math.min(path.prices.length - 1, Math.floor(sec / STEP_SEC));
  }

  /** Session to display: the one in progress, or the most recently finished one. */
  private currentPath(symbol: string, now: Date): SessionPath {
    return this.getPath(sessionOnOrBefore(symbol, now));
  }

  /**
   * Forecast of the session's closing price using only prices up to `step`.
   * Combines recent trend (damped) with reversion to the session VWAP, scaled by
   * the trading time remaining.
   */
  private forecastCloseAt(path: SessionPath, step: number) {
    const meta = METAS[path.session.symbol];
    const n = path.prices.length - 1;
    const p = path.prices[step];
    const remainingFrac = Math.max(0, (n - step) / n);

    // Trend: least-squares slope of log price over the last 30 minutes
    const window = Math.min(step, Math.round(1800 / STEP_SEC));
    let slope = 0;
    if (window >= 12) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i <= window; i++) {
        const y = Math.log(path.prices[step - window + i]);
        sx += i; sy += y; sxx += i * i; sxy += i * y;
      }
      const cnt = window + 1;
      slope = (cnt * sxy - sx * sy) / Math.max(1e-9, cnt * sxx - sx * sx);
    }

    // Session VWAP so far
    let pv = 0, vol = 0;
    for (let i = 0; i <= step; i++) {
      pv += path.prices[i] * path.volumes[i];
      vol += path.volumes[i];
    }
    const vwap = vol > 0 ? pv / vol : p;

    const sigma = p * meta.dailyVol * Math.sqrt(Math.max(remainingFrac, 1 / n));
    const trendMove = p * slope * (n - step) * 0.35;
    const reversionMove = (vwap - p) * 0.25 * remainingFrac;
    const move = Math.max(-1.2 * sigma, Math.min(1.2 * sigma, trendMove + reversionMove));
    const expected = round2(p + move);

    const threshold = p * 0.0003;
    const direction: 'UP' | 'DOWN' | 'SIDEWAYS' = move > threshold ? 'UP' : move < -threshold ? 'DOWN' : 'SIDEWAYS';
    const z = move / Math.max(1e-9, sigma);
    const pUp = 1 / (1 + Math.exp(-2.2 * z));

    return {
      price: p,
      expected,
      sigma,
      lower: round2(expected - 1.282 * sigma),
      upper: round2(expected + 1.282 * sigma),
      stabLow: round2(expected - Math.max(p * 0.0008, 0.45 * sigma)),
      stabHigh: round2(expected + Math.max(p * 0.0008, 0.45 * sigma)),
      direction,
      pUp,
      confidence: Math.round((0.5 + 0.4 * (1 - remainingFrac)) * 100) / 100,
    };
  }

  private lockStep(path: SessionPath): number {
    return this.stepAt(path, path.session.lockAt);
  }

  /** Close forecast as shown to the user: live before the lock time, frozen afterwards. */
  private closeForecast(path: SessionPath, now: Date) {
    const lockStep = this.lockStep(path);
    const locked = now.getTime() >= path.session.lockAt.getTime();
    const step = locked ? lockStep : this.stepAt(path, now);
    const f = this.forecastCloseAt(path, step);
    const closed = now.getTime() >= path.session.close.getTime();
    const actual = closed ? path.prices[path.prices.length - 1] : null;

    const forecast: CloseForecast = {
      session_date: path.session.dateKey,
      value: f.expected,
      lower: f.lower,
      upper: f.upper,
      locked,
      locked_at: locked ? path.session.lockAt.toISOString() : null,
      price_at_lock: locked ? path.prices[lockStep] : null,
      actual_close: actual,
      error: actual !== null ? round2(actual - f.expected) : null,
      error_pct: actual !== null ? Math.round(((actual - f.expected) / actual) * 10000) / 100 : null,
    };
    return { forecast, f };
  }

  public getMarkets(now: Date = new Date()): MarketSummary[] {
    return SYMBOLS.map((sym) => {
      const meta = METAS[sym];
      const path = this.currentPath(sym, now);
      const step = this.stepAt(path, now);
      const curr = path.prices[step];

      let high = -Infinity, low = Infinity;
      for (let i = 0; i <= step; i++) {
        high = Math.max(high, path.prices[i]);
        low = Math.min(low, path.prices[i]);
      }

      const { forecast, f } = this.closeForecast(path, now);
      const state = getSessionState(sym, now);
      const change = round2(curr - path.prevClose);
      const probUp = f.direction === 'SIDEWAYS' ? 0.3 : f.pUp;

      return {
        symbol: sym,
        name: meta.name,
        market: meta.market,
        currency: meta.currency,
        current_price: curr,
        day_open: path.prices[0],
        day_high: round2(high),
        day_low: round2(low),
        previous_close: path.prevClose,
        change,
        change_percent: Math.round((change / path.prevClose) * 10000) / 100,
        data_latency_ms: 0,
        is_stale: state.status !== 'OPEN' && state.status !== 'LOCKED',
        market_status: state.status,
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
        convergence_stability: forecast.locked ? 'HIGH' : f.confidence >= 0.7 ? 'HIGH' : 'LOW',
      };
    });
  }

  /** 5-minute candles for the current session, padded with the previous session. */
  public getCandles(symbol: string, now: Date = new Date(), limit = 60): Candle[] {
    const path = this.currentPath(symbol, now);
    const prev = this.getPath(previousSession(path.session));
    const candles = [...this.buildCandles(prev, prev.prices.length - 1), ...this.buildCandles(path, this.stepAt(path, now))];
    return candles.slice(-limit);
  }

  private buildCandles(path: SessionPath, uptoStep: number): Candle[] {
    const perBucket = Math.round(300 / STEP_SEC);
    const out: Candle[] = [];
    for (let start = 0; start < uptoStep; start += perBucket) {
      const end = Math.min(uptoStep, start + perBucket);
      let high = -Infinity, low = Infinity, volume = 0;
      for (let i = start; i <= end; i++) {
        high = Math.max(high, path.prices[i]);
        low = Math.min(low, path.prices[i]);
        volume += path.volumes[i];
      }
      out.push({
        instrument_code: path.session.symbol,
        timeframe: '5m',
        bucket_time: instantAtTradingSecond(path.session, start * STEP_SEC).toISOString(),
        open: path.prices[start],
        high: round2(high),
        low: round2(low),
        close: path.prices[end],
        volume,
      });
    }
    return out;
  }

  /** Short-horizon forecast; horizons past the close collapse onto the close forecast. */
  public getPrediction(symbol: string, horizonMinutes = 5, now: Date = new Date()): HorizonPrediction {
    const path = this.currentPath(symbol, now);
    const step = this.stepAt(path, now);
    return this.predictionFromStep(path, step, horizonMinutes, now);
  }

  /** Forecast to the session close, frozen at the lock step from 30 minutes before the close. */
  public getClosePrediction(symbol: string, now: Date = new Date()): HorizonPrediction {
    const path = this.currentPath(symbol, now);
    const locked = now.getTime() >= path.session.lockAt.getTime();
    const step = locked ? this.lockStep(path) : this.stepAt(path, now);
    return { ...this.predictionFromStep(path, step, 24 * 60, now), horizon: 'Close' };
  }

  private predictionFromStep(path: SessionPath, step: number, horizonMinutes: number, now: Date): HorizonPrediction {
    const symbol = path.session.symbol;
    const n = path.prices.length - 1;
    const f = this.forecastCloseAt(path, step);
    const hSteps = Math.min(n - step, Math.round((horizonMinutes * 60) / STEP_SEC));
    const frac = n - step > 0 ? hSteps / (n - step) : 0;
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
      stabilization_zone: {
        stabilization_low: f.stabLow,
        stabilization_high: f.stabHigh,
        stabilization_probability: 0.7,
      },
      confidence: f.confidence,
      convergence_stability: f.confidence >= 0.7 ? 'HIGH' : 'LOW',
      prediction_time: now.toISOString(),
      target_time: target.getTime() > path.session.close.getTime() ? path.session.close.toISOString() : target.toISOString(),
    };
  }

  /** Evolution of the close forecast through the session (every 5 minutes), frozen after the lock. */
  public getTimeline(symbol: string, now: Date = new Date()) {
    const path = this.currentPath(symbol, now);
    const current = this.stepAt(path, now);
    const lockStep = this.lockStep(path);
    const perBucket = Math.round(300 / STEP_SEC);
    const items = [];
    for (let step = perBucket; step <= current; step += perBucket) {
      items.push(this.timelinePoint(path, step, lockStep));
    }
    if (current % perBucket !== 0 && current > 0) items.push(this.timelinePoint(path, current, lockStep));
    return items;
  }

  private timelinePoint(path: SessionPath, step: number, lockStep: number) {
    const f = this.forecastCloseAt(path, Math.min(step, lockStep));
    return {
      timestamp: instantAtTradingSecond(path.session, step * STEP_SEC).toISOString(),
      current_price: path.prices[step],
      expected_price: f.expected,
      lower_bound: f.lower,
      upper_bound: f.upper,
      stabilization_low: f.stabLow,
      stabilization_high: f.stabHigh,
    };
  }

  /** Accuracy of locked close forecasts over the last `sessions` completed sessions. */
  public getAccuracy(symbol: string, now: Date = new Date(), sessions = 20): AccuracyReport {
    const meta = METAS[symbol];
    let session = sessionOnOrBefore(symbol, now);
    if (now.getTime() < session.close.getTime()) session = previousSession(session);

    const evals = [];
    for (let i = 0; i < sessions; i++) {
      const path = this.getPath(i === 0 ? session : previousSession(session, i));
      const lockStep = this.lockStep(path);
      const f = this.forecastCloseAt(path, lockStep);
      evals.push({ ...f, current: path.prices[lockStep], actual: path.prices[path.prices.length - 1] });
    }
    return calculateMetrics(evals, meta.tickSize);
  }
}

function calculateMetrics(
  evals: { expected: number; lower: number; upper: number; stabLow: number; stabHigh: number; direction: string; current: number; actual: number }[],
  tickSize: number,
): AccuracyReport {
  const n = evals.length;
  let absSum = 0, sqSum = 0, smape = 0, dir = 0, range = 0, stab = 0;
  let exact = 0, t05 = 0, t10 = 0, t20 = 0, t30 = 0;
  for (const e of evals) {
    const err = Math.abs(e.expected - e.actual);
    absSum += err;
    sqSum += err * err;
    smape += (err / ((Math.abs(e.actual) + Math.abs(e.expected)) / 2)) * 100;
    const move = e.actual - e.current;
    if ((e.direction === 'UP' && move > 0) || (e.direction === 'DOWN' && move < 0) || (e.direction === 'SIDEWAYS' && Math.abs(move) <= e.current * 0.0003)) dir++;
    if (e.lower <= e.actual && e.actual <= e.upper) range++;
    if (e.stabLow <= e.actual && e.actual <= e.stabHigh) stab++;
    const pct = (err / e.actual) * 100;
    if (err <= tickSize) exact++;
    if (pct <= 0.05) t05++;
    if (pct <= 0.1) t10++;
    if (pct <= 0.2) t20++;
    if (pct <= 0.3) t30++;
  }
  const pctOf = (v: number) => Math.round((v / n) * 1000) / 10;
  return {
    total_predictions: n,
    mae: round2(absSum / n),
    rmse: round2(Math.sqrt(sqSum / n)),
    smape: round2(smape / n),
    direction_accuracy: pctOf(dir),
    range_coverage: pctOf(range),
    stabilization_hit_rate: pctOf(stab),
    tolerances: {
      exact_match: pctOf(exact),
      within_0_05_pct: pctOf(t05),
      within_0_10_pct: pctOf(t10),
      within_0_20_pct: pctOf(t20),
      within_0_30_pct: pctOf(t30),
    },
  };
}

export const edgeEngine = new EdgeSimulationEngine();

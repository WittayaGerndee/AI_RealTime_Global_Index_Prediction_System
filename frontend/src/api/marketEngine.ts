import { MarketSummary, Candle, HorizonPrediction, AccuracyReport, SegmentForecast, SegmentAccuracy } from '../types/market';
import {
  SYMBOLS,
  EXCHANGE_SCHEDULES,
  TradingSegment,
  getSessionState,
  sessionOnOrBefore,
  previousSession,
} from '../utils/marketSessions';
import {
  Bar,
  BAR_MS,
  FINAL_CLOSE_GRACE_MS,
  SessionBars,
  SegmentModel,
  ForecastMoment,
  SegmentForecastResult,
  EvaluatedForecast,
  momentKey,
  lastCompletedIndex,
  segmentCloseIndex,
  featuresAt,
  buildSample,
  fitSegmentModel,
  predictSegment,
  calculateAccuracy,
  round2,
} from '../utils/closeForecast';

// Turns 5-minute bars from a BarSource (real Yahoo Finance data or the offline simulation)
// into market summaries and per-segment closing forecasts. Forecasts only use bars
// completed by the moment they represent, so a locked forecast is reproducible.

export interface Quote {
  price?: number;
  time?: number; // ms
  previousClose?: number;
  dayHigh?: number;
  dayLow?: number;
}

export interface BarSource {
  readonly ready: boolean;
  /** Changes whenever past bars change (not for every live-bar update). */
  readonly historyVersion: number;
  refresh(now: Date): Promise<boolean>;
  bars(symbol: string): Bar[];
  quote(symbol: string): Quote | null;
}

const METAS: Record<string, { name: string; market: string; currency: string; tickSize: number }> = {
  NIKKEI225: { name: 'Nikkei 225', market: 'TSE', currency: 'JPY', tickSize: 1 },
  HSI: { name: 'Hang Seng Index', market: 'HKEX', currency: 'HKD', tickSize: 1 },
  SZSE: { name: 'SZSE Component', market: 'SZSE', currency: 'CNY', tickSize: 0.01 },
  DJI: { name: 'Dow Jones Industrial', market: 'NYSE', currency: 'USD', tickSize: 1 },
};

const SESSIONS_BACK = 65;
const MIN_TRAIN_WALK_FORWARD = 15;
const HOLIDAY_GRACE_MS = 20 * 60_000;

function lowerBound(bars: Bar[], t: number): number {
  let lo = 0, hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class MarketEngine {
  private sessionCache = new Map<string, { key: string; sessions: SessionBars[] }>();
  private modelCache = new Map<string, SegmentModel>();
  private volCache = new Map<string, number>();

  constructor(private source: BarSource, private modelVersion: string) {}

  get ready(): boolean {
    return this.source.ready;
  }

  refresh(now: Date = new Date()): Promise<boolean> {
    return this.source.refresh(now);
  }

  /** Sessions that have bars, newest first. */
  private sessions(symbol: string, now: Date): SessionBars[] {
    const bars = this.source.bars(symbol);
    const last = bars[bars.length - 1];
    const newest = sessionOnOrBefore(symbol, now);
    const key = `${bars.length}:${last?.t}:${last?.close}:${newest.dateKey}`;
    const cached = this.sessionCache.get(symbol);
    if (cached?.key === key) return cached.sessions;

    const out: SessionBars[] = [];
    let session = newest;
    for (let i = 0; i < SESSIONS_BACK; i++) {
      const from = lowerBound(bars, session.open.getTime());
      const to = lowerBound(bars, session.close.getTime() + FINAL_CLOSE_GRACE_MS);
      if (to > from) out.push({ session, bars: bars.slice(from, to) });
      session = previousSession(session);
    }
    this.sessionCache.set(symbol, { key, sessions: out });
    return out;
  }

  /** Latest session with data that has started by `now`. */
  private displaySession(symbol: string, now: Date): SessionBars | null {
    return this.sessions(symbol, now).find((s) => s.session.open.getTime() <= now.getTime()) ?? null;
  }

  /** Fully finished sessions, oldest first, excluding `excludeDateKey`. */
  private trainingSessions(symbol: string, now: Date, excludeDateKey?: string): SessionBars[] {
    return this.sessions(symbol, now)
      .filter((s) => s.session.close.getTime() + FINAL_CLOSE_GRACE_MS <= now.getTime() && s.session.dateKey !== excludeDateKey)
      .reverse();
  }

  private model(symbol: string, segIndex: number, moment: ForecastMoment, train: SessionBars[]): SegmentModel {
    const lastKey = train.length ? train[train.length - 1].session.dateKey : 'none';
    const key = `${symbol}:${segIndex}:${momentKey(moment)}:${lastKey}:${train.length}:${this.source.historyVersion}`;
    let model = this.modelCache.get(key);
    if (!model) {
      const samples = train.map((sb) => buildSample(sb, segIndex, moment)).filter((s) => s !== null);
      model = fitSegmentModel(samples);
      if (this.modelCache.size > 2000) this.modelCache.clear();
      this.modelCache.set(key, model);
    }
    return model;
  }

  /** Typical 5-minute log-return volatility, used only when history is too short for empirical intervals. */
  private perBarVol(symbol: string, train: SessionBars[]): number {
    const key = `${symbol}:${train.length}:${this.source.historyVersion}`;
    let vol = this.volCache.get(key);
    if (vol === undefined) {
      let sumSq = 0, count = 0;
      for (const sb of train) {
        for (let i = 1; i < sb.bars.length; i++) {
          sumSq += Math.log(sb.bars[i].close / sb.bars[i - 1].close) ** 2;
          count++;
        }
      }
      vol = count ? Math.sqrt(sumSq / count) : 0.001;
      this.volCache.set(key, vol);
    }
    return vol;
  }

  private isLatest(symbol: string, sb: SessionBars, now: Date): boolean {
    return this.sessions(symbol, now)[0] === sb;
  }

  /** Last traded price of a session; the quote covers closing-auction prints after the last bar. */
  private lastPrice(symbol: string, sb: SessionBars, now: Date): number {
    const q = this.source.quote(symbol);
    if (q?.price && q.time && this.isLatest(symbol, sb, now)) {
      if (q.time >= sb.session.open.getTime() && q.time < sb.session.close.getTime() + FINAL_CLOSE_GRACE_MS) return round2(q.price);
    }
    return sb.bars[sb.bars.length - 1].close;
  }

  private previousClose(symbol: string, sb: SessionBars, now: Date): number {
    const q = this.source.quote(symbol);
    if (q?.previousClose && this.isLatest(symbol, sb, now)) return round2(q.previousClose);
    const all = this.sessions(symbol, now);
    const prev = all[all.indexOf(sb) + 1];
    return prev ? this.lastPrice(symbol, prev, now) : sb.bars[0].open;
  }

  private forecastSegment(symbol: string, sb: SessionBars, seg: TradingSegment, now: Date): { forecast: SegmentForecast; result: SegmentForecastResult } | null {
    const t = now.getTime();
    const locked = t >= seg.lockAt.getTime();
    const at = locked ? seg.lockAt.getTime() : t;
    const idx = lastCompletedIndex(sb.bars, at);
    if (idx < 0) return null;

    // Live forecasts follow the latest price; locked ones use the bar completed at the lock time
    const price = locked ? sb.bars[idx].close : this.lastPrice(symbol, sb, now);
    const moment: ForecastMoment = locked ? { kind: 'lock' } : { kind: 'before_close', ms: seg.close.getTime() - t };
    const train = this.trainingSessions(symbol, now, sb.session.dateKey);
    const model = this.model(symbol, seg.index, moment, train);
    const barsToClose = Math.max(1, (seg.close.getTime() - at) / BAR_MS);
    const result = predictSegment(model, price, featuresAt(sb.bars, idx, price), this.perBarVol(symbol, train) * Math.sqrt(barsToClose));

    const closedAt = seg.close.getTime() + (seg.isFinal ? FINAL_CLOSE_GRACE_MS : 0);
    const target = segmentCloseIndex(sb.bars, seg);
    let actual: number | null = null;
    if (t >= seg.close.getTime() && target >= 0 && (t >= closedAt || !seg.isFinal)) {
      actual = seg.isFinal ? this.lastPrice(symbol, sb, now) : sb.bars[target].close;
    }

    const forecast: SegmentForecast = {
      segment_index: seg.index,
      label: seg.label,
      lock_at: seg.lockAt.toISOString(),
      close_at: seg.close.toISOString(),
      status: actual !== null ? 'CLOSED' : locked ? 'LOCKED' : 'LIVE',
      model: model.kind,
      training_sessions: model.samples,
      session_date: sb.session.dateKey,
      value: result.expected,
      lower: result.lower,
      upper: result.upper,
      locked,
      locked_at: locked ? seg.lockAt.toISOString() : null,
      price_at_lock: locked ? price : null,
      actual_close: actual,
      error: actual !== null ? round2(actual - result.expected) : null,
      error_pct: actual !== null ? Math.round(((actual - result.expected) / actual) * 10000) / 100 : null,
    };
    return { forecast, result };
  }

  /** Segment whose close is next (or the final one once the session is over). */
  private activeSegment(sb: SessionBars, now: Date): TradingSegment {
    return sb.session.segments.find((s) => now.getTime() < s.close.getTime()) ?? sb.session.segments[sb.session.segments.length - 1];
  }

  private activeForecast(symbol: string, sb: SessionBars, now: Date) {
    const segs = sb.session.segments;
    let seg = this.activeSegment(sb, now);
    let f = this.forecastSegment(symbol, sb, seg, now);
    // Too early for the active segment: fall back to the latest segment that has data
    for (let i = seg.index - 1; !f && i >= 0; i--) {
      seg = segs[i];
      f = this.forecastSegment(symbol, sb, seg, now);
    }
    return f ? { seg, ...f } : null;
  }

  public getMarkets(now: Date = new Date()): MarketSummary[] {
    return SYMBOLS.flatMap((sym) => {
      const meta = METAS[sym];
      const sb = this.displaySession(sym, now);
      if (!sb) return [];
      const q = this.source.quote(sym);
      const latest = this.isLatest(sym, sb, now);
      const curr = this.lastPrice(sym, sb, now);
      const prevClose = this.previousClose(sym, sb, now);
      const change = round2(curr - prevClose);

      const segmentForecasts = sb.session.segments
        .map((seg) => this.forecastSegment(sym, sb, seg, now)?.forecast)
        .filter((f): f is SegmentForecast => !!f);
      const active = this.activeForecast(sym, sb, now);

      // No bars for today's session well after the scheduled open: exchange holiday
      const calendar = getSessionState(sym, now);
      const noTradingToday = calendar.current.dateKey !== sb.session.dateKey && now.getTime() > calendar.current.open.getTime() + HOLIDAY_GRACE_MS;
      const r = active?.result;

      return [{
        symbol: sym,
        name: meta.name,
        market: meta.market,
        currency: meta.currency,
        current_price: curr,
        day_open: sb.bars[0].open,
        day_high: latest && q?.dayHigh ? round2(q.dayHigh) : round2(Math.max(...sb.bars.map((b) => b.high))),
        day_low: latest && q?.dayLow ? round2(q.dayLow) : round2(Math.min(...sb.bars.map((b) => b.low))),
        previous_close: prevClose,
        change,
        change_percent: Math.round((change / prevClose) * 10000) / 100,
        data_latency_ms: 0,
        is_stale: calendar.status !== 'OPEN' && calendar.status !== 'LOCKED',
        market_status: noTradingToday ? 'HOLIDAY' : calendar.status,
        last_update: new Date(q?.time ?? sb.bars[sb.bars.length - 1].t + BAR_MS).toISOString(),
        expected_close: r?.expected ?? curr,
        close_forecast: active?.forecast,
        segment_forecasts: segmentForecasts,
        prediction_range: { lower: r?.lower ?? curr, upper: r?.upper ?? curr, probability: 0.8 },
        direction: r?.direction ?? 'SIDEWAYS',
        direction_probability: r ? Math.round(Math.max(r.pUp, r.pDown, r.pSideways) * 100) / 100 : 0,
        stabilization_zone: {
          stabilization_low: r?.stabLow ?? curr,
          stabilization_high: r?.stabHigh ?? curr,
          stabilization_probability: 0.5,
        },
        confidence: r?.confidence ?? 0,
        convergence_stability: active?.forecast.locked || (r?.confidence ?? 0) >= 0.7 ? 'HIGH' : 'LOW',
      }];
    });
  }

  public getCandles(symbol: string, now: Date = new Date(), limit = 60): Candle[] {
    const bars = this.source.bars(symbol);
    return bars
      .slice(0, lowerBound(bars, now.getTime() + 1))
      .slice(-limit)
      .map((b) => ({ instrument_code: symbol, timeframe: '5m', bucket_time: new Date(b.t).toISOString(), open: b.open, high: b.high, low: b.low, close: b.close, volume: 0 }));
  }

  /** Horizon forecast that moves toward the active segment's close forecast in proportion to time. */
  public getPrediction(symbol: string, horizonMinutes = 5, now: Date = new Date()): HorizonPrediction | null {
    const sb = this.displaySession(symbol, now);
    const active = sb && this.activeForecast(symbol, sb, now);
    if (!sb || !active) return null;
    const remaining = active.seg.close.getTime() - now.getTime();
    const frac = remaining > 0 ? Math.min(1, (horizonMinutes * 60_000) / remaining) : 1;
    return this.toHorizon(symbol, active.result, this.lastPrice(symbol, sb, now), frac, `${horizonMinutes}m`, horizonMinutes, now, active.seg.close);
  }

  public getClosePrediction(symbol: string, now: Date = new Date()): HorizonPrediction | null {
    const sb = this.displaySession(symbol, now);
    const active = sb && this.activeForecast(symbol, sb, now);
    if (!sb || !active) return null;
    return this.toHorizon(symbol, active.result, active.result.price, 1, 'Close', 0, now, active.seg.close);
  }

  private toHorizon(symbol: string, r: SegmentForecastResult, price: number, frac: number, label: string, minutes: number, now: Date, close: Date): HorizonPrediction {
    const expected = round2(price + (r.expected - price) * frac);
    const scale = Math.sqrt(frac);
    const band = (lo: number, hi: number) => ({ lower: round2(expected - (r.expected - lo) * scale), upper: round2(expected + (hi - r.expected) * scale) });
    const b80 = band(r.lower, r.upper);
    const b50 = band(r.stabLow, r.stabHigh);
    const target = new Date(Math.min(now.getTime() + minutes * 60_000, close.getTime()));
    return {
      symbol,
      horizon: label,
      horizon_minutes: minutes,
      model_version: `${this.modelVersion} · ${r.model.kind === 'ridge' ? 'Ridge' : 'Random walk'}`,
      current_price: price,
      expected_price: expected,
      expected_close: r.expected,
      lower_bound: b80.lower,
      upper_bound: b80.upper,
      intervals: { 50: b50, 80: b80, 95: b80 },
      direction: r.direction,
      direction_probability: Math.round(Math.max(r.pUp, r.pDown, r.pSideways) * 100) / 100,
      probabilities: {
        up: Math.round(r.pUp * 100) / 100,
        down: Math.round(r.pDown * 100) / 100,
        sideways: Math.round(r.pSideways * 100) / 100,
      },
      stabilization_zone: { stabilization_low: r.stabLow, stabilization_high: r.stabHigh, stabilization_probability: 0.5 },
      confidence: r.confidence,
      convergence_stability: r.confidence >= 0.7 ? 'HIGH' : 'LOW',
      prediction_time: now.toISOString(),
      target_time: label === 'Close' ? close.toISOString() : target.toISOString(),
    };
  }

  /** Forecast of the next segment close after each completed bar of the display session, frozen at lock times. */
  public getTimeline(symbol: string, now: Date = new Date()) {
    const sb = this.displaySession(symbol, now);
    if (!sb) return [];
    const points = [];
    for (const bar of sb.bars) {
      const end = bar.t + BAR_MS;
      if (end > now.getTime()) break;
      const at = new Date(end);
      const seg = this.activeSegment(sb, at);
      const f = this.forecastSegment(symbol, sb, seg, at);
      if (!f) continue;
      points.push({
        timestamp: at.toISOString(),
        current_price: bar.close,
        expected_price: f.result.expected,
        lower_bound: f.result.lower,
        upper_bound: f.result.upper,
        stabilization_low: f.result.stabLow,
        stabilization_high: f.result.stabHigh,
      });
    }
    return points;
  }

  /** Walk-forward evaluation of locked forecasts: each session is predicted from earlier sessions only. */
  public getAccuracy(symbol: string, now: Date = new Date()): AccuracyReport {
    const train = this.trainingSessions(symbol, now);
    const all: EvaluatedForecast[] = [];
    const segments: SegmentAccuracy[] = [];
    const specs = EXCHANGE_SCHEDULES[symbol].segments;

    specs.forEach((spec, segIndex) => {
      const rows = train.flatMap((sb) => {
        const sample = buildSample(sb, segIndex, { kind: 'lock' });
        if (!sample) return [];
        const seg = sb.session.segments[segIndex];
        const idx = lastCompletedIndex(sb.bars, seg.lockAt.getTime());
        return [{ sample, sb, price: sb.bars[idx].close, actual: sb.bars[segmentCloseIndex(sb.bars, seg)].close, idx }];
      });

      const evals: EvaluatedForecast[] = [];
      let baselineErr = 0, pctErr = 0;
      for (let i = MIN_TRAIN_WALK_FORWARD; i < rows.length; i++) {
        const model = fitSegmentModel(rows.slice(0, i).map((r) => r.sample));
        const { sb, price, actual, idx } = rows[i];
        const seg = sb.session.segments[segIndex];
        const vol = this.perBarVol(symbol, rows.slice(0, i).map((r) => r.sb)) * Math.sqrt(Math.max(1, (seg.close.getTime() - seg.lockAt.getTime()) / BAR_MS));
        const r = predictSegment(model, price, featuresAt(sb.bars, idx), vol);
        evals.push({ expected: r.expected, lower: r.lower, upper: r.upper, stabLow: r.stabLow, stabHigh: r.stabHigh, direction: r.direction, current: price, actual });
        baselineErr += Math.abs(actual - price);
        pctErr += (Math.abs(actual - r.expected) / actual) * 100;
      }
      if (!evals.length) return;

      const report = calculateAccuracy(evals, METAS[symbol].tickSize);
      segments.push({
        label: specs.length === 1 ? 'ทั้งวัน' : segIndex === 0 ? 'ช่วงเช้า' : 'ช่วงบ่าย',
        lock_time_th: spec.lockTh,
        total: evals.length,
        model: fitSegmentModel(rows.map((r) => r.sample)).kind,
        mae: report.mae,
        mae_pct: Math.round((pctErr / evals.length) * 1000) / 1000,
        baseline_mae: round2(baselineErr / evals.length),
        direction_accuracy: report.direction_accuracy,
        range_coverage: report.range_coverage,
        within_0_10_pct: report.tolerances.within_0_10_pct,
      });
      all.push(...evals);
    });

    return { ...calculateAccuracy(all, METAS[symbol].tickSize), segments };
  }
}

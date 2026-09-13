import type { AccuracyReport } from '../types/market';
import type { TradingSession, TradingSegment } from './marketSessions';

// Statistical closing-price model for one trading segment (morning / afternoon / full day).
//
// Training samples come from past sessions: the price known at a given moment (the lock
// time, or the same distance before the close) and the log return from there to the
// segment close. Two candidates are compared by walk-forward error on those samples:
//   - random walk: close = last known price (the strongest baseline for index prices
//     15–45 minutes before a close in 60-day backtests)
//   - ridge regression on recent momentum, return since open and distance from the
//     session average, heavily shrunk toward zero
// The candidate with the lower walk-forward error is used. Prediction intervals are
// empirical quantiles of that model's historical errors, not a normal approximation.

export const BAR_MS = 5 * 60_000;
/** HKEX closing-auction prints land after the 16:00 close. */
export const FINAL_CLOSE_GRACE_MS = 15 * 60_000;

const MIN_SAMPLES_FOR_MODEL = 12;
const MIN_TRAIN_WALK_FORWARD = 15;
const SIDEWAYS_THRESHOLD = 0.0003;

export const round2 = (v: number) => Math.round(v * 100) / 100;

export interface Bar {
  t: number; // bucket start, ms
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SessionBars {
  session: TradingSession;
  bars: Bar[]; // chronological, within [session open, session close + grace)
}

export type ModelKind = 'random_walk' | 'ridge';

export interface SegmentModel {
  kind: ModelKind;
  samples: number;
  beta: number[]; // [intercept, ...standardized feature weights]
  mean: number[];
  std: number[];
  residuals: number[]; // sorted log-return errors of the chosen model
  walkForwardMae: number | null; // log-return MAE of the chosen model
  baselineMae: number | null; // log-return MAE of the random walk
}

export interface SegmentForecastResult {
  price: number; // price known at the forecast moment
  expected: number;
  lower: number; // 80% interval
  upper: number;
  stabLow: number; // 50% interval
  stabHigh: number;
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  pUp: number;
  pDown: number;
  pSideways: number;
  confidence: number;
  model: SegmentModel;
}

/** Forecast moment: the segment's lock time, or a fixed distance before its close. */
export type ForecastMoment = { kind: 'lock' } | { kind: 'before_close'; ms: number };

export function momentKey(m: ForecastMoment): string {
  return m.kind === 'lock' ? 'lock' : `bc${Math.round(m.ms / BAR_MS)}`;
}

function momentTime(seg: TradingSegment, m: ForecastMoment): number {
  return m.kind === 'lock' ? seg.lockAt.getTime() : seg.close.getTime() - m.ms;
}

/** Index of the last bar fully completed by `at`, or -1. */
export function lastCompletedIndex(bars: Bar[], at: number): number {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t + BAR_MS <= at) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Index of the last bar belonging to the segment, or -1. */
export function segmentCloseIndex(bars: Bar[], seg: TradingSegment): number {
  const end = seg.close.getTime() + (seg.isFinal ? FINAL_CLOSE_GRACE_MS : 0);
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].t < end) return bars[i].t >= seg.open.getTime() ? i : -1;
  }
  return -1;
}

/** Features at bar `idx`: 30-minute log return, log return since open, log gap to session average. */
export function featuresAt(bars: Bar[], idx: number, price = bars[idx].close): number[] {
  const back = bars[Math.max(0, idx - 6)].close;
  let sum = 0;
  for (let i = 0; i <= idx; i++) sum += bars[i].close;
  return [Math.log(price / back), Math.log(price / bars[0].open), Math.log(sum / (idx + 1) / price)];
}

export interface Sample {
  x: number[];
  y: number;
}

/** Sample for one past session, or null when the data does not cover it. */
export function buildSample(sb: SessionBars, segIndex: number, moment: ForecastMoment): Sample | null {
  const seg = sb.session.segments[segIndex];
  const at = momentTime(seg, moment);
  const idx = lastCompletedIndex(sb.bars, at);
  const target = segmentCloseIndex(sb.bars, seg);
  if (idx < 0 || target < 0 || sb.bars[target].t + BAR_MS <= at) return null;
  return { x: featuresAt(sb.bars, idx), y: Math.log(sb.bars[target].close / sb.bars[idx].close) };
}

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    const d = m[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / d;
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / (row[i] || 1e-12));
}

function fitRidge(samples: Sample[]) {
  const n = samples.length;
  const k = samples[0].x.length;
  const mean = Array(k).fill(0);
  const std = Array(k).fill(0);
  for (const s of samples) s.x.forEach((v, j) => (mean[j] += v / n));
  for (const s of samples) s.x.forEach((v, j) => (std[j] += (v - mean[j]) ** 2 / n));
  for (let j = 0; j < k; j++) std[j] = Math.sqrt(std[j]) || 1;

  // Heavy shrinkage (lambda = 2n) keeps the fit near the random walk unless the signal is consistent
  const lambda = 2 * n;
  const dim = k + 1;
  const ata = Array.from({ length: dim }, () => Array(dim).fill(0));
  const aty = Array(dim).fill(0);
  for (const s of samples) {
    const row = [1, ...s.x.map((v, j) => (v - mean[j]) / std[j])];
    for (let i = 0; i < dim; i++) {
      aty[i] += row[i] * s.y;
      for (let j = 0; j < dim; j++) ata[i][j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < dim; i++) ata[i][i] += lambda;
  return { beta: solve(ata, aty), mean, std };
}

function ridgeReturn(beta: number[], mean: number[], std: number[], x: number[]): number {
  return beta[0] + x.reduce((acc, v, j) => acc + beta[j + 1] * ((v - mean[j]) / std[j]), 0);
}

/** Fits both candidates on chronological samples and keeps the one with lower walk-forward error. */
export function fitSegmentModel(samples: Sample[]): SegmentModel {
  const n = samples.length;
  const randomWalk: SegmentModel = {
    kind: 'random_walk',
    samples: n,
    beta: [],
    mean: [],
    std: [],
    residuals: samples.map((s) => s.y).sort((a, b) => a - b),
    walkForwardMae: null,
    baselineMae: null,
  };
  if (n < MIN_SAMPLES_FOR_MODEL) return randomWalk;

  let rwErr = 0, ridgeErr = 0, count = 0;
  const ridgeResiduals: number[] = [];
  for (let i = Math.min(MIN_TRAIN_WALK_FORWARD, n - 1); i < n; i++) {
    const { beta, mean, std } = fitRidge(samples.slice(0, i));
    const r = samples[i].y - ridgeReturn(beta, mean, std, samples[i].x);
    ridgeResiduals.push(r);
    rwErr += Math.abs(samples[i].y);
    ridgeErr += Math.abs(r);
    count++;
  }
  const baselineMae = rwErr / count;
  const ridgeMae = ridgeErr / count;

  // Require a clear improvement before trusting the regression over the random walk
  if (ridgeMae < baselineMae * 0.98) {
    const { beta, mean, std } = fitRidge(samples);
    return { kind: 'ridge', samples: n, beta, mean, std, residuals: ridgeResiduals.sort((a, b) => a - b), walkForwardMae: ridgeMae, baselineMae };
  }
  return { ...randomWalk, walkForwardMae: baselineMae, baselineMae };
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Forecast of the segment close from `price` with features `x`. `fallbackVol` sizes intervals when history is thin. */
export function predictSegment(model: SegmentModel, price: number, x: number[], fallbackVol: number): SegmentForecastResult {
  const ret = model.kind === 'ridge' ? ridgeReturn(model.beta, model.mean, model.std, x) : 0;
  const expected = round2(price * Math.exp(ret));

  let residuals = model.residuals;
  if (residuals.length < MIN_SAMPLES_FOR_MODEL) {
    // Normal-shaped stand-in: z-scores of the 10/25/50/75/90% quantiles
    residuals = [-1.2816, -0.6745, 0, 0.6745, 1.2816].map((z) => z * fallbackVol);
  }
  const at = (q: number) => round2(price * Math.exp(ret + quantile(residuals, q)));

  let up = 0, down = 0;
  for (const r of residuals) {
    const move = ret + r;
    if (move > SIDEWAYS_THRESHOLD) up++;
    else if (move < -SIDEWAYS_THRESHOLD) down++;
  }
  const pUp = up / residuals.length;
  const pDown = down / residuals.length;
  const pSideways = 1 - pUp - pDown;
  // Most likely outcome under the historical error distribution (a random walk has no point direction)
  const direction = pUp >= pDown && pUp >= pSideways ? 'UP' : pDown >= pSideways ? 'DOWN' : 'SIDEWAYS';

  // Narrower historical error band => higher confidence
  const width80 = quantile(residuals, 0.9) - quantile(residuals, 0.1);
  const confidence = Math.round(Math.max(0.3, Math.min(0.95, 1 - width80 / 0.02)) * 100) / 100;

  return {
    price,
    expected,
    lower: at(0.1),
    upper: at(0.9),
    stabLow: at(0.25),
    stabHigh: at(0.75),
    direction,
    pUp,
    pDown,
    pSideways,
    confidence,
    model,
  };
}

export interface EvaluatedForecast {
  expected: number;
  lower: number;
  upper: number;
  stabLow: number;
  stabHigh: number;
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  current: number;
  actual: number;
}

export function calculateAccuracy(evals: EvaluatedForecast[], tickSize: number): AccuracyReport {
  const n = evals.length;
  const pctOf = (v: number) => (n ? Math.round((v / n) * 1000) / 10 : 0);
  let absSum = 0, sqSum = 0, smape = 0, dir = 0, range = 0, stab = 0;
  let exact = 0, t05 = 0, t10 = 0, t20 = 0, t30 = 0;
  for (const e of evals) {
    const err = Math.abs(e.expected - e.actual);
    absSum += err;
    sqSum += err * err;
    smape += (err / ((Math.abs(e.actual) + Math.abs(e.expected)) / 2)) * 100;
    const move = e.actual - e.current;
    if ((e.direction === 'UP' && move > 0) || (e.direction === 'DOWN' && move < 0) || (e.direction === 'SIDEWAYS' && Math.abs(move) <= e.current * SIDEWAYS_THRESHOLD)) dir++;
    if (e.lower <= e.actual && e.actual <= e.upper) range++;
    if (e.stabLow <= e.actual && e.actual <= e.stabHigh) stab++;
    const pct = (err / e.actual) * 100;
    if (err <= tickSize) exact++;
    if (pct <= 0.05) t05++;
    if (pct <= 0.1) t10++;
    if (pct <= 0.2) t20++;
    if (pct <= 0.3) t30++;
  }
  return {
    total_predictions: n,
    mae: n ? round2(absSum / n) : 0,
    rmse: n ? round2(Math.sqrt(sqSum / n)) : 0,
    smape: n ? round2(smape / n) : 0,
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

import type { AccuracyReport } from '../types/market';

// Session closing-price forecast shared by the real-data and demo engines.
// Uses only prices up to `step`: damped recent trend plus reversion to the session
// VWAP, scaled by the fraction of the session still to trade.

export interface CloseForecastInput {
  prices: ArrayLike<number>;
  volumes?: ArrayLike<number>;
  /** Index of the latest price that may be used. */
  step: number;
  /** Number of steps in a full session. */
  totalSteps: number;
  /** Typical full-session volatility as a fraction of price. */
  dailyVol: number;
  /** Steps covering the ~30 minute trend window. */
  trendWindow: number;
}

export interface CloseForecastResult {
  price: number;
  expected: number;
  sigma: number;
  lower: number;
  upper: number;
  stabLow: number;
  stabHigh: number;
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  pUp: number;
  confidence: number;
}

export const round2 = (v: number) => Math.round(v * 100) / 100;

export function forecastClose({ prices, volumes, step, totalSteps, dailyVol, trendWindow }: CloseForecastInput): CloseForecastResult {
  const n = Math.max(totalSteps, step + 1);
  const p = prices[step];
  const remainingSteps = Math.max(0, n - 1 - step);
  const remainingFrac = remainingSteps / Math.max(1, n - 1);

  // Trend: least-squares slope of log price over the trend window
  const window = Math.min(step, trendWindow);
  let slope = 0;
  if (window >= Math.min(12, Math.ceil(trendWindow / 2))) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i <= window; i++) {
      const y = Math.log(prices[step - window + i]);
      sx += i; sy += y; sxx += i * i; sxy += i * y;
    }
    const cnt = window + 1;
    slope = (cnt * sxy - sx * sy) / Math.max(1e-9, cnt * sxx - sx * sx);
  }

  // Session VWAP so far (plain mean when volume is unavailable, as for indices)
  let pv = 0, vol = 0, sum = 0;
  for (let i = 0; i <= step; i++) {
    const v = volumes ? volumes[i] : 0;
    pv += prices[i] * v;
    vol += v;
    sum += prices[i];
  }
  const vwap = vol > 0 ? pv / vol : sum / (step + 1);

  const sigma = p * dailyVol * Math.sqrt(Math.max(remainingFrac, 1 / n));
  const trendMove = p * slope * remainingSteps * 0.35;
  const reversionMove = (vwap - p) * 0.25 * remainingFrac;
  const move = Math.max(-1.2 * sigma, Math.min(1.2 * sigma, trendMove + reversionMove));
  const expected = round2(p + move);

  const threshold = p * 0.0003;
  const direction = move > threshold ? 'UP' : move < -threshold ? 'DOWN' : 'SIDEWAYS';
  const z = move / Math.max(1e-9, sigma);
  const stabHalf = Math.max(p * 0.0008, 0.45 * sigma);

  return {
    price: p,
    expected,
    sigma,
    lower: round2(expected - 1.282 * sigma),
    upper: round2(expected + 1.282 * sigma),
    stabLow: round2(expected - stabHalf),
    stabHigh: round2(expected + stabHalf),
    direction,
    pUp: 1 / (1 + Math.exp(-2.2 * z)),
    confidence: Math.round((0.5 + 0.4 * (1 - remainingFrac)) * 100) / 100,
  };
}

export interface EvaluatedForecast extends CloseForecastResult {
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

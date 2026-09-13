// Descriptive statistics and randomness tests for Lao Development Lottery results.
// Nothing here can predict a draw: the backtest measures how a "pick the most frequent
// number for that weekday" strategy would actually have performed.

export interface LaoDraw {
  date: string; // YYYY-MM-DD (Thai calendar date of the draw)
  last4: string;
  animal: string;
}

export const WEEKDAY_LABELS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const last2 = (d: LaoDraw) => d.last4.slice(2);
export const last3 = (d: LaoDraw) => d.last4.slice(1);

// ---------- chi-square distribution ----------

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularized upper incomplete gamma Q(a, x). */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

export interface ChiSquareResult {
  statistic: number;
  df: number;
  pValue: number;
  /** p >= 0.05: no evidence against the hypothesis being tested */
  consistent: boolean;
}

function chiSquare(statistic: number, df: number): ChiSquareResult {
  const pValue = gammaQ(df / 2, statistic / 2);
  return { statistic: Math.round(statistic * 100) / 100, df, pValue, consistent: pValue >= 0.05 };
}

/** Goodness of fit: are all `counts` equally likely? */
export function uniformityTest(counts: number[]): ChiSquareResult {
  const n = counts.reduce((a, b) => a + b, 0);
  const expected = n / counts.length;
  const stat = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
  return chiSquare(stat, counts.length - 1);
}

/** Independence of rows and columns in a contingency table. */
export function independenceTest(table: number[][]): ChiSquareResult {
  const rows = table.filter((r) => r.some((v) => v > 0));
  const colTotals = rows[0].map((_, j) => rows.reduce((acc, r) => acc + r[j], 0));
  const total = colTotals.reduce((a, b) => a + b, 0);
  let stat = 0;
  for (const r of rows) {
    const rowTotal = r.reduce((a, b) => a + b, 0);
    r.forEach((obs, j) => {
      const exp = (rowTotal * colTotals[j]) / total;
      if (exp > 0) stat += (obs - exp) ** 2 / exp;
    });
  }
  return chiSquare(stat, (rows.length - 1) * (colTotals.filter((c) => c > 0).length - 1));
}

// ---------- frequencies ----------

export interface NumberCount {
  number: string;
  count: number;
  pct: number;
}

export function countTwoDigit(draws: LaoDraw[]): number[] {
  const counts = Array(100).fill(0);
  for (const d of draws) counts[Number(last2(d))]++;
  return counts;
}

export function countDigits(draws: LaoDraw[], position: number): number[] {
  const counts = Array(10).fill(0);
  for (const d of draws) counts[Number(d.last4[position])]++;
  return counts;
}

export function topNumbers(counts: number[], n: number, width = 2): NumberCount[] {
  const total = counts.reduce((a, b) => a + b, 0);
  return counts
    .map((count, i) => ({ number: String(i).padStart(width, '0'), count, pct: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || Number(a.number) - Number(b.number))
    .slice(0, n);
}

// ---------- backtest ----------

export interface StrategyResult {
  label: string;
  picks: number;
  trials: number;
  hits: number;
  hitRate: number; // %
  expectedRate: number; // % under pure chance
  /** Exact two-sided binomial p-value that the hit rate differs from chance. */
  pValue: number;
}

/** Exact binomial p-value for `k` successes in `n` trials: twice the smaller tail (conservative two-sided test). */
export function binomialTwoSided(k: number, n: number, p: number): number {
  const logPmf = (i: number) => logGamma(n + 1) - logGamma(i + 1) - logGamma(n - i + 1) + i * Math.log(p) + (n - i) * Math.log(1 - p);
  let lower = 0, upper = 0;
  for (let i = 0; i <= n; i++) {
    const v = Math.exp(logPmf(i));
    if (i <= k) lower += v;
    if (i >= k) upper += v;
  }
  return Math.min(1, 2 * Math.min(lower, upper));
}

function topKeys(counts: Map<string, number>, k: number): string[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k).map(([key]) => key);
}

/**
 * Walk-forward: before each draw, pick the `picks` values that appeared most often in earlier
 * draws on the same weekday, then check whether the draw matched one of them.
 */
export function backtestHotNumbers(draws: LaoDraw[], extract: (d: LaoDraw) => string, space: number, picks: number, label: string, warmup = 20): StrategyResult {
  const history = new Map<number, Map<string, number>>();
  let trials = 0, hits = 0;
  for (const d of draws) {
    const wd = weekdayOf(d.date);
    const counts = history.get(wd) ?? new Map<string, number>();
    const seen = [...counts.values()].reduce((a, b) => a + b, 0);
    const value = extract(d);
    if (seen >= warmup) {
      trials++;
      if (topKeys(counts, picks).includes(value)) hits++;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
    history.set(wd, counts);
  }
  const p0 = picks / space;
  const hitRate = trials ? hits / trials : 0;
  return {
    label,
    picks,
    trials,
    hits,
    hitRate: Math.round(hitRate * 1000) / 10,
    expectedRate: Math.round(p0 * 1000) / 10,
    pValue: trials ? binomialTwoSided(hits, trials, p0) : 1,
  };
}

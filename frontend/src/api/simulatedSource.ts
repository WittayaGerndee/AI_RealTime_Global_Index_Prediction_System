import { SYMBOLS, TradingSession, sessionOnOrBefore, previousSession } from '../utils/marketSessions';
import { Bar, BAR_MS, round2 } from '../utils/closeForecast';
import type { BarSource, Quote } from './marketEngine';

// Offline demo data used only when real prices cannot be fetched.
// Each session is a deterministic, seeded price path, so prices only move during
// trading hours, stay flat at lunch and after the close, and are identical across reloads.

const STEP_MS = 5_000;
const SESSIONS_BACK = 65;

const PARAMS: Record<string, { base: number; dailyVol: number; phase: number }> = {
  NIKKEI225: { base: 64000, dailyVol: 0.011, phase: 0.3 },
  HSI: { base: 24800, dailyVol: 0.013, phase: 1.7 },
  SZSE: { base: 13500, dailyVol: 0.012, phase: 2.9 },
  DJI: { base: 52500, dailyVol: 0.008, phase: 4.1 },
};

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

/** Deterministic closing level for a session date. */
function closeAnchor(symbol: string, dateKey: string): number {
  const p = PARAMS[symbol];
  const day = Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000;
  const noise = mulberry32(hashString(`anchor:${symbol}:${dateKey}`))() - 0.5;
  return p.base * (1 + 0.035 * Math.sin(day / 11 + p.phase) + 0.015 * Math.sin(day / 3.7 + p.phase * 2) + 0.012 * noise);
}

interface SessionPath {
  session: TradingSession;
  prices: Float64Array; // price after each 5-second trading step; prices[0] = open
  segmentOffsets: number[]; // step index at which each segment starts
}

export class SimulatedBarSource implements BarSource {
  public readonly ready = true;
  public historyVersion = 0;
  private paths = new Map<string, SessionPath>();
  private completedBars = new Map<string, Bar[]>();
  private barsMemo = new Map<string, { now: number; bars: Bar[] }>();
  private now = new Date();

  refresh(now: Date = new Date()): Promise<boolean> {
    this.now = now;
    return Promise.resolve(true);
  }

  private path(session: TradingSession): SessionPath {
    const key = `${session.symbol}:${session.dateKey}`;
    let path = this.paths.get(key);
    if (path) return path;

    const { symbol, dateKey } = session;
    const rand = mulberry32(hashString(`path:${symbol}:${dateKey}`));
    const open = closeAnchor(symbol, previousSession(session).dateKey) * (1 + gaussian(rand) * 0.003);
    const close = closeAnchor(symbol, dateKey);

    const segmentOffsets: number[] = [];
    let n = 0;
    for (const seg of session.segments) {
      segmentOffsets.push(n);
      n += Math.round((seg.close.getTime() - seg.open.getTime()) / STEP_MS);
    }

    // Brownian bridge in log-price from open to close
    const stepVol = PARAMS[symbol].dailyVol / Math.sqrt(n);
    const walk = new Float64Array(n + 1);
    for (let k = 1; k <= n; k++) walk[k] = walk[k - 1] + gaussian(rand) * stepVol;
    const prices = new Float64Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const frac = k / n;
      prices[k] = round2(Math.exp(Math.log(open) + (Math.log(close) - Math.log(open)) * frac + walk[k] - frac * walk[n]));
    }

    path = { session, prices, segmentOffsets };
    this.paths.set(key, path);
    if (this.paths.size > SYMBOLS.length * (SESSIONS_BACK + 5)) {
      const oldest = this.paths.keys().next().value;
      if (oldest) this.paths.delete(oldest);
    }
    return path;
  }

  /** 5-minute bars of a session up to `now` (the last one may still be forming). */
  private sessionBars(session: TradingSession, now: number): Bar[] {
    const done = now >= session.close.getTime();
    const key = `${session.symbol}:${session.dateKey}`;
    if (done && this.completedBars.has(key)) return this.completedBars.get(key)!;

    const path = this.path(session);
    const bars: Bar[] = [];
    session.segments.forEach((seg, i) => {
      const base = path.segmentOffsets[i];
      for (let start = seg.open.getTime(); start < seg.close.getTime() && start <= now; start += BAR_MS) {
        const from = base + Math.round((start - seg.open.getTime()) / STEP_MS);
        const end = Math.min(start + BAR_MS, seg.close.getTime(), now);
        const to = base + Math.round((end - seg.open.getTime()) / STEP_MS);
        let high = -Infinity, low = Infinity;
        for (let k = from; k <= to; k++) {
          high = Math.max(high, path.prices[k]);
          low = Math.min(low, path.prices[k]);
        }
        bars.push({ t: start, open: path.prices[from], high: round2(high), low: round2(low), close: path.prices[to] });
      }
    });
    if (done) this.completedBars.set(key, bars);
    return bars;
  }

  bars(symbol: string): Bar[] {
    const now = this.now.getTime();
    const memo = this.barsMemo.get(symbol);
    if (memo?.now === now) return memo.bars;

    let session = sessionOnOrBefore(symbol, this.now);
    const sessions: TradingSession[] = [];
    for (let i = 0; i < SESSIONS_BACK; i++) {
      sessions.push(session);
      session = previousSession(session);
    }
    const bars = sessions.reverse().flatMap((s) => this.sessionBars(s, now));
    this.barsMemo.set(symbol, { now, bars });
    return bars;
  }

  quote(): Quote | null {
    return null;
  }
}

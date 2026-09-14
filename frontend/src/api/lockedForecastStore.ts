import type { SegmentForecastResult, ModelKind } from '../utils/closeForecast';

// Keeps each locked closing forecast exactly as it was calculated at its lock time, so later
// history refreshes, late bars or page reloads cannot change a number that is already frozen.

const PREFIX = 'lockedForecast:v1:';
const MAX_AGE_MS = 14 * 86_400_000;

export interface StoredForecast {
  savedAt: number;
  price: number;
  expected: number;
  lower: number;
  upper: number;
  stabLow: number;
  stabHigh: number;
  direction: SegmentForecastResult['direction'];
  pUp: number;
  pDown: number;
  pSideways: number;
  confidence: number;
  modelKind: ModelKind;
  samples: number;
}

const memory = new Map<string, StoredForecast>();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function lockKey(scope: string, symbol: string, dateKey: string, segIndex: number): string {
  return `${PREFIX}${scope}:${symbol}:${dateKey}:${segIndex}`;
}

export function loadLocked(key: string): StoredForecast | null {
  const cached = memory.get(key);
  if (cached) return cached;
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredForecast;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocked(key: string, r: SegmentForecastResult): StoredForecast {
  const stored: StoredForecast = {
    savedAt: Date.now(),
    price: r.price,
    expected: r.expected,
    lower: r.lower,
    upper: r.upper,
    stabLow: r.stabLow,
    stabHigh: r.stabHigh,
    direction: r.direction,
    pUp: r.pUp,
    pDown: r.pDown,
    pSideways: r.pSideways,
    confidence: r.confidence,
    modelKind: r.model.kind,
    samples: r.model.samples,
  };
  memory.set(key, stored);
  const s = storage();
  if (!s) return stored;
  try {
    s.setItem(key, JSON.stringify(stored));
    // Drop snapshots older than two weeks
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const savedAt = Number(JSON.parse(s.getItem(k) || '{}').savedAt);
      if (!(savedAt > Date.now() - MAX_AGE_MS)) s.removeItem(k);
    }
  } catch {
    // Storage full or blocked: the in-memory copy still keeps the number fixed for this visit
  }
  return stored;
}

export function toResult(s: StoredForecast): SegmentForecastResult {
  return {
    price: s.price,
    expected: s.expected,
    lower: s.lower,
    upper: s.upper,
    stabLow: s.stabLow,
    stabHigh: s.stabHigh,
    direction: s.direction,
    pUp: s.pUp,
    pDown: s.pDown,
    pSideways: s.pSideways,
    confidence: s.confidence,
    model: { kind: s.modelKind, samples: s.samples, beta: [], mean: [], std: [], residuals: [], walkForwardMae: null, baselineMae: null },
  };
}

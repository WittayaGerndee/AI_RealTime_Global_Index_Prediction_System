// Exchange trading-session calendar, evaluated in each exchange's own timezone
// (so US daylight-saving shifts are handled) and displayed in Thai time.
// Public holidays are not modelled here; the real-data engine detects them from missing bars.

export const THAI_TZ = 'Asia/Bangkok';

export const SYMBOLS = ['NIKKEI225', 'HSI', 'SZSE', 'DJI'];

/** HOLIDAY is only reported by real data (no bars on a scheduled trading day). */
export type SessionStatus = 'PRE_OPEN' | 'OPEN' | 'LUNCH' | 'LOCKED' | 'CLOSED' | 'HOLIDAY';

interface SegmentSpec {
  open: string; // exchange-local "HH:mm"
  close: string; // exchange-local "HH:mm"
  lockTh: string; // Thai "HH:mm" at which this segment's closing forecast is frozen
}

interface ExchangeSchedule {
  timezone: string;
  segments: SegmentSpec[];
}

export const EXCHANGE_SCHEDULES: Record<string, ExchangeSchedule> = {
  // TSE extended its close to 15:30 JST in Nov 2024
  NIKKEI225: {
    timezone: 'Asia/Tokyo',
    segments: [
      { open: '09:00', close: '11:30', lockTh: '09:15' },
      { open: '12:30', close: '15:30', lockTh: '12:45' },
    ],
  },
  HSI: {
    timezone: 'Asia/Hong_Kong',
    segments: [
      { open: '09:30', close: '12:00', lockTh: '10:45' },
      { open: '13:00', close: '16:00', lockTh: '14:45' },
    ],
  },
  // Shenzhen shares China Standard Time with Shanghai
  SZSE: {
    timezone: 'Asia/Shanghai',
    segments: [
      { open: '09:30', close: '11:30', lockTh: '09:45' },
      { open: '13:00', close: '15:00', lockTh: '13:40' },
    ],
  },
  DJI: {
    timezone: 'America/New_York',
    segments: [{ open: '09:30', close: '16:00', lockTh: '00:45' }],
  },
};

export interface TradingSegment {
  index: number;
  /** "ช่วงเช้า" / "ช่วงบ่าย" / "ทั้งวัน" */
  label: string;
  open: Date;
  close: Date;
  lockAt: Date;
  isFinal: boolean;
}

export interface TradingSession {
  symbol: string;
  /** Exchange-local trading date, "YYYY-MM-DD" — stable key for the session. */
  dateKey: string;
  segments: TradingSegment[];
  open: Date;
  close: Date;
}

export interface SessionState {
  status: SessionStatus;
  /** Session in progress, or the one that most recently finished. */
  current: TradingSession;
  /** Next session that has not opened yet. */
  next: TradingSession;
  /** Next status change: lock, segment close, lunch end or next open. */
  nextEvent: { label: string; at: Date };
}

interface LocalDate {
  y: number;
  m: number;
  d: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function zonedParts(date: Date, timeZone: string) {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return p;
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time in `timeZone` to an absolute instant. */
function zonedTime(local: LocalDate, hhmm: string, timeZone: string): Date {
  const [h, min] = hhmm.split(':').map(Number);
  const guess = Date.UTC(local.y, local.m - 1, local.d, h, min);
  let ts = guess - tzOffsetMs(new Date(guess), timeZone);
  // Re-check once in case the guess straddled a DST transition
  ts = guess - tzOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

function addDays(local: LocalDate, days: number): LocalDate {
  const dt = new Date(Date.UTC(local.y, local.m - 1, local.d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function isWeekday(local: LocalDate): boolean {
  const dow = new Date(Date.UTC(local.y, local.m - 1, local.d)).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** Latest instant at Thai wall-clock `hhmm` that is not after `notAfter`. */
function thaiTimeAtOrBefore(hhmm: string, notAfter: Date): Date {
  const p = zonedParts(notAfter, THAI_TZ);
  let local: LocalDate = { y: p.year, m: p.month, d: p.day };
  let t = zonedTime(local, hhmm, THAI_TZ);
  if (t.getTime() > notAfter.getTime()) {
    local = addDays(local, -1);
    t = zonedTime(local, hhmm, THAI_TZ);
  }
  return t;
}

function buildSession(symbol: string, local: LocalDate): TradingSession {
  const sched = EXCHANGE_SCHEDULES[symbol];
  const n = sched.segments.length;
  const segments = sched.segments.map((s, index) => {
    const open = zonedTime(local, s.open, sched.timezone);
    const close = zonedTime(local, s.close, sched.timezone);
    const lockAt = thaiTimeAtOrBefore(s.lockTh, close);
    return {
      index,
      label: n === 1 ? 'ทั้งวัน' : index === 0 ? 'ช่วงเช้า' : 'ช่วงบ่าย',
      open,
      close,
      // A lock time before the segment opens falls back to the segment open
      lockAt: lockAt.getTime() < open.getTime() ? open : lockAt,
      isFinal: index === n - 1,
    };
  });
  const pad = (v: number) => String(v).padStart(2, '0');
  return {
    symbol,
    dateKey: `${local.y}-${pad(local.m)}-${pad(local.d)}`,
    segments,
    open: segments[0].open,
    close: segments[n - 1].close,
  };
}

function localToday(symbol: string, now: Date): LocalDate {
  const p = zonedParts(now, EXCHANGE_SCHEDULES[symbol].timezone);
  return { y: p.year, m: p.month, d: p.day };
}

/** Most recent session whose open is at or before `now`. */
export function sessionOnOrBefore(symbol: string, now: Date): TradingSession {
  let local = localToday(symbol, now);
  for (let i = 0; i < 10; i++) {
    if (isWeekday(local)) {
      const s = buildSession(symbol, local);
      if (s.open.getTime() <= now.getTime()) return s;
    }
    local = addDays(local, -1);
  }
  throw new Error(`No session found for ${symbol}`);
}

/** Session `n` trading days before `session` (n >= 1). */
export function previousSession(session: TradingSession, n = 1): TradingSession {
  const [y, m, d] = session.dateKey.split('-').map(Number);
  let local: LocalDate = { y, m, d };
  let remaining = n;
  while (remaining > 0) {
    local = addDays(local, -1);
    if (isWeekday(local)) remaining--;
  }
  return buildSession(session.symbol, local);
}

function nextSessionAfter(symbol: string, now: Date): TradingSession {
  let local = localToday(symbol, now);
  for (let i = 0; i < 10; i++) {
    if (isWeekday(local)) {
      const s = buildSession(symbol, local);
      if (s.open.getTime() > now.getTime()) return s;
    }
    local = addDays(local, 1);
  }
  throw new Error(`No session found for ${symbol}`);
}

export function getSessionState(symbol: string, now: Date = new Date()): SessionState {
  const current = sessionOnOrBefore(symbol, now);
  const next = nextSessionAfter(symbol, now);
  const t = now.getTime();

  if (t >= current.close.getTime()) {
    return { status: 'CLOSED', current, next, nextEvent: { label: 'เปิดตลาด', at: next.open } };
  }

  const seg = current.segments.find((s) => t < s.close.getTime())!;
  if (t < seg.open.getTime()) {
    return { status: 'LUNCH', current, next, nextEvent: { label: 'เปิดช่วงบ่าย', at: seg.open } };
  }
  if (t >= seg.lockAt.getTime()) {
    const label = seg.isFinal ? 'ปิดตลาด' : 'ปิดช่วงเช้า';
    return { status: 'LOCKED', current, next, nextEvent: { label, at: seg.close } };
  }
  const label = seg.isFinal ? 'ล็อกคาดการณ์ราคาปิด' : 'ล็อกคาดการณ์ปิดช่วงเช้า';
  return { status: 'OPEN', current, next, nextEvent: { label, at: seg.lockAt } };
}

/** Status of a market before its first session of the day, used for display only. */
export function displayStatus(state: SessionState, now: Date = new Date()): SessionStatus {
  if (state.status === 'CLOSED' && state.next.open.getTime() - now.getTime() < 60 * 60_000) {
    return 'PRE_OPEN';
  }
  return state.status;
}

const thaiTimeFmt = new Intl.DateTimeFormat('th-TH', { timeZone: THAI_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const thaiDateFmt = new Intl.DateTimeFormat('th-TH', { timeZone: THAI_TZ, weekday: 'short', day: 'numeric', month: 'short' });

export function formatThaiTime(date: Date): string {
  return thaiTimeFmt.format(date);
}

export function formatThaiDate(date: Date): string {
  return thaiDateFmt.format(date);
}

/** True when the instant falls on a different Thai calendar day than `reference`. */
export function isDifferentThaiDay(date: Date, reference: Date): boolean {
  return formatThaiDate(date) !== formatThaiDate(reference);
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const STATUS_LABELS: Record<SessionStatus, string> = {
  PRE_OPEN: 'ใกล้เปิด',
  OPEN: 'เปิดทำการ',
  LUNCH: 'พักกลางวัน',
  LOCKED: 'ล็อกคาดการณ์แล้ว',
  CLOSED: 'ปิดแล้ว',
  HOLIDAY: 'วันหยุดตลาด',
};

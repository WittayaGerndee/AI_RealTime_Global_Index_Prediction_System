// Exchange trading-session calendar, evaluated in each exchange's own timezone
// (so US daylight-saving shifts are handled) and displayed in Thai time.
// Public holidays are not modelled: a holiday is treated as a normal trading day.

export const THAI_TZ = 'Asia/Bangkok';

/** Minutes before the final close at which the predicted close is locked. */
export const LOCK_MINUTES_BEFORE_CLOSE = 30;

/** HOLIDAY is only reported by real data (no bars on a scheduled trading day). */
export type SessionStatus = 'PRE_OPEN' | 'OPEN' | 'LUNCH' | 'LOCKED' | 'CLOSED' | 'HOLIDAY';

interface Segment {
  open: string; // exchange-local "HH:mm"
  close: string;
}

interface ExchangeSchedule {
  timezone: string;
  segments: Segment[];
}

export const EXCHANGE_SCHEDULES: Record<string, ExchangeSchedule> = {
  // TSE extended its close to 15:30 JST in Nov 2024
  NIKKEI225: { timezone: 'Asia/Tokyo', segments: [{ open: '09:00', close: '11:30' }, { open: '12:30', close: '15:30' }] },
  HSI: { timezone: 'Asia/Hong_Kong', segments: [{ open: '09:30', close: '12:00' }, { open: '13:00', close: '16:00' }] },
  // Shenzhen shares China Standard Time with Shanghai
  SZSE: { timezone: 'Asia/Shanghai', segments: [{ open: '09:30', close: '11:30' }, { open: '13:00', close: '15:00' }] },
  DJI: { timezone: 'America/New_York', segments: [{ open: '09:30', close: '16:00' }] },
};

export interface TradingSession {
  symbol: string;
  /** Exchange-local trading date, "YYYY-MM-DD" — stable key for the session. */
  dateKey: string;
  segments: { open: Date; close: Date }[];
  open: Date;
  close: Date;
  lockAt: Date;
}

export interface SessionState {
  status: SessionStatus;
  /** Session in progress, or the one that most recently finished. */
  current: TradingSession;
  /** Next session that has not opened yet. */
  next: TradingSession;
  /** Next status change: lunch start/end, lock, close or next open. */
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

/** Converts an exchange-local wall-clock time to an absolute instant. */
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

function buildSession(symbol: string, local: LocalDate): TradingSession {
  const sched = EXCHANGE_SCHEDULES[symbol];
  const segments = sched.segments.map((s) => ({
    open: zonedTime(local, s.open, sched.timezone),
    close: zonedTime(local, s.close, sched.timezone),
  }));
  const open = segments[0].open;
  const close = segments[segments.length - 1].close;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    symbol,
    dateKey: `${local.y}-${pad(local.m)}-${pad(local.d)}`,
    segments,
    open,
    close,
    lockAt: new Date(close.getTime() - LOCK_MINUTES_BEFORE_CLOSE * 60_000),
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

  const inSegment = current.segments.findIndex((s) => t >= s.open.getTime() && t < s.close.getTime());
  if (inSegment === -1) {
    const resume = current.segments.find((s) => s.open.getTime() > t)!;
    return { status: 'LUNCH', current, next, nextEvent: { label: 'เปิดช่วงบ่าย', at: resume.open } };
  }

  if (t >= current.lockAt.getTime()) {
    return { status: 'LOCKED', current, next, nextEvent: { label: 'ปิดตลาด', at: current.close } };
  }

  const seg = current.segments[inSegment];
  const isLast = inSegment === current.segments.length - 1;
  const nextEvent = isLast
    ? { label: 'ล็อกราคาคาดการณ์', at: current.lockAt }
    : { label: 'พักกลางวัน', at: seg.close };
  return { status: 'OPEN', current, next, nextEvent };
}

/** Status of a market before its first session of the day, used for display only. */
export function displayStatus(state: SessionState, now: Date = new Date()): SessionStatus {
  if (state.status === 'CLOSED' && state.next.open.getTime() - now.getTime() < 60 * 60_000) {
    return 'PRE_OPEN';
  }
  return state.status;
}

/** Trading seconds elapsed in `session` at `now` (lunch breaks excluded). */
export function tradingSecondsElapsed(session: TradingSession, now: Date): number {
  const t = now.getTime();
  let total = 0;
  for (const s of session.segments) {
    const end = Math.min(t, s.close.getTime());
    if (end > s.open.getTime()) total += (end - s.open.getTime()) / 1000;
  }
  return Math.floor(total);
}

export function totalTradingSeconds(session: TradingSession): number {
  return session.segments.reduce((sum, s) => sum + (s.close.getTime() - s.open.getTime()) / 1000, 0);
}

/** Maps trading seconds since open back to a wall-clock instant. */
export function instantAtTradingSecond(session: TradingSession, seconds: number): Date {
  let remaining = seconds;
  for (const s of session.segments) {
    const len = (s.close.getTime() - s.open.getTime()) / 1000;
    if (remaining <= len) return new Date(s.open.getTime() + remaining * 1000);
    remaining -= len;
  }
  return session.close;
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

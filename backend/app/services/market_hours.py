"""
Exchange trading-session calendar, evaluated in each exchange's own timezone
(so US daylight-saving shifts are handled). Mirrors frontend/src/utils/marketSessions.ts.
Public holidays are not modelled: a holiday is treated as a normal trading day.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

THAI_TZ = ZoneInfo("Asia/Bangkok")

# (exchange-local open, exchange-local close, Thai time at which that segment's closing forecast is locked)
EXCHANGE_SCHEDULES: Dict[str, Tuple[str, List[Tuple[str, str, str]]]] = {
    # TSE extended its close to 15:30 JST in Nov 2024
    "NIKKEI225": ("Asia/Tokyo", [("09:00", "11:30", "09:15"), ("12:30", "15:30", "12:45")]),
    "HSI": ("Asia/Hong_Kong", [("09:30", "12:00", "10:45"), ("13:00", "16:00", "14:45")]),
    # Shenzhen shares China Standard Time with Shanghai
    "SZSE": ("Asia/Shanghai", [("09:30", "11:30", "09:45"), ("13:00", "15:00", "13:40")]),
    "DJI": ("America/New_York", [("09:30", "16:00", "00:45")]),
}

STATUS_OPEN = "OPEN"
STATUS_LUNCH = "LUNCH"
STATUS_LOCKED = "LOCKED"
STATUS_CLOSED = "CLOSED"


@dataclass
class TradingSession:
    symbol: str
    session_date: str  # exchange-local "YYYY-MM-DD"
    segments: List[Tuple[datetime, datetime]]
    segment_locks: List[datetime]

    @property
    def open(self) -> datetime:
        return self.segments[0][0]

    @property
    def close(self) -> datetime:
        return self.segments[-1][1]

    @property
    def lock_at(self) -> datetime:
        """Lock time of the final segment's closing forecast."""
        return self.segment_locks[-1]

    def remaining_trading_minutes(self, now: datetime) -> float:
        total = 0.0
        for seg_open, seg_close in self.segments:
            start = max(seg_open, now)
            if seg_close > start:
                total += (seg_close - start).total_seconds() / 60.0
        return total

    def to_dict(self) -> Dict[str, object]:
        return {
            "session_date": self.session_date,
            "segments": [
                {"open": o.astimezone(THAI_TZ).isoformat(), "close": c.astimezone(THAI_TZ).isoformat()}
                for o, c in self.segments
            ],
            "open": self.open.astimezone(THAI_TZ).isoformat(),
            "close": self.close.astimezone(THAI_TZ).isoformat(),
            "lock_at": self.lock_at.astimezone(THAI_TZ).isoformat(),
            "segment_locks": [t.astimezone(THAI_TZ).isoformat() for t in self.segment_locks],
        }


def is_supported(symbol: str) -> bool:
    return symbol in EXCHANGE_SCHEDULES


def _build_session(symbol: str, local_day: date) -> TradingSession:
    tz_name, segments = EXCHANGE_SCHEDULES[symbol]
    tz = ZoneInfo(tz_name)

    def at(hhmm: str) -> datetime:
        h, m = map(int, hhmm.split(":"))
        return datetime.combine(local_day, time(h, m), tzinfo=tz).astimezone(timezone.utc)

    bounds = [(at(o), at(c)) for o, c, _ in segments]
    locks = [max(seg_open, _thai_time_at_or_before(lock_th, seg_close)) for (seg_open, seg_close), (_, _, lock_th) in zip(bounds, segments)]
    return TradingSession(symbol=symbol, session_date=local_day.isoformat(), segments=bounds, segment_locks=locks)


def _thai_time_at_or_before(hhmm: str, not_after: datetime) -> datetime:
    """Latest instant at Thai wall-clock `hhmm` that is not after `not_after`."""
    h, m = map(int, hhmm.split(":"))
    local = not_after.astimezone(THAI_TZ)
    candidate = local.replace(hour=h, minute=m, second=0, microsecond=0)
    if candidate > local:
        candidate -= timedelta(days=1)
    return candidate.astimezone(timezone.utc)


def _local_today(symbol: str, now: datetime) -> date:
    return now.astimezone(ZoneInfo(EXCHANGE_SCHEDULES[symbol][0])).date()


def session_on_or_before(symbol: str, now: datetime) -> TradingSession:
    """Most recent session whose open is at or before `now`."""
    day = _local_today(symbol, now)
    for _ in range(10):
        if day.weekday() < 5:
            s = _build_session(symbol, day)
            if s.open <= now:
                return s
        day -= timedelta(days=1)
    raise RuntimeError(f"No session found for {symbol}")


def next_session_after(symbol: str, now: datetime) -> TradingSession:
    day = _local_today(symbol, now)
    for _ in range(10):
        if day.weekday() < 5:
            s = _build_session(symbol, day)
            if s.open > now:
                return s
        day += timedelta(days=1)
    raise RuntimeError(f"No session found for {symbol}")


def get_session_state(symbol: str, now: Optional[datetime] = None) -> Dict[str, object]:
    now = now or datetime.now(timezone.utc)
    current = session_on_or_before(symbol, now)
    nxt = next_session_after(symbol, now)

    active = next((i for i, (_, c) in enumerate(current.segments) if now < c), None)
    if active is None:
        status = STATUS_CLOSED
    elif now < current.segments[active][0]:
        status = STATUS_LUNCH
    elif now >= current.segment_locks[active]:
        status = STATUS_LOCKED
    else:
        status = STATUS_OPEN

    return {"status": status, "current": current, "next": nxt}


def is_trading(symbol: str, now: Optional[datetime] = None) -> bool:
    return get_session_state(symbol, now)["status"] in (STATUS_OPEN, STATUS_LOCKED)

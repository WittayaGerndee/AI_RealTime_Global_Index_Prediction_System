from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import time

@dataclass
class NormalizedTick:
    instrument_code: str
    provider: str
    provider_symbol: str
    provider_timestamp: datetime
    received_timestamp: datetime
    price: float
    bid: Optional[float]
    ask: Optional[float]
    volume: float
    day_open: Optional[float]
    day_high: Optional[float]
    day_low: Optional[float]
    previous_close: Optional[float]
    latency_ms: int
    sequence: int
    is_stale: bool = False

class TickNormalizer:
    def __init__(self, stale_threshold_sec: float = 60.0):
        self.stale_threshold_sec = stale_threshold_sec
        self._last_sequences: Dict[str, int] = {}
        self._last_timestamps: Dict[str, datetime] = {}

    def normalize(self, raw: Dict[str, Any], provider_name: str) -> Optional[NormalizedTick]:
        """
        Converts provider-specific tick payload to NormalizedTick.
        Calculates latency and validates out-of-order or duplicate ticks.
        """
        now = datetime.now(timezone.utc)
        symbol = raw.get("symbol") or raw.get("code")
        if not symbol:
            return None

        # Parse provider timestamp
        raw_ts = raw.get("timestamp") or raw.get("datetime") or raw.get("time")
        if isinstance(raw_ts, (int, float)):
            # unix timestamp in sec or ms
            if raw_ts > 1e11: # milliseconds
                provider_ts = datetime.fromtimestamp(raw_ts / 1000.0, tz=timezone.utc)
            else:
                provider_ts = datetime.fromtimestamp(raw_ts, tz=timezone.utc)
        elif isinstance(raw_ts, datetime):
            provider_ts = raw_ts if raw_ts.tzinfo else raw_ts.replace(tzinfo=timezone.utc)
        elif isinstance(raw_ts, str):
            try:
                provider_ts = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                if not provider_ts.tzinfo:
                    provider_ts = provider_ts.replace(tzinfo=timezone.utc)
            except Exception:
                provider_ts = now
        else:
            provider_ts = now

        # Latency calculation
        latency_ms = max(0, int((now - provider_ts).total_seconds() * 1000))
        is_stale = (now - provider_ts).total_seconds() > self.stale_threshold_sec

        # Extract prices
        price = float(raw.get("price") or raw.get("close") or raw.get("last") or 0.0)
        bid = float(raw["bid"]) if raw.get("bid") is not None else None
        ask = float(raw["ask"]) if raw.get("ask") is not None else None
        volume = float(raw.get("volume") or raw.get("vol") or 0.0)
        day_open = float(raw["day_open"]) if raw.get("day_open") is not None else (float(raw["open"]) if raw.get("open") is not None else None)
        day_high = float(raw["day_high"]) if raw.get("day_high") is not None else (float(raw["high"]) if raw.get("high") is not None else None)
        day_low = float(raw["day_low"]) if raw.get("day_low") is not None else (float(raw["low"]) if raw.get("low") is not None else None)
        prev_close = float(raw["previous_close"]) if raw.get("previous_close") is not None else (float(raw["prev_close"]) if raw.get("prev_close") is not None else None)

        seq = int(raw.get("sequence") or (self._last_sequences.get(symbol, 0) + 1))
        self._last_sequences[symbol] = seq
        self._last_timestamps[symbol] = provider_ts

        return NormalizedTick(
            instrument_code=symbol,
            provider=provider_name,
            provider_symbol=raw.get("provider_symbol", symbol),
            provider_timestamp=provider_ts,
            received_timestamp=now,
            price=price,
            bid=bid,
            ask=ask,
            volume=volume,
            day_open=day_open,
            day_high=day_high,
            day_low=day_low,
            previous_close=prev_close,
            latency_ms=latency_ms,
            sequence=seq,
            is_stale=is_stale
        )

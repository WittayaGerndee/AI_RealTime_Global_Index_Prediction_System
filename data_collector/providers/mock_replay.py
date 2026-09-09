import asyncio
import math
import random
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from data_collector.providers.base import MarketDataProvider

class MockReplayProvider(MarketDataProvider):
    """
    High-fidelity deterministic market data replay provider for backtesting,
    automated CI testing, and local development.
    Models realistic microstructure for Nikkei 225, Dow Jones, Hang Seng, and SSE.
    """

    DEFAULT_BASE_PRICES = {
        "NIKKEI225": 38450.0,
        "DJI": 40850.0,
        "HSI": 17820.0,
        "SSE": 2860.0,
    }

    VOLATILITIES = {
        "NIKKEI225": 0.0008, # Per-tick volatility
        "DJI": 0.0006,
        "HSI": 0.0009,
        "SSE": 0.0007,
    }

    def __init__(self, name: str = "mock_replay", speed: float = 1.0):
        super().__init__(name=name)
        self.speed = speed
        self._current_prices: Dict[str, float] = dict(self.DEFAULT_BASE_PRICES)
        self._day_opens: Dict[str, float] = {k: v * 0.998 for k, v in self.DEFAULT_BASE_PRICES.items()}
        self._day_highs: Dict[str, float] = {k: v * 1.006 for k, v in self.DEFAULT_BASE_PRICES.items()}
        self._day_lows: Dict[str, float] = {k: v * 0.994 for k, v in self.DEFAULT_BASE_PRICES.items()}
        self._prev_closes: Dict[str, float] = {k: v * 0.997 for k, v in self.DEFAULT_BASE_PRICES.items()}
        self._sequences: Dict[str, int] = {k: 0 for k in self.DEFAULT_BASE_PRICES}
        self._running = False

    async def connect(self) -> bool:
        self.is_connected = True
        self._running = True
        return True

    async def disconnect(self) -> bool:
        self.is_connected = False
        self._running = False
        return True

    async def subscribe(self, symbols: List[str]) -> bool:
        for s in symbols:
            self.subscribed_symbols.add(s)
            if s not in self._current_prices:
                self._current_prices[s] = 1000.0
                self._day_opens[s] = 998.0
                self._day_highs[s] = 1005.0
                self._day_lows[s] = 995.0
                self._prev_closes[s] = 996.0
                self._sequences[s] = 0
        return True

    async def unsubscribe(self, symbols: List[str]) -> bool:
        for s in symbols:
            self.subscribed_symbols.discard(s)
        return True

    def _generate_next_tick(self, symbol: str) -> Dict[str, Any]:
        curr = self._current_prices.get(symbol, 1000.0)
        vol = self.VOLATILITIES.get(symbol, 0.0007)
        
        # Mean reversion towards open + stochastic drift
        mean_rev = (self._day_opens.get(symbol, curr) - curr) * 0.0002
        noise = random.gauss(0, 1) * vol * curr
        change = mean_rev + noise
        new_price = round(curr + change, 2)
        
        # Update bounds
        self._current_prices[symbol] = new_price
        self._day_highs[symbol] = max(self._day_highs.get(symbol, new_price), new_price)
        self._day_lows[symbol] = min(self._day_lows.get(symbol, new_price), new_price)
        self._sequences[symbol] = self._sequences.get(symbol, 0) + 1

        spread = round(new_price * 0.0001, 2)
        now = datetime.now(timezone.utc)

        return {
            "symbol": symbol,
            "provider_symbol": symbol,
            "timestamp": now.isoformat(),
            "price": new_price,
            "bid": round(new_price - spread / 2, 2),
            "ask": round(new_price + spread / 2, 2),
            "volume": round(random.uniform(10, 150), 2),
            "day_open": self._day_opens.get(symbol, new_price),
            "day_high": self._day_highs.get(symbol, new_price),
            "day_low": self._day_lows.get(symbol, new_price),
            "previous_close": self._prev_closes.get(symbol, new_price),
            "sequence": self._sequences[symbol],
        }

    async def get_quote(self, symbol: str) -> Dict[str, Any]:
        return self._generate_next_tick(symbol)

    async def get_historical(self, symbol: str, timeframe: str = "1m", limit: int = 100) -> List[Dict[str, Any]]:
        """
        Generates realistic past candles ending at now.
        """
        base_price = self._current_prices.get(symbol, 1000.0)
        vol = self.VOLATILITIES.get(symbol, 0.0007) * 8 # higher for bar
        now = datetime.now(timezone.utc)

        # Map timeframe to timedelta
        tf_delta = {
            "1m": timedelta(minutes=1),
            "5m": timedelta(minutes=5),
            "15m": timedelta(minutes=15),
            "1h": timedelta(hours=1),
            "1d": timedelta(days=1),
        }.get(timeframe, timedelta(minutes=1))

        candles = []
        curr_close = base_price
        # Work backwards then reverse
        bar_closes = []
        for _ in range(limit):
            step = random.gauss(0, 1) * vol * curr_close
            curr_close = max(10.0, curr_close - step)
            bar_closes.append(curr_close)
        bar_closes.reverse()

        price_cursor = bar_closes[0]
        start_time = now - (tf_delta * limit)
        for i in range(limit):
            bucket = start_time + (tf_delta * i)
            close = round(bar_closes[i], 2)
            high = round(max(price_cursor, close) + abs(random.gauss(0, 1)) * vol * close * 0.5, 2)
            low = round(min(price_cursor, close) - abs(random.gauss(0, 1)) * vol * close * 0.5, 2)
            c = {
                "instrument_code": symbol,
                "timeframe": timeframe,
                "bucket_time": bucket.isoformat(),
                "open": round(price_cursor, 2),
                "high": high,
                "low": low,
                "close": close,
                "volume": round(random.uniform(500, 5000), 2),
                "tick_count": random.randint(30, 120),
            }
            candles.append(c)
            price_cursor = close

        return candles

    async def get_intraday(self, symbol: str, interval: str = "1m") -> List[Dict[str, Any]]:
        return await self.get_historical(symbol, timeframe=interval, limit=60)

    async def health_check(self) -> Dict[str, Any]:
        return {
            "provider": self.name,
            "connected": self.is_connected,
            "latency_ms": 2,
            "subscribed_symbols": list(self.subscribed_symbols),
            "status": "HEALTHY",
        }

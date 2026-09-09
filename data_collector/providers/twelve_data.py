import asyncio
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from data_collector.providers.base import MarketDataProvider

class TwelveDataProvider(MarketDataProvider):
    """
    Twelve Data Provider for Global Indices via REST and WebSocket.
    """

    BASE_URL = "https://api.twelvedata.com"
    WS_URL = "wss://ws.twelvedata.com/v1/quotes/price"

    def __init__(self, api_key: Optional[str] = None):
        super().__init__(name="twelve_data", api_key=api_key)
        self.client: Optional[httpx.AsyncClient] = None

    async def connect(self) -> bool:
        self.client = httpx.AsyncClient(timeout=10.0)
        self.is_connected = True
        return True

    async def disconnect(self) -> bool:
        if self.client:
            await self.client.aclose()
        self.is_connected = False
        return True

    async def subscribe(self, symbols: List[str]) -> bool:
        for s in symbols:
            self.subscribed_symbols.add(s)
        return True

    async def unsubscribe(self, symbols: List[str]) -> bool:
        for s in symbols:
            self.subscribed_symbols.discard(s)
        return True

    async def get_quote(self, symbol: str) -> Dict[str, Any]:
        if not self.api_key:
            raise ValueError("Twelve Data API key is required for live quotes")
        url = f"{self.BASE_URL}/quote"
        params = {"symbol": symbol, "apikey": self.api_key}
        resp = await self.client.get(url, params=params)
        data = resp.json()
        if "close" not in data and "price" not in data:
            raise RuntimeError(f"Failed to fetch quote from Twelve Data: {data}")
        return {
            "symbol": symbol,
            "provider_symbol": symbol,
            "timestamp": data.get("datetime", datetime.now(timezone.utc).isoformat()),
            "price": float(data.get("close") or data.get("price")),
            "day_open": float(data.get("open", 0)),
            "day_high": float(data.get("high", 0)),
            "day_low": float(data.get("low", 0)),
            "previous_close": float(data.get("previous_close", 0)),
            "volume": float(data.get("volume", 0)),
        }

    async def get_historical(self, symbol: str, timeframe: str = "1m", limit: int = 100) -> List[Dict[str, Any]]:
        if not self.api_key:
            raise ValueError("Twelve Data API key is required for historical candles")
        url = f"{self.BASE_URL}/time_series"
        params = {"symbol": symbol, "interval": timeframe, "outputsize": limit, "apikey": self.api_key}
        resp = await self.client.get(url, params=params)
        data = resp.json()
        values = data.get("values", [])
        candles = []
        for v in reversed(values):
            candles.append({
                "instrument_code": symbol,
                "timeframe": timeframe,
                "bucket_time": v["datetime"],
                "open": float(v["open"]),
                "high": float(v["high"]),
                "low": float(v["low"]),
                "close": float(v["close"]),
                "volume": float(v.get("volume", 0)),
            })
        return candles

    async def get_intraday(self, symbol: str, interval: str = "1m") -> List[Dict[str, Any]]:
        return await self.get_historical(symbol, timeframe=interval, limit=60)

    async def health_check(self) -> Dict[str, Any]:
        return {
            "provider": self.name,
            "connected": self.is_connected,
            "has_api_key": bool(self.api_key),
            "status": "HEALTHY" if self.is_connected else "DISCONNECTED",
        }

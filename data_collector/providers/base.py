from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime

class MarketDataProvider(ABC):
    """
    Abstract interface for all Market Data Providers conforming to requirement section 4.
    Allows changing providers seamlessly without touching feature or prediction engines.
    """

    def __init__(self, name: str, api_key: Optional[str] = None):
        self.name = name
        self.api_key = api_key
        self.is_connected = False
        self.subscribed_symbols = set()

    @abstractmethod
    async def connect(self) -> bool:
        """Establish connection to provider API/WebSocket."""
        pass

    @abstractmethod
    async def disconnect(self) -> bool:
        """Disconnect cleanly from provider."""
        pass

    @abstractmethod
    async def subscribe(self, symbols: List[str]) -> bool:
        """Subscribe to real-time tick streaming for symbols."""
        pass

    @abstractmethod
    async def unsubscribe(self, symbols: List[str]) -> bool:
        """Unsubscribe from symbols."""
        pass

    @abstractmethod
    async def get_quote(self, symbol: str) -> Dict[str, Any]:
        """Fetch current live snapshot quote."""
        pass

    @abstractmethod
    async def get_historical(self, symbol: str, timeframe: str = "1m", limit: int = 500) -> List[Dict[str, Any]]:
        """Fetch historical OHLC candles."""
        pass

    @abstractmethod
    async def get_intraday(self, symbol: str, interval: str = "1m") -> List[Dict[str, Any]]:
        """Fetch intraday tick/bar series."""
        pass

    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        """Return connectivity, data freshness, latency status."""
        pass

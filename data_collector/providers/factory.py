from typing import Optional
from data_collector.providers.base import MarketDataProvider
from data_collector.providers.mock_replay import MockReplayProvider
from data_collector.providers.twelve_data import TwelveDataProvider
from backend.app.core.config import settings

def get_market_data_provider(provider_type: Optional[str] = None) -> MarketDataProvider:
    provider = provider_type or settings.MARKET_DATA_PROVIDER
    if provider == "twelve_data":
        return TwelveDataProvider(api_key=settings.TWELVE_DATA_API_KEY)
    elif provider == "mock_replay":
        return MockReplayProvider(speed=settings.MOCK_REPLAY_SPEED)
    else:
        # Default fallback to mock replay for safety
        return MockReplayProvider()

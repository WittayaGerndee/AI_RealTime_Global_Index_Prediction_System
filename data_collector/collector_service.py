import asyncio
import logging
import json
from datetime import datetime, timezone
from typing import Dict, Any, List
from data_collector.providers.factory import get_market_data_provider
from data_collector.normalizer import TickNormalizer, NormalizedTick
from backend.app.core.config import settings

logger = logging.getLogger("data_collector")

class MarketDataCollector:
    SYMBOLS = ["NIKKEI225", "DJI", "HSI", "SSE"]

    def __init__(self):
        self.provider = get_market_data_provider()
        self.normalizer = TickNormalizer()
        self.running = False
        self.latest_ticks: Dict[str, NormalizedTick] = {}
        self.tick_callbacks = []

    def register_callback(self, callback):
        self.tick_callbacks.append(callback)

    async def start(self):
        logger.info(f"Starting Data Collector with provider: {self.provider.name}")
        self.running = True
        await self.provider.connect()
        await self.provider.subscribe(self.SYMBOLS)

        while self.running:
            try:
                for symbol in self.SYMBOLS:
                    raw = await self.provider.get_quote(symbol)
                    normalized = self.normalizer.normalize(raw, self.provider.name)
                    if normalized:
                        self.latest_ticks[symbol] = normalized
                        # Notify subscribers/callbacks
                        for cb in self.tick_callbacks:
                            try:
                                if asyncio.iscoroutinefunction(cb):
                                    await cb(normalized)
                                else:
                                    cb(normalized)
                            except Exception as e:
                                logger.error(f"Error in tick callback: {e}")

                await asyncio.sleep(1.0 / max(0.1, settings.MOCK_REPLAY_SPEED))
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in data collector loop: {e}. Retrying in 3 seconds...")
                await asyncio.sleep(3.0)

    async def stop(self):
        self.running = False
        await self.provider.disconnect()
        logger.info("Data Collector stopped cleanly")

# Global singleton instance
collector_service = MarketDataCollector()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(collector_service.start())

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.config import settings
from backend.app.core.logging import setup_logging
from backend.app.api.endpoints import markets, predictions, backtest, system
from backend.app.api import websocket as ws_module
from data_collector.collector_service import collector_service
from feature_engine.calculator import FeatureCalculator
from prediction_engine.inference.service import prediction_service
from backend.app.services.accuracy_service import accuracy_service

logger = setup_logging(settings.LOG_LEVEL)

background_tasks = []

async def on_new_tick(tick):
    """Callback executed whenever a new tick arrives."""
    sym = tick.instrument_code
    # 1. Update live accuracy with latest tick
    accuracy_service.process_incoming_tick(sym, tick.price, tick.received_timestamp)

    # 2. Broadcast tick via WebSocket
    await ws_module.ws_manager.broadcast_market({
        "type": "tick",
        "symbol": sym,
        "price": tick.price,
        "timestamp": tick.provider_timestamp.isoformat(),
        "latency_ms": tick.latency_ms,
        "day_open": tick.day_open,
        "day_high": tick.day_high,
        "day_low": tick.day_low,
        "previous_close": tick.previous_close,
    })

async def prediction_loop():
    """Periodic loop generating AI predictions every N seconds (Section 8)."""
    while True:
        try:
            for sym in collector_service.SYMBOLS:
                tick = collector_service.latest_ticks.get(sym)
                if tick and not tick.is_stale:
                    candles = await collector_service.provider.get_historical(sym, timeframe="5m", limit=30)
                    feats = FeatureCalculator.calculate_features(
                        candles=candles,
                        current_tick={"price": tick.price},
                        day_open=tick.day_open,
                        day_high=tick.day_high,
                        day_low=tick.day_low,
                        prev_close=tick.previous_close
                    )
                    pred = prediction_service.generate_all_horizons(sym, feats)
                    # Register prediction for future accuracy evaluation
                    accuracy_service.register_prediction(sym, pred)

                    # Broadcast prediction to WebSocket clients
                    await ws_module.ws_manager.broadcast_pred({
                        "type": "prediction",
                        "symbol": sym,
                        "data": pred,
                    })

            await asyncio.sleep(settings.PREDICTION_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in prediction loop: {e}")
            await asyncio.sleep(3.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up AI Real-Time Global Index Prediction System...")
    # Register tick callback
    collector_service.register_callback(on_new_tick)
    # Start collector task
    collector_task = asyncio.create_task(collector_service.start())
    pred_task = asyncio.create_task(prediction_loop())
    background_tasks.extend([collector_task, pred_task])

    yield

    logger.info("Shutting down services...")
    for t in background_tasks:
        t.cancel()
    await collector_service.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# CORS configuration for Cloudflare Pages and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount REST API routers
app.include_router(markets.router, prefix=f"{settings.API_V1_STR}/markets", tags=["Markets"])
app.include_router(predictions.router, prefix=f"{settings.API_V1_STR}/predictions", tags=["Predictions"])
app.include_router(backtest.router, prefix=f"{settings.API_V1_STR}/backtest", tags=["Backtest"])
app.include_router(system.router, prefix=f"{settings.API_V1_STR}/system", tags=["System"])

# Mount WebSockets
app.include_router(ws_module.router, tags=["WebSockets"])

@app.get("/")
async def root():
    return {
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "ONLINE",
        "disclaimer": "ข้อมูลและการคาดการณ์เป็นข้อมูลเชิงสถิติ ไม่ใช่การรับประกันราคาหรือผลตอบแทนจากการลงทุน"
    }

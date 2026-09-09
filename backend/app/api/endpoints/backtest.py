from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any
from backtest.engine.walk_forward import WalkForwardBacktestEngine
from data_collector.collector_service import collector_service

router = APIRouter()

@router.get("/{symbol}")
async def run_backtest_for_symbol(
    symbol: str,
    timeframe: str = Query("5m", regex="^(1m|5m|15m|1h)$"),
    limit: int = Query(100, ge=30, le=500),
    horizon_bars: int = Query(5, ge=1, le=20)
) -> Dict[str, Any]:
    sym = symbol.upper()
    candles = await collector_service.provider.get_historical(sym, timeframe=timeframe, limit=limit)
    if not candles:
        raise HTTPException(status_code=400, detail="Unable to retrieve historical data for backtesting")
    
    engine = WalkForwardBacktestEngine(horizon_bars=horizon_bars)
    result = engine.run(sym, candles, window_size=25)
    return result

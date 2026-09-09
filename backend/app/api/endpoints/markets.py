from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from data_collector.collector_service import collector_service
from feature_engine.calculator import FeatureCalculator
from prediction_engine.inference.service import prediction_service

router = APIRouter()

MARKET_METADATA = {
    "NIKKEI225": {"name": "Nikkei 225", "market": "TSE", "timezone": "Asia/Tokyo", "currency": "JPY", "tick_size": 5.0},
    "DJI": {"name": "Dow Jones Industrial Average", "market": "NYSE", "timezone": "America/New_York", "currency": "USD", "tick_size": 1.0},
    "HSI": {"name": "Hang Seng Index", "market": "HKEX", "timezone": "Asia/Hong_Kong", "currency": "HKD", "tick_size": 1.0},
    "SSE": {"name": "Shanghai Composite Index", "market": "SSE", "timezone": "Asia/Shanghai", "currency": "CNY", "tick_size": 0.01},
}

@router.get("")
async def get_all_markets() -> List[Dict[str, Any]]:
    """Returns overview of all 4 global indices conforming to section 22."""
    results = []
    for symbol, meta in MARKET_METADATA.items():
        tick = collector_service.latest_ticks.get(symbol)
        if not tick:
            # Generate quote if not yet received
            raw = await collector_service.provider.get_quote(symbol)
            tick = collector_service.normalizer.normalize(raw, collector_service.provider.name)
            collector_service.latest_ticks[symbol] = tick

        curr = tick.price
        prev = tick.previous_close or curr
        change = round(curr - prev, 2)
        change_pct = round((change / prev) * 100.0, 2) if prev > 0 else 0.0

        # Run or retrieve prediction
        pred = prediction_service.latest_predictions.get(symbol)
        if not pred:
            candles = await collector_service.provider.get_historical(symbol, timeframe="5m", limit=30)
            feats = FeatureCalculator.calculate_features(
                candles=candles,
                current_tick={"price": curr},
                day_open=tick.day_open,
                day_high=tick.day_high,
                day_low=tick.day_low,
                prev_close=tick.previous_close
            )
            pred = prediction_service.generate_all_horizons(symbol, feats)

        results.append({
            "symbol": symbol,
            "name": meta["name"],
            "market": meta["market"],
            "currency": meta["currency"],
            "current_price": curr,
            "day_open": tick.day_open,
            "day_high": tick.day_high,
            "day_low": tick.day_low,
            "previous_close": prev,
            "change": change,
            "change_percent": change_pct,
            "data_latency_ms": tick.latency_ms,
            "is_stale": tick.is_stale,
            "market_status": "OPEN", # In active simulation
            "expected_close": pred["expected_close"],
            "prediction_range": pred["prediction_range"],
            "direction": pred["direction"],
            "direction_probability": pred["direction_probability"],
            "stabilization_zone": pred["stabilization_zone"],
            "confidence": pred["confidence"],
            "convergence_stability": pred["convergence_stability"],
        })
    return results

@router.get("/{symbol}")
async def get_market_detail(symbol: str) -> Dict[str, Any]:
    sym = symbol.upper()
    if sym not in MARKET_METADATA:
        raise HTTPException(status_code=404, detail="Symbol not supported")
    markets = await get_all_markets()
    for m in markets:
        if m["symbol"] == sym:
            return m
    raise HTTPException(status_code=404, detail="Market not found")

@router.get("/{symbol}/candles")
async def get_market_candles(symbol: str, timeframe: str = "5m", limit: int = 60) -> List[Dict[str, Any]]:
    sym = symbol.upper()
    candles = await collector_service.provider.get_historical(sym, timeframe=timeframe, limit=limit)
    return candles

@router.get("/{symbol}/indicators")
async def get_market_indicators(symbol: str) -> Dict[str, Any]:
    sym = symbol.upper()
    candles = await collector_service.provider.get_historical(sym, timeframe="5m", limit=40)
    tick = collector_service.latest_ticks.get(sym)
    feats = FeatureCalculator.calculate_features(
        candles=candles,
        current_tick={"price": tick.price} if tick else None,
        day_open=tick.day_open if tick else None,
        day_high=tick.day_high if tick else None,
        day_low=tick.day_low if tick else None,
        prev_close=tick.previous_close if tick else None
    )
    return feats

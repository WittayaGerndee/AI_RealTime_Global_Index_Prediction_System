from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from prediction_engine.inference.service import prediction_service
from backend.app.services.accuracy_service import accuracy_service
from data_collector.collector_service import collector_service
from feature_engine.calculator import FeatureCalculator

router = APIRouter()

@router.get("/{symbol}")
async def get_latest_prediction(symbol: str) -> Dict[str, Any]:
    sym = symbol.upper()
    pred = prediction_service.latest_predictions.get(sym)
    if not pred:
        # Trigger dynamic calculation
        candles = await collector_service.provider.get_historical(sym, timeframe="5m", limit=30)
        tick = collector_service.latest_ticks.get(sym)
        feats = FeatureCalculator.calculate_features(
            candles=candles,
            current_tick={"price": tick.price} if tick else None
        )
        pred = prediction_service.generate_all_horizons(sym, feats)
    return pred

@router.get("/{symbol}/timeline")
async def get_prediction_timeline(symbol: str) -> List[Dict[str, Any]]:
    """Returns past actual vs predicted points for charting (Section 24)."""
    sym = symbol.upper()
    return prediction_service.prediction_history.get(sym, [])

@router.get("/{symbol}/accuracy")
async def get_market_accuracy(symbol: str) -> Dict[str, Any]:
    """Returns actual empirical accuracy report with multi-tolerance metrics (Section 21)."""
    sym = symbol.upper()
    return accuracy_service.get_accuracy_report(sym)

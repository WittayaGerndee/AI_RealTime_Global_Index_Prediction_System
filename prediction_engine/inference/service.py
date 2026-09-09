import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from prediction_engine.ensemble.weighted_ensemble import WeightedEnsembleEngine
from feature_engine.calculator import FeatureCalculator
from data_collector.collector_service import collector_service

logger = logging.getLogger("prediction_engine")

class PredictionService:
    """
    Coordinates real-time predictions across all horizons (1m, 5m, 15m, 30m, 60m, Close)
    for all global index instruments conforming to requirement section 8, 12, 16.
    """

    HORIZONS = [1, 5, 15, 30, 60]

    def __init__(self):
        self.ensemble = WeightedEnsembleEngine()
        self.latest_predictions: Dict[str, Dict[str, Any]] = {}
        self.prediction_history: Dict[str, List[Dict[str, Any]]] = {}

    def generate_all_horizons(self, symbol: str, features: Dict[str, Any]) -> Dict[str, Any]:
        """Runs predictions across all horizons and packages the result."""
        curr_price = float(features["current_price"])
        now = datetime.now(timezone.utc)
        horizon_results = {}

        for h in self.HORIZONS:
            target_time = now + timedelta(minutes=h)
            pred = self.ensemble.predict_horizon(symbol, features, horizon_minutes=h)
            pred["prediction_time"] = now.isoformat()
            pred["target_time"] = target_time.isoformat()
            horizon_results[f"{h}m"] = pred

        # Session close prediction (horizon 180 min representative or session close)
        close_pred = self.ensemble.predict_horizon(symbol, features, horizon_minutes=180, is_session_close=True)
        close_pred["prediction_time"] = now.isoformat()
        close_pred["target_time"] = (now + timedelta(hours=3)).isoformat()
        horizon_results["Close"] = close_pred

        # Main active horizon for high-level cards is 5m
        main_pred = horizon_results["5m"]

        payload = {
            "symbol": symbol,
            "timestamp": now.isoformat(),
            "current_price": curr_price,
            "expected_close": close_pred["expected_price"],
            "prediction_range": {
                "lower": main_pred["lower_bound"],
                "upper": main_pred["upper_bound"],
                "probability": 0.80,
            },
            "direction": main_pred["direction"],
            "direction_probability": main_pred["direction_probability"],
            "stabilization_zone": main_pred["stabilization_zone"],
            "confidence": main_pred["confidence"],
            "convergence_stability": main_pred["convergence_stability"],
            "model_version": self.ensemble.MODEL_VERSION,
            "horizons": horizon_results,
        }

        self.latest_predictions[symbol] = payload

        # Keep rolling history of main predictions for timeline graphs
        hist = self.prediction_history.setdefault(symbol, [])
        hist.append({
            "timestamp": now.isoformat(),
            "current_price": curr_price,
            "expected_price": main_pred["expected_price"],
            "lower_bound": main_pred["lower_bound"],
            "upper_bound": main_pred["upper_bound"],
            "stabilization_low": main_pred["stabilization_zone"]["stabilization_low"],
            "stabilization_high": main_pred["stabilization_zone"]["stabilization_high"],
        })
        if len(hist) > 100:
            hist.pop(0)

        return payload

# Global singleton
prediction_service = PredictionService()

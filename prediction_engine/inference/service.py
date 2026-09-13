import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from prediction_engine.ensemble.weighted_ensemble import WeightedEnsembleEngine
from feature_engine.calculator import FeatureCalculator
from backend.app.services import market_hours

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
        # Close forecast frozen at lock time, per symbol, for the current session
        self.locked_close: Dict[str, Dict[str, Any]] = {}

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

        # Session close prediction over the trading time remaining (lunch breaks excluded)
        state = market_hours.get_session_state(symbol, now) if market_hours.is_supported(symbol) else None
        session = state["current"] if state else None
        remaining = max(1, round(session.remaining_trading_minutes(now))) if session else 180
        close_pred = self.ensemble.predict_horizon(symbol, features, horizon_minutes=remaining, is_session_close=True)
        close_pred["prediction_time"] = now.isoformat()
        close_pred["target_time"] = (session.close if session else now + timedelta(hours=3)).isoformat()
        horizon_results["Close"] = close_pred
        close_forecast = self._close_forecast(symbol, state, close_pred, curr_price, now)

        # Main active horizon for high-level cards is 5m
        main_pred = horizon_results["5m"]

        payload = {
            "symbol": symbol,
            "timestamp": now.isoformat(),
            "current_price": curr_price,
            "expected_close": close_forecast["value"],
            "close_forecast": close_forecast,
            "market_status": state["status"] if state else "OPEN",
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

    def _close_forecast(
        self,
        symbol: str,
        state: Optional[Dict[str, Any]],
        close_pred: Dict[str, Any],
        curr_price: float,
        now: datetime,
    ) -> Dict[str, Any]:
        """Live session-close forecast until the final segment's lock time, frozen from then on."""
        live = {
            "session_date": state["current"].session_date if state else None,
            "value": close_pred["expected_price"],
            "lower": close_pred["lower_bound"],
            "upper": close_pred["upper_bound"],
            "locked": False,
            "locked_at": None,
            "price_at_lock": None,
            "actual_close": None,
            "error": None,
            "error_pct": None,
        }
        session = state["current"] if state else None
        # Only the final segment's lock freezes the session close (morning locks apply to the morning close)
        if not session or now < session.lock_at:
            return live

        locked = self.locked_close.get(symbol)
        if not locked or locked["session_date"] != session.session_date:
            # First snapshot at or after lock time for this session
            locked = dict(live, locked=True, locked_at=now.isoformat(), price_at_lock=curr_price)
            self.locked_close[symbol] = locked
        return locked

    def record_close(self, symbol: str, close_price: float) -> None:
        """Stores the realized session close next to the locked forecast."""
        locked = self.locked_close.get(symbol)
        if not locked or locked["actual_close"] is not None:
            return
        err = round(close_price - locked["value"], 2)
        locked.update(
            actual_close=close_price,
            error=err,
            error_pct=round(err / close_price * 100.0, 2) if close_price else None,
        )
        payload = self.latest_predictions.get(symbol)
        if payload:
            payload["close_forecast"] = locked
            payload["market_status"] = market_hours.STATUS_CLOSED

# Global singleton
prediction_service = PredictionService()

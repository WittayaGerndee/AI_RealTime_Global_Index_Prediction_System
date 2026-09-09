from typing import List, Dict, Any
from feature_engine.calculator import FeatureCalculator
from prediction_engine.ensemble.weighted_ensemble import WeightedEnsembleEngine
from backtest.metrics.accuracy import AccuracyMetrics

class WalkForwardBacktestEngine:
    """
    Simulates walk-forward time-series backtesting conforming to requirement section 20.
    Eliminates look-ahead bias and data leakage.
    """

    def __init__(self, horizon_bars: int = 5, tick_size: float = 1.0):
        self.horizon_bars = horizon_bars
        self.tick_size = tick_size
        self.ensemble = WeightedEnsembleEngine()

    def run(self, symbol: str, candles: List[Dict[str, Any]], window_size: int = 40) -> Dict[str, Any]:
        """
        Steps through historical candles sequentially.
        For bar i, uses candles[i - window_size : i] to forecast bar i + horizon_bars.
        """
        if len(candles) < window_size + self.horizon_bars:
            return {"error": "Not enough candles for walk-forward validation"}

        evaluations = []

        for i in range(window_size, len(candles) - self.horizon_bars):
            history_window = candles[i - window_size : i]
            current_bar = history_window[-1]
            future_bar = candles[i + self.horizon_bars]

            # Calculate features strictly from past window
            features = FeatureCalculator.calculate_features(
                candles=history_window,
                current_tick={"price": current_bar["close"]},
                day_open=history_window[0]["open"],
                day_high=max(c["high"] for c in history_window),
                day_low=min(c["low"] for c in history_window),
                prev_close=history_window[0]["open"]
            )

            # Predict horizon
            pred = self.ensemble.predict_horizon(
                symbol=symbol,
                features=features,
                horizon_minutes=self.horizon_bars
            )

            evaluations.append({
                "timestamp": current_bar["bucket_time"],
                "current_price": float(current_bar["close"]),
                "expected_price": pred["expected_price"],
                "lower_bound": pred["lower_bound"],
                "upper_bound": pred["upper_bound"],
                "stabilization_low": pred["stabilization_zone"]["stabilization_low"],
                "stabilization_high": pred["stabilization_zone"]["stabilization_high"],
                "direction": pred["direction"],
                "actual_price": float(future_bar["close"]),
            })

            # Update ensemble error to simulate online Bayesian calibration
            sq_err = (pred["expected_price"] - float(future_bar["close"])) ** 2
            self.ensemble.update_model_error("quant_reversion", sq_err)

        metrics = AccuracyMetrics.calculate_metrics(evaluations, tick_size=self.tick_size)
        metrics["symbol"] = symbol
        metrics["horizon_bars"] = self.horizon_bars
        metrics["window_size"] = window_size
        metrics["sample_evaluations"] = evaluations[-20:] # Last 20 for preview

        return metrics

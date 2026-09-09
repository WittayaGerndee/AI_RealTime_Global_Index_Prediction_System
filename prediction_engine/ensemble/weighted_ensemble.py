import math
from typing import Dict, Any, List
from prediction_engine.models.base_models import BaselineModels
from prediction_engine.ensemble.stabilization_zone import StabilizationZoneEngine

class WeightedEnsembleEngine:
    """
    Ensemble prediction engine with Bayesian inverse-error weighting,
    probabilistic interval generation, directional classification,
    and convergence tracking. Conforms to requirements 13, 16, 17, 18, 21, 25.
    """

    MODEL_VERSION = "v1.0.0-AdaptiveQuant"

    def __init__(self):
        # Rolling errors for dynamic model weights (inverse MSE)
        self._model_mse = {
            "naive": 25.0,
            "momentum": 18.0,
            "ewma_trend": 16.0,
            "quant_reversion": 12.0,
        }
        # Recent predictions buffer for convergence stability
        self._recent_predictions: Dict[str, List[float]] = {}

    def update_model_error(self, model_key: str, squared_error: float):
        """Update exponential moving MSE for dynamic Bayesian weighting."""
        if model_key in self._model_mse:
            self._model_mse[model_key] = (0.95 * self._model_mse[model_key]) + (0.05 * squared_error)

    def _get_ensemble_weights(self) -> Dict[str, float]:
        """Inverse-variance weighting: w_i = (1 / MSE_i) / sum(1 / MSE_j)"""
        inv_vars = {k: 1.0 / max(0.1, v) for k, v in self._model_mse.items()}
        total = sum(inv_vars.values())
        return {k: v / total for k, v in inv_vars.items()}

    def predict_horizon(
        self,
        symbol: str,
        features: Dict[str, Any],
        horizon_minutes: int,
        is_session_close: bool = False
    ) -> Dict[str, Any]:
        curr = float(features["current_price"])
        returns = features.get("returns", {})
        ema_5 = float(features.get("ema_5", curr))
        ema_20 = float(features.get("ema_20", curr))
        vwap = float(features.get("vwap", curr))
        bb_middle = float(features.get("bb_middle", curr))
        rsi_14 = float(features.get("rsi_14", 50.0))
        realized_vol = float(features.get("realized_volatility", 0.005))
        atr_14 = float(features.get("atr_14", curr * 0.002))
        regime_info = features.get("regime", {})
        regime = regime_info.get("primary", "RANGE")
        sr = features.get("support_resistance", {"supports": [], "resistances": []})

        # 1. Run sub-models
        p_naive = BaselineModels.predict_naive(curr)
        p_momentum = BaselineModels.predict_momentum(curr, returns, horizon_minutes)
        p_ewma = BaselineModels.predict_ewma_trend(curr, ema_5, ema_20, horizon_minutes)
        p_quant = BaselineModels.predict_quant_reversion(curr, vwap, bb_middle, rsi_14, realized_vol, horizon_minutes)

        sub_predictions = {
            "naive": p_naive,
            "momentum": p_momentum,
            "ewma_trend": p_ewma,
            "quant_reversion": p_quant,
        }

        # 2. Weighted ensemble
        weights = self._get_ensemble_weights()
        expected_price = sum(sub_predictions[k] * weights[k] for k in sub_predictions)
        expected_price = round(expected_price, 2)

        # Expected close logic: If session close horizon, anchor to session progress
        expected_close = expected_price

        # 3. Probabilistic confidence intervals (50%, 80%, 95%)
        # Standard deviation scales with sqrt of horizon
        vol_scaling = max(0.0005, realized_vol) * math.sqrt(max(1.0, horizon_minutes))
        sigma = curr * vol_scaling

        # Normal quantiles: z_50 = 0.674, z_80 = 1.282, z_95 = 1.960
        lower_50 = round(expected_price - 0.674 * sigma, 2)
        upper_50 = round(expected_price + 0.674 * sigma, 2)
        lower_80 = round(expected_price - 1.282 * sigma, 2)
        upper_80 = round(expected_price + 1.282 * sigma, 2)
        lower_95 = round(expected_price - 1.960 * sigma, 2)
        upper_95 = round(expected_price + 1.960 * sigma, 2)

        # 4. Direction & Probabilities (UP, DOWN, SIDEWAYS)
        price_diff = expected_price - curr
        threshold = curr * 0.0003 # 0.03% threshold for sideways

        # Compute direction probabilities via logistic softmax
        z_score = price_diff / max(0.1, sigma)
        p_raw_up = 1.0 / (1.0 + math.exp(-2.5 * z_score))
        p_raw_down = 1.0 - p_raw_up

        if abs(price_diff) < threshold:
            direction = "SIDEWAYS"
            prob_sideways = 0.55
            prob_up = round((1.0 - prob_sideways) * p_raw_up, 2)
            prob_down = round(1.0 - prob_sideways - prob_up, 2)
        elif price_diff > 0:
            direction = "UP"
            prob_up = round(min(0.88, max(0.52, p_raw_up)), 2)
            prob_sideways = round((1.0 - prob_up) * 0.4, 2)
            prob_down = round(1.0 - prob_up - prob_sideways, 2)
        else:
            direction = "DOWN"
            prob_down = round(min(0.88, max(0.52, p_raw_down)), 2)
            prob_sideways = round((1.0 - prob_down) * 0.4, 2)
            prob_up = round(1.0 - prob_down - prob_sideways, 2)

        direction_probability = max(prob_up, prob_down, prob_sideways)

        # 5. Price Stabilization Zone
        stab_zone = StabilizationZoneEngine.calculate_stabilization_zone(
            current_price=curr,
            expected_price=expected_price,
            support_levels=sr.get("supports", []),
            resistance_levels=sr.get("resistances", []),
            realized_vol=realized_vol,
            atr=atr_14,
            regime=regime
        )

        # 6. Model Agreement & Confidence Score
        # Dispersion between sub-models
        sub_vals = list(sub_predictions.values())
        mean_sub = sum(sub_vals) / len(sub_vals)
        dispersion = math.sqrt(sum((x - mean_sub) ** 2 for x in sub_vals) / len(sub_vals)) / curr if curr > 0 else 0.01
        agreement_score = max(0.3, 1.0 - (dispersion / 0.005)) # High agreement if low std
        interval_tightness = max(0.3, 1.0 - ((upper_80 - lower_80) / curr / 0.015))
        regime_penalty = 0.9 if regime == "HIGH_VOLATILITY" else 1.0

        confidence = round(
            (0.40 * agreement_score + 0.35 * direction_probability + 0.25 * interval_tightness) * regime_penalty,
            2
        )
        confidence = float(max(0.35, min(0.92, confidence)))

        # 7. Convergence tracking (Section 25)
        history = self._recent_predictions.setdefault(symbol, [])
        history.append(expected_price)
        if len(history) > 5:
            history.pop(0)

        convergence_stability = "HIGH"
        if len(history) >= 4:
            mean_hist = sum(history) / len(history)
            std_recent = math.sqrt(sum((x - mean_hist) ** 2 for x in history) / len(history))
            if std_recent > (curr * 0.0015):
                convergence_stability = "LOW"

        horizon_label = "Close" if is_session_close else f"{horizon_minutes}m"

        return {
            "symbol": symbol,
            "horizon": horizon_label,
            "horizon_minutes": horizon_minutes,
            "model_version": self.MODEL_VERSION,
            "current_price": curr,
            "expected_price": expected_price,
            "expected_close": expected_close,
            "lower_bound": lower_80, # Default main interval on UI is 80%
            "upper_bound": upper_80,
            "intervals": {
                "50": {"lower": lower_50, "upper": upper_50},
                "80": {"lower": lower_80, "upper": upper_80},
                "95": {"lower": lower_95, "upper": upper_95},
            },
            "direction": direction,
            "direction_probability": direction_probability,
            "probabilities": {
                "up": prob_up,
                "down": prob_down,
                "sideways": prob_sideways,
            },
            "stabilization_zone": stab_zone,
            "confidence": confidence,
            "convergence_stability": convergence_stability,
            "sub_model_predictions": sub_predictions,
            "sub_model_weights": {k: round(v, 4) for k, v in weights.items()},
        }

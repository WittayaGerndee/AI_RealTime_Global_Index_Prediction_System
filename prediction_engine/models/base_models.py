import math
from typing import Dict, Any

class BaselineModels:
    """
    Core baseline and quant mathematical predictors conforming to requirement section 13.
    Strictly causal with zero look-ahead bias.
    """

    @staticmethod
    def predict_naive(current_price: float) -> float:
        """Baseline 1: Naive persistence model: future = current"""
        return float(current_price)

    @staticmethod
    def predict_momentum(current_price: float, returns: Dict[str, float], horizon_minutes: int) -> float:
        """Baseline 2: Short-term momentum with mean-reversion decay"""
        r_5 = returns.get("r_5", 0.0) / 100.0
        # Decay momentum over horizon
        decay_factor = math.exp(-0.05 * horizon_minutes)
        projected_return = (r_5 * (horizon_minutes / 5.0)) * decay_factor
        # Cap projected move at realistic max per horizon
        max_pct = 0.005 * math.sqrt(horizon_minutes)
        clipped_return = max(-max_pct, min(max_pct, projected_return))
        return round(current_price * (1.0 + clipped_return), 2)

    @staticmethod
    def predict_ewma_trend(current_price: float, ema_5: float, ema_20: float, horizon_minutes: int) -> float:
        """Baseline 3: Exponential smoothing & trend slope"""
        slope = (ema_5 - ema_20) / max(1.0, ema_20)
        projected_drift = slope * math.log1p(horizon_minutes) * 0.5
        max_pct = 0.006 * math.sqrt(horizon_minutes)
        clipped_drift = max(-max_pct, min(max_pct, projected_drift))
        return round(current_price * (1.0 + clipped_drift), 2)

    @staticmethod
    def predict_quant_reversion(
        current_price: float,
        vwap: float,
        bb_middle: float,
        rsi_14: float,
        realized_vol: float,
        horizon_minutes: int
    ) -> float:
        """
        Microstructure Quant Model:
        Ornstein-Uhlenbeck mean-reverting drift towards VWAP/BB-middle,
        dampened by RSI overbought/oversold boundaries and volatility.
        """
        equilibrium = (vwap * 0.6) + (bb_middle * 0.4)
        distance = equilibrium - current_price
        
        # Mean reversion speed kappa
        kappa = 0.08 * (1.0 - math.exp(-0.1 * horizon_minutes))
        reversion_step = distance * kappa

        # RSI counter-force
        rsi_adjustment = 0.0
        if rsi_14 > 70:
            # Overbought push downward
            rsi_adjustment = -0.0008 * (rsi_14 - 70) * current_price
        elif rsi_14 < 30:
            # Oversold push upward
            rsi_adjustment = 0.0008 * (30 - rsi_14) * current_price

        pred = current_price + reversion_step + rsi_adjustment
        return round(pred, 2)

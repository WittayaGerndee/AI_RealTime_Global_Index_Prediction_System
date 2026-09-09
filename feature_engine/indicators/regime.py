from typing import Dict, Any

class MarketRegimeDetector:
    """
    Detects market regimes conforming to requirement section 19.
    """

    @staticmethod
    def detect_regime(
        current_price: float,
        ema_20: float,
        ema_50: float,
        rsi_14: float,
        volatility: float,
        bb_bandwidth: float,
        atr: float
    ) -> Dict[str, Any]:
        regimes = []

        # Trend detection
        is_uptrend = current_price > ema_20 and ema_20 > ema_50
        is_downtrend = current_price < ema_20 and ema_20 < ema_50

        if is_uptrend:
            regimes.append("TREND_UP")
        elif is_downtrend:
            regimes.append("TREND_DOWN")
        else:
            regimes.append("RANGE")

        # Volatility regime
        if bb_bandwidth > 0.04 or volatility > 0.003:
            regimes.append("HIGH_VOLATILITY")
        elif bb_bandwidth < 0.015:
            regimes.append("LOW_VOLATILITY")

        # Breakout / Reversal risk
        if rsi_14 > 75 or rsi_14 < 25:
            regimes.append("REVERSAL_RISK")
        elif bb_bandwidth < 0.012:
            regimes.append("BREAKOUT_WATCH")

        primary_regime = regimes[0]
        return {
            "primary": primary_regime,
            "all_tags": regimes,
            "trend_strength": round(abs(current_price - ema_50) / ema_50 * 100.0, 2) if ema_50 > 0 else 0.0,
            "volatility_state": "HIGH" if "HIGH_VOLATILITY" in regimes else ("LOW" if "LOW_VOLATILITY" in regimes else "NORMAL"),
        }

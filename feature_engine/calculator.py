from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from feature_engine.indicators.technical import TechnicalIndicators
from feature_engine.indicators.support_resistance import SupportResistanceEngine
from feature_engine.indicators.regime import MarketRegimeDetector

class FeatureCalculator:
    """
    Calculates unified technical, statistical, and regime feature snapshots
    conforming to requirement sections 9, 10, 15, and 19.
    """

    @staticmethod
    def calculate_features(
        candles: List[Dict[str, Any]],
        current_tick: Optional[Dict[str, Any]] = None,
        day_open: Optional[float] = None,
        day_high: Optional[float] = None,
        day_low: Optional[float] = None,
        prev_close: Optional[float] = None
    ) -> Dict[str, Any]:
        if not candles:
            return {}

        closes = [float(c["close"]) for c in candles]
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        volumes = [float(c.get("volume", 1.0)) for c in candles]

        current_price = float(current_tick["price"]) if current_tick else closes[-1]
        
        # Base day values fallback
        d_open = day_open or float(candles[0]["open"])
        d_high = max(day_high or max(highs), current_price)
        d_low = min(day_low or min(lows), current_price)
        p_close = prev_close or d_open

        # Indicators
        ema_5 = TechnicalIndicators.calculate_ema(closes, 5)
        ema_9 = TechnicalIndicators.calculate_ema(closes, 9)
        ema_20 = TechnicalIndicators.calculate_ema(closes, 20)
        ema_50 = TechnicalIndicators.calculate_ema(closes, 50)
        ema_200 = TechnicalIndicators.calculate_ema(closes, 200)

        rsi_14 = TechnicalIndicators.calculate_rsi(closes, 14)
        macd_dict = TechnicalIndicators.calculate_macd(closes)
        bb_dict = TechnicalIndicators.calculate_bollinger_bands(closes, 20, 2.0)
        atr_14 = TechnicalIndicators.calculate_atr(highs, lows, closes, 14)
        roc_10 = TechnicalIndicators.calculate_roc(closes, 10)
        vwap = TechnicalIndicators.calculate_vwap(closes, volumes)
        realized_vol = TechnicalIndicators.calculate_realized_volatility(closes, 20)

        # Returns
        def get_return(lag: int) -> float:
            if len(closes) > lag:
                return float((current_price - closes[-lag]) / closes[-lag] * 100.0)
            return 0.0

        r_1 = get_return(1)
        r_3 = get_return(3)
        r_5 = get_return(5)
        r_10 = get_return(10)
        r_30 = get_return(30)

        # Price position
        day_range = max(0.01, d_high - d_low)
        position_in_day_range = float((current_price - d_low) / day_range)
        dist_to_high = float(d_high - current_price)
        dist_to_low = float(current_price - d_low)
        dist_to_open = float(current_price - d_open)

        # Support & Resistance
        sr_levels = SupportResistanceEngine.calculate_levels(
            current_price=current_price,
            day_open=d_open,
            day_high=d_high,
            day_low=d_low,
            prev_close=p_close,
            rolling_prices=closes,
            bb_upper=bb_dict["upper"],
            bb_lower=bb_dict["lower"]
        )

        # Regime detection
        regime = MarketRegimeDetector.detect_regime(
            current_price=current_price,
            ema_20=ema_20,
            ema_50=ema_50,
            rsi_14=rsi_14,
            volatility=realized_vol,
            bb_bandwidth=bb_dict["bandwidth"],
            atr=atr_14
        )

        return {
            "current_price": current_price,
            "day_open": d_open,
            "day_high": d_high,
            "day_low": d_low,
            "previous_close": p_close,
            "ema_5": round(ema_5, 2),
            "ema_9": round(ema_9, 2),
            "ema_20": round(ema_20, 2),
            "ema_50": round(ema_50, 2),
            "ema_200": round(ema_200, 2),
            "rsi_14": round(rsi_14, 2),
            "macd": round(macd_dict["macd"], 4),
            "macd_signal": round(macd_dict["signal"], 4),
            "macd_histogram": round(macd_dict["histogram"], 4),
            "bb_upper": round(bb_dict["upper"], 2),
            "bb_middle": round(bb_dict["middle"], 2),
            "bb_lower": round(bb_dict["lower"], 2),
            "bb_bandwidth": round(bb_dict["bandwidth"], 4),
            "atr_14": round(atr_14, 2),
            "roc_10": round(roc_10, 4),
            "vwap": round(vwap, 2),
            "realized_volatility": round(realized_vol, 6),
            "returns": {
                "r_1": round(r_1, 4),
                "r_3": round(r_3, 4),
                "r_5": round(r_5, 4),
                "r_10": round(r_10, 4),
                "r_30": round(r_30, 4),
            },
            "position": {
                "in_day_range": round(position_in_day_range, 4),
                "dist_to_high": round(dist_to_high, 2),
                "dist_to_low": round(dist_to_low, 2),
                "dist_to_open": round(dist_to_open, 2),
            },
            "support_resistance": sr_levels,
            "regime": regime,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

import math
from typing import List, Dict, Any

class StabilizationZoneEngine:
    """
    Calculates Price Stabilization Zone conforming to requirement section 11.
    Finds the equilibrium consolidation zone where price momentum decelerates.
    """

    @staticmethod
    def calculate_stabilization_zone(
        current_price: float,
        expected_price: float,
        support_levels: List[Dict[str, Any]],
        resistance_levels: List[Dict[str, Any]],
        realized_vol: float,
        atr: float,
        regime: str
    ) -> Dict[str, float]:
        # Collect candidate barrier levels near expected price
        nearby_levels = []
        for s in support_levels:
            if abs(s["price"] - expected_price) / expected_price < 0.015:
                nearby_levels.append((s["price"], s.get("strength", 0.7)))
        for r in resistance_levels:
            if abs(r["price"] - expected_price) / expected_price < 0.015:
                nearby_levels.append((r["price"], r.get("strength", 0.7)))

        # If near levels exist, weight center towards strongest cluster
        if nearby_levels:
            total_w = sum(w for _, w in nearby_levels) + 1.0
            center = (sum(p * w for p, w in nearby_levels) + expected_price) / total_w
        else:
            center = expected_price

        # Base width of zone is determined by ATR and market regime
        base_half_width = max(current_price * 0.0008, atr * 0.45)

        # Regimes expand or contract stabilization zone
        if regime == "HIGH_VOLATILITY":
            half_width = base_half_width * 1.35
            base_prob = 0.58
        elif regime == "RANGE":
            half_width = base_half_width * 0.85
            base_prob = 0.78
        elif regime == "LOW_VOLATILITY":
            half_width = base_half_width * 0.75
            base_prob = 0.82
        else:
            half_width = base_half_width
            base_prob = 0.68

        low = round(center - half_width, 2)
        high = round(center + half_width, 2)
        prob = round(min(0.92, max(0.45, base_prob)), 2)

        return {
            "stabilization_low": low,
            "stabilization_high": high,
            "stabilization_probability": prob,
        }

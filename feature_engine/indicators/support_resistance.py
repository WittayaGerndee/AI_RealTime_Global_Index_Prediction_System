from typing import List, Dict, Any

class SupportResistanceEngine:
    """
    Consolidates multi-method support and resistance levels conforming to requirement section 10.
    """

    @staticmethod
    def calculate_levels(
        current_price: float,
        day_open: float,
        day_high: float,
        day_low: float,
        prev_close: float,
        rolling_prices: np.ndarray,
        bb_upper: float,
        bb_lower: float
    ) -> Dict[str, List[Dict[str, Any]]]:
        candidates = []

        # 1. Day extremes
        candidates.append({"price": round(day_high, 2), "method": "DAY_HIGH", "weight": 0.85})
        candidates.append({"price": round(day_low, 2), "method": "DAY_LOW", "weight": 0.85})
        candidates.append({"price": round(prev_close, 2), "method": "PREVIOUS_CLOSE", "weight": 0.90})

        # 2. Classic & Fibonacci Pivot Points
        pp = (day_high + day_low + prev_close) / 3.0
        r1 = 2 * pp - day_low
        s1 = 2 * pp - day_high
        r2 = pp + (day_high - day_low)
        s2 = pp - (day_high - day_low)

        # Fibonacci pivots
        range_hl = day_high - day_low
        r_fib1 = pp + 0.382 * range_hl
        r_fib2 = pp + 0.618 * range_hl
        s_fib1 = pp - 0.382 * range_hl
        s_fib2 = pp - 0.618 * range_hl

        candidates.append({"price": round(pp, 2), "method": "PIVOT_POINT", "weight": 0.95})
        candidates.append({"price": round(r1, 2), "method": "PIVOT_R1", "weight": 0.80})
        candidates.append({"price": round(s1, 2), "method": "PIVOT_S1", "weight": 0.80})
        candidates.append({"price": round(r2, 2), "method": "PIVOT_R2", "weight": 0.75})
        candidates.append({"price": round(s2, 2), "method": "PIVOT_S2", "weight": 0.75})
        candidates.append({"price": round(r_fib1, 2), "method": "FIB_R382", "weight": 0.70})
        candidates.append({"price": round(s_fib1, 2), "method": "FIB_S382", "weight": 0.70})

        # 3. Bollinger bands
        candidates.append({"price": round(bb_upper, 2), "method": "BOLLINGER_UPPER", "weight": 0.75})
        candidates.append({"price": round(bb_lower, 2), "method": "BOLLINGER_LOWER", "weight": 0.75})

        # 4. Rolling extremes
        if len(rolling_prices) > 10:
            roll_high = float(max(rolling_prices))
            roll_low = float(min(rolling_prices))
            candidates.append({"price": round(roll_high, 2), "method": "ROLLING_HIGH", "weight": 0.70})
            candidates.append({"price": round(roll_low, 2), "method": "ROLLING_LOW", "weight": 0.70})

        supports = []
        resistances = []

        for item in candidates:
            price = item["price"]
            dist = round(abs(price - current_price), 2)
            pct_dist = round(dist / current_price * 100.0, 3) if current_price > 0 else 0.0
            level_info = {
                "price": price,
                "method": item["method"],
                "strength": item["weight"],
                "distance_from_current": dist,
                "distance_pct": pct_dist,
                "confidence": round(item["weight"] * max(0.2, 1.0 - (pct_dist / 5.0)), 2)
            }

            if price < current_price:
                supports.append(level_info)
            elif price > current_price:
                resistances.append(level_info)

        # Sort supports descending (closest to price first)
        supports.sort(key=lambda x: x["price"], reverse=True)
        # Sort resistances ascending (closest to price first)
        resistances.sort(key=lambda x: x["price"])

        return {
            "supports": supports[:5], # Top 5 closest
            "resistances": resistances[:5], # Top 5 closest
        }

import math
from typing import List, Dict, Any, Union

NumericList = Union[List[float], Any]

class TechnicalIndicators:
    """
    High-precision mathematical implementation of technical indicators
    conforming to requirement section 9.
    Runs natively with pure Python math and supports NumPy arrays seamlessly.
    """

    @staticmethod
    def calculate_ema(prices: NumericList, period: int) -> float:
        p_list = list(prices)
        n = len(p_list)
        if n == 0:
            return 0.0
        if n < period:
            return float(sum(p_list) / n)
        
        alpha = 2.0 / (period + 1.0)
        ema = float(p_list[0])
        for price in p_list[1:]:
            ema = (float(price) * alpha) + (ema * (1.0 - alpha))
        return float(ema)

    @staticmethod
    def _ema_series(prices: List[float], span: int) -> List[float]:
        if not prices:
            return []
        alpha = 2.0 / (span + 1.0)
        result = [float(prices[0])]
        for p in prices[1:]:
            result.append(float(p) * alpha + result[-1] * (1.0 - alpha))
        return result

    @staticmethod
    def calculate_rsi(prices: NumericList, period: int = 14) -> float:
        p_list = [float(x) for x in prices]
        if len(p_list) < period + 1:
            return 50.0
        
        gains = []
        losses = []
        for i in range(1, len(p_list)):
            diff = p_list[i] - p_list[i - 1]
            gains.append(max(0.0, diff))
            losses.append(max(0.0, -diff))

        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period

        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period

        if avg_loss == 0.0:
            return 100.0 if avg_gain > 0 else 50.0
        rs = avg_gain / avg_loss
        rsi = 100.0 - (100.0 / (1.0 + rs))
        return float(max(0.0, min(100.0, rsi)))

    @staticmethod
    def calculate_macd(prices: NumericList, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, float]:
        p_list = [float(x) for x in prices]
        if len(p_list) < slow:
            return {"macd": 0.0, "signal": 0.0, "histogram": 0.0}

        fast_series = TechnicalIndicators._ema_series(p_list, fast)
        slow_series = TechnicalIndicators._ema_series(p_list, slow)
        macd_line = [f - s for f, s in zip(fast_series, slow_series)]
        signal_line = TechnicalIndicators._ema_series(macd_line, signal)
        
        hist = macd_line[-1] - signal_line[-1]
        return {
            "macd": float(macd_line[-1]),
            "signal": float(signal_line[-1]),
            "histogram": float(hist),
        }

    @staticmethod
    def calculate_bollinger_bands(prices: NumericList, period: int = 20, num_std: float = 2.0) -> Dict[str, float]:
        p_list = [float(x) for x in prices]
        n = len(p_list)
        if n < 2:
            p = float(p_list[-1]) if n > 0 else 0.0
            return {"upper": p, "middle": p, "lower": p, "bandwidth": 0.0}
        
        window = p_list[-period:] if n >= period else p_list
        middle = sum(window) / len(window)
        variance = sum((x - middle) ** 2 for x in window) / len(window)
        std = math.sqrt(variance)
        upper = middle + (num_std * std)
        lower = middle - (num_std * std)
        bandwidth = (upper - lower) / middle if middle > 0 else 0.0

        return {
            "upper": float(upper),
            "middle": float(middle),
            "lower": float(lower),
            "bandwidth": float(bandwidth),
        }

    @staticmethod
    def calculate_atr(highs: NumericList, lows: NumericList, closes: NumericList, period: int = 14) -> float:
        h_list = [float(x) for x in highs]
        l_list = [float(x) for x in lows]
        c_list = [float(x) for x in closes]
        n = len(c_list)
        if n < 2:
            return float(h_list[-1] - l_list[-1]) if n > 0 else 1.0

        tr_list = []
        for i in range(1, n):
            h_l = h_list[i] - l_list[i]
            h_pc = abs(h_list[i] - c_list[i - 1])
            l_pc = abs(l_list[i] - c_list[i - 1])
            tr = max(h_l, h_pc, l_pc)
            tr_list.append(tr)

        if not tr_list:
            return 1.0
        window = tr_list[-period:] if len(tr_list) >= period else tr_list
        return float(sum(window) / len(window))

    @staticmethod
    def calculate_vwap(prices: NumericList, volumes: NumericList) -> float:
        p_list = [float(x) for x in prices]
        v_list = [float(x) for x in volumes]
        if not p_list or sum(v_list) == 0:
            return float(p_list[-1]) if p_list else 0.0
        pv = sum(p * v for p, v in zip(p_list, v_list))
        total_v = sum(v_list)
        return float(pv / total_v)

    @staticmethod
    def calculate_realized_volatility(prices: NumericList, window: int = 20) -> float:
        p_list = [float(x) for x in prices]
        if len(p_list) < 3:
            return 0.005
        subset = p_list[-window:]
        returns = [math.log(subset[i] / subset[i - 1]) for i in range(1, len(subset))]
        if not returns:
            return 0.005
        mean_r = sum(returns) / len(returns)
        var = sum((r - mean_r) ** 2 for r in returns) / len(returns)
        return float(math.sqrt(var))

    @staticmethod
    def calculate_roc(prices: NumericList, period: int = 10) -> float:
        p_list = [float(x) for x in prices]
        if len(p_list) <= period:
            return 0.0
        past = p_list[-period - 1]
        curr = p_list[-1]
        if past == 0:
            return 0.0
        return float((curr - past) / past * 100.0)

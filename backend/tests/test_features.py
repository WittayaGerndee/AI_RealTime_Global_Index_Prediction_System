import pytest
import numpy as np
from feature_engine.indicators.technical import TechnicalIndicators
from feature_engine.indicators.support_resistance import SupportResistanceEngine
from feature_engine.indicators.regime import MarketRegimeDetector
from feature_engine.calculator import FeatureCalculator

def test_ema_calculation():
    prices = np.array([10.0, 11.0, 12.0, 13.0, 14.0, 15.0])
    ema = TechnicalIndicators.calculate_ema(prices, 3)
    assert ema > 10.0 and ema <= 15.0

def test_rsi_bounds():
    # Uptrend prices should result in RSI > 50
    up_prices = np.array([10.0 + i * 0.5 for i in range(25)])
    rsi_up = TechnicalIndicators.calculate_rsi(up_prices, 14)
    assert rsi_up > 50.0 and rsi_up <= 100.0

    # Downtrend prices should result in RSI < 50
    down_prices = np.array([50.0 - i * 0.5 for i in range(25)])
    rsi_down = TechnicalIndicators.calculate_rsi(down_prices, 14)
    assert rsi_down < 50.0 and rsi_down >= 0.0

def test_bollinger_bands():
    prices = np.array([100.0 + (i % 3) for i in range(30)])
    bb = TechnicalIndicators.calculate_bollinger_bands(prices, period=20, num_std=2.0)
    assert bb["lower"] <= bb["middle"] <= bb["upper"]
    assert bb["bandwidth"] > 0

def test_support_resistance_ordering():
    sr = SupportResistanceEngine.calculate_levels(
        current_price=40000.0,
        day_open=39800.0,
        day_high=40200.0,
        day_low=39700.0,
        prev_close=39900.0,
        rolling_prices=np.array([39800.0, 40000.0, 40100.0]),
        bb_upper=40300.0,
        bb_lower=39700.0
    )
    for s in sr["supports"]:
        assert s["price"] <= 40000.0
    for r in sr["resistances"]:
        assert r["price"] >= 40000.0

def test_regime_detection():
    regime = MarketRegimeDetector.detect_regime(
        current_price=41000.0,
        ema_20=40500.0,
        ema_50=40000.0,
        rsi_14=65.0,
        volatility=0.002,
        bb_bandwidth=0.02,
        atr=100.0
    )
    assert regime["primary"] == "TREND_UP"

import unittest
import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from feature_engine.indicators.technical import TechnicalIndicators
from feature_engine.indicators.support_resistance import SupportResistanceEngine
from feature_engine.indicators.regime import MarketRegimeDetector
from feature_engine.calculator import FeatureCalculator
from prediction_engine.ensemble.weighted_ensemble import WeightedEnsembleEngine
from prediction_engine.ensemble.stabilization_zone import StabilizationZoneEngine
from backtest.metrics.accuracy import AccuracyMetrics
from backtest.engine.walk_forward import WalkForwardBacktestEngine
from data_collector.normalizer import TickNormalizer

class TestTechnicalIndicators(unittest.TestCase):
    def test_ema_calculation(self):
        prices = [10.0, 11.0, 12.0, 13.0, 14.0, 15.0]
        ema = TechnicalIndicators.calculate_ema(prices, 3)
        self.assertTrue(10.0 < ema <= 15.0)

    def test_rsi_bounds(self):
        up_prices = [10.0 + i * 0.5 for i in range(25)]
        rsi_up = TechnicalIndicators.calculate_rsi(up_prices, 14)
        self.assertTrue(50.0 < rsi_up <= 100.0)

        down_prices = [50.0 - i * 0.5 for i in range(25)]
        rsi_down = TechnicalIndicators.calculate_rsi(down_prices, 14)
        self.assertTrue(0.0 <= rsi_down < 50.0)

    def test_bollinger_bands(self):
        prices = [100.0 + (i % 3) for i in range(30)]
        bb = TechnicalIndicators.calculate_bollinger_bands(prices, period=20, num_std=2.0)
        self.assertTrue(bb["lower"] <= bb["middle"] <= bb["upper"])
        self.assertTrue(bb["bandwidth"] > 0)

    def test_macd(self):
        prices = [100.0 + i * 0.2 for i in range(40)]
        macd = TechnicalIndicators.calculate_macd(prices)
        self.assertIn("macd", macd)
        self.assertIn("signal", macd)
        self.assertIn("histogram", macd)

class TestSupportResistance(unittest.TestCase):
    def test_levels_order(self):
        sr = SupportResistanceEngine.calculate_levels(
            current_price=40000.0,
            day_open=39800.0,
            day_high=40200.0,
            day_low=39700.0,
            prev_close=39900.0,
            rolling_prices=[39800.0, 40000.0, 40100.0],
            bb_upper=40300.0,
            bb_lower=39700.0
        )
        for s in sr["supports"]:
            self.assertTrue(s["price"] <= 40000.0)
        for r in sr["resistances"]:
            self.assertTrue(r["price"] >= 40000.0)

class TestPredictionEngine(unittest.TestCase):
    def test_intervals_and_direction(self):
        ensemble = WeightedEnsembleEngine()
        features = {
            "current_price": 40000.0,
            "ema_5": 40020.0,
            "ema_20": 39980.0,
            "vwap": 40010.0,
            "bb_middle": 40000.0,
            "rsi_14": 52.0,
            "realized_volatility": 0.004,
            "atr_14": 80.0,
            "regime": {"primary": "RANGE"},
            "returns": {"r_5": 0.05},
            "support_resistance": {"supports": [], "resistances": []}
        }
        res = ensemble.predict_horizon("DJI", features, horizon_minutes=5)
        intervals = res["intervals"]
        self.assertTrue(intervals["50"]["lower"] <= res["expected_price"] <= intervals["50"]["upper"])
        self.assertTrue(intervals["80"]["lower"] <= intervals["50"]["lower"])
        self.assertTrue(intervals["80"]["upper"] >= intervals["50"]["upper"])
        self.assertTrue(intervals["95"]["lower"] <= intervals["80"]["lower"])
        self.assertTrue(intervals["95"]["upper"] >= intervals["80"]["upper"])
        self.assertIn(res["direction"], ["UP", "DOWN", "SIDEWAYS"])
        self.assertTrue(0.0 <= res["direction_probability"] <= 1.0)
        self.assertTrue(0.3 <= res["confidence"] <= 1.0)

    def test_stabilization_zone(self):
        zone = StabilizationZoneEngine.calculate_stabilization_zone(
            current_price=40000.0,
            expected_price=40050.0,
            support_levels=[{"price": 40040.0, "strength": 0.8}],
            resistance_levels=[{"price": 40060.0, "strength": 0.8}],
            realized_vol=0.003,
            atr=50.0,
            regime="RANGE"
        )
        self.assertTrue(zone["stabilization_low"] <= zone["stabilization_high"])
        self.assertTrue(0.4 <= zone["stabilization_probability"] <= 1.0)

class TestAccuracyAndBacktest(unittest.TestCase):
    def test_accuracy_metrics(self):
        evals = [
            {
                "current_price": 100.0,
                "expected_price": 101.0,
                "lower_bound": 99.0,
                "upper_bound": 102.0,
                "stabilization_low": 100.5,
                "stabilization_high": 101.5,
                "direction": "UP",
                "actual_price": 101.05
            },
            {
                "current_price": 100.0,
                "expected_price": 99.0,
                "lower_bound": 98.0,
                "upper_bound": 100.0,
                "stabilization_low": 98.5,
                "stabilization_high": 99.5,
                "direction": "DOWN",
                "actual_price": 99.2
            }
        ]
        metrics = AccuracyMetrics.calculate_metrics(evals, tick_size=0.1)
        self.assertEqual(metrics["total_predictions"], 2)
        self.assertEqual(metrics["direction_accuracy"], 100.0)
        self.assertEqual(metrics["range_coverage"], 100.0)
        self.assertEqual(metrics["stabilization_hit_rate"], 100.0)
        self.assertTrue(metrics["mae"] > 0)

    def test_normalizer(self):
        norm = TickNormalizer()
        raw = {
            "symbol": "NIKKEI225",
            "price": 38500.0,
            "timestamp": "2026-09-09T06:00:00Z"
        }
        tick = norm.normalize(raw, "mock")
        self.assertIsNotNone(tick)
        self.assertEqual(tick.price, 38500.0)
        self.assertEqual(tick.instrument_code, "NIKKEI225")

if __name__ == "__main__":
    unittest.main()

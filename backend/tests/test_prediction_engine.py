import pytest
from prediction_engine.ensemble.weighted_ensemble import WeightedEnsembleEngine
from prediction_engine.ensemble.stabilization_zone import StabilizationZoneEngine
from backtest.metrics.accuracy import AccuracyMetrics

def test_prediction_intervals_validity():
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
    
    # Check bounds
    intervals = res["intervals"]
    assert intervals["50"]["lower"] <= res["expected_price"] <= intervals["50"]["upper"]
    assert intervals["80"]["lower"] <= intervals["50"]["lower"]
    assert intervals["80"]["upper"] >= intervals["50"]["upper"]
    assert intervals["95"]["lower"] <= intervals["80"]["lower"]
    assert intervals["95"]["upper"] >= intervals["80"]["upper"]

    # Check direction and probability
    assert res["direction"] in ["UP", "DOWN", "SIDEWAYS"]
    assert 0.0 <= res["direction_probability"] <= 1.0
    assert 0.3 <= res["confidence"] <= 1.0

def test_stabilization_zone_consistency():
    zone = StabilizationZoneEngine.calculate_stabilization_zone(
        current_price=40000.0,
        expected_price=40050.0,
        support_levels=[{"price": 40040.0, "strength": 0.8}],
        resistance_levels=[{"price": 40060.0, "strength": 0.8}],
        realized_vol=0.003,
        atr=50.0,
        regime="RANGE"
    )
    assert zone["stabilization_low"] <= zone["stabilization_high"]
    assert zone["stabilization_low"] <= 40050.0 <= zone["stabilization_high"]
    assert 0.4 <= zone["stabilization_probability"] <= 1.0

def test_accuracy_metrics_calculation():
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
    assert metrics["total_predictions"] == 2
    assert metrics["direction_accuracy"] == 100.0
    assert metrics["range_coverage"] == 100.0
    assert metrics["stabilization_hit_rate"] == 100.0
    assert metrics["mae"] > 0

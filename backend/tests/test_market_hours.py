import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.app.services import market_hours
from backend.app.services.market_hours import THAI_TZ
from prediction_engine.inference.service import PredictionService


def th(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=THAI_TZ)


def th_hhmm(dt):
    return dt.astimezone(THAI_TZ).strftime("%H:%M")


FEATURES = {
    "current_price": 38000.0,
    "ema_5": 38010.0,
    "ema_20": 37990.0,
    "vwap": 38000.0,
    "bb_middle": 38000.0,
    "rsi_14": 55.0,
    "realized_volatility": 0.002,
    "atr_14": 60.0,
    "regime": {"primary": "RANGE"},
    "returns": {"r_5": 0.02},
    "support_resistance": {"supports": [], "resistances": []},
}


class TestMarketHours(unittest.TestCase):
    def test_asian_sessions_in_thai_time(self):
        monday = th(2026, 9, 14, 10, 0)
        expected = {
            "NIKKEI225": [("07:00", "09:30"), ("10:30", "13:30")],
            "HSI": [("08:30", "11:00"), ("12:00", "15:00")],
            "SSE": [("08:30", "10:30"), ("12:00", "14:00")],
        }
        for sym, segs in expected.items():
            session = market_hours.get_session_state(sym, monday)["current"]
            self.assertEqual([(th_hhmm(o), th_hhmm(c)) for o, c in session.segments], segs, sym)

    def test_dow_follows_us_daylight_saving(self):
        summer = market_hours.get_session_state("DJI", th(2026, 9, 14, 21, 0))["current"]
        self.assertEqual((th_hhmm(summer.open), th_hhmm(summer.close), th_hhmm(summer.lock_at)), ("20:30", "03:00", "02:30"))
        winter = market_hours.get_session_state("DJI", th(2026, 12, 14, 22, 0))["current"]
        self.assertEqual((th_hhmm(winter.open), th_hhmm(winter.close)), ("21:30", "04:00"))

    def test_status_transitions(self):
        cases = [
            (th(2026, 9, 14, 7, 30), "OPEN"),
            (th(2026, 9, 14, 10, 0), "LUNCH"),
            (th(2026, 9, 14, 12, 59), "OPEN"),
            (th(2026, 9, 14, 13, 0), "LOCKED"),
            (th(2026, 9, 14, 13, 30), "CLOSED"),
            (th(2026, 9, 13, 10, 0), "CLOSED"),  # Sunday
        ]
        for now, status in cases:
            self.assertEqual(market_hours.get_session_state("NIKKEI225", now)["status"], status, now)

    def test_remaining_minutes_excludes_lunch(self):
        session = market_hours.get_session_state("HSI", th(2026, 9, 14, 10, 0))["current"]
        # 10:00-11:00 morning + 12:00-15:00 afternoon
        self.assertEqual(session.remaining_trading_minutes(th(2026, 9, 14, 10, 0)), 240.0)


class TestCloseForecastLock(unittest.TestCase):
    def test_close_forecast_freezes_from_lock_time(self):
        svc = PredictionService()
        sym = "NIKKEI225"

        before = svc._close_forecast(sym, market_hours.get_session_state(sym, th(2026, 9, 14, 12, 50)),
                                     {"expected_price": 38100.0, "lower_bound": 38000.0, "upper_bound": 38200.0}, 38050.0, th(2026, 9, 14, 12, 50))
        self.assertFalse(before["locked"])

        at_lock = svc._close_forecast(sym, market_hours.get_session_state(sym, th(2026, 9, 14, 13, 1)),
                                      {"expected_price": 38120.0, "lower_bound": 38020.0, "upper_bound": 38220.0}, 38060.0, th(2026, 9, 14, 13, 1))
        later = svc._close_forecast(sym, market_hours.get_session_state(sym, th(2026, 9, 14, 13, 20)),
                                    {"expected_price": 37900.0, "lower_bound": 37800.0, "upper_bound": 38000.0}, 37950.0, th(2026, 9, 14, 13, 20))
        self.assertTrue(at_lock["locked"])
        self.assertEqual(later["value"], 38120.0)

        svc.record_close(sym, 38100.0)
        self.assertEqual(svc.locked_close[sym]["actual_close"], 38100.0)
        self.assertEqual(svc.locked_close[sym]["error"], -20.0)

        # A new session starts a fresh, unlocked forecast
        next_day = svc._close_forecast(sym, market_hours.get_session_state(sym, th(2026, 9, 15, 8, 0)),
                                       {"expected_price": 38300.0, "lower_bound": 38200.0, "upper_bound": 38400.0}, 38250.0, th(2026, 9, 15, 8, 0))
        self.assertFalse(next_day["locked"])
        self.assertEqual(next_day["value"], 38300.0)

    def test_generate_all_horizons_includes_close_forecast(self):
        payload = PredictionService().generate_all_horizons("HSI", dict(FEATURES))
        self.assertIn("close_forecast", payload)
        self.assertEqual(payload["expected_close"], payload["close_forecast"]["value"])


if __name__ == "__main__":
    unittest.main()

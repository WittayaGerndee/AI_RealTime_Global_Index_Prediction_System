import asyncio
import json
import os
import sys
from backtest.engine.walk_forward import WalkForwardBacktestEngine
from data_collector.providers.mock_replay import MockReplayProvider

async def run_cli_backtest():
    provider = MockReplayProvider()
    await provider.connect()
    
    symbols = ["NIKKEI225", "DJI", "HSI", "SSE"]
    results = {}
    
    print("Executing walk-forward backtesting across all markets...")
    for sym in symbols:
        candles = await provider.get_historical(sym, timeframe="5m", limit=120)
        engine = WalkForwardBacktestEngine(horizon_bars=5, tick_size=1.0)
        res = engine.run(sym, candles, window_size=30)
        results[sym] = res
        print(f"[{sym}] MAE: {res['mae']}, Direction Acc: {res['direction_accuracy']}%, Coverage: {res['range_coverage']}%")

    os.makedirs("reports", exist_ok=True)
    report_path = "reports/daily_backtest.json"
    with open(report_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Backtest report successfully saved to {report_path}")

if __name__ == "__main__":
    asyncio.run(run_cli_backtest())

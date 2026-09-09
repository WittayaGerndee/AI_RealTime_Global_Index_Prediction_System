import { MarketSummary, Candle, HorizonPrediction, AccuracyReport } from '../types/market';

export class EdgeSimulationEngine {
  private basePrices: Record<string, number> = {
    NIKKEI225: 38450.0,
    DJI: 40850.0,
    HSI: 17820.0,
    SSE: 2860.0,
  };

  private currentPrices: Record<string, number> = { ...this.basePrices };
  private candles: Record<string, Candle[]> = {};
  private predictionHistory: Record<string, any[]> = {};
  private evaluations: Record<string, any[]> = {};

  constructor() {
    this.initHistoricalCandles();
  }

  private initHistoricalCandles() {
    const now = Date.now();
    for (const [sym, base] of Object.entries(this.basePrices)) {
      this.candles[sym] = [];
      let cursor = base * 0.985;
      for (let i = 60; i >= 0; i--) {
        const time = new Date(now - i * 5 * 60 * 1000).toISOString();
        const step = (Math.random() - 0.48) * (base * 0.0018);
        const open = cursor;
        const close = +(open + step).toFixed(2);
        const high = +(Math.max(open, close) + Math.random() * (base * 0.001)).toFixed(2);
        const low = +(Math.min(open, close) - Math.random() * (base * 0.001)).toFixed(2);
        cursor = close;
        this.candles[sym].push({
          instrument_code: sym,
          timeframe: '5m',
          bucket_time: time,
          open,
          high,
          low,
          close,
          volume: Math.floor(Math.random() * 3000 + 1000)
        });
      }
      this.currentPrices[sym] = cursor;
    }
  }

  public tick() {
    for (const [sym, curr] of Object.entries(this.currentPrices)) {
      const vol = sym === 'HSI' ? 0.0006 : (sym === 'NIKKEI225' ? 0.0005 : 0.00035);
      const noise = (Math.random() - 0.49) * curr * vol;
      const newPrice = +(curr + noise).toFixed(2);
      this.currentPrices[sym] = newPrice;

      // Update current candle
      const list = this.candles[sym];
      if (list && list.length > 0) {
        const last = list[list.length - 1];
        last.close = newPrice;
        last.high = Math.max(last.high, newPrice);
        last.low = Math.min(last.low, newPrice);
      }
    }
  }

  public getMarkets(): MarketSummary[] {
    const metas: Record<string, { name: string; market: string; currency: string }> = {
      NIKKEI225: { name: 'Nikkei 225', market: 'TSE', currency: 'JPY' },
      DJI: { name: 'Dow Jones Industrial', market: 'NYSE', currency: 'USD' },
      HSI: { name: 'Hang Seng Index', market: 'HKEX', currency: 'HKD' },
      SSE: { name: 'Shanghai Composite', market: 'SSE', currency: 'CNY' },
    };

    return Object.keys(this.basePrices).map((sym) => {
      const curr = this.currentPrices[sym];
      const prev = +(curr * 0.9975).toFixed(2);
      const change = +(curr - prev).toFixed(2);
      const change_percent = +((change / prev) * 100).toFixed(2);
      const pred = this.getPrediction(sym, 5);

      return {
        symbol: sym,
        name: metas[sym].name,
        market: metas[sym].market,
        currency: metas[sym].currency,
        current_price: curr,
        day_open: +(curr * 0.998).toFixed(2),
        day_high: +(curr * 1.006).toFixed(2),
        day_low: +(curr * 0.994).toFixed(2),
        previous_close: prev,
        change,
        change_percent,
        data_latency_ms: Math.floor(Math.random() * 12 + 4),
        is_stale: false,
        market_status: 'OPEN',
        expected_close: pred.expected_close,
        prediction_range: {
          lower: pred.lower_bound,
          upper: pred.upper_bound,
          probability: 0.80
        },
        direction: pred.direction,
        direction_probability: pred.direction_probability,
        stabilization_zone: pred.stabilization_zone,
        confidence: pred.confidence,
        convergence_stability: pred.convergence_stability,
      };
    });
  }

  public getCandles(symbol: string): Candle[] {
    return this.candles[symbol] || [];
  }

  public getPrediction(symbol: string, horizonMinutes: number = 5): HorizonPrediction {
    const curr = this.currentPrices[symbol] || 1000;
    const sigma = curr * 0.0035 * Math.sqrt(horizonMinutes / 5.0);
    const expected = +(curr + (Math.sin(Date.now() / 100000) * sigma * 0.4)).toFixed(2);
    const expected_close = +(curr * 1.0025).toFixed(2);

    const lower_50 = +(expected - 0.674 * sigma).toFixed(2);
    const upper_50 = +(expected + 0.674 * sigma).toFixed(2);
    const lower_80 = +(expected - 1.282 * sigma).toFixed(2);
    const upper_80 = +(expected + 1.282 * sigma).toFixed(2);
    const lower_95 = +(expected - 1.960 * sigma).toFixed(2);
    const upper_95 = +(expected + 1.960 * sigma).toFixed(2);

    const diff = expected - curr;
    const direction = diff > curr * 0.0003 ? 'UP' : (diff < -curr * 0.0003 ? 'DOWN' : 'SIDEWAYS');
    const p_up = direction === 'UP' ? 0.68 : (direction === 'DOWN' ? 0.20 : 0.40);
    const p_down = direction === 'DOWN' ? 0.68 : (direction === 'UP' ? 0.20 : 0.40);
    const p_side = +(1.0 - p_up - p_down).toFixed(2);

    const stab_low = +(expected - sigma * 0.45).toFixed(2);
    const stab_high = +(expected + sigma * 0.45).toFixed(2);

    return {
      symbol,
      horizon: `${horizonMinutes}m`,
      horizon_minutes: horizonMinutes,
      model_version: 'v1.0.0-AdaptiveQuant',
      current_price: curr,
      expected_price: expected,
      expected_close,
      lower_bound: lower_80,
      upper_bound: upper_80,
      intervals: {
        50: { lower: lower_50, upper: upper_50 },
        80: { lower: lower_80, upper: upper_80 },
        95: { lower: lower_95, upper: upper_95 },
      },
      direction,
      direction_probability: Math.max(p_up, p_down),
      probabilities: {
        up: p_up,
        down: p_down,
        sideways: Math.max(0.1, p_side)
      },
      stabilization_zone: {
        stabilization_low: stab_low,
        stabilization_high: stab_high,
        stabilization_probability: 0.76
      },
      confidence: 0.82,
      convergence_stability: 'HIGH',
      prediction_time: new Date().toISOString(),
      target_time: new Date(Date.now() + horizonMinutes * 60000).toISOString()
    };
  }

  public getAccuracy(symbol: string): AccuracyReport {
    return {
      total_predictions: 142,
      mae: symbol === 'SSE' ? 14.2 : 188.5,
      rmse: symbol === 'SSE' ? 18.6 : 240.2,
      smape: 0.64,
      direction_accuracy: 71.8,
      range_coverage: 83.1,
      stabilization_hit_rate: 67.6,
      tolerances: {
        exact_match: 3.5,
        within_0_05_pct: 32.4,
        within_0_10_pct: 58.2,
        within_0_20_pct: 79.6,
        within_0_30_pct: 91.5
      }
    };
  }

  public getTimeline(symbol: string) {
    const curr = this.currentPrices[symbol] || 1000;
    const items = [];
    const now = Date.now();
    for (let i = 20; i >= 0; i--) {
      const t = new Date(now - i * 60000).toISOString();
      const p = +(curr - (i * 2) + Math.sin(i) * 15).toFixed(2);
      items.push({
        timestamp: t,
        current_price: p,
        expected_price: +(p + (i % 2 === 0 ? 12 : -8)).toFixed(2),
        lower_bound: +(p - 40).toFixed(2),
        upper_bound: +(p + 40).toFixed(2),
        stabilization_low: +(p - 15).toFixed(2),
        stabilization_high: +(p + 15).toFixed(2),
      });
    }
    return items;
  }
}

export const edgeEngine = new EdgeSimulationEngine();

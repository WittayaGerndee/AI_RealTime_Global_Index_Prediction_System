export interface MarketSummary {
  symbol: string;
  name: string;
  market: string;
  currency: string;
  current_price: number;
  day_open: number;
  day_high: number;
  day_low: number;
  previous_close: number;
  change: number;
  change_percent: number;
  data_latency_ms: number;
  is_stale: boolean;
  market_status: string;
  expected_close: number;
  prediction_range: {
    lower: number;
    upper: number;
    probability: number;
  };
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  direction_probability: number;
  stabilization_zone: {
    stabilization_low: number;
    stabilization_high: number;
    stabilization_probability: number;
  };
  confidence: number;
  convergence_stability: 'HIGH' | 'LOW';
}

export interface Candle {
  instrument_code: string;
  timeframe: string;
  bucket_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tick_count?: number;
}

export interface HorizonPrediction {
  symbol: string;
  horizon: string;
  horizon_minutes: number;
  model_version: string;
  current_price: number;
  expected_price: number;
  expected_close: number;
  lower_bound: number;
  upper_bound: number;
  intervals: {
    50: { lower: number; upper: number };
    80: { lower: number; upper: number };
    95: { lower: number; upper: number };
  };
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  direction_probability: number;
  probabilities: {
    up: number;
    down: number;
    sideways: number;
  };
  stabilization_zone: {
    stabilization_low: number;
    stabilization_high: number;
    stabilization_probability: number;
  };
  confidence: number;
  convergence_stability: 'HIGH' | 'LOW';
  prediction_time: string;
  target_time: string;
}

export interface AccuracyReport {
  total_predictions: number;
  mae: number;
  rmse: number;
  smape: number;
  direction_accuracy: number;
  range_coverage: number;
  stabilization_hit_rate: number;
  tolerances: {
    exact_match: number;
    within_0_05_pct: number;
    within_0_10_pct: number;
    within_0_20_pct: number;
    within_0_30_pct: number;
  };
}

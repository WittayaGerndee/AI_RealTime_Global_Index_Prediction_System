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
  /** Time of the latest price from the data source (ISO). */
  last_update?: string;
  expected_close: number;
  close_forecast?: CloseForecast;
  /** One closing forecast per trading segment (morning / afternoon, or full day). */
  segment_forecasts?: SegmentForecast[];
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

/** Closing-price forecast; frozen from its lock time until the close. */
export interface CloseForecast {
  session_date: string;
  value: number;
  lower: number;
  upper: number;
  locked: boolean;
  locked_at: string | null;
  price_at_lock: number | null;
  actual_close: number | null;
  error: number | null;
  error_pct: number | null;
}

export interface SegmentForecast extends CloseForecast {
  segment_index: number;
  /** "ช่วงเช้า" / "ช่วงบ่าย" / "ทั้งวัน" */
  label: string;
  lock_at: string;
  close_at: string;
  /** LIVE: still updating • LOCKED: frozen, awaiting close • CLOSED: actual close known */
  status: 'LIVE' | 'LOCKED' | 'CLOSED';
  model: 'random_walk' | 'ridge';
  training_sessions: number;
}

export interface SegmentAccuracy {
  label: string;
  lock_time_th: string;
  total: number;
  model: 'random_walk' | 'ridge';
  mae: number;
  mae_pct: number;
  /** MAE of simply using the price at lock time */
  baseline_mae: number;
  direction_accuracy: number;
  range_coverage: number;
  within_0_10_pct: number;
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
  segments?: SegmentAccuracy[];
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

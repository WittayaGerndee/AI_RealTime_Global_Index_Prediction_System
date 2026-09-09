-- AI Real-Time Global Index Prediction System
-- TimescaleDB & PostgreSQL Schema Initialization

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 1. instruments
CREATE TABLE IF NOT EXISTS instruments (
    id SERIAL PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    provider VARCHAR(64) NOT NULL DEFAULT 'twelve_data',
    provider_symbol VARCHAR(64) NOT NULL,
    market VARCHAR(64) NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
    tick_size NUMERIC(12, 4) NOT NULL DEFAULT 0.01,
    price_decimals INT NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. market_ticks
CREATE TABLE IF NOT EXISTS market_ticks (
    id BIGSERIAL,
    instrument_id INT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    provider_timestamp TIMESTAMPTZ NOT NULL,
    received_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    price NUMERIC(16, 4) NOT NULL,
    bid NUMERIC(16, 4),
    ask NUMERIC(16, 4),
    volume NUMERIC(18, 4) DEFAULT 0,
    day_open NUMERIC(16, 4),
    day_high NUMERIC(16, 4),
    day_low NUMERIC(16, 4),
    previous_close NUMERIC(16, 4),
    source VARCHAR(64) DEFAULT 'websocket',
    sequence BIGINT DEFAULT 0,
    latency_ms INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, provider_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_ticks_inst_time ON market_ticks (instrument_id, provider_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ticks_recv_time ON market_ticks (received_timestamp DESC);

-- Enable Timescale hypertable for ticks if Timescale is installed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('market_ticks', 'provider_timestamp', if_not_exists => TRUE);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 3. candles
CREATE TABLE IF NOT EXISTS candles (
    id BIGSERIAL,
    instrument_id INT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    timeframe VARCHAR(16) NOT NULL, -- 1s, 5s, 15s, 1m, 5m, 15m, 30m, 1h, 1d
    bucket_time TIMESTAMPTZ NOT NULL,
    open NUMERIC(16, 4) NOT NULL,
    high NUMERIC(16, 4) NOT NULL,
    low NUMERIC(16, 4) NOT NULL,
    close NUMERIC(16, 4) NOT NULL,
    volume NUMERIC(18, 4) DEFAULT 0,
    tick_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, bucket_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_inst_tf_bucket ON candles (instrument_id, timeframe, bucket_time);
CREATE INDEX IF NOT EXISTS idx_candles_bucket_time ON candles (bucket_time DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('candles', 'bucket_time', if_not_exists => TRUE);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 4. technical_features
CREATE TABLE IF NOT EXISTS technical_features (
    id BIGSERIAL,
    instrument_id INT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    bucket_time TIMESTAMPTZ NOT NULL,
    timeframe VARCHAR(16) NOT NULL,
    ema_5 NUMERIC(16, 4),
    ema_9 NUMERIC(16, 4),
    ema_20 NUMERIC(16, 4),
    ema_50 NUMERIC(16, 4),
    ema_200 NUMERIC(16, 4),
    rsi_14 NUMERIC(8, 4),
    macd NUMERIC(16, 4),
    macd_signal NUMERIC(16, 4),
    macd_histogram NUMERIC(16, 4),
    bb_upper NUMERIC(16, 4),
    bb_middle NUMERIC(16, 4),
    bb_lower NUMERIC(16, 4),
    atr_14 NUMERIC(16, 4),
    roc NUMERIC(12, 6),
    stochastic NUMERIC(8, 4),
    volatility NUMERIC(12, 6),
    momentum NUMERIC(16, 4),
    vwap NUMERIC(16, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, bucket_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tech_features_inst_tf_time ON technical_features (instrument_id, timeframe, bucket_time);

-- 5. market_context (Cross-market correlation & relative strength)
CREATE TABLE IF NOT EXISTS market_context (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    instrument_id INT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    related_instrument_id INT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    correlation_window VARCHAR(16) NOT NULL DEFAULT '1d',
    correlation NUMERIC(8, 4),
    lead_lag NUMERIC(8, 4),
    relative_strength NUMERIC(8, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. model_versions
CREATE TABLE IF NOT EXISTS model_versions (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(64) NOT NULL,
    version VARCHAR(32) NOT NULL UNIQUE,
    training_start TIMESTAMPTZ,
    training_end TIMESTAMPTZ,
    dataset_hash VARCHAR(128),
    features JSONB,
    algorithm VARCHAR(64) NOT NULL,
    hyperparameters JSONB,
    validation_mae NUMERIC(12, 4),
    validation_rmse NUMERIC(12, 4),
    direction_accuracy NUMERIC(8, 4),
    range_coverage NUMERIC(8, 4),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- TRAINING, VALIDATED, ACTIVE, RETIRED, FAILED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. predictions
CREATE TABLE IF NOT EXISTS predictions (
    id BIGSERIAL PRIMARY KEY,
    instrument_id INT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    prediction_time TIMESTAMPTZ NOT NULL,
    target_time TIMESTAMPTZ NOT NULL,
    horizon VARCHAR(32) NOT NULL, -- 1m, 5m, 15m, 30m, 60m, session_close
    model_version VARCHAR(32) NOT NULL,
    current_price NUMERIC(16, 4) NOT NULL,
    expected_price NUMERIC(16, 4) NOT NULL,
    expected_close NUMERIC(16, 4) NOT NULL,
    lower_bound NUMERIC(16, 4) NOT NULL,
    upper_bound NUMERIC(16, 4) NOT NULL,
    direction VARCHAR(16) NOT NULL, -- UP, DOWN, SIDEWAYS
    direction_probability NUMERIC(6, 4) NOT NULL,
    range_probability NUMERIC(6, 4) NOT NULL DEFAULT 0.80,
    stabilization_low NUMERIC(16, 4) NOT NULL,
    stabilization_high NUMERIC(16, 4) NOT NULL,
    stabilization_probability NUMERIC(6, 4) NOT NULL,
    confidence NUMERIC(6, 4) NOT NULL,
    feature_snapshot_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pred_inst_time ON predictions (instrument_id, prediction_time DESC);
CREATE INDEX IF NOT EXISTS idx_pred_target_time ON predictions (target_time);

-- 8. prediction_results
CREATE TABLE IF NOT EXISTS prediction_results (
    id BIGSERIAL PRIMARY KEY,
    prediction_id BIGINT NOT NULL UNIQUE REFERENCES predictions(id) ON DELETE CASCADE,
    actual_price NUMERIC(16, 4) NOT NULL,
    actual_close NUMERIC(16, 4),
    absolute_error NUMERIC(16, 4) NOT NULL,
    percentage_error NUMERIC(8, 4) NOT NULL,
    direction_correct BOOLEAN NOT NULL,
    inside_range BOOLEAN NOT NULL,
    inside_stabilization_zone BOOLEAN NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pred_results_eval_time ON prediction_results (evaluated_at DESC);

-- 9. market_sessions
CREATE TABLE IF NOT EXISTS market_sessions (
    id SERIAL PRIMARY KEY,
    instrument_id INT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    open_time TIMESTAMPTZ NOT NULL,
    close_time TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'CLOSED', -- OPEN, CLOSED, PRE_MARKET, POST_MARKET, HOLIDAY
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (instrument_id, session_date)
);

-- Seed Default Instruments (Nikkei 225, Dow Jones, Hang Seng, SSE Composite)
INSERT INTO instruments (code, name, provider, provider_symbol, market, timezone, currency, tick_size, price_decimals, is_active)
VALUES
    ('NIKKEI225', 'Nikkei 225 Index', 'twelve_data', 'NI225', 'TSE', 'Asia/Tokyo', 'JPY', 5.0, 2, TRUE),
    ('DJI', 'Dow Jones Industrial Average', 'twelve_data', 'DJI', 'NYSE', 'America/New_York', 'USD', 1.0, 2, TRUE),
    ('HSI', 'Hang Seng Index', 'twelve_data', 'HSI', 'HKEX', 'Asia/Hong_Kong', 'HKD', 1.0, 2, TRUE),
    ('SSE', 'Shanghai Composite Index', 'twelve_data', '000001.SS', 'SSE', 'Asia/Shanghai', 'CNY', 0.01, 2, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Seed Default Active Model
INSERT INTO model_versions (model_name, version, algorithm, status, validation_mae, direction_accuracy, range_coverage, features)
VALUES (
    'Ensemble-AdaptiveQuant-v1.0',
    'v1.0.0',
    'Bayesian_Weighted_Ensemble',
    'ACTIVE',
    18.42,
    0.692,
    0.841,
    '{"indicators": ["ema", "rsi", "macd", "bb", "atr", "vwap"], "features": ["momentum", "volatility", "cross_market"]}'::jsonb
) ON CONFLICT (version) DO NOTHING;

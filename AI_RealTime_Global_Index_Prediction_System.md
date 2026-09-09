# AI Real-Time Global Index Prediction System
## Product Requirements + Technical Specification + AI Development Prompt
Version: 1.0
Date: 2026-09-09

---

## 0. คำสั่งสำหรับ AI Developer

คุณคือ Senior Full-Stack Engineer, Quant/ML Engineer และ System Architect

จงพัฒนาระบบ **AI Real-Time Global Index Prediction System** ตามเอกสารนี้ โดยเน้น:
1. Real-time market data
2. การคำนวณ Technical/Statistical/ML features แบบต่อเนื่อง
3. การคาดการณ์ราคาปิดและช่วงราคาที่มีโอกาสเกิดขึ้น
4. การหา Price Stabilization Zone หรือบริเวณที่ราคามีโอกาสชะลอ/หยุด
5. การวัดความแม่นยำจากผลจริง
6. Backtesting และ Walk-forward validation
7. ระบบต้องไม่สร้างตัวเลขตลาดปลอม และต้องแสดงสถานะ data freshness
8. ห้ามอ้างว่า AI ทำนายราคาปิดได้แน่นอน
9. Prediction ทุกตัวต้องเก็บ timestamp, model version และข้อมูลที่ใช้คำนวณ
10. ทุก metric ที่แสดงบน Dashboard ต้องตรวจสอบย้อนกลับได้

ห้ามข้ามขั้นตอน validation เพื่อให้ตัวเลข accuracy ดูดี

---

# 1. เป้าหมายระบบ

สร้าง Web Application สำหรับวิเคราะห์ดัชนีตลาดแบบ Real-time และคาดการณ์ระยะสั้น/ราคาปิด ได้แก่:

- Nikkei 225
- Dow Jones Industrial Average
- Hang Seng Index
- China/SSE Composite หรือดัชนีจีนที่ Data Provider รองรับ

ระบบต้องสามารถเพิ่มตลาดอื่นภายหลังได้โดยไม่ต้องแก้ architecture หลัก

เป้าหมายของ Prediction ไม่ใช่การทาย "เลขเดียวแบบรับประกัน" แต่ให้ผลลัพธ์เป็น:

- Current Price
- Expected Price
- Expected Close
- Prediction Range
- Direction Probability
- Stabilization Zone
- Support / Resistance
- Confidence
- Forecast Horizon
- Model Version
- Prediction Error เมื่อมีราคาจริง

---

# 2. หลักการสำคัญ

## 2.1 ห้ามใช้คำว่า "แม่น 100%"
ระบบต้องแสดงความไม่แน่นอน

ตัวอย่าง:

Expected Close: 42,350
Prediction Range: 42,280 - 42,410
Direction: UP
Direction Probability: 68%
Stabilization Zone: 42,330 - 42,370

## 2.2 Accuracy ต้องมาจากผลย้อนหลังจริง

ห้ามกำหนด accuracy แบบ hard-code

ระบบต้องคำนวณจาก:

Prediction vs Actual

และแยก:
- Direction Accuracy
- Range Coverage
- MAE
- RMSE
- MAPE/SMAPE
- Calibration
- Stabilization Zone Hit Rate

## 2.3 ป้องกัน Data Leakage

ห้ามใช้ข้อมูลในอนาคตเพื่อสร้าง feature หรือ train model

ต้องใช้ time-series split / walk-forward validation

ห้ามสุ่ม train/test แบบ random split สำหรับข้อมูลตามเวลา

---

# 3. ตลาดและ Symbol Configuration

สร้างตาราง instruments เพื่อรองรับ:

- NIKKEI225
- DJI
- HSI
- SSE/Shanghai Composite

แต่ Symbol จริงต้องกำหนดจาก Data Provider ผ่าน configuration

ตัวอย่าง:

instrument:
  code: NIKKEI225
  provider_symbol: <PROVIDER_SYMBOL>
  timezone: Asia/Tokyo
  market_timezone: Asia/Tokyo
  tick_size: <FROM_PROVIDER>
  enabled: true

ห้าม hard-code symbol หาก Data Provider ใช้ชื่อแตกต่างกัน

---

# 4. Data Provider Layer

สร้าง abstraction:

MarketDataProvider

interface ที่ต้องรองรับ:

- connect()
- disconnect()
- subscribe(symbols)
- unsubscribe(symbols)
- get_quote()
- get_historical()
- get_intraday()
- health_check()

ระบบต้องสามารถเปลี่ยน Provider ได้โดยไม่ต้องแก้ Prediction Engine

Provider เริ่มต้นสามารถรองรับ WebSocket API ที่มีข้อมูลดัชนีแบบ real-time เช่น Twelve Data หรือ iTick ตามสิทธิ์และ coverage ของบัญชีที่ใช้งานจริง

ข้อสำคัญ:
- ตรวจสอบ market coverage ก่อน production
- ตรวจสอบว่า data เป็น real-time หรือ delayed
- เก็บ provider_timestamp
- เก็บ received_timestamp
- คำนวณ data_latency_ms
- แสดง Data Status บน Dashboard

---

# 5. Real-Time Data Pipeline

Architecture:

Market Data Provider
        |
        v
WebSocket Collector
        |
        v
Normalizer
        |
        +----> Redis Latest State
        |
        +----> TimescaleDB Raw Data
        |
        v
Feature Engine
        |
        v
Prediction Engine
        |
        +----> Prediction DB
        |
        v
FastAPI
        |
        v
WebSocket/SSE
        |
        v
Vue Dashboard

ระบบต้อง reconnect WebSocket อัตโนมัติเมื่อ connection หลุด

ต้องมี:
- heartbeat
- retry/backoff
- duplicate detection
- out-of-order event handling
- provider timestamp validation
- market session validation

---

# 6. Database

แนะนำ:

PostgreSQL + TimescaleDB

เหตุผล:
- market data เป็น time-series
- ต้อง ingest ข้อมูลจำนวนมาก
- ต้อง query OHLC และ rolling windows
- ต้องเก็บ historical data ระยะยาว

ใช้ PostgreSQL สำหรับ relational/configuration data
ใช้ TimescaleDB hypertables สำหรับ market time-series

---

# 7. Database Schema

## instruments

id
code
name
provider
provider_symbol
market
timezone
currency
tick_size
price_decimals
is_active
created_at
updated_at

## market_ticks

id
instrument_id
provider_timestamp
received_timestamp
price
bid
ask
volume
day_open
day_high
day_low
previous_close
source
sequence
created_at

Indexes:
(instrument_id, provider_timestamp)
(received_timestamp)

## candles

id
instrument_id
timeframe
bucket_time
open
high
low
close
volume
tick_count
created_at

timeframes:
1s
5s
15s
1m
5m
15m
30m
1h
1d

## technical_features

id
instrument_id
bucket_time
timeframe
ema_5
ema_9
ema_20
ema_50
ema_200
rsi_14
macd
macd_signal
macd_histogram
bb_upper
bb_middle
bb_lower
atr_14
roc
stochastic
volatility
momentum
vwap
created_at

## market_context

id
timestamp
instrument_id
related_instrument_id
correlation_window
correlation
lead_lag
relative_strength
created_at

## predictions

id
instrument_id
prediction_time
target_time
horizon
model_version
current_price
expected_price
expected_close
lower_bound
upper_bound
direction
direction_probability
range_probability
stabilization_low
stabilization_high
stabilization_probability
confidence
feature_snapshot_hash
created_at

## prediction_results

id
prediction_id
actual_price
actual_close
absolute_error
percentage_error
direction_correct
inside_range
inside_stabilization_zone
evaluated_at

## model_versions

id
model_name
version
training_start
training_end
dataset_hash
features
algorithm
hyperparameters
validation_mae
validation_rmse
direction_accuracy
range_coverage
status
created_at

## market_sessions

id
instrument_id
session_date
open_time
close_time
timezone
status

---

# 8. Real-Time Calculations

เมื่อมี tick ใหม่:

1. update latest price
2. update OHLC
3. update rolling windows
4. calculate indicators
5. calculate support/resistance
6. calculate volatility
7. calculate market relationships
8. run prediction
9. calculate stabilization zone
10. publish result
11. save prediction snapshot

ไม่จำเป็นต้อง train model ทุก tick

Prediction inference สามารถทำทุก:
- 1 second
- 5 seconds
- 10 seconds
- 30 seconds

ให้ configurable

---

# 9. Technical Indicators

ต้อง implement อย่างน้อย:

Trend:
- EMA 5
- EMA 9
- EMA 20
- EMA 50
- EMA 200

Momentum:
- RSI 14
- MACD
- Stochastic
- ROC

Volatility:
- ATR 14
- Bollinger Bands
- realized volatility

Price:
- VWAP
- day open
- day high
- day low
- previous close
- gap
- distance from high/low/open

---

# 10. Support / Resistance Engine

สร้างหลายวิธี แล้วรวมผล:

1. Previous day high/low
2. Previous close
3. Day high/low
4. Pivot Points
5. Rolling highs/lows
6. Bollinger boundaries
7. Volume/price concentration หากข้อมูล volume มีคุณภาพ
8. Model-derived levels

Output:

support_levels[]
resistance_levels[]

แต่ละระดับต้องมี:
- price
- method
- strength
- distance_from_current
- confidence

---

# 11. Price Stabilization Zone

นิยาม:

บริเวณราคาที่โมเดลประเมินว่ามีโอกาสสูงกว่าพื้นที่อื่นในการชะลอหรือสิ้นสุดการเคลื่อนไหวระยะสั้น

ห้ามใช้คำว่า "จุดปิดแน่นอน"

คำนวณจาก:
- predicted distribution
- support/resistance
- volatility
- momentum decay
- price clustering
- historical reaction zones
- model ensemble

Output:

stabilization_low
stabilization_high
stabilization_probability

ตัวอย่าง:

Stabilization Zone:
42,330 - 42,370
Probability:
68%

---

# 12. Prediction Horizons

ต้องรองรับ:

- 1 minute
- 5 minutes
- 15 minutes
- 30 minutes
- 60 minutes
- End of Session / Expected Close

แต่ละ horizon ต้องเป็น prediction แยกกัน

ตัวอย่าง:

1m:
42,318

5m:
42,325

15m:
42,340

30m:
42,350

Close:
42,365

---

# 13. Prediction Model Architecture

เริ่มด้วย baseline ก่อน

## Baseline 1
Naive:
future_price = current_price

## Baseline 2
Previous close / current momentum

## Baseline 3
Moving average / exponential smoothing

จากนั้นจึงเพิ่ม ML

## Model A
LightGBM หรือ XGBoost

Features:
- technical indicators
- returns
- volatility
- time-of-day
- distance from open/high/low
- market context
- lag features

## Model B
LSTM/GRU

ใช้ sequence ของ features

## Model C
Statistical model
เช่น ARIMA/ETS หรือ model ที่เหมาะสมกับข้อมูลจริง

## Ensemble

Final prediction:

Weighted Ensemble

weights ต้องเรียนรู้/validate จาก historical validation set

ห้ามกำหนดน้ำหนักเพื่อให้ผลย้อนหลังดูดีโดยไม่มี validation

---

# 14. Cross-Market Features

ระบบต้องสามารถนำตลาดอื่นเข้ามาเป็น feature

ตัวอย่าง:

Nikkei:
- Dow
- Nasdaq
- S&P 500
- USD/JPY
- Hang Seng
- Shanghai

Dow:
- S&P 500
- Nasdaq
- VIX
- Nikkei
- Hang Seng

Hang Seng:
- Shanghai
- Nikkei
- US futures/index context
- USD/HKD หาก data มี

China:
- Hang Seng
- Nikkei
- global risk context

ต้องระวัง timezone และ lead-lag

ห้ามใช้ข้อมูลของตลาดที่ ณ target timestamp ยังไม่เกิดขึ้น

---

# 15. Feature Engineering

สร้าง:

returns:
r_1
r_3
r_5
r_10
r_30

momentum:
momentum_5
momentum_15
momentum_30

volatility:
vol_5
vol_15
vol_30
vol_60

price_position:
position_in_day_range
distance_to_high
distance_to_low
distance_to_open

trend:
ema_cross
ema_slope

time:
minute_of_session
minutes_to_close
session_progress

cross-market:
correlation
relative_return
lead_lag_return

---

# 16. Expected Close Model

Expected Close ต้องเป็น probabilistic forecast

ไม่ใช่เลขเดียว

Output:

expected_close
lower_50
upper_50
lower_80
upper_80
lower_95
upper_95

ตัวอย่าง:

Expected Close = 42,350

50% interval:
42,320 - 42,380

80% interval:
42,270 - 42,430

95% interval:
42,190 - 42,500

Dashboard อาจเลือกแสดง 80% interval เป็นหลัก

---

# 17. Direction Model

Target:

UP
DOWN
SIDEWAYS

หรือ binary:
UP/DOWN

ต้อง output:

probability_up
probability_down
probability_sideways

ตัวอย่าง:

UP: 71%
DOWN: 18%
SIDEWAYS: 11%

Final direction:
UP

---

# 18. Confidence Score

Confidence ห้ามเป็นตัวเลขที่สร้างขึ้นเพื่อความสวยงาม

ต้อง derive จาก:
- model probability
- ensemble agreement
- recent validation performance
- prediction interval width
- data freshness
- market volatility
- regime stability

ตัวอย่าง:

Model probability = 0.74
Ensemble agreement = 0.81
Data quality = 0.99
Recent calibration = 0.72

Final confidence ต้องมาจากสูตรที่ documented และ testable

---

# 19. Market Regime Detection

ต้อง detect:

- TREND_UP
- TREND_DOWN
- RANGE
- HIGH_VOLATILITY
- LOW_VOLATILITY
- BREAKOUT
- REVERSAL_RISK

Prediction model สามารถเลือก model/weights ต่างกันตาม regime

---

# 20. Backtesting

ต้องมี Backtest Engine

Input:
- instrument
- date range
- timeframe
- model version
- prediction horizon

Output:

MAE
RMSE
SMAPE
Direction Accuracy
Range Coverage
Stabilization Hit Rate
Calibration Error
Max Error
Median Error

ต้องรองรับ:
- historical replay
- walk-forward validation
- rolling retraining
- out-of-sample testing

---

# 21. Accuracy Definition

ห้ามเรียก "เลขปิดถูก X%" หากไม่ได้กำหนด tolerance

ต้องแยก:

Exact Match:
abs(predicted - actual) <= tick_size

Tolerance:
abs(predicted - actual) / actual <= 0.05%
abs(predicted - actual) / actual <= 0.10%
abs(predicted - actual) / actual <= 0.20%
abs(predicted - actual) / actual <= 0.30%

รายงานทุก tolerance แยกกัน

ตัวอย่าง:

Close within 0.05%: 31%
Close within 0.10%: 54%
Close within 0.20%: 76%

---

# 22. Dashboard

## Main Dashboard

แสดง 4 markets:

Nikkei 225
Dow Jones
Hang Seng
China

แต่ละ card:

- Current
- Open
- High
- Low
- Previous Close
- Change
- Change %
- Market Status
- Data Age
- Direction
- Expected Close
- Prediction Range
- Stabilization Zone
- Confidence

---

# 23. Detail Page

สำหรับแต่ละ index:

Header:
- current price
- change
- market status
- data latency

Chart:
- candlestick
- current price
- EMA
- Bollinger
- support/resistance
- prediction line
- prediction interval
- stabilization zone

Side panel:
- AI Direction
- Expected Close
- 5m
- 15m
- 30m
- 60m
- Close
- Confidence

---

# 24. Prediction Timeline

ต้องมีกราฟ:

Actual vs Prediction

ตัวอย่าง:

timestamp
actual
predicted
lower
upper

เพื่อดูว่า model เคยทายอย่างไรแบบย้อนหลัง

---

# 25. Prediction Convergence

ต้องแสดงว่าการคาดการณ์กำลัง converge หรือ diverge

ตัวอย่าง:

14:20 prediction 42,350
14:21 prediction 42,355
14:22 prediction 42,357
14:23 prediction 42,356
14:24 prediction 42,357

ระบบสามารถแสดง:

Prediction Stability:
HIGH

แต่ถ้า:

42,350
42,410
42,280
42,450

แสดง:

Prediction Stability:
LOW

---

# 26. Data Quality Monitor

Dashboard ต้องมี:

WebSocket:
CONNECTED/DISCONNECTED

Last Tick:
timestamp

Data Age:
xx ms / xx sec

Provider:
provider name

Market Session:
OPEN/CLOSED

Data Delay:
REALTIME/DELAYED/UNKNOWN

หาก data stale:
- หยุด prediction ใหม่
- แสดง warning
- ไม่สร้างข้อมูลปลอม

---

# 27. Admin

ต้องมี:

- Instruments
- Data Providers
- Market Sessions
- Model Versions
- Prediction Settings
- Feature Settings
- Backtest
- Accuracy Reports
- System Logs

---

# 28. API

FastAPI endpoints:

GET /api/markets
GET /api/markets/{symbol}
GET /api/markets/{symbol}/quote
GET /api/markets/{symbol}/candles
GET /api/markets/{symbol}/indicators
GET /api/markets/{symbol}/prediction
GET /api/markets/{symbol}/predictions
GET /api/markets/{symbol}/accuracy
GET /api/markets/{symbol}/backtest

POST /api/backtest
POST /api/models/train
POST /api/models/retrain

GET /api/system/health
GET /api/system/data-status

WebSocket:

/ws/market
/ws/prediction

---

# 29. Authentication

ต้องมี:

- Admin
- Analyst
- Viewer

ใช้ JWT หรือ secure session

API keys ของ Data Provider:
- ห้ามใส่ใน frontend
- ห้าม commit เข้า Git
- ใช้ .env
- production ใช้ secrets management

---

# 30. Frontend

แนะนำ:

Vue 3
Vite
TypeScript
Tailwind CSS
ECharts หรือ TradingView-compatible chart library ตาม license

ต้องเป็น responsive

Desktop:
1920x1080

Tablet:
1280x800

Mobile:
responsive

Dark mode เป็น default สำหรับ market dashboard

---

# 31. Backend

Python:
3.12+

FastAPI
Pydantic
SQLAlchemy
asyncpg
Redis
WebSocket client
pandas/polars
numpy
scikit-learn
LightGBM/XGBoost
PyTorch สำหรับ deep learning

---

# 32. Infrastructure

Docker Compose:

services:

postgres
timescaledb
redis
api
worker
data-collector
prediction-engine
frontend
nginx

ต้องมี healthcheck

ต้องรองรับ restart policy

---

# 33. Background Jobs

ใช้ Celery/RQ/Arq หรือระบบ async ที่เหมาะสม

Jobs:

- data ingestion
- candle aggregation
- feature calculation
- prediction inference
- prediction evaluation
- model training
- model validation
- model promotion
- cleanup/archive

---

# 34. Model Training Pipeline

Pipeline:

Raw Data
  |
Data Validation
  |
Feature Engineering
  |
Label Generation
  |
Train/Validation Split
  |
Walk-forward Training
  |
Hyperparameter Search
  |
Validation
  |
Calibration
  |
Backtest
  |
Model Registry
  |
Promote Model

ห้าม deploy model ใหม่จนกว่าจะผ่าน acceptance criteria

---

# 35. Model Registry

แต่ละ model ต้องมี:

model_name
version
created_at
training_period
feature_version
dataset_hash
git_commit
parameters
metrics
status

Status:
- TRAINING
- VALIDATED
- ACTIVE
- RETIRED
- FAILED

---

# 36. Acceptance Criteria

MVP ต้องทำได้:

1. รับข้อมูล real-time ได้
2. แสดง Current/Open/High/Low
3. สร้าง candles
4. คำนวณ indicators
5. สร้าง prediction
6. แสดง prediction range
7. แสดง stabilization zone
8. บันทึก prediction
9. เปรียบเทียบกับ actual
10. คำนวณ accuracy
11. Backtest ได้
12. WebSocket dashboard update ได้
13. reconnect เมื่อ data provider หลุด
14. ไม่สร้าง fake data ใน production

---

# 37. MVP Development Order

Phase 1:
Project setup
Docker
PostgreSQL/TimescaleDB
Redis
FastAPI
Vue

Phase 2:
Market data provider
WebSocket collector
Raw data storage

Phase 3:
Candles
Technical indicators
Market session

Phase 4:
Dashboard

Phase 5:
Baseline prediction

Phase 6:
ML prediction

Phase 7:
Prediction range
Stabilization zone

Phase 8:
Backtesting
Accuracy engine

Phase 9:
Model registry
Retraining

Phase 10:
Production hardening

---

# 38. Testing

ต้องมี:

Unit Tests
Integration Tests
Data Pipeline Tests
WebSocket Reconnection Tests
Prediction Tests
Backtest Tests
API Tests
Frontend Tests

โดยเฉพาะ:

- timezone
- market open/close
- missing ticks
- duplicate ticks
- stale data
- out-of-order ticks
- market holiday
- DST
- provider disconnect

---

# 39. Logging

Structured JSON logging

ทุก prediction ต้องสามารถ trace:

request/prediction id
symbol
timestamp
model version
current price
features hash
prediction
confidence

ห้าม log:
- API secret
- password
- JWT
- sensitive credentials

---

# 40. Monitoring

Metrics:

data_latency_ms
ticks_per_second
prediction_latency_ms
prediction_count
prediction_error
model_accuracy
websocket_reconnect_count
api_error_rate
redis_latency
database_latency

Alerts:

data stale
provider disconnected
prediction engine failed
model failure
database failure

---

# 41. Security

- HTTPS
- secure headers
- rate limiting
- authentication
- authorization
- secrets in environment/secrets manager
- SQL injection prevention
- input validation
- dependency scanning

---

# 42. Financial Safety / Product Disclaimer

ระบบนี้เป็นระบบวิเคราะห์และคาดการณ์เชิงสถิติ

ห้ามนำเสนอ prediction เป็น:
- guaranteed result
- guaranteed profit
- guaranteed closing price
- financial certainty

UI ต้องมีข้อความ:

"ข้อมูลและการคาดการณ์เป็นข้อมูลเชิงสถิติ ไม่ใช่การรับประกันราคาหรือผลตอบแทนจากการลงทุน"

---

# 43. Critical Rules สำหรับ AI Developer

ห้าม:

1. สร้างข้อมูลตลาดปลอมแล้วแสดงว่าเป็น real-time
2. hard-code ราคาหุ้น
3. hard-code accuracy
4. ใช้ future data ใน feature
5. random split time-series
6. รายงาน backtest ที่มี look-ahead bias
7. train/test overlap
8. ลบ prediction history
9. overwrite prediction โดยไม่เก็บ version
10. ซ่อน data delay
11. อ้างว่าโมเดลทายเลขปิดได้แน่นอน
12. ใช้ API key ใน frontend

---

# 44. Required Deliverables

AI Developer ต้องส่ง:

1. System Architecture
2. Database ERD
3. SQL migrations
4. Docker Compose
5. Backend source
6. Frontend source
7. Data Collector
8. Prediction Engine
9. Feature Engine
10. Backtest Engine
11. Model Training Pipeline
12. Model Registry
13. API Documentation
14. Environment Example
15. Test Suite
16. Deployment Guide
17. Monitoring Guide
18. User Manual

---

# 45. Suggested Project Structure

```text
global-index-ai/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   └── tests/
│
├── data_collector/
│   ├── providers/
│   ├── normalizer/
│   ├── websocket/
│   └── tests/
│
├── feature_engine/
│   ├── indicators/
│   ├── features/
│   └── tests/
│
├── prediction_engine/
│   ├── models/
│   ├── ensemble/
│   ├── inference/
│   ├── calibration/
│   └── tests/
│
├── backtest/
│   ├── engine/
│   ├── metrics/
│   ├── reports/
│   └── tests/
│
├── training/
│   ├── datasets/
│   ├── pipelines/
│   ├── experiments/
│   └── registry/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── views/
│   │   ├── stores/
│   │   ├── services/
│   │   └── charts/
│   └── tests/
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── docker/
├── docs/
├── scripts/
├── .env.example
├── docker-compose.yml
└── README.md
```

---

# 46. Development Strategy

ห้ามพัฒนาทุกอย่างพร้อมกัน

ทำทีละ milestone:

M1:
Data Provider + DB

M2:
Realtime Dashboard

M3:
Indicators

M4:
Baseline Forecast

M5:
ML Forecast

M6:
Prediction Range

M7:
Stabilization Zone

M8:
Backtest

M9:
Accuracy Dashboard

M10:
Model Retraining

แต่ละ milestone ต้อง:
- run ได้
- test ได้
- มี README
- มี migration
- มี sample configuration
- ไม่มี hard-coded secret

---

# 47. Definition of Done

ระบบถือว่าเสร็จเมื่อ:

- real-time data ทำงานจริง
- market session ถูกต้อง
- data latency แสดงถูกต้อง
- prediction update ตาม schedule
- prediction ถูกเก็บย้อนหลัง
- actual result ถูกนำมา evaluate
- accuracy คำนวณจากข้อมูลจริง
- backtest ไม่มี look-ahead bias
- model version trace ได้
- Dashboard แสดง uncertainty
- ระบบ recover เมื่อ provider disconnect
- production secrets ไม่อยู่ใน source code
- มี automated tests
- มี deployment documentation

---

# 48. Final AI Instruction

เริ่มพัฒนาจาก Phase 1 เท่านั้น

อย่าเขียนระบบทั้งหมดในครั้งเดียว

ก่อนเขียน code ให้:
1. ตรวจ requirement
2. สร้าง architecture
3. สร้าง database schema
4. ระบุ dependency
5. ระบุ environment variables
6. ระบุ data provider assumptions
7. สร้าง implementation plan

จากนั้น implement เป็น milestone

ทุกครั้งที่เสร็จ milestone:
- run tests
- report test result
- report changed files
- report database migration
- report known limitations
- ห้ามอ้าง feature ที่ยังไม่ได้ implement ว่าเสร็จแล้ว

เป้าหมายสูงสุดคือสร้างระบบที่สามารถวัดได้จริงว่า
"Prediction ใกล้ความจริงแค่ไหน"
ไม่ใช่สร้าง Dashboard ที่แค่ดูเหมือน AI

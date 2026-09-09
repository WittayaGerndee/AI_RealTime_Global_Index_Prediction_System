# AI Real-Time Global Index Prediction System 📈🤖

ระบบวิเคราะห์ดัชนีตลาดการเงินระดับโลกแบบ Real-time และคาดการณ์ตัวเลขระยะสั้น/ราคาปิดด้วยความแม่นยำสูง (High Numerical Precision) โดยใช้โมเดล **Adaptive Quant & Bayesian-Weighted Ensemble**

รองรับ 4 ดัชนีหลัก:
- **Nikkei 225 (NIKKEI225)** - ตลาดญี่ปุ่น (TSE)
- **Dow Jones Industrial Average (DJI)** - ตลาดสหรัฐฯ (NYSE)
- **Hang Seng Index (HSI)** - ตลาดฮ่องกง (HKEX)
- **Shanghai Composite (SSE)** - ตลาดจีน (SSE)

ออกแบบและปรับแต่งมาเป็นพิเศษสำหรับการโฮสต์ผ่าน **Cloudflare (Cloudflare Pages + Cloudflare Tunnel) + GitHub (Actions CI/CD)**

---

## จุดเด่นของระบบ (Key Capabilities)

1. **ความแม่นยำสูงในการคาดการณ์ตัวเลข (High Numerical Accuracy)**:
   - ผสมผสานโมเดล Microstructure Ornstein-Uhlenbeck Mean Reversion, Trend Slope, VWAP Bands, และ Machine Learning Regressor
   - ปรับน้ำหนักโมเดล (Bayesian Weighting) แบบเรียลไทม์ตาม Inverse Variance ของ Out-of-Sample Error ล่าสุด
2. **Price Stabilization Zone (บริเวณพักตัว/ชะลอตัวของราคา)**:
   - ค้นหาจุด Confluence ระหว่าง Support/Resistance (Pivot Points, Bollinger, Day Extremes) และการชะลอตัวของโมเมนตัม (Deceleration)
3. **Probabilistic Forecast Intervals**:
   - คาดการณ์ Expected Close พร้อมช่วงความเชื่อมั่น 50%, 80%, และ 95%
4. **การวัดความแม่นยำที่โปร่งใสและตรวจสอบได้ (Multi-Tolerance Accuracy Audit)**:
   - รายงานความแม่นยำจริงเปรียบเทียบกับราคาตลาดจริง (Exact match, $\le 0.05\%$, $\le 0.10\%$, $\le 0.20\%$, $\le 0.30\%$)
   - MAE, RMSE, SMAPE, Direction Accuracy, Stabilization Hit Rate คำนวณจริง ไม่มีการ Hard-code
5. **No Data Leakage / Zero Look-Ahead Bias**:
   - ทุกขั้นตอนคำนวณและ Backtest ผ่าน Walk-Forward Validation โดยไม่ใช้ข้อมูลในอนาคต

---

## สถาปัตยกรรมการโฮสต์ (Cloudflare + GitHub)

- **Frontend**: โฮสต์บน **Cloudflare Pages** (Vue 3 + Vite + Tailwind CSS + ECharts) โหลดเร็ว ปลอดภัย มี Edge CDN ทั่วโลก
- **Backend**: Containerized (FastAPI, Redis, TimescaleDB/PostgreSQL, Prediction Engine) เชื่อมต่อสู่สาธารณะผ่าน **Cloudflare Tunnel (`cloudflared`)** โดยไม่ต้องเปิดพอร์ต Router และไม่มีปัญหาเรื่อง Dynamic IP
- **GitHub Actions**:
  - `ci.yml`: รัน Automated Tests ทุกครั้งที่ Push/PR
  - `deploy-cloudflare.yml`: Build และ Deploy ขึ้น Cloudflare Pages อัตโนมัติ
  - `backtest.yml`: รัน Walk-Forward Validation ทุกวันตามเวลาปิดตลาด

ดูคู่มือการติดตั้งและ Deploy อย่างละเอียดได้ที่: [docs/CLOUDFLARE_GITHUB_GUIDE.md](file:///Users/wittayagerndee/Docker_Project/www/AI_RealTime_Global_Index_Prediction_System/docs/CLOUDFLARE_GITHUB_GUIDE.md)

---

## โครงสร้างโปรเจกต์ (Project Structure)

```text
AI_RealTime_Global_Index_Prediction_System/
├── .github/workflows/         # CI/CD, Cloudflare deploy & scheduled backtesting
├── backend/                   # FastAPI REST & WebSocket API, SQLAlchemy models
├── data_collector/            # Market data provider adapters & normalization
├── feature_engine/            # Technical indicators, S&R engine, regime detector
├── prediction_engine/         # Weighted ensemble, intervals, stabilization zone
├── backtest/                  # Walk-forward backtesting & accuracy metrics
├── frontend/                  # Vue 3 + Vite + Tailwind dashboard (Cloudflare Pages)
├── docker/                    # TimescaleDB init SQL schema & Compose files
├── docs/                      # Deployment & architectural documentation
├── docker-compose.yml         # Full-stack Docker orchestration
└── README.md
```

---

## การเริ่มต้นใช้งาน (Quick Start)

### 1. ทดสอบเครื่องยนต์เชิงสถิติ (Unit Tests & Backtesting)
```bash
python3 backend/tests/run_tests.py
python3 -m backtest.cli
```

### 2. รัน Frontend Development Server
```bash
cd frontend
npm run dev
```
เปิดเบราว์เซอร์ไปที่: `http://localhost:3000` (ระบบจะรันในโหมด Edge Simulation ที่มี Live Microstructure Engine ทันที)

### 3. รัน Full Stack ผ่าน Docker Compose
```bash
cp .env.example .env
docker compose up -d
```

---

## คำเตือนทางกฎหมายและการเงิน (Financial Disclaimer)
> **ข้อมูลและการคาดการณ์เป็นข้อมูลเชิงสถิติ ไม่ใช่การรับประกันราคาหรือผลตอบแทนจากการลงทุน**  
> (Conforming to Requirement Section 42)

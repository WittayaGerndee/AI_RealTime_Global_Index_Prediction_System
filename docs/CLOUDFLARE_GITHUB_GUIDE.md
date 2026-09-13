# คู่มือการติดตั้งและ Deploy บน Cloudflare + GitHub
## AI Real-Time Global Index Prediction System

ระบบนี้ Deploy ร่วมกันระหว่าง **Cloudflare** (Workers + Cloudflare Tunnel) และ **GitHub** (Repository + Actions CI)

---

## 1. การทำงานร่วมกันระหว่าง Cloudflare และ GitHub

```text
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Repository                       │
│  - Source code (Frontend, Worker, Backend, Engines)         │
│  - Workflows: CI Tests, Daily Backtest                      │
└──────────────┬───────────────────────────────┬──────────────┘
               │ (git push → Workers Builds)   │ (git clone / pull)
               ▼                               ▼
┌───────────────────────────────┐  ┌───────────────────────────────┐
│  Cloudflare Worker            │  │     Docker Host / VPS         │
│  - Static assets (dist/)      │  │  - FastAPI Backend            │
│  - /market-data → Yahoo       │  │  - TimescaleDB + Redis        │
│    Finance (ราคาดัชนีจริง)       │  │  - Data Collector & AI Engine │
└──────────────▲────────────────┘  │  - cloudflared Tunnel Daemon   │
               │ (HTTPS / WSS)     └───────────────┬───────────────┘
               └───────────────────────────────────┘
```

---

## 2. Push Code ขึ้น GitHub
```bash
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git branch -M main
git push -u origin main
```

GitHub Actions ที่ใช้งาน:
- `ci.yml`: รัน Backend tests (pytest) และ Build Frontend ทุกครั้งที่ Push/PR
- `backtest.yml`: รัน Walk-Forward Backtest ทุกวันทำการ

---

## 3. Deploy ขึ้น Cloudflare Workers (GitHub Integration)

การตั้งค่า Worker อยู่ในไฟล์ [`wrangler.jsonc`](../wrangler.jsonc) ที่ root ของ repo:
- `main`: [`worker/index.ts`](../worker/index.ts) — จัดการ `/market-data` และส่งไฟล์หน้าเว็บ
- `assets.directory`: `./dist` — ผลลัพธ์จาก `npm run build` (root `package.json` จะ build `frontend/` แล้วคัดลอกมาไว้ที่ `dist/`)

ขั้นตอน:
1. **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Import a repository** → เลือก repo นี้
2. Build settings:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
   - **Root directory**: `/` (root ของ repo)
3. ชื่อ Worker ต้องตรงกับ `name` ใน `wrangler.jsonc` (`ai-realtime-global-index-prediction-system`)
4. ทุกครั้งที่ push เข้า `main` Cloudflare จะ build และ deploy ให้อัตโนมัติ

ทดสอบในเครื่องแบบเดียวกับบน Cloudflare:
```bash
npm run build
npx wrangler dev
```

> หากต้องการต่อกับ Backend ผ่าน Tunnel ให้ตั้ง `VITE_API_BASE_URL` และ `VITE_WS_URL` เป็น Build variables ของ Worker

---

## 4. ขั้นตอนการเชื่อมต่อ Backend ด้วย Cloudflare Tunnel (`cloudflared`)

ข้อดีของ Cloudflare Tunnel คือ **ไม่ต้องเปิดพอร์ต Router (Port Forwarding), ไม่ต้องมี Public IP คงที่, ได้รับ SSL Certificate อัตโนมัติ, และป้องกันการโจมตี DDoS ผ่านเครือข่าย Cloudflare 100%**

### 4.1 สร้าง Tunnel ใน Cloudflare Zero Trust
1. ไปที่ **Cloudflare Zero Trust** -> **Networks** -> **Tunnels**
2. กด **Add a tunnel** -> เลือก **Cloudflare Tunnel** -> ตั้งชื่อ เช่น `global-index-tunnel`
3. คัดลอก **Tunnel Token** ที่ Cloudflare ให้มา
4. ใส่ Tunnel Token ในไฟล์ `.env`:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN="eyJhIjoi..."
   ```
5. ในแท็บ **Public Hostname**:
   - Subdomain: `api` (เช่น `api.yourdomain.com`)
   - Service Type: `HTTP`
   - URL: `backend:8000`

### 4.2 สตาร์ท Backend ด้วย Docker Compose
```bash
docker compose up -d
```
หลังจากคำสั่งเสร็จสิ้น:
- Backend FastAPI และ WebSocket จะสามารถเข้าถึงได้อย่างปลอดภัยผ่าน `https://api.yourdomain.com` ทั่วโลก
- หน้าเว็บบน Cloudflare จะเชื่อมต่อดึงข้อมูล Real-time Ticks และ Predictions จาก Backend ได้ทันที

---

## 5. แหล่งข้อมูลของหน้าเว็บ (ลำดับการเลือกอัตโนมัติ)

1. **Backend (Live)** — เมื่อเชื่อมต่อ `VITE_API_BASE_URL` ได้
2. **ราคาจริง (Yahoo Finance)** — ผ่าน `/market-data` ของ Worker อัปเดตทุก 30 วินาที ใช้คำนวณราคาปิดที่คาดการณ์แยกช่วงเช้า/บ่าย จากสถิติ 60 วันล่าสุด และล็อก ณ เวลาที่กำหนด (เวลาไทย): Nikkei 09:15/12:45, HSI 10:45/14:45, SZSE 09:45/13:40, DJI 00:45
3. **ข้อมูลจำลอง (Demo)** — ใช้เมื่อดึงข้อมูลจริงไม่ได้ หน้าเว็บจะแสดงป้าย "โหมดจำลอง" ชัดเจน

# คู่มือการติดตั้งและ Deploy บน Cloudflare + GitHub
## AI Real-Time Global Index Prediction System

ระบบนี้ออกแบบมาเพื่อรันและ Deploy ร่วมกันระหว่าง **Cloudflare** (Cloudflare Pages + Cloudflare Tunnel) และ **GitHub** (Repository + Actions CI/CD) อย่างมีประสิทธิภาพสูงสุด

---

## 1. การทำงานร่วมกันระหว่าง Cloudflare และ GitHub

```text
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Repository                       │
│  - Source code (Frontend, Backend, Engines)                 │
│  - Workflows: CI Tests, Daily Backtest, Cloudflare Deploy   │
└──────────────┬───────────────────────────────┬──────────────┘
               │ (git push / actions)          │ (git clone / pull)
               ▼                               ▼
┌───────────────────────────────┐  ┌───────────────────────────────┐
│       Cloudflare Pages        │  │     Docker Host / VPS         │
│  - Frontend (Vue 3 + ECharts) │  │  - FastAPI Backend            │
│  - Global Anycast Edge CDN    │  │  - TimescaleDB + Redis        │
│  - Standalone / Live Hybrid   │  │  - Data Collector & AI Engine │
└──────────────▲────────────────┘  │  - cloudflared Tunnel Daemon   │
               │ (HTTPS / WSS)     └───────────────┬───────────────┘
               └───────────────────────────────────┘
```

---

## 2. ขั้นตอนการตั้งค่า GitHub

### 2.1 สร้าง GitHub Repository และ Push Code
```bash
git add .
git commit -m "feat: AI Real-Time Global Index Prediction System v1.0"
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git branch -M main
git push -u origin main
```

### 2.2 ตั้งค่า GitHub Secrets สำหรับ Cloudflare (Settings -> Secrets and variables -> Actions)
เพิ่ม Secrets ดังนี้:
1. `CLOUDFLARE_API_TOKEN`: API Token จาก Cloudflare Dashboard (มีสิทธิ์ Cloudflare Pages: Edit)
2. `CLOUDFLARE_ACCOUNT_ID`: Account ID ของคุณใน Cloudflare Dashboard
3. `CLOUDFLARE_API_URL`: (Optional) เช่น `https://api.yourdomain.com/api` (หากต่อกับ Cloudflare Tunnel)
4. `CLOUDFLARE_WS_URL`: (Optional) เช่น `wss://api.yourdomain.com/ws`

---

## 3. ขั้นตอนการตั้งค่า Cloudflare Pages

### วิธีที่ 1: Deploy ผ่าน GitHub Integration (แนะนำที่สุด)
1. ไปที่ **Cloudflare Dashboard** -> **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**
2. เลือก Repository ที่คุณเพิ่ง push บน GitHub
3. ตั้งค่า Build Settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `frontend`
4. ใส่ Environment Variables:
   - `VITE_STANDALONE_DEMO_ENABLED` = `true`
   - `VITE_API_BASE_URL` = `https://api.yourdomain.com/api` (หรือปล่อยว่างเพื่อใช้ Standalone Edge Engine)
   - `VITE_WS_URL` = `wss://api.yourdomain.com/ws`
5. กด **Save and Deploy**
   - Cloudflare Pages จะบิลด์และรันเว็บแอพพลิเคชันของคุณทันที พร้อม URL เช่น `https://ai-global-index-prediction.pages.dev`

### วิธีที่ 2: Deploy อัตโนมัติผ่าน GitHub Actions
ไฟล์ `.github/workflows/deploy-cloudflare.yml` มีการตั้งค่าไว้ล่วงหน้าแล้ว ทุกครั้งที่ push โค้ดเข้า branch `main` GitHub Action จะทำการบิลด์และสั่ง `wrangler pages deploy` ขึ้น Cloudflare อัตโนมัติ

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
- หน้าเว็บ Cloudflare Pages จะเชื่อมต่อดึงข้อมูล Real-time Ticks และ Predictions จาก Backend ได้ทันที!

---

## 5. Standalone Edge Mode (Fallback อัจฉริยะ)

หาก Docker Backend บนเครื่องของคุณยังไม่ได้เปิด หรืออยู่ในระหว่างซ่อมบำรุง ระบบ Frontend บน Cloudflare Pages จะสลับเข้าสู่ **Standalone Edge Quant Engine** โดยอัตโนมัติ:
- ดำเนินการจำลอง Microstructure Ticks และ Candlesticks ของดัชนีทั้ง 4 ตลาด (Nikkei 225, Dow Jones, Hang Seng, SSE)
- คำนวณ EMA, Bollinger Bands, Prediction Ranges (50%, 80%, 95%), Stabilization Zones, และรายงาน Accuracy ย้อนหลังได้ทันที 100%

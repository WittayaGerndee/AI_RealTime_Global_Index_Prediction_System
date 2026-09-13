import { MarketSummary, Candle, HorizonPrediction, AccuracyReport } from '../types/market';
import { edgeEngine } from './edgeSimulation';
import { realEngine } from './realMarketData';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

/** backend: FastAPI stack • real: Yahoo Finance via /market-data • demo: offline simulation */
export type DataSource = 'backend' | 'real' | 'demo';

type LocalEngine = typeof realEngine | typeof edgeEngine;

class MarketApiClient {
  public isLiveBackend = false;
  private wsMarket: WebSocket | null = null;
  private wsPred: WebSocket | null = null;
  private listeners: Record<string, Function[]> = {};

  public get dataSource(): DataSource {
    if (this.isLiveBackend) return 'backend';
    return realEngine.ready ? 'real' : 'demo';
  }

  private get engine(): LocalEngine {
    return realEngine.ready ? realEngine : edgeEngine;
  }

  public async checkBackendHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/system/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        this.isLiveBackend = true;
        this.connectWebSockets();
        return true;
      }
    } catch {
      this.isLiveBackend = false;
    }
    return false;
  }

  /** Refreshes real market data (throttled); falls back to the simulation when unavailable. */
  public async refreshLocalData(): Promise<void> {
    if (!this.isLiveBackend) await realEngine.refresh();
  }

  public async getMarkets(): Promise<MarketSummary[]> {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/markets`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Backend unavailable, falling back to local data', e);
      }
    }
    return this.engine.getMarkets();
  }

  public async getCandles(symbol: string, timeframe = '5m'): Promise<Candle[]> {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/markets/${symbol}/candles?timeframe=${timeframe}`);
        if (res.ok) return await res.json();
      } catch {}
    }
    return this.engine.getCandles(symbol);
  }

  /** Forecasts keyed by horizon label ("1m" … "60m", "Close"). */
  public async getHorizons(symbol: string): Promise<Record<string, HorizonPrediction>> {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/predictions/${symbol}`);
        if (res.ok) return (await res.json()).horizons;
      } catch {}
    }
    const engine = this.engine;
    const out: Record<string, HorizonPrediction> = {};
    for (const h of [1, 5, 15, 30, 60]) out[`${h}m`] = engine.getPrediction(symbol, h);
    out['Close'] = engine.getClosePrediction(symbol);
    return out;
  }

  public async getAccuracy(symbol: string): Promise<AccuracyReport> {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/predictions/${symbol}/accuracy`);
        if (res.ok) return await res.json();
      } catch {}
    }
    return this.engine.getAccuracy(symbol);
  }

  public async getTimeline(symbol: string) {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/predictions/${symbol}/timeline`);
        if (res.ok) return await res.json();
      } catch {}
    }
    return this.engine.getTimeline(symbol);
  }

  private connectWebSockets() {
    try {
      this.wsMarket = new WebSocket(`${WS_BASE}/market`);
      this.wsMarket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.emit('tick', data);
      };
      this.wsPred = new WebSocket(`${WS_BASE}/prediction`);
      this.wsPred.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.emit('prediction', data);
      };
    } catch (e) {
      console.warn('WebSocket connection failed:', e);
    }
  }

  public on(event: string, callback: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  private emit(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => cb(data));
    }
  }
}

export const apiClient = new MarketApiClient();

import { MarketSummary, Candle, HorizonPrediction, AccuracyReport } from '../types/market';
import { edgeEngine } from './edgeSimulation';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';
const ALLOW_FALLBACK = import.meta.env.VITE_STANDALONE_DEMO_ENABLED !== 'false';

class MarketApiClient {
  public isLiveBackend = false;
  private wsMarket: WebSocket | null = null;
  private wsPred: WebSocket | null = null;
  private listeners: Record<string, Function[]> = {};

  constructor() {
    this.checkBackendHealth();
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

  public async getMarkets(): Promise<MarketSummary[]> {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/markets`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Backend unavailable, falling back to edge engine', e);
      }
    }
    return edgeEngine.getMarkets();
  }

  public async getCandles(symbol: string, timeframe = '5m'): Promise<Candle[]> {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/markets/${symbol}/candles?timeframe=${timeframe}`);
        if (res.ok) return await res.json();
      } catch {}
    }
    return edgeEngine.getCandles(symbol);
  }

  public async getPrediction(symbol: string): Promise<HorizonPrediction> {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/predictions/${symbol}`);
        if (res.ok) {
          const data = await res.json();
          return data.horizons['5m'];
        }
      } catch {}
    }
    return edgeEngine.getPrediction(symbol, 5);
  }

  public async getAccuracy(symbol: string): Promise<AccuracyReport> {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/predictions/${symbol}/accuracy`);
        if (res.ok) return await res.json();
      } catch {}
    }
    return edgeEngine.getAccuracy(symbol);
  }

  public async getTimeline(symbol: string) {
    if (this.isLiveBackend) {
      try {
        const res = await fetch(`${API_BASE}/predictions/${symbol}/timeline`);
        if (res.ok) return await res.json();
      } catch {}
    }
    return edgeEngine.getTimeline(symbol);
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

// Cloudflare Worker entry: serves the built frontend from static assets and the
// /market-data endpoint that proxies real index prices.
import { handleMarketData } from '../frontend/server/marketData';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/market-data') {
      return handleMarketData(request);
    }
    return env.ASSETS.fetch(request);
  },
};

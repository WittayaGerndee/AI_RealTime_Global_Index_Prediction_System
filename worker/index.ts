// Cloudflare Worker entry: serves the built frontend from static assets, /market-data
// (real index prices) and /lao-lottery (Lao lottery draws newer than the bundled data).
import { handleMarketData } from '../frontend/server/marketData';
import { handleLaoLottery } from '../frontend/server/laoLottery';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/market-data') return handleMarketData(request);
    if (pathname === '/lao-lottery') return handleLaoLottery(request);
    return env.ASSETS.fetch(request);
  },
};

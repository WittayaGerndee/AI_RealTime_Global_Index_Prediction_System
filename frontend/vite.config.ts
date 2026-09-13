import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { handleMarketData } from './server/marketData'
import { handleLaoLottery } from './server/laoLottery'

// Serves the Worker endpoints locally so `npm run dev` gets real data too
function marketDataDevProxy(): Plugin {
  return {
    name: 'market-data-dev-proxy',
    configureServer(server) {
      const routes = { '/market-data': handleMarketData, '/lao-lottery': handleLaoLottery }
      for (const [path, handler] of Object.entries(routes)) {
        server.middlewares.use(path, async (req, res) => {
          const response = await handler(new Request(`http://localhost${req.originalUrl}`))
          res.statusCode = response.status
          res.setHeader('Content-Type', 'application/json')
          res.end(await response.text())
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), marketDataDevProxy()],
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
})

import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { onRequestGet } from './functions/market-data'

// Serves the Pages Function locally so `npm run dev` gets real market data too
function marketDataDevProxy(): Plugin {
  return {
    name: 'market-data-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/market-data', async (req, res) => {
        const response = await onRequestGet({ request: new Request(`http://localhost${req.originalUrl}`) })
        res.statusCode = response.status
        res.setHeader('Content-Type', 'application/json')
        res.end(await response.text())
      })
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

<template>
  <div class="min-h-screen bg-dark-900 text-gray-100 flex flex-col font-sans">
    <!-- Header -->
    <Header @open-accuracy="isAccuracyOpen = true" />

    <!-- Data Quality Bar -->
    <DataQualityBar />

    <!-- Main Content Container -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <!-- Market Cards Overview (Section 22) -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-bold uppercase tracking-wider text-gray-400">Global Markets Overview</h2>
          <span class="text-xs text-gray-500">Select market for deep-dive quantitative analysis</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MarketCard
            v-for="m in markets"
            :key="m.symbol"
            :market="m"
            :isSelected="m.symbol === selectedSymbol"
            @select="selectedSymbol = $event"
          />
        </div>
      </div>

      <!-- Active Market Deep Dive Section (Section 23) -->
      <div v-if="activeMarket" class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Left: Candlestick Chart (2 cols) -->
          <div class="lg:col-span-2 space-y-6">
            <CandlestickChart
              :symbol="activeMarket.symbol"
              :candles="candles"
              :currentPrice="activeMarket.current_price"
              :expectedPrice="activePrediction?.expected_price"
              :predictionRange="activeMarket.prediction_range"
              :stabilizationZone="activeMarket.stabilization_zone"
            />

            <!-- Prediction Convergence Timeline (Section 24 & 25) -->
            <PredictionTimeline
              :timeline="timeline"
              :stability="activeMarket.convergence_stability"
            />
          </div>

          <!-- Right: Multi-Horizon Forecasts & Quant Metrics (1 col) -->
          <div class="space-y-6">
            <!-- Horizon Forecast Card -->
            <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 space-y-4">
              <div class="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 class="text-base font-bold text-white">Prediction Horizons</h3>
                <span class="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  {{ activePrediction?.model_version || 'v1.0.0' }}
                </span>
              </div>

              <!-- Horizons List -->
              <div class="space-y-2.5">
                <div
                  v-for="h in horizonList"
                  :key="h.label"
                  :class="[
                    'p-3 rounded-xl border transition-colors flex items-center justify-between',
                    selectedHorizon === h.minutes
                      ? 'bg-blue-600/10 border-blue-500/40 text-white'
                      : 'bg-dark-900/60 border-gray-800 text-gray-300 hover:bg-dark-900'
                  ]"
                  @click="selectedHorizon = h.minutes"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-200">
                      {{ h.label }}
                    </span>
                    <span class="text-xs text-gray-400">{{ h.desc }}</span>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-bold font-mono text-blue-400">
                      {{ formatPrice(h.price) }}
                    </div>
                    <div class="text-[10px] text-gray-500">
                      ±{{ formatPrice(h.price * 0.002) }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Direction Probabilities Bar -->
              <div class="pt-3 border-t border-gray-800 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-gray-400">Direction Probability:</span>
                  <span class="font-bold text-emerald-400">
                    {{ activeMarket.direction }} {{ Math.round(activeMarket.direction_probability * 100) }}%
                  </span>
                </div>
                <div class="w-full bg-dark-900 h-2 rounded-full overflow-hidden flex">
                  <div
                    class="bg-emerald-500 h-full"
                    :style="`width: ${activePrediction?.probabilities.up ? activePrediction.probabilities.up * 100 : 60}%`"
                    title="UP"
                  ></div>
                  <div
                    class="bg-gray-500 h-full"
                    :style="`width: ${activePrediction?.probabilities.sideways ? activePrediction.probabilities.sideways * 100 : 20}%`"
                    title="SIDEWAYS"
                  ></div>
                  <div
                    class="bg-red-500 h-full"
                    :style="`width: ${activePrediction?.probabilities.down ? activePrediction.probabilities.down * 100 : 20}%`"
                    title="DOWN"
                  ></div>
                </div>
                <div class="flex justify-between text-[10px] text-gray-500 font-mono">
                  <span>UP: {{ Math.round((activePrediction?.probabilities.up || 0.6) * 100) }}%</span>
                  <span>SIDEWAYS: {{ Math.round((activePrediction?.probabilities.sideways || 0.2) * 100) }}%</span>
                  <span>DOWN: {{ Math.round((activePrediction?.probabilities.down || 0.2) * 100) }}%</span>
                </div>
              </div>
            </div>

            <!-- Stabilization Zone Focus Card -->
            <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  Price Stabilization Zone
                </h3>
                <span class="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  {{ Math.round(activeMarket.stabilization_zone.stabilization_probability * 100) }}% Hit Rate
                </span>
              </div>
              <p class="text-xs text-gray-400">
                Model-identified consolidation band where momentum is estimated to decelerate.
              </p>
              <div class="bg-dark-900 rounded-xl p-3 border border-gray-800 flex items-center justify-around font-mono text-center">
                <div>
                  <div class="text-[10px] text-gray-500">Zone Floor</div>
                  <div class="text-sm font-bold text-gray-200">{{ formatPrice(activeMarket.stabilization_zone.stabilization_low) }}</div>
                </div>
                <div class="text-gray-600">➔</div>
                <div>
                  <div class="text-[10px] text-gray-500">Zone Ceiling</div>
                  <div class="text-sm font-bold text-gray-200">{{ formatPrice(activeMarket.stabilization_zone.stabilization_high) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Accuracy Audit Modal -->
    <AccuracyReportModal
      v-if="isAccuracyOpen && accuracyReport"
      :symbol="selectedSymbol"
      :report="accuracyReport"
      @close="isAccuracyOpen = false"
    />

    <!-- Financial Safety Disclaimer (Section 42) -->
    <DisclaimerBanner />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import Header from './components/Header.vue';
import DataQualityBar from './components/DataQualityBar.vue';
import MarketCard from './components/MarketCard.vue';
import CandlestickChart from './components/CandlestickChart.vue';
import PredictionTimeline from './components/PredictionTimeline.vue';
import AccuracyReportModal from './components/AccuracyReportModal.vue';
import DisclaimerBanner from './components/DisclaimerBanner.vue';

import { MarketSummary, Candle, HorizonPrediction, AccuracyReport } from './types/market';
import { apiClient } from './api/client';
import { edgeEngine } from './api/edgeSimulation';

const markets = ref<MarketSummary[]>([]);
const selectedSymbol = ref<string>('NIKKEI225');
const selectedHorizon = ref<number>(5);
const candles = ref<Candle[]>([]);
const activePrediction = ref<HorizonPrediction | null>(null);
const timeline = ref<any[]>([]);
const accuracyReport = ref<AccuracyReport | null>(null);
const isAccuracyOpen = ref<boolean>(false);

let tickInterval: any = null;

const activeMarket = computed(() => {
  return markets.value.find(m => m.symbol === selectedSymbol.value) || markets.value[0];
});

const horizonList = computed(() => {
  if (!activeMarket.value) return [];
  const curr = activeMarket.value.current_price;
  return [
    { label: '1m', minutes: 1, desc: 'Ultra-short', price: +(curr * 1.0002).toFixed(2) },
    { label: '5m', minutes: 5, desc: 'Main Horizon', price: +(activePrediction.value?.expected_price || curr * 1.0008).toFixed(2) },
    { label: '15m', minutes: 15, desc: 'Short-term', price: +(curr * 1.0014).toFixed(2) },
    { label: '30m', minutes: 30, desc: 'Intraday drift', price: +(curr * 1.0020).toFixed(2) },
    { label: '60m', minutes: 60, desc: 'Hourly outlook', price: +(curr * 1.0028).toFixed(2) },
    { label: 'Close', minutes: 180, desc: 'Session End', price: activeMarket.value.expected_close },
  ];
});

async function refreshData() {
  markets.value = await apiClient.getMarkets();
  if (selectedSymbol.value) {
    candles.value = await apiClient.getCandles(selectedSymbol.value);
    activePrediction.value = await apiClient.getPrediction(selectedSymbol.value);
    timeline.value = await apiClient.getTimeline(selectedSymbol.value);
    accuracyReport.value = await apiClient.getAccuracy(selectedSymbol.value);
  }
}

watch(selectedSymbol, async () => {
  if (selectedSymbol.value) {
    candles.value = await apiClient.getCandles(selectedSymbol.value);
    activePrediction.value = await apiClient.getPrediction(selectedSymbol.value);
    timeline.value = await apiClient.getTimeline(selectedSymbol.value);
    accuracyReport.value = await apiClient.getAccuracy(selectedSymbol.value);
  }
});

onMounted(async () => {
  await refreshData();
  // Live continuous simulated tick loop for responsive UX
  tickInterval = setInterval(() => {
    edgeEngine.tick();
    markets.value = apiClient.isLiveBackend ? markets.value : edgeEngine.getMarkets();
    if (!apiClient.isLiveBackend && selectedSymbol.value) {
      candles.value = edgeEngine.getCandles(selectedSymbol.value);
      activePrediction.value = edgeEngine.getPrediction(selectedSymbol.value, selectedHorizon.value);
      timeline.value = edgeEngine.getTimeline(selectedSymbol.value);
    }
  }, 1200);
});

onUnmounted(() => {
  if (tickInterval) clearInterval(tickInterval);
});

function formatPrice(val: number): string {
  if (val === undefined || val === null) return '0.00';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
</script>

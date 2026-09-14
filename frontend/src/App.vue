<template>
  <div class="min-h-screen bg-dark-900 text-gray-100 flex flex-col font-sans">
    <!-- Header -->
    <Header :source="dataSource" @open-accuracy="isAccuracyOpen = true" />

    <!-- Data Source & Thai Clock -->
    <DataQualityBar :source="dataSource" :symbols="SYMBOLS" :now="now" />

    <!-- Page tabs -->
    <nav class="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-5 flex gap-2">
      <a
        v-for="tab in PAGES"
        :key="tab.id"
        :href="`#${tab.id}`"
        :class="['px-4 py-2 rounded-xl text-sm font-semibold border', page === tab.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-dark-800 border-gray-800 text-gray-300 hover:bg-dark-700']"
      >
        {{ tab.label }}
      </a>
    </nav>

    <main v-if="page === 'lao'" class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <LaoLotteryPage />
    </main>

    <!-- Main Content Container -->
    <main v-else class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <!-- Market Hours in Thai Time -->
      <SessionSchedule :symbols="SYMBOLS" :selectedSymbol="selectedSymbol" :now="now" :statusOverrides="statusOverrides" @select="selectedSymbol = $event" />

      <!-- Market Cards Overview -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-bold uppercase tracking-wider text-gray-400">ภาพรวมตลาดโลก</h2>
          <span class="text-xs text-gray-500">เลือกตลาดเพื่อดูรายละเอียด</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MarketCard
            v-for="m in markets"
            :key="m.symbol"
            :market="m"
            :now="now"
            :isSelected="m.symbol === selectedSymbol"
            @select="selectedSymbol = $event"
          />
        </div>
      </div>

      <!-- Active Market Deep Dive -->
      <div v-if="activeMarket" class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Left: Candlestick Chart (2 cols) -->
          <div class="lg:col-span-2 space-y-6">
            <CandlestickChart
              :symbol="activeMarket.symbol"
              :candles="candles"
              :currentPrice="activeMarket.current_price"
              :expectedPrice="isLocked ? activeMarket.expected_close : undefined"
              :predictionRange="isLocked ? activeMarket.prediction_range : undefined"
              :stabilizationZone="isLocked ? activeMarket.stabilization_zone : undefined"
            />

            <!-- Close Forecast Timeline -->
            <PredictionTimeline
              :timeline="timeline"
              :stability="activeMarket.convergence_stability"
            />
          </div>

          <!-- Right: Multi-Horizon Forecasts (1 col) -->
          <div class="space-y-6">
            <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 space-y-4">
              <div class="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 class="text-base font-bold text-white">คาดการณ์ตามช่วงเวลา</h3>
                <span class="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  {{ horizons['5m']?.model_version || 'v1.1.0' }}
                </span>
              </div>

              <div class="space-y-2.5">
                <div
                  v-for="h in horizonList"
                  :key="h.label"
                  :class="[
                    'p-3 rounded-xl border flex items-center justify-between',
                    h.isClose && closeForecast?.locked
                      ? 'bg-amber-500/5 border-amber-500/30 text-white'
                      : 'bg-dark-900/60 border-gray-800 text-gray-300'
                  ]"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-200">
                      {{ h.label }}
                    </span>
                    <span class="text-xs text-gray-400">{{ h.desc }}</span>
                  </div>
                  <div class="text-right">
                    <template v-if="h.price !== null">
                      <div :class="['text-sm font-bold font-mono', h.isClose && closeForecast?.locked ? 'text-amber-300' : 'text-blue-400']">
                        {{ formatPrice(h.price) }}
                      </div>
                      <div class="text-[10px] text-gray-500">±{{ formatPrice(h.halfRange) }}</div>
                    </template>
                    <div v-else class="text-xs text-gray-500">{{ h.pendingText }}</div>
                  </div>
                </div>
              </div>

              <!-- Direction Probabilities Bar -->
              <div v-if="closePrediction && isLocked" class="pt-3 border-t border-gray-800 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-gray-400">ทิศทางถึงราคาปิด{{ activeSegmentLabel }}:</span>
                  <span class="font-bold text-emerald-400">
                    {{ DIRECTION_LABELS[activeMarket.direction] }} {{ Math.round(activeMarket.direction_probability * 100) }}%
                  </span>
                </div>
                <div class="w-full bg-dark-900 h-2 rounded-full overflow-hidden flex">
                  <div class="bg-emerald-500 h-full" :style="`width: ${closePrediction.probabilities.up * 100}%`" title="ขึ้น"></div>
                  <div class="bg-gray-500 h-full" :style="`width: ${closePrediction.probabilities.sideways * 100}%`" title="ทรงตัว"></div>
                  <div class="bg-red-500 h-full" :style="`width: ${closePrediction.probabilities.down * 100}%`" title="ลง"></div>
                </div>
                <div class="flex justify-between text-[10px] text-gray-500 font-mono">
                  <span>ขึ้น: {{ Math.round(closePrediction.probabilities.up * 100) }}%</span>
                  <span>ทรงตัว: {{ Math.round(closePrediction.probabilities.sideways * 100) }}%</span>
                  <span>ลง: {{ Math.round(closePrediction.probabilities.down * 100) }}%</span>
                </div>
              </div>
            </div>

            <!-- Stabilization Zone Card -->
            <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  โซนที่ราคาน่าจะหยุด
                </h3>
              </div>
              <p class="text-xs text-gray-400">
                กรอบ 50% จากความคลาดเคลื่อนจริงในอดีต — ราคาปิด{{ activeSegmentLabel }}มีโอกาสราวครึ่งหนึ่งที่จะอยู่ในช่วงนี้
              </p>
              <div v-if="!isLocked" class="bg-dark-900 rounded-xl p-3 border border-gray-800 text-xs text-gray-500 text-center">
                {{ pendingCloseText }}
              </div>
              <div v-else class="bg-dark-900 rounded-xl p-3 border border-gray-800 flex items-center justify-around font-mono text-center">
                <div>
                  <div class="text-[10px] text-gray-500">ต่ำสุด</div>
                  <div class="text-sm font-bold text-gray-200">{{ formatPrice(activeMarket.stabilization_zone.stabilization_low) }}</div>
                </div>
                <div class="text-gray-600">➔</div>
                <div>
                  <div class="text-[10px] text-gray-500">สูงสุด</div>
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

    <DisclaimerBanner />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import Header from './components/Header.vue';
import DataQualityBar from './components/DataQualityBar.vue';
import SessionSchedule from './components/SessionSchedule.vue';
import MarketCard from './components/MarketCard.vue';
import CandlestickChart from './components/CandlestickChart.vue';
import PredictionTimeline from './components/PredictionTimeline.vue';
import AccuracyReportModal from './components/AccuracyReportModal.vue';
import DisclaimerBanner from './components/DisclaimerBanner.vue';
import LaoLotteryPage from './components/LaoLotteryPage.vue';

import { MarketSummary, Candle, HorizonPrediction, AccuracyReport, SegmentForecast } from './types/market';
import { apiClient, DataSource } from './api/client';
import { SYMBOLS, getSessionState, formatThaiTime } from './utils/marketSessions';

const DIRECTION_LABELS = { UP: 'ขึ้น', DOWN: 'ลง', SIDEWAYS: 'ทรงตัว' };
const SHORT_HORIZONS = [
  { label: '1m', minutes: 1, desc: '1 นาที' },
  { label: '5m', minutes: 5, desc: '5 นาที' },
  { label: '15m', minutes: 15, desc: '15 นาที' },
  { label: '30m', minutes: 30, desc: '30 นาที' },
  { label: '60m', minutes: 60, desc: '1 ชั่วโมง' },
];

const PAGES = [
  { id: 'stocks', label: 'ดัชนีหุ้น' },
  { id: 'lao', label: 'สถิติหวยลาว' },
];
const currentPage = () => (window.location.hash === '#lao' ? 'lao' : 'stocks');
const page = ref(currentPage());
const onHashChange = () => (page.value = currentPage());

const now = ref(new Date());
const dataSource = ref<DataSource>('demo');
const markets = ref<MarketSummary[]>([]);
const selectedSymbol = ref<string>('NIKKEI225');
const candles = ref<Candle[]>([]);
const horizons = ref<Record<string, HorizonPrediction>>({});
const timeline = ref<any[]>([]);
const accuracyReport = ref<AccuracyReport | null>(null);
const isAccuracyOpen = ref<boolean>(false);

let clockInterval: ReturnType<typeof setInterval> | null = null;
let dataInterval: ReturnType<typeof setInterval> | null = null;

const activeMarket = computed(() => {
  return markets.value.find(m => m.symbol === selectedSymbol.value) || markets.value[0];
});

const statusOverrides = computed(() => Object.fromEntries(markets.value.map((m) => [m.symbol, m.market_status])));

const closeForecast = computed(() => activeMarket.value?.close_forecast);

// Segment the "Close" row refers to, e.g. "ช่วงเช้า"
const activeSegmentLabel = computed(() => {
  const cf = activeMarket.value?.close_forecast;
  return cf && 'label' in cf && cf.label !== 'ทั้งวัน' ? (cf as SegmentForecast).label : '';
});
const isLocked = computed(() => !!closeForecast.value?.locked);
const pendingCloseText = computed(() => {
  const cf = closeForecast.value as SegmentForecast | undefined;
  if (cf?.status === 'CALCULATING') return 'กำลังคำนวณราคาปิด…';
  return cf && 'lock_at' in cf ? `คำนวณเวลา ${formatThaiTime(new Date(cf.lock_at))} น.` : 'รอข้อมูลหลังเปิดตลาด';
});
const closePrediction = computed(() => horizons.value['Close'] || horizons.value['5m']);

const isTrading = computed(() => {
  const status = getSessionState(selectedSymbol.value, now.value).status;
  return status === 'OPEN' || status === 'LOCKED';
});

const horizonList = computed(() => {
  const m = activeMarket.value;
  if (!m) return [];
  const rows = SHORT_HORIZONS.map((h) => {
    const p = horizons.value[h.label];
    return {
      ...h,
      isClose: false,
      price: isTrading.value && p ? p.expected_price : null,
      halfRange: p ? (p.upper_bound - p.lower_bound) / 2 : 0,
      pendingText: 'ตลาดไม่ได้ซื้อขาย',
    };
  });
  const cf = m.close_forecast;
  rows.push({
    label: 'Close',
    minutes: 0,
    desc: `${cf?.locked ? '🔒 ' : ''}ราคาปิด${activeSegmentLabel.value}${cf?.locked ? ' (ล็อกแล้ว)' : ''}`,
    isClose: true,
    price: cf?.locked ? m.expected_close : null,
    halfRange: (m.prediction_range.upper - m.prediction_range.lower) / 2,
    pendingText: pendingCloseText.value,
  });
  return rows;
});

async function loadSelected() {
  const sym = selectedSymbol.value;
  const [c, h, t] = await Promise.all([
    apiClient.getCandles(sym),
    apiClient.getHorizons(sym),
    apiClient.getTimeline(sym),
  ]);
  if (sym !== selectedSymbol.value) return;
  candles.value = c;
  horizons.value = h;
  timeline.value = t;
}

async function refreshData() {
  await apiClient.refreshLocalData();
  dataSource.value = apiClient.dataSource;
  markets.value = await apiClient.getMarkets();
  await loadSelected();
}

watch(selectedSymbol, async () => {
  await loadSelected();
  accuracyReport.value = await apiClient.getAccuracy(selectedSymbol.value);
});

watch(isAccuracyOpen, async (open) => {
  if (open) accuracyReport.value = await apiClient.getAccuracy(selectedSymbol.value);
});

onMounted(async () => {
  window.addEventListener('hashchange', onHashChange);
  await apiClient.checkBackendHealth();
  await refreshData();
  accuracyReport.value = await apiClient.getAccuracy(selectedSymbol.value);

  clockInterval = setInterval(() => {
    now.value = new Date();
  }, 1000);

  // Prices only change while an exchange is trading; outside hours the refresh returns the same values
  dataInterval = setInterval(refreshData, apiClient.isLiveBackend ? 5000 : 2000);
});

onUnmounted(() => {
  window.removeEventListener('hashchange', onHashChange);
  if (clockInterval) clearInterval(clockInterval);
  if (dataInterval) clearInterval(dataInterval);
});

function formatPrice(val: number): string {
  if (val === undefined || val === null) return '0.00';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
</script>

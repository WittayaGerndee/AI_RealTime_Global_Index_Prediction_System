<template>
  <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 relative">
    <!-- Chart Header -->
    <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
      <div class="flex items-center space-x-3">
        <h2 class="text-base font-bold text-white flex items-center gap-2">
          <span>{{ symbol }} Candlestick & Quant Stabilization Zone</span>
          <span class="text-xs font-mono font-normal text-gray-400 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">5m</span>
        </h2>
      </div>

      <!-- Overlays Legend -->
      <div class="flex items-center space-x-4 text-xs">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-0.5 bg-blue-400"></span>
          <span class="text-gray-300">EMA 20</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-0.5 border-t border-dashed border-indigo-400"></span>
          <span class="text-gray-300">Expected (AI)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-2 bg-amber-500/20 border border-amber-500/50 rounded-sm"></span>
          <span class="text-amber-400 font-medium">Stabilization Zone</span>
        </div>
      </div>
    </div>

    <!-- Chart Canvas / SVG Container -->
    <div class="relative w-full h-[360px] bg-dark-900/90 rounded-xl border border-gray-800 overflow-hidden select-none">
      <svg
        v-if="candles.length > 0"
        class="w-full h-full"
        :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
        preserveAspectRatio="none"
      >
        <!-- Horizontal Gridlines & Price Labels -->
        <g v-for="(gridPrice, idx) in gridLines" :key="idx">
          <line
            x1="0"
            :y1="priceToY(gridPrice)"
            :x2="chartWidth - 65"
            :y2="priceToY(gridPrice)"
            stroke="#1F2430"
            stroke-dasharray="3 3"
          />
          <text
            :x="chartWidth - 60"
            :y="priceToY(gridPrice) + 4"
            fill="#64748B"
            font-size="10"
            font-family="monospace"
          >
            {{ formatPrice(gridPrice) }}
          </text>
        </g>

        <!-- Stabilization Zone Shaded Band -->
        <rect
          v-if="stabilizationZone"
          x="0"
          :y="priceToY(stabilizationZone.stabilization_high)"
          :width="chartWidth - 65"
          :height="Math.max(2, priceToY(stabilizationZone.stabilization_low) - priceToY(stabilizationZone.stabilization_high))"
          fill="rgba(245, 158, 11, 0.12)"
          stroke="rgba(245, 158, 11, 0.4)"
          stroke-dasharray="4 2"
        />

        <!-- Prediction Bounds (80% Interval) -->
        <line
          v-if="predictionRange"
          x1="0"
          :y1="priceToY(predictionRange.upper)"
          :x2="chartWidth - 65"
          :y2="priceToY(predictionRange.upper)"
          stroke="#818CF8"
          stroke-dasharray="4 4"
          stroke-width="1.2"
        />
        <line
          v-if="predictionRange"
          x1="0"
          :y1="priceToY(predictionRange.lower)"
          :x2="chartWidth - 65"
          :y2="priceToY(predictionRange.lower)"
          stroke="#818CF8"
          stroke-dasharray="4 4"
          stroke-width="1.2"
        />

        <!-- Expected Price Line -->
        <line
          v-if="expectedPrice"
          x1="0"
          :y1="priceToY(expectedPrice)"
          :x2="chartWidth - 65"
          :y2="priceToY(expectedPrice)"
          stroke="#60A5FA"
          stroke-dasharray="5 3"
          stroke-width="1.5"
        />

        <!-- Candlesticks -->
        <g v-for="(c, idx) in visibleCandles" :key="idx">
          <!-- Wick line -->
          <line
            :x1="candleX(idx)"
            :y1="priceToY(c.high)"
            :x2="candleX(idx)"
            :y2="priceToY(c.low)"
            :stroke="c.close >= c.open ? '#10B981' : '#EF4444'"
            stroke-width="1.5"
          />
          <!-- Body rectangle -->
          <rect
            :x="candleX(idx) - candleWidth / 2"
            :y="priceToY(Math.max(c.open, c.close))"
            :width="candleWidth"
            :height="Math.max(2, Math.abs(priceToY(c.open) - priceToY(c.close)))"
            :fill="c.close >= c.open ? '#10B981' : '#EF4444'"
            rx="1"
          />
        </g>

        <!-- EMA Line -->
        <path
          :d="emaPath"
          fill="none"
          stroke="#3B82F6"
          stroke-width="2"
        />

        <!-- Current Price Marker -->
        <line
          x1="0"
          :y1="priceToY(currentPrice)"
          :x2="chartWidth - 65"
          :y2="priceToY(currentPrice)"
          stroke="#E2E8F0"
          stroke-width="1"
        />
        <rect
          :x="chartWidth - 62"
          :y="priceToY(currentPrice) - 9"
          width="58"
          height="18"
          fill="#3B82F6"
          rx="3"
        />
        <text
          :x="chartWidth - 58"
          :y="priceToY(currentPrice) + 4"
          fill="#FFFFFF"
          font-size="9"
          font-weight="bold"
          font-family="monospace"
        >
          {{ formatPrice(currentPrice) }}
        </text>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Candle } from '../types/market';

const props = defineProps<{
  symbol: string;
  candles: Candle[];
  currentPrice: number;
  expectedPrice?: number;
  predictionRange?: { lower: number; upper: number };
  stabilizationZone?: { stabilization_low: number; stabilization_high: number };
}>();

const chartWidth = 900;
const chartHeight = 360;
const candleWidth = 8;
const candleSpacing = 16;

const visibleCandles = computed(() => {
  return props.candles.slice(-45);
});

const minPrice = computed(() => {
  if (visibleCandles.value.length === 0) return 100;
  const lows = visibleCandles.value.map(c => c.low);
  if (props.predictionRange) lows.push(props.predictionRange.lower);
  if (props.stabilizationZone) lows.push(props.stabilizationZone.stabilization_low);
  return Math.min(...lows) * 0.998;
});

const maxPrice = computed(() => {
  if (visibleCandles.value.length === 0) return 200;
  const highs = visibleCandles.value.map(c => c.high);
  if (props.predictionRange) highs.push(props.predictionRange.upper);
  if (props.stabilizationZone) highs.push(props.stabilizationZone.stabilization_high);
  return Math.max(...highs) * 1.002;
});

const priceRange = computed(() => Math.max(1, maxPrice.value - minPrice.value));

function priceToY(p: number): number {
  const norm = (p - minPrice.value) / priceRange.value;
  return chartHeight - 20 - norm * (chartHeight - 40);
}

function candleX(idx: number): number {
  return 30 + idx * candleSpacing;
}

const gridLines = computed(() => {
  const count = 5;
  const step = priceRange.value / (count - 1);
  const lines = [];
  for (let i = 0; i < count; i++) {
    lines.push(minPrice.value + i * step);
  }
  return lines;
});

const emaPath = computed(() => {
  const list = visibleCandles.value;
  if (list.length < 2) return '';
  const points = [];
  let ema = list[0].close;
  const alpha = 2.0 / (20 + 1);

  for (let i = 0; i < list.length; i++) {
    ema = list[i].close * alpha + ema * (1 - alpha);
    points.push(`${candleX(i)},${priceToY(ema)}`);
  }
  return 'M ' + points.join(' L ');
});

function formatPrice(val: number): string {
  return val ? val.toFixed(2) : '0.00';
}
</script>

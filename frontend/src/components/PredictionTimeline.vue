<template>
  <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <span>Prediction Convergence & Accuracy Timeline</span>
          <span
            :class="[
              'text-[11px] font-bold px-2 py-0.5 rounded-full border',
              stability === 'HIGH'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            ]"
          >
            Stability: {{ stability }}
          </span>
        </h3>
        <p class="text-xs text-gray-400">Actual vs Historical Model Predictions (Requirement Section 24 & 25)</p>
      </div>

      <div class="flex items-center space-x-3 text-xs">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-0.5 bg-emerald-400"></span>
          <span class="text-gray-300">Actual Price</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-0.5 bg-blue-400 border-t border-dashed"></span>
          <span class="text-gray-300">Expected (AI)</span>
        </div>
      </div>
    </div>

    <div class="relative w-full h-[180px] bg-dark-900/90 rounded-xl border border-gray-800 overflow-hidden select-none">
      <svg
        v-if="timeline.length > 1"
        class="w-full h-full"
        :viewBox="`0 0 ${width} ${height}`"
        preserveAspectRatio="none"
      >
        <!-- Horizontal Grid -->
        <line x1="0" y1="45" :x2="width" y2="45" stroke="#1F2430" stroke-dasharray="3 3" />
        <line x1="0" y1="90" :x2="width" y2="90" stroke="#1F2430" stroke-dasharray="3 3" />
        <line x1="0" y1="135" :x2="width" y2="135" stroke="#1F2430" stroke-dasharray="3 3" />

        <!-- Prediction Bound Shaded Area -->
        <polygon :points="bandPoints" fill="rgba(96, 165, 250, 0.08)" />

        <!-- Actual Line -->
        <path :d="actualPath" fill="none" stroke="#10B981" stroke-width="2" />

        <!-- Predicted Line -->
        <path :d="predPath" fill="none" stroke="#60A5FA" stroke-width="2" stroke-dasharray="4 3" />
      </svg>
      <div v-else class="h-full flex items-center justify-center text-xs text-gray-500">
        Collecting prediction snapshots...
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  timeline: any[];
  stability: 'HIGH' | 'LOW';
}>();

const width = 800;
const height = 180;

const minVal = computed(() => {
  if (!props.timeline.length) return 100;
  const vals = props.timeline.flatMap(d => [d.current_price, d.expected_price, d.lower_bound]);
  return Math.min(...vals) * 0.999;
});

const maxVal = computed(() => {
  if (!props.timeline.length) return 200;
  const vals = props.timeline.flatMap(d => [d.current_price, d.expected_price, d.upper_bound]);
  return Math.max(...vals) * 1.001;
});

const range = computed(() => Math.max(1, maxVal.value - minVal.value));

function toY(v: number) {
  const norm = (v - minVal.value) / range.value;
  return height - 15 - norm * (height - 30);
}

function toX(i: number) {
  return 20 + i * ((width - 40) / Math.max(1, props.timeline.length - 1));
}

const actualPath = computed(() => {
  return 'M ' + props.timeline.map((d, i) => `${toX(i)},${toY(d.current_price)}`).join(' L ');
});

const predPath = computed(() => {
  return 'M ' + props.timeline.map((d, i) => `${toX(i)},${toY(d.expected_price)}`).join(' L ');
});

const bandPoints = computed(() => {
  const top = props.timeline.map((d, i) => `${toX(i)},${toY(d.upper_bound)}`);
  const bot = props.timeline.map((d, i) => `${toX(props.timeline.length - 1 - i)},${toY(props.timeline[props.timeline.length - 1 - i].lower_bound)}`);
  return top.concat(bot).join(' ');
});
</script>

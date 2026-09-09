<template>
  <div
    @click="$emit('select', market.symbol)"
    :class="[
      'p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group',
      isSelected
        ? 'bg-dark-800 border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/50'
        : 'bg-dark-800/60 border-gray-800 hover:border-gray-700 hover:bg-dark-800'
    ]"
  >
    <!-- Card Top: Symbol & Direction -->
    <div class="flex items-start justify-between mb-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-gray-700 text-gray-200">
            {{ market.symbol }}
          </span>
          <span class="text-xs text-gray-400">{{ market.market }} • {{ market.currency }}</span>
        </div>
        <h3 class="text-base font-bold text-white mt-1 group-hover:text-blue-400 transition-colors">
          {{ market.name }}
        </h3>
      </div>

      <!-- Direction Badge -->
      <div
        :class="[
          'px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm',
          market.direction === 'UP'
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            : market.direction === 'DOWN'
            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
            : 'bg-gray-500/15 text-gray-300 border border-gray-500/30'
        ]"
      >
        <svg v-if="market.direction === 'UP'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
        <svg v-else-if="market.direction === 'DOWN'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
        <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 12h14"></path></svg>
        <span>{{ market.direction }} {{ Math.round(market.direction_probability * 100) }}%</span>
      </div>
    </div>

    <!-- Current Price & Change -->
    <div class="flex items-baseline justify-between mb-4">
      <div>
        <div class="text-2xl font-extrabold text-white font-mono tracking-tight">
          {{ formatPrice(market.current_price) }}
        </div>
      </div>
      <div
        :class="[
          'text-sm font-semibold font-mono flex items-center gap-1',
          market.change >= 0 ? 'text-emerald-400' : 'text-red-400'
        ]"
      >
        <span>{{ market.change >= 0 ? '+' : '' }}{{ formatPrice(market.change) }}</span>
        <span>({{ market.change_percent >= 0 ? '+' : '' }}{{ market.change_percent.toFixed(2) }}%)</span>
      </div>
    </div>

    <!-- Expected Close & Prediction Range -->
    <div class="bg-dark-900/80 rounded-xl p-3 border border-gray-800/80 space-y-2 mb-4">
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-400">Expected Close (AI):</span>
        <span class="font-mono font-bold text-blue-400 text-sm">
          {{ formatPrice(market.expected_close) }}
        </span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-400">Prediction Range (80%):</span>
        <span class="font-mono text-gray-300">
          {{ formatPrice(market.prediction_range.lower) }} - {{ formatPrice(market.prediction_range.upper) }}
        </span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-400">Stabilization Zone:</span>
        <span class="font-mono font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
          {{ formatPrice(market.stabilization_zone.stabilization_low) }} - {{ formatPrice(market.stabilization_zone.stabilization_high) }}
        </span>
      </div>
    </div>

    <!-- Card Bottom: Day Extremes & Confidence -->
    <div class="pt-3 border-t border-gray-800/60 flex items-center justify-between text-[11px] text-gray-400">
      <div class="flex items-center gap-3 font-mono">
        <span>O: {{ formatPrice(market.day_open) }}</span>
        <span>H: {{ formatPrice(market.day_high) }}</span>
        <span>L: {{ formatPrice(market.day_low) }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span>Conf:</span>
        <span class="font-mono font-bold text-gray-200">{{ Math.round(market.confidence * 100) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MarketSummary } from '../types/market';

defineProps<{
  market: MarketSummary;
  isSelected: boolean;
}>();

defineEmits(['select']);

function formatPrice(val: number): string {
  if (val === undefined || val === null) return '0.00';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
</script>

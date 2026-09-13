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
    <!-- Card Top: Symbol & Session Status -->
    <div class="flex items-start justify-between mb-3 gap-2">
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

      <span :class="['px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap border', statusClass]">
        <span :class="['w-1.5 h-1.5 rounded-full', statusDot]"></span>
        {{ STATUS_LABELS[status] }}
      </span>
    </div>

    <!-- Current Price & Change -->
    <div class="flex flex-wrap items-baseline justify-between gap-x-2 mb-3">
      <div class="text-2xl font-extrabold text-white font-mono tracking-tight">
        {{ formatPrice(market.current_price) }}
      </div>
      <div :class="['text-sm font-semibold font-mono flex items-center gap-1', market.change >= 0 ? 'text-emerald-400' : 'text-red-400']">
        <span>{{ market.change >= 0 ? '+' : '' }}{{ formatPrice(market.change) }}</span>
        <span>({{ market.change_percent >= 0 ? '+' : '' }}{{ market.change_percent.toFixed(2) }}%)</span>
      </div>
    </div>

    <div v-if="market.last_update" class="text-[10px] text-gray-500 -mt-2 mb-3">
      ข้อมูลล่าสุด {{ formatThaiDate(new Date(market.last_update)) }} {{ formatThaiTime(new Date(market.last_update)) }} น.
    </div>

    <!-- Session hours in Thai time -->
    <div class="text-[11px] text-gray-400 mb-3 space-y-1">
      <div class="flex items-center justify-between gap-2">
        <span class="whitespace-nowrap">เวลาไทย</span>
        <span class="font-mono text-gray-200 text-right">{{ sessionHours }}</span>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="whitespace-nowrap">
          {{ state.nextEvent.label }} {{ formatThaiTime(state.nextEvent.at) }}
          <span v-if="isDifferentThaiDay(state.nextEvent.at, now)" class="text-gray-500">({{ formatThaiDate(state.nextEvent.at) }})</span>
        </span>
        <span class="font-mono text-blue-400 whitespace-nowrap">อีก {{ formatCountdown(state.nextEvent.at.getTime() - now.getTime()) }}</span>
      </div>
    </div>

    <!-- Close Forecast -->
    <div
      :class="[
        'rounded-xl p-3 border space-y-2 mb-3',
        forecast?.locked ? 'bg-amber-500/5 border-amber-500/30' : 'bg-dark-900/80 border-gray-800/80'
      ]"
    >
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-400 whitespace-nowrap">
          คาดการณ์ราคาปิด
          <span v-if="forecast?.locked" class="text-amber-400 font-semibold">🔒</span>
        </span>
        <span :class="['font-mono font-bold text-sm', forecast?.locked ? 'text-amber-300' : 'text-blue-400']">
          {{ formatPrice(market.expected_close) }}
        </span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-400 whitespace-nowrap">ช่วง 80%</span>
        <span class="font-mono text-gray-300">
          {{ formatPrice(market.prediction_range.lower) }} - {{ formatPrice(market.prediction_range.upper) }}
        </span>
      </div>

      <div class="text-[10px]" :class="forecast?.locked ? 'text-amber-400' : 'text-gray-500'">
        {{ forecast?.locked
          ? `ล็อกค่าแล้วเมื่อ ${formatThaiTime(new Date(forecast.locked_at!))} (ก่อนปิด 30 นาที)`
          : 'ค่ายังปรับตามราคาจนถึงเวลาล็อก' }}
      </div>

      <template v-if="forecast?.actual_close != null">
        <div class="flex items-center justify-between text-xs pt-2 border-t border-gray-800">
          <span class="text-gray-400">ราคาปิดจริง</span>
          <span class="font-mono font-bold text-white">{{ formatPrice(forecast.actual_close) }}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">คลาดเคลื่อน</span>
          <span :class="['font-mono font-semibold', Math.abs(forecast.error_pct!) <= 0.2 ? 'text-emerald-400' : 'text-red-400']">
            {{ forecast.error! >= 0 ? '+' : '' }}{{ formatPrice(forecast.error!) }}
            ({{ forecast.error_pct! >= 0 ? '+' : '' }}{{ forecast.error_pct!.toFixed(2) }}%)
          </span>
        </div>
      </template>
    </div>

    <!-- Card Bottom: Day Extremes & Confidence -->
    <div class="pt-3 border-t border-gray-800/60 flex items-center justify-between text-[11px] text-gray-400">
      <div class="flex items-center gap-3 font-mono">
        <span>O: {{ formatPrice(market.day_open) }}</span>
        <span>H: {{ formatPrice(market.day_high) }}</span>
        <span>L: {{ formatPrice(market.day_low) }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span>ความมั่นใจ:</span>
        <span class="font-mono font-bold text-gray-200">{{ Math.round(market.confidence * 100) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MarketSummary } from '../types/market';
import {
  getSessionState,
  displayStatus,
  formatThaiTime,
  formatThaiDate,
  formatCountdown,
  isDifferentThaiDay,
  STATUS_LABELS,
} from '../utils/marketSessions';

const props = defineProps<{
  market: MarketSummary;
  isSelected: boolean;
  now: Date;
}>();

defineEmits(['select']);

const state = computed(() => getSessionState(props.market.symbol, props.now));
const status = computed(() => (props.market.market_status === 'HOLIDAY' ? 'HOLIDAY' : displayStatus(state.value, props.now)));
const forecast = computed(() => props.market.close_forecast);

// Hours of the upcoming session once the current one has closed
const sessionHours = computed(() => {
  const s = state.value.status === 'CLOSED' ? state.value.next : state.value.current;
  return s.segments.map((seg) => `${formatThaiTime(seg.open)}–${formatThaiTime(seg.close)}`).join(', ');
});

const statusClass = computed(() => ({
  OPEN: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  LOCKED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  LUNCH: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  PRE_OPEN: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  CLOSED: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
  HOLIDAY: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}[status.value]));

const statusDot = computed(() => ({
  OPEN: 'bg-emerald-400 animate-pulse',
  LOCKED: 'bg-amber-400 animate-pulse',
  LUNCH: 'bg-sky-300',
  PRE_OPEN: 'bg-indigo-300',
  CLOSED: 'bg-gray-400',
  HOLIDAY: 'bg-rose-300',
}[status.value]));

function formatPrice(val: number): string {
  if (val === undefined || val === null) return '0.00';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
</script>

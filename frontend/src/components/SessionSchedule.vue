<template>
  <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h2 class="text-sm font-bold text-white">ตารางเวลาตลาด (เวลาประเทศไทย)</h2>
      <span class="text-[11px] text-gray-500">
        ราคาคาดการณ์ราคาปิดจะล็อกก่อนปิดตลาด {{ LOCK_MINUTES_BEFORE_CLOSE }} นาที • ยังไม่รวมวันหยุดนักขัตฤกษ์ของแต่ละตลาด
      </span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-xs min-w-[640px]">
        <thead>
          <tr class="text-gray-500 text-left border-b border-gray-800">
            <th class="py-2 pr-3 font-medium">ตลาด</th>
            <th class="py-2 pr-3 font-medium">วันทำการ</th>
            <th class="py-2 pr-3 font-medium">ช่วงเช้า</th>
            <th class="py-2 pr-3 font-medium">ช่วงบ่าย</th>
            <th class="py-2 pr-3 font-medium text-amber-400">ล็อกคาดการณ์</th>
            <th class="py-2 pr-3 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.symbol"
            :class="['border-b border-gray-800/60 cursor-pointer hover:bg-dark-900/60', row.symbol === selectedSymbol ? 'bg-blue-600/5' : '']"
            @click="$emit('select', row.symbol)"
          >
            <td class="py-2 pr-3 font-mono font-bold text-gray-200">{{ row.symbol }}</td>
            <td class="py-2 pr-3 text-gray-400">{{ row.dateLabel }}</td>
            <td class="py-2 pr-3 font-mono text-gray-200">{{ row.morning }}</td>
            <td class="py-2 pr-3 font-mono text-gray-200">{{ row.afternoon }}</td>
            <td class="py-2 pr-3 font-mono font-semibold text-amber-300">{{ row.lock }}</td>
            <td class="py-2 pr-3">
              <span :class="['font-semibold', row.statusClass]">{{ row.statusLabel }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  getSessionState,
  displayStatus,
  formatThaiTime,
  formatThaiDate,
  STATUS_LABELS,
  LOCK_MINUTES_BEFORE_CLOSE,
} from '../utils/marketSessions';

const props = defineProps<{
  symbols: string[];
  selectedSymbol: string;
  now: Date;
  /** Status reported by the data source, e.g. HOLIDAY. */
  statusOverrides?: Record<string, string>;
}>();

defineEmits(['select']);

const STATUS_CLASS = {
  OPEN: 'text-emerald-400',
  LOCKED: 'text-amber-400',
  LUNCH: 'text-sky-300',
  PRE_OPEN: 'text-indigo-300',
  CLOSED: 'text-gray-400',
  HOLIDAY: 'text-rose-300',
};

const rows = computed(() =>
  props.symbols.map((symbol) => {
    const state = getSessionState(symbol, props.now);
    // Show today's session while it runs, otherwise the upcoming one
    const s = state.status === 'CLOSED' ? state.next : state.current;
    const seg = s.segments.map((x) => `${formatThaiTime(x.open)}–${formatThaiTime(x.close)}`);
    const status = props.statusOverrides?.[symbol] === 'HOLIDAY' ? 'HOLIDAY' : displayStatus(state, props.now);
    return {
      symbol,
      dateLabel: formatThaiDate(s.open),
      // Single-session markets (NYSE) have no lunch break
      morning: seg.length > 1 ? seg[0] : `${formatThaiTime(s.open)}–${formatThaiTime(s.close)}`,
      afternoon: seg.length > 1 ? seg[1] : 'ไม่มีพักกลางวัน',
      lock: formatThaiTime(s.lockAt),
      statusLabel: STATUS_LABELS[status],
      statusClass: STATUS_CLASS[status],
    };
  }),
);
</script>

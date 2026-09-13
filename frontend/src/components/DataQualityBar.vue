<template>
  <div class="bg-dark-800 border-b border-gray-800 px-4 py-2 text-xs text-gray-400">
    <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2">
      <div class="flex items-center space-x-6 flex-wrap gap-y-1">
        <div class="flex items-center space-x-2">
          <span class="text-gray-500">เวลาไทย:</span>
          <span class="text-gray-100 font-mono font-semibold">{{ thaiClock }}</span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-gray-500">แหล่งข้อมูล:</span>
          <span v-if="source === 'backend'" class="inline-flex items-center gap-1 text-emerald-400 font-medium">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Backend (Live)
          </span>
          <span v-else-if="source === 'real'" class="inline-flex items-center gap-1 text-emerald-400 font-medium">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> ราคาจริง (Yahoo Finance, อัปเดตทุก 30 วินาที)
          </span>
          <span v-else class="inline-flex items-center gap-1 text-amber-400 font-medium">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> ข้อมูลจำลอง (Demo)
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-gray-500">ตลาดที่เปิดอยู่:</span>
          <span class="font-mono text-gray-200">{{ openCount }} / {{ symbols.length }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getSessionState, THAI_TZ } from '../utils/marketSessions';
import type { DataSource } from '../api/client';

const props = defineProps<{
  source: DataSource;
  symbols: string[];
  now: Date;
}>();

const clockFmt = new Intl.DateTimeFormat('th-TH', {
  timeZone: THAI_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const thaiClock = computed(() => clockFmt.format(props.now));

const openCount = computed(
  () => props.symbols.filter((s) => ['OPEN', 'LOCKED'].includes(getSessionState(s, props.now).status)).length,
);
</script>

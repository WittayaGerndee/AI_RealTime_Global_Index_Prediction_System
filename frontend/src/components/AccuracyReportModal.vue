<template>
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-dark-800 border border-gray-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh] relative">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-gray-800 pb-4 mb-5">
        <div>
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>Accuracy & Validation Audit Report</span>
            <span class="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
              {{ symbol }}
            </span>
          </h2>
          <p class="text-xs text-gray-400">Strict empirical evaluation against realized market prices (Section 2 & 21)</p>
        </div>
        <button @click="$emit('close')" class="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <!-- Core Metrics Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div class="bg-dark-900/80 p-3 rounded-xl border border-gray-800">
          <div class="text-[11px] text-gray-400 mb-1">Direction Accuracy</div>
          <div class="text-xl font-bold font-mono text-emerald-400">{{ report.direction_accuracy }}%</div>
        </div>
        <div class="bg-dark-900/80 p-3 rounded-xl border border-gray-800">
          <div class="text-[11px] text-gray-400 mb-1">Range Coverage</div>
          <div class="text-xl font-bold font-mono text-blue-400">{{ report.range_coverage }}%</div>
        </div>
        <div class="bg-dark-900/80 p-3 rounded-xl border border-gray-800">
          <div class="text-[11px] text-gray-400 mb-1">Stabilization Hit Rate</div>
          <div class="text-xl font-bold font-mono text-amber-400">{{ report.stabilization_hit_rate }}%</div>
        </div>
        <div class="bg-dark-900/80 p-3 rounded-xl border border-gray-800">
          <div class="text-[11px] text-gray-400 mb-1">MAE (Error)</div>
          <div class="text-xl font-bold font-mono text-gray-200">{{ report.mae }}</div>
        </div>
      </div>

      <!-- Per-segment walk-forward results -->
      <div v-if="report.segments?.length" class="bg-dark-900 rounded-xl border border-gray-800 p-4 mb-5 overflow-x-auto">
        <h4 class="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">คาดการณ์ราคาปิด ณ เวลาล็อก (ทดสอบย้อนหลังแบบ walk-forward)</h4>
        <p class="text-[11px] text-gray-500 mb-3">แต่ละวันถูกคาดการณ์จากข้อมูลวันก่อนหน้าเท่านั้น • "ใช้ราคาล่าสุด" คือความคลาดเคลื่อนหากเดาว่าราคาปิด = ราคา ณ เวลาล็อก</p>
        <table class="w-full text-xs min-w-[520px]">
          <thead>
            <tr class="text-gray-500 text-left border-b border-gray-800">
              <th class="py-1.5 pr-2 font-medium">ช่วง</th>
              <th class="py-1.5 pr-2 font-medium">ล็อก</th>
              <th class="py-1.5 pr-2 font-medium">วัน</th>
              <th class="py-1.5 pr-2 font-medium">โมเดล</th>
              <th class="py-1.5 pr-2 font-medium">คลาดเฉลี่ย</th>
              <th class="py-1.5 pr-2 font-medium">ใช้ราคาล่าสุด</th>
              <th class="py-1.5 pr-2 font-medium">≤0.10%</th>
              <th class="py-1.5 pr-2 font-medium">อยู่ในช่วง 80%</th>
            </tr>
          </thead>
          <tbody class="font-mono">
            <tr v-for="seg in report.segments" :key="seg.label" class="border-b border-gray-800/60">
              <td class="py-1.5 pr-2 font-sans text-gray-200">{{ seg.label }}</td>
              <td class="py-1.5 pr-2 text-amber-300">{{ seg.lock_time_th }}</td>
              <td class="py-1.5 pr-2 text-gray-300">{{ seg.total }}</td>
              <td class="py-1.5 pr-2 font-sans text-gray-300">{{ seg.model === 'ridge' ? 'Ridge' : 'Random walk' }}</td>
              <td class="py-1.5 pr-2 text-gray-100">{{ seg.mae }} ({{ seg.mae_pct.toFixed(2) }}%)</td>
              <td class="py-1.5 pr-2 text-gray-400">{{ seg.baseline_mae }}</td>
              <td class="py-1.5 pr-2 text-emerald-400">{{ seg.within_0_10_pct }}%</td>
              <td class="py-1.5 pr-2 text-blue-400">{{ seg.range_coverage }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Multi-Tolerance Table (Section 21) -->
      <div class="bg-dark-900 rounded-xl border border-gray-800 p-4 mb-5">
        <h4 class="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">
          Tolerance-Level Precision (Actual vs Predicted)
        </h4>
        <div class="space-y-2.5 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-gray-400">Exact Match (within tick size):</span>
            <span class="font-mono font-bold text-gray-200">{{ report.tolerances.exact_match }}%</span>
          </div>
          <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div class="bg-emerald-400 h-full" :style="`width: ${report.tolerances.exact_match}%`"></div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <span class="text-gray-400">Within 0.05% error band:</span>
            <span class="font-mono font-bold text-emerald-400">{{ report.tolerances.within_0_05_pct }}%</span>
          </div>
          <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div class="bg-emerald-400 h-full" :style="`width: ${report.tolerances.within_0_05_pct}%`"></div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <span class="text-gray-400">Within 0.10% error band:</span>
            <span class="font-mono font-bold text-blue-400">{{ report.tolerances.within_0_10_pct }}%</span>
          </div>
          <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div class="bg-blue-400 h-full" :style="`width: ${report.tolerances.within_0_10_pct}%`"></div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <span class="text-gray-400">Within 0.20% error band:</span>
            <span class="font-mono font-bold text-indigo-400">{{ report.tolerances.within_0_20_pct }}%</span>
          </div>
          <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div class="bg-indigo-400 h-full" :style="`width: ${report.tolerances.within_0_20_pct}%`"></div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <span class="text-gray-400">Within 0.30% error band:</span>
            <span class="font-mono font-bold text-purple-400">{{ report.tolerances.within_0_30_pct }}%</span>
          </div>
          <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div class="bg-purple-400 h-full" :style="`width: ${report.tolerances.within_0_30_pct}%`"></div>
          </div>
        </div>
      </div>

      <!-- Footer / Disclaimer -->
      <div class="flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-gray-800">
        <span>Evaluated Predictions: <strong class="text-gray-300">{{ report.total_predictions }}</strong></span>
        <span>Zero Future-Leakage • Walk-Forward Calibrated</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AccuracyReport } from '../types/market';

defineProps<{
  symbol: string;
  report: AccuracyReport;
}>();

defineEmits(['close']);
</script>

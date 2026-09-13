<template>
  <div class="space-y-6">
    <!-- Warning -->
    <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100 space-y-1">
      <div class="font-bold text-rose-300">⚠️ สถิติย้อนหลังใช้ทำนายผลหวยไม่ได้</div>
      <p class="text-xs leading-relaxed text-rose-100/90">
        ผลหวยแต่ละงวดสุ่มแยกจากกัน เลขที่ "ออกบ่อย" ในอดีตไม่ได้มีโอกาสออกมากขึ้นในงวดหน้า หน้านี้แสดงข้อมูลเชิงสถิติ
        พร้อมผลทดสอบย้อนหลังให้เห็นว่าการเลือกเลขจากความถี่ได้ผลจริงแค่ไหน • การซื้อหวยลาวผ่านเจ้ามือในประเทศไทยผิดกฎหมาย
      </p>
    </div>

    <div v-if="error" class="rounded-2xl border border-gray-800 bg-dark-800 p-6 text-sm text-gray-400">
      โหลดข้อมูลไม่สำเร็จ: {{ error }}
    </div>
    <div v-else-if="!dataset" class="rounded-2xl border border-gray-800 bg-dark-800 p-6 text-sm text-gray-400">กำลังโหลดผลหวยย้อนหลัง...</div>

    <template v-else>
      <!-- Most frequent numbers for the next draw's weekday -->
      <div class="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-base font-bold text-white">
            เลขที่ออกบ่อยของวัน{{ WEEKDAY_LABELS[nextDraw.weekday] }} <span class="text-amber-300">(สถิติ {{ years }} ปี)</span>
          </h2>
          <span class="text-xs text-gray-400">
            งวด {{ thaiDate(nextDraw.date, true) }} • จาก {{ nextDrawDraws.length }} งวดวัน{{ WEEKDAY_LABELS[nextDraw.weekday] }}ในอดีต
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div v-for="group in nextDrawGroups" :key="group.label" class="rounded-xl border border-gray-800 bg-dark-900 p-4 space-y-3">
            <div class="text-xs text-gray-400">{{ group.label }}</div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="t in group.top"
                :key="t.number"
                class="rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-2 text-center min-w-[64px]"
              >
                <div class="font-mono font-bold text-2xl text-amber-300 tracking-wider">{{ t.number }}</div>
                <div class="text-[10px] text-gray-400">{{ t.count }} ครั้ง</div>
              </div>
              <div v-if="!group.top.length" class="text-xs text-gray-500">ยังไม่มีข้อมูลของวันนี้</div>
            </div>
            <div class="text-[11px] text-gray-400">
              ทดสอบย้อนหลัง {{ group.backtest.trials }} งวด: ถ้าเลือก {{ group.backtest.picks }} เลขที่ออกบ่อยสุดของวันนั้นทุกงวด
              ถูกจริง <span class="font-mono text-amber-300">{{ group.backtest.hitRate.toFixed(1) }}%</span> •
              เลือกเลขมั่ว ๆ ถูก <span class="font-mono text-gray-200">{{ group.backtest.expectedRate.toFixed(1) }}%</span>
              <span :class="group.backtest.pValue < 0.05 ? 'text-rose-300' : 'text-emerald-400'">
                ({{ group.backtest.pValue < 0.05 ? 'ต่างจากสุ่ม' : 'ไม่ต่างจากการสุ่ม' }})
              </span>
            </div>
          </div>
        </div>

        <p class="text-[11px] text-gray-400">
          นี่คือเลขที่เคยออกบ่อยในอดีต ไม่ใช่เลขที่มีโอกาสออกมากกว่าเลขอื่น — ตามผลทดสอบย้อนหลัง
          การเลือกเลขเหล่านี้มีโอกาสถูกไม่ต่างจากการเลือกเลขใดก็ได้
        </p>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-dark-800 rounded-2xl border border-gray-800 p-4">
          <div class="text-[11px] text-gray-500">จำนวนงวดในช่วงที่เลือก</div>
          <div class="text-2xl font-bold font-mono text-white">{{ periodDraws.length.toLocaleString() }}</div>
          <div class="text-[11px] text-gray-500">{{ thaiDate(periodDraws[0]?.date) }} – {{ thaiDate(latest?.date) }}</div>
        </div>
        <div class="bg-dark-800 rounded-2xl border border-gray-800 p-4">
          <div class="text-[11px] text-gray-500">ผลล่าสุด • {{ thaiDate(latest?.date, true) }}</div>
          <div class="text-2xl font-bold font-mono text-amber-300 tracking-widest">{{ latest?.last4 }}</div>
          <div class="text-[11px] text-gray-400">3 ตัว {{ latest && last3(latest) }} • 2 ตัว {{ latest && last2(latest) }} • {{ latest?.animal }}</div>
        </div>
        <div class="bg-dark-800 rounded-2xl border border-gray-800 p-4">
          <div class="text-[11px] text-gray-500">ช่วงข้อมูล</div>
          <div class="flex gap-1.5 mt-1">
            <button
              v-for="p in PERIODS"
              :key="p.years"
              @click="years = p.years"
              :class="['px-2.5 py-1 rounded-lg text-xs font-semibold border', years === p.years ? 'bg-blue-600 border-blue-500 text-white' : 'bg-dark-900 border-gray-700 text-gray-300']"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        <div class="bg-dark-800 rounded-2xl border border-gray-800 p-4">
          <div class="text-[11px] text-gray-500">แหล่งข้อมูล</div>
          <a :href="dataset.source" target="_blank" rel="noopener" class="text-sm text-blue-400 hover:underline">Sanook ตรวจหวยลาว</a>
          <div class="text-[11px] text-gray-500">
            {{ dataset.fetchedLive ? `+${dataset.fetchedLive} งวดใหม่ดึงอัตโนมัติ` : 'ข้อมูลเป็นปัจจุบัน' }}
          </div>
        </div>
      </div>

      <!-- Weekday selector -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-gray-400">วันออกผล:</span>
        <button
          v-for="opt in weekdayOptions"
          :key="opt.value"
          @click="weekday = opt.value"
          :class="['px-3 py-1.5 rounded-lg text-xs font-semibold border', weekday === opt.value ? 'bg-amber-500 border-amber-400 text-dark-900' : 'bg-dark-800 border-gray-700 text-gray-300 hover:bg-dark-700']"
        >
          {{ opt.label }} <span class="font-mono opacity-70">({{ opt.count }})</span>
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Top numbers -->
        <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 space-y-3">
          <h3 class="text-sm font-bold text-white">เลขท้าย 2 ตัวที่ออกบ่อยที่สุด • {{ weekdayLabel }}</h3>
          <p class="text-[11px] text-gray-500">
            {{ selectedDraws.length }} งวด • ถ้าสุ่มจริง แต่ละเลขควรออกราว {{ (selectedDraws.length / 100).toFixed(1) }} ครั้ง
          </p>
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-500 text-left border-b border-gray-800">
                <th class="py-1.5 pr-3">อันดับ</th>
                <th class="py-1.5 pr-3">เลข</th>
                <th class="py-1.5 pr-3 text-right">ครั้ง</th>
                <th class="py-1.5 pr-3 text-right">%</th>
              </tr>
            </thead>
            <tbody class="font-mono">
              <tr v-for="(t, i) in top2" :key="t.number" class="border-b border-gray-800/60">
                <td class="py-1.5 pr-3 text-gray-500">{{ i + 1 }}</td>
                <td class="py-1.5 pr-3 text-amber-300 font-bold text-sm">{{ t.number }}</td>
                <td class="py-1.5 pr-3 text-right text-gray-200">{{ t.count }}</td>
                <td class="py-1.5 pr-3 text-right text-gray-400">{{ t.pct.toFixed(1) }}</td>
              </tr>
            </tbody>
          </table>
          <TestBadge :result="uniformity2" hypothesis="เลข 00–99 ออกเท่า ๆ กัน" />
        </div>

        <!-- Heatmap -->
        <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 space-y-3 lg:col-span-2">
          <h3 class="text-sm font-bold text-white">ตารางความถี่เลข 00–99 • {{ weekdayLabel }}</h3>
          <p class="text-[11px] text-gray-500">สีเข้ม = ออกบ่อย • แถว = หลักสิบ, คอลัมน์ = หลักหน่วย</p>
          <div class="overflow-x-auto">
            <div class="grid gap-1 min-w-[460px]" style="grid-template-columns: repeat(10, minmax(0, 1fr))">
              <div
                v-for="(c, i) in counts2"
                :key="i"
                class="rounded text-center py-1.5 font-mono text-[11px]"
                :style="{ background: `rgba(245, 158, 11, ${maxCount2 ? 0.08 + 0.72 * (c / maxCount2) : 0.08})` }"
                :title="`${String(i).padStart(2, '0')}: ${c} ครั้ง`"
              >
                <div class="text-gray-100">{{ String(i).padStart(2, '0') }}</div>
                <div class="text-[9px] text-gray-300">{{ c }}</div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div v-for="pos in DIGIT_POSITIONS" :key="pos.index" class="space-y-1.5">
              <div class="text-xs text-gray-300 font-semibold">{{ pos.label }}</div>
              <div v-for="(c, digit) in digitCounts[pos.index]" :key="digit" class="flex items-center gap-2 text-[11px] font-mono">
                <span class="w-3 text-gray-400">{{ digit }}</span>
                <div class="flex-1 bg-dark-900 h-2 rounded-full overflow-hidden">
                  <div class="bg-amber-500/80 h-full" :style="{ width: `${maxDigit(pos.index) ? (c / maxDigit(pos.index)) * 100 : 0}%` }"></div>
                </div>
                <span class="w-14 text-right text-gray-400">{{ c }} ({{ selectedDraws.length ? ((c / selectedDraws.length) * 100).toFixed(1) : 0 }}%)</span>
              </div>
              <TestBadge :result="uniformityTest(digitCounts[pos.index])" :hypothesis="`${pos.label} 0–9 ออกเท่า ๆ กัน`" />
            </div>
          </div>
        </div>
      </div>

      <!-- Weekday effect -->
      <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 space-y-3">
        <h3 class="text-sm font-bold text-white">วันในสัปดาห์มีผลต่อเลขที่ออกหรือไม่</h3>
        <p class="text-[11px] text-gray-500">
          ทดสอบ chi-square ว่าการกระจายของเลขท้ายตัวสุดท้ายแตกต่างกันระหว่างวันจริง หรือเป็นแค่ความบังเอิญ
        </p>
        <TestBadge :result="weekdayEffect" hypothesis="เลขที่ออกไม่ขึ้นกับวันในสัปดาห์" />
        <div class="overflow-x-auto">
          <table class="w-full text-xs min-w-[520px]">
            <thead>
              <tr class="text-gray-500 text-left border-b border-gray-800">
                <th class="py-1.5 pr-3">วัน</th>
                <th class="py-1.5 pr-3 text-right">งวด</th>
                <th class="py-1.5 pr-3">เลข 2 ตัวที่ออกบ่อยสุด</th>
                <th class="py-1.5 pr-3 text-right">p-value (00–99 เท่ากัน)</th>
                <th class="py-1.5 pr-3">สรุป</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in weekdayRows" :key="row.weekday" class="border-b border-gray-800/60">
                <td class="py-1.5 pr-3 text-gray-200">{{ row.label }}</td>
                <td class="py-1.5 pr-3 text-right font-mono text-gray-300">{{ row.count }}</td>
                <td class="py-1.5 pr-3 font-mono text-amber-300">{{ row.top }}</td>
                <td class="py-1.5 pr-3 text-right font-mono text-gray-300">{{ row.test.pValue.toFixed(3) }}</td>
                <td :class="['py-1.5', row.test.consistent ? 'text-emerald-400' : 'text-rose-300']">
                  {{ row.test.consistent ? 'สอดคล้องกับการสุ่ม' : 'ต่างจากการสุ่ม' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Backtest -->
      <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 space-y-3">
        <h3 class="text-sm font-bold text-white">ทดสอบย้อนหลัง: ถ้าเลือกเลขที่ออกบ่อยที่สุดของวันนั้น จะถูกกี่ครั้ง</h3>
        <p class="text-[11px] text-gray-500">
          ก่อนแต่ละงวด เลือกเลขที่ออกบ่อยที่สุดจากงวดก่อนหน้าที่ตรงวันเดียวกัน (ใช้เฉพาะข้อมูลในอดีต) แล้วดูว่าถูกจริงกี่ครั้ง เทียบกับการเลือกเลขแบบสุ่ม
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs min-w-[640px]">
            <thead>
              <tr class="text-gray-500 text-left border-b border-gray-800">
                <th class="py-1.5 pr-3">วิธีเลือก</th>
                <th class="py-1.5 pr-3 text-right">งวดที่ทดสอบ</th>
                <th class="py-1.5 pr-3 text-right">ถูก</th>
                <th class="py-1.5 pr-3 text-right">อัตราถูกจริง</th>
                <th class="py-1.5 pr-3 text-right">ถ้าเลือกสุ่ม</th>
                <th class="py-1.5 pr-3">สรุป</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in backtests" :key="s.label" class="border-b border-gray-800/60">
                <td class="py-1.5 pr-3 text-gray-200">{{ s.label }}</td>
                <td class="py-1.5 pr-3 text-right font-mono text-gray-300">{{ s.trials }}</td>
                <td class="py-1.5 pr-3 text-right font-mono text-gray-300">{{ s.hits }}</td>
                <td class="py-1.5 pr-3 text-right font-mono text-amber-300">{{ s.hitRate.toFixed(1) }}%</td>
                <td class="py-1.5 pr-3 text-right font-mono text-gray-400">{{ s.expectedRate.toFixed(1) }}%</td>
                <td :class="['py-1.5', s.pValue < 0.05 ? 'text-rose-300' : 'text-emerald-400']">
                  {{ s.pValue < 0.05 ? (s.hitRate > s.expectedRate ? 'ดีกว่าสุ่ม (p<0.05)' : 'แย่กว่าสุ่ม (p<0.05)') : 'ไม่ต่างจากการสุ่ม' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="text-[11px] text-gray-500">
          หมายเหตุ: หน้านี้ทดสอบทางสถิติหลายสิบรายการพร้อมกัน ถึงผลจะสุ่มจริง ก็คาดได้ว่าราว 1 ใน 20 รายการจะได้ p &lt; 0.05 โดยบังเอิญ
          ผลที่ "ต่างจากการสุ่ม" เพียงรายการเดียวจึงยังไม่ใช่หลักฐานว่ามีรูปแบบจริง
        </p>

      </div>

      <!-- Results table -->
      <div class="bg-dark-800 rounded-2xl border border-gray-800 p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-white">ผลหวยลาวพัฒนาย้อนหลัง • {{ weekdayLabel }}</h3>
          <button @click="showAll = !showAll" class="text-xs text-blue-400 hover:underline">
            {{ showAll ? 'แสดง 30 งวดล่าสุด' : `แสดงทั้งหมด (${selectedDraws.length})` }}
          </button>
        </div>
        <div class="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table class="w-full text-xs min-w-[480px]">
            <thead class="sticky top-0 bg-dark-800">
              <tr class="text-gray-500 text-left border-b border-gray-800">
                <th class="py-1.5 pr-3">วันที่</th>
                <th class="py-1.5 pr-3">วัน</th>
                <th class="py-1.5 pr-3">เลข 4 ตัว</th>
                <th class="py-1.5 pr-3">3 ตัว</th>
                <th class="py-1.5 pr-3">2 ตัว</th>
                <th class="py-1.5 pr-3">นามสัตว์</th>
              </tr>
            </thead>
            <tbody class="font-mono">
              <tr v-for="d in tableDraws" :key="d.date" class="border-b border-gray-800/60">
                <td class="py-1.5 pr-3 text-gray-300">{{ thaiDate(d.date) }}</td>
                <td class="py-1.5 pr-3 font-sans text-gray-400">{{ WEEKDAY_LABELS[weekdayOf(d.date)] }}</td>
                <td class="py-1.5 pr-3 text-white tracking-wider">{{ d.last4 }}</td>
                <td class="py-1.5 pr-3 text-gray-200">{{ last3(d) }}</td>
                <td class="py-1.5 pr-3 text-amber-300 font-bold">{{ last2(d) }}</td>
                <td class="py-1.5 pr-3 font-sans text-gray-400">{{ d.animal }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineComponent, h, PropType } from 'vue';
import { loadLaoDataset, LaoDataset } from '../api/laoLotteryData';
import {
  LaoDraw,
  WEEKDAY_LABELS,
  weekdayOf,
  last2,
  last3,
  countTwoDigit,
  countThreeDigit,
  countDigits,
  topNumbers,
  uniformityTest,
  independenceTest,
  backtestHotNumbers,
  ChiSquareResult,
} from '../utils/laoLotteryStats';

const PERIODS = [
  { years: 1, label: '1 ปี' },
  { years: 3, label: '3 ปี' },
  { years: 5, label: '5 ปี' },
];
const DIGIT_POSITIONS = [
  { index: 2, label: 'หลักสิบ (เลข 2 ตัว)' },
  { index: 3, label: 'หลักหน่วย (เลข 2 ตัว)' },
];
const ALL = -1;

/** Chi-square outcome in plain Thai. */
const TestBadge = defineComponent({
  props: {
    result: { type: Object as PropType<ChiSquareResult>, required: true },
    hypothesis: { type: String, required: true },
  },
  setup(props) {
    return () =>
      h('div', { class: ['rounded-lg border px-3 py-2 text-[11px]', props.result.consistent ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'] }, [
        h('span', { class: props.result.consistent ? 'text-emerald-400 font-semibold' : 'text-rose-300 font-semibold' },
          props.result.consistent ? 'สอดคล้องกับการสุ่ม' : 'ต่างจากการสุ่มอย่างมีนัยสำคัญ'),
        h('span', { class: 'text-gray-400' }, ` • สมมติฐาน: ${props.hypothesis} • χ²=${props.result.statistic}, df=${props.result.df}, p=${props.result.pValue.toFixed(3)}`),
      ]);
  },
});

const dataset = ref<LaoDataset | null>(null);
const error = ref('');
const years = ref(5);
const weekday = ref(ALL);
const showAll = ref(false);

onMounted(async () => {
  try {
    dataset.value = await loadLaoDataset();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

const latest = computed(() => dataset.value?.draws[dataset.value.draws.length - 1]);

const periodDraws = computed<LaoDraw[]>(() => {
  const all = dataset.value?.draws ?? [];
  if (!all.length) return [];
  const [y, m, d] = all[all.length - 1].date.split('-').map(Number);
  const from = new Date(Date.UTC(y - years.value, m - 1, d)).toISOString().slice(0, 10);
  return all.filter((x) => x.date > from);
});

const weekdayOptions = computed(() => {
  const counts = new Map<number, number>();
  for (const d of periodDraws.value) counts.set(weekdayOf(d.date), (counts.get(weekdayOf(d.date)) ?? 0) + 1);
  return [
    { value: ALL, label: 'ทุกวัน', count: periodDraws.value.length },
    ...[...counts.entries()].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, label: WEEKDAY_LABELS[value], count })),
  ];
});

const weekdayLabel = computed(() => (weekday.value === ALL ? 'ทุกวัน' : `วัน${WEEKDAY_LABELS[weekday.value]}`));
const selectedDraws = computed(() => (weekday.value === ALL ? periodDraws.value : periodDraws.value.filter((d) => weekdayOf(d.date) === weekday.value)));

const counts2 = computed(() => countTwoDigit(selectedDraws.value));
const maxCount2 = computed(() => Math.max(0, ...counts2.value));
const top2 = computed(() => topNumbers(counts2.value, 10));
const uniformity2 = computed(() => uniformityTest(counts2.value));
const digitCounts = computed(() => ({ 2: countDigits(selectedDraws.value, 2), 3: countDigits(selectedDraws.value, 3) }) as Record<number, number[]>);
const maxDigit = (pos: number) => Math.max(0, ...digitCounts.value[pos]);

const weekdayRows = computed(() =>
  weekdayOptions.value
    .filter((o) => o.value !== ALL)
    .map((o) => {
      const draws = periodDraws.value.filter((d) => weekdayOf(d.date) === o.value);
      const counts = countTwoDigit(draws);
      return {
        weekday: o.value,
        label: o.label,
        count: draws.length,
        top: topNumbers(counts, 3).map((t) => `${t.number} (${t.count})`).join(', '),
        test: uniformityTest(counts),
      };
    }),
);

const weekdayEffect = computed(() => {
  const days = weekdayOptions.value.filter((o) => o.value !== ALL).map((o) => o.value);
  return independenceTest(days.map((wd) => countDigits(periodDraws.value.filter((d) => weekdayOf(d.date) === wd), 3)));
});

const backtests = computed(() => {
  const draws = periodDraws.value;
  return [
    backtestHotNumbers(draws, last2, 100, 1, 'เลข 2 ตัว • เลือก 1 เลขที่ออกบ่อยสุด'),
    backtestHotNumbers(draws, last2, 100, 5, 'เลข 2 ตัว • เลือก 5 เลขที่ออกบ่อยสุด'),
    backtestHotNumbers(draws, last2, 100, 10, 'เลข 2 ตัว • เลือก 10 เลขที่ออกบ่อยสุด'),
    backtestHotNumbers(draws, last3, 1000, 5, 'เลข 3 ตัว • เลือก 5 เลขที่ออกบ่อยสุด'),
    backtestHotNumbers(draws, (d) => d.last4[3], 10, 1, 'เลขท้ายตัวเดียว • เลือกตัวที่ออกบ่อยสุด'),
  ];
});

/** Next weekday on which a draw has been published recently. */
const nextDraw = computed(() => {
  const draws = dataset.value?.draws ?? [];
  const recentDays = new Set(draws.slice(-20).map((d) => weekdayOf(d.date)));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  let date = latest.value && latest.value.date >= today ? addDays(latest.value.date, 1) : today;
  for (let i = 0; i < 14 && !recentDays.has(weekdayOf(date)); i++) date = addDays(date, 1);
  return { date, weekday: weekdayOf(date) };
});

const nextDrawDraws = computed(() => periodDraws.value.filter((d) => weekdayOf(d.date) === nextDraw.value.weekday));

const nextDrawGroups = computed(() => [
  { label: 'เลขท้าย 2 ตัว', top: topNumbers(countTwoDigit(nextDrawDraws.value), 5).filter((t) => t.count > 0), backtest: backtests.value[1] },
  { label: 'เลขท้าย 3 ตัว', top: topNumbers(countThreeDigit(nextDrawDraws.value), 5, 3).filter((t) => t.count > 0), backtest: backtests.value[3] },
]);

const tableDraws = computed(() => {
  const rows = [...selectedDraws.value].reverse();
  return showAll.value ? rows : rows.slice(0, 30);
});

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function thaiDate(date?: string, withWeekday = false): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    ...(withWeekday ? { weekday: 'short' } : {}),
  }).format(new Date(`${date}T00:00:00Z`));
}
</script>

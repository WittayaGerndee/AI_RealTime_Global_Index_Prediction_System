<template>
  <div class="bg-dark-800 border-b border-gray-800 px-4 py-2 text-xs text-gray-400">
    <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2">
      <div class="flex items-center space-x-6 flex-wrap gap-y-1">
        <div class="flex items-center space-x-2">
          <span class="text-gray-500">Provider:</span>
          <span class="text-gray-200 font-mono font-medium">Twelve Data / Replay</span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-gray-500">WebSocket:</span>
          <span class="inline-flex items-center gap-1 text-emerald-400 font-medium">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> CONNECTED
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-gray-500">Feed Latency:</span>
          <span class="font-mono text-gray-200">~8 ms</span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-gray-500">Market Sessions:</span>
          <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">ACTIVE</span>
        </div>
      </div>

      <div class="flex items-center space-x-4">
        <div class="flex items-center space-x-1.5">
          <span class="text-gray-500">Quant Calibration:</span>
          <span class="text-indigo-400 font-mono font-semibold">Bayesian Online</span>
        </div>
        <div class="flex items-center space-x-1.5">
          <span class="text-gray-500">Data Integrity:</span>
          <span class="text-cyan-400 font-mono font-semibold">Strict No-Leakage</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

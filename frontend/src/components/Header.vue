<template>
  <header class="border-b border-gray-800 bg-dark-800/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-500/20">
          AI
        </div>
        <div>
          <h1 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            AI Real-Time Global Index Prediction
            <span class="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">v1.0</span>
          </h1>
          <p class="text-xs text-gray-400">High-Precision Probabilistic Quant Forecast Engine</p>
        </div>
      </div>

      <div class="flex items-center space-x-4">
        <!-- Cloudflare & Host Badge -->
        <div class="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-gray-900/80 border border-gray-700 text-xs">
          <span class="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></span>
          <span class="text-gray-300">Cloudflare Pages + GitHub</span>
        </div>

        <!-- Connection Status -->
        <div class="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span class="font-medium">Live Stream</span>
        </div>

        <button
          @click="$emit('open-accuracy')"
          class="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition shadow-sm shadow-indigo-600/30 flex items-center gap-1.5"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          Accuracy Audit
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
defineEmits(['open-accuracy']);
</script>

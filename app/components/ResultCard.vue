<script setup lang="ts">
import type { AnalyzeOutput } from "~/shared/types";
defineProps<{ result: AnalyzeOutput }>();
</script>

<template>
  <div class="rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4">
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold uppercase tracking-wider text-emerald-400">Analysis Complete</span>
      <span class="text-xs text-slate-500">{{ result.latencyMs.toLocaleString() }} ms</span>
    </div>

    <p class="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{{ result.answer }}</p>

    <div v-if="result.sources?.length" class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Sources</p>
      <ul class="space-y-1">
        <li v-for="(s, i) in result.sources" :key="i">
          <a :href="s.url" target="_blank" rel="noopener"
            class="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 truncate transition-colors">
            <span class="shrink-0 text-slate-600">[{{ i + 1 }}]</span>
            <span class="truncate">{{ s.title || s.url }}</span>
          </a>
        </li>
      </ul>
    </div>
  </div>
</template>

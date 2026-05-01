<script setup lang="ts">
const route = useRoute();
const batchId = route.params.id as string;
const { status, error } = useBatchPolling(batchId);

const selected = ref<any>(null);

const progress = computed(() => {
  if (!status.value) return 0;
  return Math.round(((status.value.doneRows + status.value.failedRows) / status.value.totalRows) * 100);
});

const statusColor: Record<string, string> = {
  running: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
  completed: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  failed: "text-red-400 bg-red-500/10 border-red-500/30",
  cancelled: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

function openResult(a: any) {
  if (a.status !== "done" && a.status !== "failed") return;
  selected.value = a;
}

function parseSources(raw: string | null): { url: string; title: string }[] {
  try { return JSON.parse(raw ?? "[]"); } catch { return []; }
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-12 space-y-8">

    <!-- Back + Header -->
    <div class="flex items-center gap-4">
      <NuxtLink to="/"
        class="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
        <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </NuxtLink>
      <div class="flex-1">
        <div class="flex items-center gap-3">
          <h1 class="text-lg font-bold">Batch Analysis</h1>
          <span v-if="status"
            :class="['text-xs font-semibold px-2.5 py-1 rounded-full border capitalize', statusColor[status.status]]">
            {{ status.status }}
          </span>
        </div>
        <p class="text-xs text-slate-500 font-mono mt-0.5">{{ batchId }}</p>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="!status && !error" class="space-y-4 animate-pulse">
      <div class="h-4 w-1/3 rounded bg-slate-800" />
      <div class="h-2 w-full rounded-full bg-slate-800" />
      <div class="h-32 rounded-xl bg-slate-900" />
    </div>

    <!-- Error -->
    <div v-if="error"
      class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {{ error }}
    </div>

    <template v-if="status">
      <!-- Progress -->
      <div class="rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4">
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-300 font-medium">
            {{ status.doneRows + status.failedRows }} / {{ status.totalRows }} processed
          </span>
          <span class="text-slate-500 tabular-nums">{{ progress }}%</span>
        </div>
        <div class="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="status.status === 'completed' ? 'bg-emerald-500' : status.status === 'failed' ? 'bg-red-500' : 'bg-indigo-500'"
            :style="`width: ${progress}%`"
          />
        </div>
        <div class="flex gap-6 text-xs text-slate-500">
          <span><span class="text-emerald-400 font-semibold">{{ status.doneRows }}</span> succeeded</span>
          <span><span class="text-red-400 font-semibold">{{ status.failedRows }}</span> failed</span>
          <span><span class="text-slate-300 font-semibold">{{ status.totalRows - status.doneRows - status.failedRows }}</span> queued</span>
        </div>
      </div>

      <!-- Download -->
      <a v-if="status.status === 'completed'"
        :href="`/api/batch/${batchId}/download`"
        class="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 active:scale-[0.98] transition-all">
        <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Download results.xlsx
      </a>

      <!-- Recent results table -->
      <div v-if="status.recentAnalyses?.length" class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent Results
          <span class="normal-case font-normal text-slate-600 ml-1">— click a row to see the full answer</span>
        </p>
        <div class="rounded-xl border border-slate-700 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-800/60">
              <tr>
                <th class="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Company</th>
                <th class="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Status</th>
                <th class="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 hidden md:table-cell">Answer</th>
                <th class="px-4 py-2.5 text-right text-xs font-semibold text-slate-400">ms</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              <tr
                v-for="a in status.recentAnalyses" :key="a.id"
                :class="[
                  'transition-colors',
                  (a.status === 'done' || a.status === 'failed') ? 'cursor-pointer hover:bg-slate-800/60' : ''
                ]"
                @click="openResult(a)"
              >
                <td class="px-4 py-2.5 font-medium text-slate-200 max-w-[140px] truncate">{{ a.companyName }}</td>
                <td class="px-4 py-2.5">
                  <span :class="[
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    a.status === 'done' ? 'text-emerald-400 bg-emerald-500/10' :
                    a.status === 'failed' ? 'text-red-400 bg-red-500/10' :
                    a.status === 'running' ? 'text-indigo-400 bg-indigo-500/10' :
                    'text-slate-400 bg-slate-500/10'
                  ]">{{ a.status }}</span>
                </td>
                <td class="px-4 py-2.5 text-slate-400 max-w-xs truncate hidden md:table-cell">
                  {{ a.answer ?? a.error ?? '—' }}
                </td>
                <td class="px-4 py-2.5 text-right text-slate-500 tabular-nums text-xs">
                  {{ a.latencyMs ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>

  <!-- Result modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="selected" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" @click.self="selected = null">
        <div class="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">

          <!-- Modal header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
            <div>
              <h2 class="font-semibold text-white">{{ selected.companyName }}</h2>
              <p v-if="selected.companyDomain" class="text-xs text-slate-500 mt-0.5">{{ selected.companyDomain }}</p>
            </div>
            <button @click="selected = null" class="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700">
              <svg class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Modal body -->
          <div class="overflow-y-auto p-6 space-y-5">
            <!-- Answer -->
            <div v-if="selected.answer" class="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{{ selected.answer }}</div>
            <div v-else class="text-sm text-red-400">{{ selected.error ?? 'No answer available.' }}</div>

            <!-- Sources -->
            <div v-if="parseSources(selected.sources).length" class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Sources</p>
              <ul class="space-y-1.5">
                <li v-for="(s, i) in parseSources(selected.sources)" :key="i">
                  <a :href="s.url" target="_blank" rel="noopener noreferrer"
                    class="text-xs text-indigo-400 hover:text-indigo-300 hover:underline break-all">
                    [{{ i + 1 }}] {{ s.title || s.url }}
                  </a>
                </li>
              </ul>
            </div>

            <!-- Latency -->
            <p v-if="selected.latencyMs" class="text-xs text-slate-600">{{ selected.latencyMs }} ms</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const {
  mode, prompt, searchProvider, llmProvider,
  email, file, companyName, companyDomain,
  result, loading, error,
  batchRows, batchRunning,
  runIndividual, startBatch, cancelBatch, downloadBatchResults,
} = useAnalyzer();

const selected = ref<any>(null);

async function handleSubmit() {
  if (mode.value === "individual") {
    await runIndividual();
  } else {
    await startBatch();
  }
}

const canSubmit = computed(() => {
  if (!prompt.value.trim()) return false;
  if (mode.value === "individual") return !!companyName.value.trim();
  return !!file.value;
});

const batchStats = computed(() => {
  const rows = batchRows.value;
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const running = rows.filter((r) => r.status === "running").length;
  const queued = rows.filter((r) => r.status === "queued").length;
  const total = rows.length;
  const progress = total === 0 ? 0 : Math.round(((done + failed) / total) * 100);
  return { done, failed, running, queued, total, progress };
});

const batchComplete = computed(
  () =>
    batchRows.value.length > 0 &&
    !batchRunning.value &&
    batchStats.value.done + batchStats.value.failed === batchStats.value.total
);
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-12 space-y-8">

    <!-- Header -->
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <div class="size-8 rounded-lg bg-indigo-500 flex items-center justify-center">
          <svg class="size-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
          </svg>
        </div>
        <h1 class="text-xl font-bold tracking-tight">Company Analyzer</h1>
      </div>
      <p class="text-sm text-slate-400">AI-powered company research using web search + LLM analysis</p>
    </div>

    <!-- Mode Toggle -->
    <div class="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1 gap-1">
      <button
        v-for="m in (['individual', 'batch'] as const)"
        :key="m"
        @click="mode = m"
        :class="[
          'rounded-lg px-5 py-2 text-sm font-medium capitalize transition-all',
          mode === m
            ? 'bg-indigo-600 text-white shadow'
            : 'text-slate-400 hover:text-slate-200',
        ]"
      >{{ m }}</button>
    </div>

    <!-- Providers -->
    <ProviderSelector
      :search-provider="searchProvider"
      :llm-provider="llmProvider"
      @update:search-provider="searchProvider = $event"
      @update:llm-provider="llmProvider = $event"
    />

    <!-- Individual Inputs -->
    <template v-if="mode === 'individual'">
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-slate-400">Company name *</label>
          <input
            v-model="companyName"
            placeholder="e.g. Stripe"
            class="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-all"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-slate-400">Domain (optional)</label>
          <input
            v-model="companyDomain"
            placeholder="e.g. stripe.com"
            class="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-all"
          />
        </div>
      </div>
    </template>

    <!-- Batch Inputs -->
    <template v-else>
      <UploadZone :file="file" @update:file="file = $event" />
      <div class="space-y-1.5">
        <label class="text-xs font-medium text-slate-400">Notify by email when finished (optional)</label>
        <input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          class="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-all"
        />
        <p class="text-xs text-slate-500">
          Keep this tab open. You'll get an email when the batch finishes —
          come back to download the xlsx. (If you close the tab, the results are lost.)
        </p>
      </div>
    </template>

    <!-- Prompt -->
    <div class="space-y-1.5">
      <label class="text-xs font-medium text-slate-400">Research prompt *</label>
      <textarea
        v-model="prompt"
        rows="4"
        placeholder="e.g. Is this company a good fit for our B2B SaaS product? What are their main pain points and recent news?"
        class="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-all resize-none"
      />
    </div>

    <!-- Error -->
    <div v-if="error"
      class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {{ error }}
    </div>

    <!-- Submit / Cancel -->
    <button
      v-if="!batchRunning"
      @click="handleSubmit"
      :disabled="!canSubmit || loading"
      :class="[
        'w-full rounded-xl py-3 text-sm font-semibold transition-all',
        canSubmit && !loading
          ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.98]'
          : 'bg-slate-800 text-slate-500 cursor-not-allowed',
      ]"
    >
      <span v-if="loading" class="flex items-center justify-center gap-2">
        <svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        {{ mode === 'individual' ? 'Analyzing…' : 'Preparing…' }}
      </span>
      <span v-else>{{ mode === 'individual' ? 'Analyze' : 'Start Batch' }}</span>
    </button>
    <button
      v-else
      @click="cancelBatch"
      class="w-full rounded-xl py-3 text-sm font-semibold bg-red-600/90 text-white hover:bg-red-500 active:scale-[0.98] transition-all"
    >Cancel batch</button>

    <!-- Individual Result -->
    <ResultCard v-if="result && mode === 'individual'" :result="result" />

    <!-- Batch Progress + Results -->
    <template v-if="mode === 'batch' && batchRows.length > 0">
      <div class="rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4">
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-300 font-medium">
            {{ batchStats.done + batchStats.failed }} / {{ batchStats.total }} processed
          </span>
          <span class="text-slate-500 tabular-nums">{{ batchStats.progress }}%</span>
        </div>
        <div class="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="batchComplete ? (batchStats.failed === batchStats.total ? 'bg-red-500' : 'bg-emerald-500') : 'bg-indigo-500'"
            :style="`width: ${batchStats.progress}%`"
          />
        </div>
        <div class="flex gap-6 text-xs text-slate-500">
          <span><span class="text-emerald-400 font-semibold">{{ batchStats.done }}</span> done</span>
          <span><span class="text-red-400 font-semibold">{{ batchStats.failed }}</span> failed</span>
          <span><span class="text-indigo-400 font-semibold">{{ batchStats.running }}</span> running</span>
          <span><span class="text-slate-300 font-semibold">{{ batchStats.queued }}</span> queued</span>
        </div>
      </div>

      <button
        v-if="batchComplete"
        @click="downloadBatchResults"
        class="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 active:scale-[0.98] transition-all"
      >
        <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Download results.xlsx
      </button>

      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Results <span class="normal-case font-normal text-slate-600 ml-1">— click a row for the full answer</span>
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
                v-for="row in batchRows" :key="row.index"
                :class="[
                  'transition-colors',
                  (row.status === 'done' || row.status === 'failed') ? 'cursor-pointer hover:bg-slate-800/60' : ''
                ]"
                @click="(row.status === 'done' || row.status === 'failed') && (selected = row)"
              >
                <td class="px-4 py-2.5 font-medium text-slate-200 max-w-[140px] truncate">{{ row.companyName }}</td>
                <td class="px-4 py-2.5">
                  <span :class="[
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    row.status === 'done' ? 'text-emerald-400 bg-emerald-500/10' :
                    row.status === 'failed' ? 'text-red-400 bg-red-500/10' :
                    row.status === 'running' ? 'text-indigo-400 bg-indigo-500/10' :
                    'text-slate-400 bg-slate-500/10'
                  ]">{{ row.status }}</span>
                </td>
                <td class="px-4 py-2.5 text-slate-400 max-w-xs truncate hidden md:table-cell">
                  {{ row.answer ?? row.error ?? '—' }}
                </td>
                <td class="px-4 py-2.5 text-right text-slate-500 tabular-nums text-xs">
                  {{ row.latencyMs ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

  </div>

  <!-- Batch result modal -->
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
          <div class="overflow-y-auto p-6 space-y-5">
            <div v-if="selected.answer" class="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{{ selected.answer }}</div>
            <div v-else class="text-sm text-red-400">{{ selected.error ?? 'No answer available.' }}</div>
            <div v-if="selected.sources?.length" class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Sources</p>
              <ul class="space-y-1.5">
                <li v-for="(s, i) in selected.sources" :key="i">
                  <a :href="s.url" target="_blank" rel="noopener noreferrer"
                    class="text-xs text-indigo-400 hover:text-indigo-300 hover:underline break-all">
                    [{{ i + 1 }}] {{ s.title || s.url }}
                  </a>
                </li>
              </ul>
            </div>
            <p v-if="selected.latencyMs" class="text-xs text-slate-600">{{ selected.latencyMs }} ms</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

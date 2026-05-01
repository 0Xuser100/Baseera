<script setup lang="ts">
const router = useRouter();
const {
  mode, prompt, searchProvider, llmProvider,
  email, file, companyName, companyDomain,
  result, loading, error,
  runIndividual, startBatch,
} = useAnalyzer();

async function handleSubmit() {
  if (mode.value === "individual") {
    await runIndividual();
  } else {
    const batchId = await startBatch();
    if (batchId) router.push(`/batch/${batchId}`);
  }
}

const canSubmit = computed(() => {
  if (!prompt.value.trim()) return false;
  if (mode.value === "individual") return !!companyName.value.trim();
  return !!file.value;
});
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
        <label class="text-xs font-medium text-slate-400">Notify by email (optional)</label>
        <input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          class="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-all"
        />
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

    <!-- Submit -->
    <button
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
        {{ mode === 'individual' ? 'Analyzing…' : 'Starting batch…' }}
      </span>
      <span v-else>{{ mode === 'individual' ? 'Analyze' : 'Start Batch' }}</span>
    </button>

    <!-- Result -->
    <ResultCard v-if="result" :result="result" />

  </div>
</template>
